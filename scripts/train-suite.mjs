// Reward-only search on directions calibrated from the presented sensory panel.
// Every candidate decision traverses the complete anatomical graph twice.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {attachNativeRate} from './native-rate.mjs';
import {createFlight,advance,decisionSteps,rng} from '../dist/engine3d.js';
import {orbitalElements} from '../dist/orbital.js';
import {sampleEmbodied} from '../dist/perception.js';
import {FLIGHT_PANEL,FLIGHT_BODY_CHANNELS,presentedInstrumentValues} from '../dist/flight-instruments.js';
import {freshEmbodied,flightResult} from '../dist/full-controller.js';
import {createInsertionHold,updateInsertionHold} from './insertion-hold.mjs';

const folder='artifacts/suite-training',basisPath=process.env.SUITE_SENSORY_BASIS??folder+'/sensory-basis.json',basisText=fs.readFileSync(basisPath,'utf8'),basis=JSON.parse(basisText);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),calibrationHash=sha(basisText),stride=2130;
const nativeBuild=process.env.FLY_NATIVE_RATE==='1'?JSON.parse(fs.readFileSync('artifacts/native-rate/build.json')):null;
if(nativeBuild&&nativeBuild.binarySHA256!==sha(fs.readFileSync('artifacts/native-rate/rate-native.node')))throw Error('Native backend does not match its build record');
// Symmetric lateral directions reduce the search dimension without prescribing
// their signs or gains. Gimbal, fins, gaze and engine-bank directions remain fixed
// during the first attitude lesson; later blocks can release additional heads.
const directions=[
 [[0,'bias',1]],[[0,'clearance',1]],[[0,'verticalSpeed',1]],[[0,'body_0',1]],[[0,'body_13',1]],
 [[2,'offsetX',1],[4,'offsetZ',1]],[[2,'driftX',1],[4,'driftZ',1]],
 [[2,'pitch',1]],[[4,'roll',1]],[[2,'body_10',1],[4,'body_11',1]],[[5,'body_12',1]],
 [[0,'fuel',1]],[[8,'bias',1]],
 // Measured selector position can couple throttle to a changed engine bank.
 [[0,'body_8',.5],[0,'bias',.5]],[[8,'body_17',1]],[[8,'body_0',1]],
 // Orbital lessons can use the existing destination and motion indicators.
 [[0,'destination',.5],[0,'bias',.5]],[[0,'tangentSpeed',1]],
 [[2,'destination',.5],[2,'bias',.5]],[[2,'clearance',1]],
 [[2,'tangentSpeed',1]],[[2,'travel',.5],[2,'bias',.5]],
 [[0,'travel',.5],[0,'bias',.5]],
 // The gimbal heads can learn from the same visible and body measurements.
 // Their signs and magnitudes are selected from complete-flight outcomes.
 [[1,'offsetX',1],[3,'offsetZ',1]],[[1,'driftX',1],[3,'driftZ',1]],
 [[1,'pitch',1]],[[3,'roll',1]],[[1,'body_10',1],[3,'body_11',1]],
];
const initial=[-.3,-.08,-.3,.03,-.02,0,0,0,0,0,0,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const scales=[.1,.15,.3,.15,.15,.2,.3,2,.5,.5,.5,.1,1,.8,3,1.5,1,2,2,2,2,3,2,.15,.15,.5,.5,.2];
const touchdownMargin=Number(process.env.SUITE_TOUCHDOWN_MARGIN??0);
const selectionOrder='landings-orbital-milestones-then-fitness';
const useInsertionHold=process.env.SUITE_INSERTION_HOLD==='1';
const fitnessVersion=useInsertionHold?'touchdown-margin-and-orbit-hold-v1':'touchdown-margin-and-orbit-insertion-v2';
const rewardSource=useInsertionHold?fs.readFileSync(new URL('./insertion-hold.mjs',import.meta.url)):null;
const rewardMetadata=rewardSource?{insertionRewardSourceSHA256:sha(rewardSource)}:{};
const orbitalMilestones=['Final approach','Atmospheric entry','Deorbit','One full orbit','Stable orbit','Space','Launch'];
function compareResults(a,b){
 if(a.landings!==b.landings)return b.landings-a.landings;
 for(const name of orbitalMilestones){
  const count=r=>r.flights.filter(f=>f.milestones?.some(m=>m.name===name)).length,difference=count(b)-count(a);
  if(difference)return difference;
 }
 return b.fitness-a.fitness;
}
function decode(parameters){
 if(parameters.length>directions.length||!parameters.every(Number.isFinite))throw Error('Invalid readout parameters');
 const weights=Array(stride*10).fill(0);
 directions.forEach((terms,k)=>terms.forEach(([head,name,gain])=>{
  const value=parameters[k]??0;if(value===0)return;
  if(name==='bias')weights[head*stride+stride-1]+=value*gain;
  else {const index=basis.names.indexOf(name);if(index<0)throw Error('Unknown sensory basis '+name);for(let j=0;j<stride;j++)weights[head*stride+j]+=value*gain*basis.basis[index][j];}
 }));return weights;
}
// The same small covariance factorization used in the first landing search.
// Correlated proposals can adjust coupled feedback gains together.
function cholesky(covariance){
 const L=covariance.map(row=>row.map(()=>0));
 for(let i=0;i<L.length;i++)for(let j=0;j<=i;j++){
  let v=covariance[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];
  L[i][j]=i===j?Math.sqrt(Math.max(1e-12,v)):v/L[j][j];
 }return L;
}
if(!isMainThread){
 const net=loadFullNetwork();if(process.env.FLY_NATIVE_RATE==='1')attachNativeRate(net);net.setInputMode('embodied');
 parentPort.on('message',job=>{
  const weights=decode(job.parameters),flights=[],features=[],targets=[];
  for(const test of job.cases){
   const s=createFlight(test.seed,test.scenario,test.variability??0);s.sensoryPresentation=FLIGHT_PANEL;s.autoOdor=false;s.styleEnabled=false;s.eyesCovered=!!test.covered;s.instrumentLights=test.instrumentLights!==false;net.reset();
   const trajectory=[],hold=useInsertionHold&&s.orbital?createInsertionHold():null;let insertionQuality=0;
   while(!s.done){
    const packet=sampleEmbodied(s),observations=[...packet.observations];
    // A fixed external odor intervention changes only the existing four
    // receptor inputs. It supplies no flight state or desired action.
    if(test.odorLevels)observations.splice(1554,4,...test.odorLevels);
    const action=net.decide(observations,weights);
    if(job.collect){
     for(const index of net.motorIndices)features.push(net.activity[index]);
     targets.push(...presentedInstrumentValues(packet.screens[1]),...FLIGHT_BODY_CHANNELS.map(i=>packet.observations[1536+i]-(i===13?1:0)));
    }
    if(job.trace)trajectory.push({t:s.t,y:s.y,vy:s.vy,x:s.x-s.padX,z:s.z-s.padZ,pitch:s.angle,roll:s.angleZ,action:Array.from(action),presented:[...presentedInstrumentValues(packet.screens[1]),...FLIGHT_BODY_CHANNELS.map(i=>packet.observations[1536+i]-(i===13?1:0))],decoded:basis.basis.map(w=>net.motorIndices.reduce((v,k,j)=>v+w[j]*net.activity[k],w[stride-1]))});
    for(let j=0,n=decisionSteps(s);j<n&&!s.done;j++){
     const before=s.t;advance(s,action);
     if(hold)updateInsertionHold(hold,s,s.t-before);
    }
    if(s.orbital){
     // Outcome-only reward shaping. These orbital elements never enter the
     // sensory packet, calibrated readout, or action calculation above.
     const e=orbitalElements(s),target=s.orbitConfig.orbitHeight;
     const distance=(Math.abs(e.periapsis-target)+Math.abs(e.apoapsis-target))/target+Math.abs(s.vy)/40;
     if(Number.isFinite(distance))insertionQuality=Math.max(insertionQuality,Math.exp(-distance*.25));
    }
   }
   flights.push({...flightResult(s),...(s.orbital?{insertionQuality,insertionReward:1200*insertionQuality+200*Math.min(1,s.maxAltitude/s.orbitConfig.orbitHeight)}:{}),
    ...(hold?{insertionHoldQuality:hold.best,insertionHoldReward:1200*hold.best+200*Math.min(1,s.maxAltitude/s.orbitConfig.orbitHeight)}:{}),...(job.trace?{trajectory}:{}),censored:false});
  }
  const score=flights.reduce((v,s)=>v+s.score,0)/flights.length;
  const fitness=flights.reduce((v,s)=>v+(s.milestones?s.score*.1:s.score)+(s.insertionHoldReward??s.insertionReward??0)-touchdownMargin*(s.landed?s.touchdown.speed**2+s.touchdown.lateral**2:0),0)/flights.length;
  if(job.collect){
   const f=Float32Array.from(features),t=Float32Array.from(targets);
   parentPort.postMessage({parameters:job.parameters,score,fitness,landings:flights.filter(s=>s.landed).length,flights,features:f.buffer,targets:t.buffer},[f.buffer,t.buffer]);
  }else parentPort.postMessage({parameters:job.parameters,score,fitness,landings:flights.filter(s=>s.landed).length,flights});
 });
}else{
 const workers=Array.from({length:Number(process.env.SUITE_WORKERS??3)},()=>new Worker(new URL(import.meta.url))),queue=[];
 const dispatch=()=>{for(const w of workers)if(!w.busy&&queue.length){const job=queue.shift();w.busy=true;w.resolve=job.resolve;w.postMessage(job.data);}};
 const evaluate=data=>new Promise(resolve=>{queue.push({data,resolve});dispatch();});
 for(const w of workers){w.on('message',r=>{w.busy=false;w.resolve(r);dispatch();});w.on('error',e=>{console.error(e);process.exit(1);});}
 const mode=process.env.SUITE_BLOCK??'vertical',path=folder+'/'+mode,searchSeed=Number(process.env.SUITE_SEARCH_SEED??1179421),random=rng(searchSeed),correlated=process.env.SUITE_COVARIANCE==='1';
 fs.mkdirSync(path,{recursive:true});
 const profiles=(process.env.SUITE_PROFILES??'0').split(',').map(Number),active=mode.startsWith('ground-joint')?[0,1,2,3,4,5,6,7,8,9,10,11,23,24,25,26,27]:mode.startsWith('vertical')?[0,1,2,3,4]:mode.startsWith('attitude')?[5,6,7,8,9,10]:mode.startsWith('engine')?[0,1,2,3,4,11,12,13,14,15]:mode.startsWith('gimbal')?[5,6,7,8,9,10,23,24,25,26,27]:mode.startsWith('orbital')?[0,1,2,3,4,5,6,7,8,9,10,11,16,17,18,19,20,21,22,23,24,25,26,27]:directions.map((_,i)=>i);
 let state=fs.existsSync(path+'/state.json')?JSON.parse(fs.readFileSync(path+'/state.json')):{generation:0,episodes:0,mean:initial,sigma:scales,best:null,history:[]};
 if(process.env.SUITE_INITIAL&&state.generation===0){const prior=JSON.parse(fs.readFileSync(process.env.SUITE_INITIAL));state.mean=prior.best?.parameters??prior.parameters;}
 if(state.generation===0&&state.mean.length<directions.length)state.mean=[...state.mean,...Array(directions.length-state.mean.length).fill(0)];
 if(state.mean.length!==directions.length||state.sigma.length!==directions.length)throw Error('Parameter layout changed; initialize a new training folder from the earlier checkpoint');
 if(state.calibrationHash&&state.calibrationHash!==calibrationHash)throw Error('Calibration changed; use a separate training folder');
 if(state.correlated!==undefined&&state.correlated!==correlated)throw Error('Search method changed; use a separate training folder');
 if(state.generation>0&&state.selectionOrder!==selectionOrder)throw Error('Selection order changed; initialize a new training folder from the earlier checkpoint');
 if(state.generation>0&&state.fitnessVersion!==fitnessVersion)throw Error('Training fitness changed; initialize a new training folder from the earlier checkpoint');
 if(state.generation>0&&state.insertionRewardSourceSHA256!==rewardMetadata.insertionRewardSourceSHA256)throw Error('Insertion reward changed; initialize a new training folder');
 const sourceText=fs.readFileSync(new URL(import.meta.url)),sourceSHA256=sha(sourceText);
 fs.writeFileSync(path+'/source-'+sourceSHA256+'.mjs',sourceText);
 if(rewardSource)fs.writeFileSync(path+'/insertion-hold-'+rewardMetadata.insertionRewardSourceSHA256+'.mjs',rewardSource);
 let stopping=false;process.on('SIGINT',()=>{stopping=true;console.log('Finishing this generation before stopping.');});
 try{
  if(process.argv.includes('--collect-senses')){
   const output=process.env.SUITE_CALIBRATION_OUTPUT??folder+'/flight-calibration',count=Number(process.env.SUITE_CALIBRATION_FLIGHTS??24),parameters=state.best?.parameters??state.mean;
   const calibrationSeed=Number(process.env.SUITE_CALIBRATION_SEED??83729017),contextBase=Number(process.env.SUITE_CALIBRATION_CONTEXT_BASE??2000000);
   if(fs.existsSync(output+'/calibration-manifest.json'))throw Error('Flight calibration already exists; preserve it before collecting again');
   if(!Number.isInteger(count)||count<1||!Number.isSafeInteger(calibrationSeed)||!Number.isSafeInteger(contextBase)||contextBase<0)throw Error('Invalid calibration count, seed or context base');
   fs.mkdirSync(output,{recursive:true});
   const cases=Array.from({length:count},(_,i)=>({scenario:profiles[i%profiles.length],seed:calibrationSeed+i*104729,variability:i%2?.4:0}));
   const records=await Promise.all(cases.map((test,part)=>evaluate({parameters,cases:[test],collect:true}).then(result=>{
    const samples=result.features.byteLength/(2129*4),context=contextBase+part;
    if(!Number.isInteger(samples)||samples<1||result.targets.byteLength!==samples*28*4)throw Error('Incomplete flight calibration buffers');
    fs.writeFileSync(`${output}/calibration-${part}-features.bin`,Buffer.from(result.features));
    fs.writeFileSync(`${output}/calibration-${part}-targets.bin`,Buffer.from(result.targets));
    fs.writeFileSync(`${output}/calibration-${part}.json`,JSON.stringify({samples,contexts:Array(samples).fill(context),dynamic:true,collection:'complete learned flight',featureCount:2129,targetCount:28,dtype:'float32-le',sensoryPresentation:FLIGHT_PANEL,case:test,flight:result.flights[0]}));
    console.log(JSON.stringify({part,samples,flight:result.flights[0]}));return {samples,flight:result.flights[0]};
   })));
   const files=['scripts/train-suite.mjs','dist/engine3d.js','dist/orbital.js','dist/missions.js','dist/perception.js','dist/flight-instruments.js','dist/full-network.js','scripts/full-network-node.mjs',basisPath,...(useInsertionHold?['scripts/insertion-hold.mjs']:[])];
   fs.writeFileSync(output+'/calibration-manifest.json',JSON.stringify({sensoryPresentation:FLIGHT_PANEL,contexts:count,contextBase,calibrationSeed,samples:records.reduce((s,r)=>s+r.samples,0),dynamic:true,collection:'complete learned flight',parts:count,features:2129,targets:28,names:basis.names,bodyChannels:FLIGHT_BODY_CHANNELS,neurons:166700,edges:25582938,passesPerDecision:2,parameters,calibrationHash,weightSHA256:sha(Buffer.from(Float64Array.from(decode(parameters)).buffer)),cases,backend:process.env.FLY_NATIVE_RATE==='1'?'native-exact-rate':'javascript-rate',nativeBuild,sourceSHA256:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(file))]))},null,2));
  }else if(process.argv.includes('--sweep')){
   const parameters=state.best?.parameters??state.mean,index=Number(process.env.SUITE_SWEEP_INDEX??7);
   if(!Number.isInteger(index)||index<0||index>=parameters.length)throw Error('Invalid sweep parameter');
   const values=[...new Set([parameters[index],...(process.env.SUITE_SWEEP_VALUES??'-6,-3,-1.5,-.5,0,.5').split(',').map(Number)])];
   if(!values.every(Number.isFinite))throw Error('Invalid sweep values');
   const secondIndex=process.env.SUITE_SWEEP_SECOND_INDEX===undefined?null:Number(process.env.SUITE_SWEEP_SECOND_INDEX);
   if(secondIndex!==null&&(!Number.isInteger(secondIndex)||secondIndex<0||secondIndex>=parameters.length||secondIndex===index))throw Error('Invalid second sweep parameter');
   const secondValues=secondIndex===null?[null]:[...new Set([parameters[secondIndex],...(process.env.SUITE_SWEEP_SECOND_VALUES??'').split(',').filter(Boolean).map(Number)])];
   if(secondIndex!==null&&!secondValues.every(Number.isFinite))throw Error('Invalid second sweep values');
   const cases=Array.from({length:Number(process.env.SUITE_BATCH??6)},(_,i)=>({scenario:profiles[i%profiles.length],seed:714133+i*19667,variability:i%2?.4:0}));
   const results=await Promise.all(values.flatMap(value=>secondValues.map(secondValue=>{const p=[...parameters];p[index]=value;if(secondIndex!==null)p[secondIndex]=secondValue;return evaluate({parameters:p,cases});})));
   results.sort(compareResults);
   const report={parameters:results[0].parameters,initialParameters:parameters,index,values,secondIndex,secondValues,calibrationHash,sourceSHA256,...rewardMetadata,nativeBuild,touchdownMargin,cases,results};
   fs.writeFileSync(path+'/sweep.json',JSON.stringify(report));
   for(const r of results)console.log(JSON.stringify({value:r.parameters[index],secondValue:secondIndex===null?null:r.parameters[secondIndex],landings:r.landings,batch:cases.length,score:r.score,fitness:r.fitness,flights:r.flights}));
  }else if(process.argv.includes('--evaluate')){
   const parameters=state.best?.parameters??state.mean,weights=decode(parameters),seedBase=Number(process.env.SUITE_TEST_SEED??61073003);
   const cases=Array.from({length:Number(process.env.SUITE_TESTS??12)},(_,i)=>({scenario:profiles[i%profiles.length],seed:seedBase+i*104729,variability:Math.floor(i/profiles.length)%2?.4:0}));
   const odorLevel=process.env.SUITE_TEST_ODOR_LEVEL===undefined?null:Number(process.env.SUITE_TEST_ODOR_LEVEL);
   if(odorLevel!==null&&(!Number.isFinite(odorLevel)||odorLevel<=0||odorLevel>1||process.env.SUITE_TEST_MODES))throw Error('Use one fixed model odor level in (0,1] without SUITE_TEST_MODES');
   const modes=odorLevel===null?(process.env.SUITE_TEST_MODES??'normal,covered').split(','):['normal','ethyl-acetate','geosmin'];
   if(!modes.every(mode=>(odorLevel===null?['normal','covered','no-instruments']:['normal','ethyl-acetate','geosmin']).includes(mode)))throw Error('Unknown evaluation condition');
   const odorIntervention=odorLevel===null?undefined:{level:odorLevel,unit:'Dimensionless model receptor input, not physical concentration',schedule:'Constant bilateral input from the first decision to the original full-flight endpoint',conditions:{normal:[0,0,0,0],'ethyl-acetate':[odorLevel,odorLevel,0,0],geosmin:[0,0,odorLevel,odorLevel]},selection:'None; retain every matched outcome with the frozen readout'};
   const report={parameters,calibrationHash,sourceSHA256,...rewardMetadata,backend:process.env.FLY_NATIVE_RATE==='1'?'native-exact-rate':'javascript-rate',nativeBuild,weightSHA256:sha(Buffer.from(Float64Array.from(weights).buffer)),cases,modes,odorIntervention,flights:[],complete:false};
   const output=path+'/'+(process.env.SUITE_TEST_OUTPUT??'selection.json');
   fs.writeFileSync(output.replace(/\.json$/,'')+'-weights.json',JSON.stringify(weights));
   const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(report));fs.renameSync(output+'.tmp',output);};
   await Promise.all(modes.flatMap(mode=>cases.map(test=>evaluate({parameters,cases:[{...test,covered:mode==='covered',instrumentLights:mode!=='no-instruments',...(odorIntervention?{odorLevels:odorIntervention.conditions[mode]}:{})}]}).then(result=>{const flight={...result.flights[0],mode};report.flights.push(flight);save();console.log(JSON.stringify(flight));}))));
   report.complete=true;save();
  }else if(process.argv.includes('--probe')){
   const parameters=state.best?.parameters??state.mean,cases=profiles.map((scenario,i)=>({scenario,seed:714133+i*19667,variability:i%2?Number(process.env.SUITE_PROBE_VARIABILITY??.2):0}));
   const results=await Promise.all(cases.map(c=>evaluate({parameters,cases:[c],trace:true})));
   fs.writeFileSync(path+'/probe.json',JSON.stringify({parameters,calibrationHash,sourceSHA256,nativeBuild,...rewardMetadata,cases,results}));
   for(const result of results)console.log(JSON.stringify({...result,flights:result.flights.map(({trajectory,...f})=>f)}));
  }else for(let g=0;g<Number(process.env.SUITE_GENERATIONS??10)&&!stopping;g++){
   const generation=state.generation+1;
   const proposalRandom=correlated?rng(searchSeed+generation*7919):random;
   const changing=process.env.SUITE_VARY_SEEDS==='1';
   const cases=Array.from({length:Number(process.env.SUITE_BATCH??3)},(_,i)=>({scenario:profiles[(generation+i-1)%profiles.length],seed:i===0?714133:i===1&&!changing?910747:527801+generation*15427+i*10391,variability:i%2?(changing?.4:.2):0}));
   const population=[state.mean];if(state.best)population.push(state.best.parameters);
   const covariance=state.covariance??state.sigma.map((s,i)=>state.sigma.map((_,j)=>i===j?s*s:0)),L=correlated?cholesky(covariance):null;
   while(population.length<Number(process.env.SUITE_POPULATION??12)){
    const i=population.length,center=i%3===0&&state.best?state.best.parameters:state.mean,p=[...center],scale=i%2?.4:1.4;
    if(correlated){const z=state.mean.map(()=>proposalRandom.normal());for(const j of active)p[j]+=scale*L[j].reduce((v,l,k)=>v+l*z[k],0);}
    else for(const j of active)p[j]+=scale*state.sigma[j]*proposalRandom.normal();population.push(p);
   }
   const results=await Promise.all(population.map((parameters,candidate)=>evaluate({parameters,cases}).then(result=>{
    console.log(JSON.stringify({type:'completed-candidate',generation,candidate,landings:result.landings,batch:cases.length,score:result.score,fitness:result.fitness,...(result.flights.some(f=>f.maxAltitude!==undefined)?{maxAltitude:Math.max(...result.flights.map(f=>f.maxAltitude??0)),insertionQuality:Math.max(...result.flights.map(f=>f.insertionQuality??0)),milestones:[...new Set(result.flights.flatMap(f=>f.milestones?.map(m=>m.name)??[]))]}:{})}));
    return result;
   })));
   fs.appendFileSync(path+'/trials.jsonl',JSON.stringify({generation,calibrationHash,sourceSHA256,...rewardMetadata,correlated,searchSeed,touchdownMargin,selectionOrder,fitnessVersion,backend:process.env.FLY_NATIVE_RATE==='1'?'native-exact-rate':'javascript-rate',nativeBuild,cases,results})+'\n');
   results.sort(compareResults);const elites=results.slice(0,3),best=results[0],mean=[...state.mean],sigma=[...state.sigma];
   for(const j of active){mean[j]=elites.reduce((v,r)=>v+r.parameters[j],0)/elites.length;sigma[j]=Math.max(scales[j]*.08,.7*Math.sqrt(elites.reduce((v,r)=>v+(r.parameters[j]-mean[j])**2,0)/elites.length)+.3*sigma[j]);}
   const nextCovariance=correlated?covariance.map((row,i)=>row.map((v,j)=>active.includes(i)&&active.includes(j)?.65*elites.reduce((sum,r)=>sum+(r.parameters[i]-mean[i])*(r.parameters[j]-mean[j]),0)/elites.length+.35*v+(i===j?(scales[i]*.05)**2:0):v)):undefined;
   const entry={generation,episodes:state.episodes+population.length*cases.length,score:best.score,fitness:best.fitness,touchdownMargin,landings:best.landings,batch:cases.length,parameters:best.parameters,flights:best.flights};
   state={...state,generation,episodes:entry.episodes,mean,sigma,covariance:nextCovariance,correlated,best,calibrationHash,sourceSHA256,...rewardMetadata,nativeBuild,selectionOrder,fitnessVersion,profiles,history:[...state.history,entry]};
   const cp={...freshEmbodied(),weights:decode(best.parameters),generation,episodes:state.episodes,scenario:profiles[0],sensoryPresentation:FLIGHT_PANEL,autoOdor:false,instrumentLights:true,initialization:'Presented-signal calibration followed by reward-only flight learning',trainingScope:profiles,trainingMethod:'Full-network reward-only search on calibrated sensory directions'+(correlated?' with learned parameter covariance':''),sensoryBasis:basis.names,parameters:best.parameters,calibrationHash,sourceSHA256,...rewardMetadata,nativeBuild,selectionOrder,fitnessVersion,history:state.history};
   fs.writeFileSync(path+'/state.json.tmp',JSON.stringify(state));fs.renameSync(path+'/state.json.tmp',path+'/state.json');
   fs.writeFileSync(path+'/candidate.json',JSON.stringify(cp));console.log(JSON.stringify(entry));
  }
 }finally{await Promise.all(workers.map(w=>w.terminate()));}
}
