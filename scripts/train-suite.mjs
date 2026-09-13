// Reward-only search on directions calibrated from the presented sensory panel.
// Every candidate decision traverses the complete anatomical graph twice.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {attachNativeRate} from './native-rate.mjs';
import {createFlight,advance,decisionSteps,rng} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {FLIGHT_PANEL,FLIGHT_BODY_CHANNELS,presentedInstrumentValues} from '../dist/flight-instruments.js';
import {freshEmbodied,flightResult} from '../dist/full-controller.js';

const folder='artifacts/suite-training',basisPath=process.env.SUITE_SENSORY_BASIS??folder+'/sensory-basis.json',basisText=fs.readFileSync(basisPath,'utf8'),basis=JSON.parse(basisText);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),calibrationHash=sha(basisText),stride=2130;
// Symmetric lateral directions reduce the search dimension without prescribing
// their signs or gains. Gimbal, fins, gaze and engine-bank directions remain fixed
// during the first attitude lesson; later blocks can release additional heads.
const directions=[
 [[0,'bias',1]],[[0,'clearance',1]],[[0,'verticalSpeed',1]],[[0,'body_0',1]],[[0,'body_13',1]],
 [[2,'offsetX',1],[4,'offsetZ',1]],[[2,'driftX',1],[4,'driftZ',1]],
 [[2,'pitch',1]],[[4,'roll',1]],[[2,'body_10',1],[4,'body_11',1]],[[5,'body_12',1]],
 [[0,'fuel',1]],[[8,'bias',1]],
];
const initial=[-.3,-.08,-.3,.03,-.02,0,0,0,0,0,0,0,-1];
const scales=[.1,.15,.3,.15,.15,.2,.3,2,.5,.5,.5,.1,.2];
const touchdownMargin=Number(process.env.SUITE_TOUCHDOWN_MARGIN??0);
function decode(parameters){
 const weights=Array(stride*10).fill(0);
 directions.forEach((terms,k)=>terms.forEach(([head,name,gain])=>{
  if(name==='bias')weights[head*stride+stride-1]+=parameters[k]*gain;
  else {const index=basis.names.indexOf(name);if(index<0)throw Error('Unknown sensory basis '+name);for(let j=0;j<stride;j++)weights[head*stride+j]+=parameters[k]*gain*basis.basis[index][j];}
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
   const trajectory=[];
   while(!s.done){
    const packet=sampleEmbodied(s),action=net.decide(packet.observations,weights);
    if(job.collect){
     for(const index of net.motorIndices)features.push(net.activity[index]);
     targets.push(...presentedInstrumentValues(packet.screens[1]),...FLIGHT_BODY_CHANNELS.map(i=>packet.observations[1536+i]-(i===13?1:0)));
    }
    if(job.trace)trajectory.push({t:s.t,y:s.y,vy:s.vy,x:s.x-s.padX,z:s.z-s.padZ,pitch:s.angle,roll:s.angleZ,action:Array.from(action),decoded:basis.basis.map(w=>net.motorIndices.reduce((v,k,j)=>v+w[j]*net.activity[k],w[stride-1]))});
    for(let j=0,n=decisionSteps(s);j<n&&!s.done;j++)advance(s,action);
   }
   flights.push({...flightResult(s),...(job.trace?{trajectory}:{}),censored:false});
  }
  const score=flights.reduce((v,s)=>v+s.score,0)/flights.length;
  const fitness=score-touchdownMargin*flights.reduce((v,s)=>v+(s.landed?s.touchdown.speed**2+s.touchdown.lateral**2:0),0)/flights.length;
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
 const profiles=(process.env.SUITE_PROFILES??'0').split(',').map(Number),active=mode.startsWith('vertical')?[0,1,2,3,4]:mode.startsWith('attitude')?[5,6,7,8,9,10]:directions.map((_,i)=>i);
 let state=fs.existsSync(path+'/state.json')?JSON.parse(fs.readFileSync(path+'/state.json')):{generation:0,episodes:0,mean:initial,sigma:scales,best:null,history:[]};
 if(process.env.SUITE_INITIAL&&state.generation===0){const prior=JSON.parse(fs.readFileSync(process.env.SUITE_INITIAL));state.mean=prior.best?.parameters??prior.parameters;}
 if(state.calibrationHash&&state.calibrationHash!==calibrationHash)throw Error('Calibration changed; use a separate training folder');
 if(state.correlated!==undefined&&state.correlated!==correlated)throw Error('Search method changed; use a separate training folder');
 const sourceText=fs.readFileSync(new URL(import.meta.url)),sourceSHA256=sha(sourceText);
 fs.writeFileSync(path+'/source-'+sourceSHA256+'.mjs',sourceText);
 let stopping=false;process.on('SIGINT',()=>{stopping=true;console.log('Finishing this generation before stopping.');});
 try{
  if(process.argv.includes('--collect-senses')){
   const output=folder+'/flight-calibration',count=Number(process.env.SUITE_CALIBRATION_FLIGHTS??24),parameters=state.best?.parameters??state.mean;
   if(fs.existsSync(output+'/calibration-manifest.json'))throw Error('Flight calibration already exists; preserve it before collecting again');
   if(!Number.isInteger(count)||count<1)throw Error('Invalid number of calibration flights');
   fs.mkdirSync(output,{recursive:true});
   const cases=Array.from({length:count},(_,i)=>({scenario:profiles[i%profiles.length],seed:83729017+i*104729,variability:i%2?.4:0}));
   const records=await Promise.all(cases.map((test,part)=>evaluate({parameters,cases:[test],collect:true}).then(result=>{
    const samples=result.features.byteLength/(2129*4),context=2000000+part;
    if(!Number.isInteger(samples)||samples<1||result.targets.byteLength!==samples*28*4)throw Error('Incomplete flight calibration buffers');
    fs.writeFileSync(`${output}/calibration-${part}-features.bin`,Buffer.from(result.features));
    fs.writeFileSync(`${output}/calibration-${part}-targets.bin`,Buffer.from(result.targets));
    fs.writeFileSync(`${output}/calibration-${part}.json`,JSON.stringify({samples,contexts:Array(samples).fill(context),dynamic:true,collection:'complete learned flight',featureCount:2129,targetCount:28,dtype:'float32-le',sensoryPresentation:FLIGHT_PANEL,case:test,flight:result.flights[0]}));
    console.log(JSON.stringify({part,samples,flight:result.flights[0]}));return {samples,flight:result.flights[0]};
   })));
   const files=['scripts/train-suite.mjs','dist/engine3d.js','dist/orbital.js','dist/missions.js','dist/perception.js','dist/flight-instruments.js','dist/full-network.js','scripts/full-network-node.mjs',basisPath];
   fs.writeFileSync(output+'/calibration-manifest.json',JSON.stringify({sensoryPresentation:FLIGHT_PANEL,contexts:count,samples:records.reduce((s,r)=>s+r.samples,0),dynamic:true,collection:'complete learned flight',parts:count,features:2129,targets:28,names:basis.names,bodyChannels:FLIGHT_BODY_CHANNELS,neurons:166700,edges:25582938,passesPerDecision:2,parameters,calibrationHash,weightSHA256:sha(Buffer.from(Float64Array.from(decode(parameters)).buffer)),cases,backend:process.env.FLY_NATIVE_RATE==='1'?'native-exact-rate':'javascript-rate',sourceSHA256:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(file))]))},null,2));
  }else if(process.argv.includes('--sweep')){
   const parameters=state.best?.parameters??state.mean,index=Number(process.env.SUITE_SWEEP_INDEX??7);
   if(!Number.isInteger(index)||index<0||index>=parameters.length)throw Error('Invalid sweep parameter');
   const values=[...new Set([parameters[index],...(process.env.SUITE_SWEEP_VALUES??'-6,-3,-1.5,-.5,0,.5').split(',').map(Number)])];
   if(!values.every(Number.isFinite))throw Error('Invalid sweep values');
   const cases=Array.from({length:Number(process.env.SUITE_BATCH??6)},(_,i)=>({scenario:profiles[i%profiles.length],seed:714133+i*19667,variability:i%2?.4:0}));
   const results=await Promise.all(values.map(value=>{const p=[...parameters];p[index]=value;return evaluate({parameters:p,cases});}));
   results.sort((a,b)=>b.landings-a.landings||b.fitness-a.fitness);
   const report={parameters:results[0].parameters,initialParameters:parameters,index,values,calibrationHash,touchdownMargin,cases,results};
   fs.writeFileSync(path+'/sweep.json',JSON.stringify(report));
   for(const r of results)console.log(JSON.stringify({value:r.parameters[index],landings:r.landings,batch:cases.length,score:r.score,fitness:r.fitness,flights:r.flights}));
  }else if(process.argv.includes('--evaluate')){
   const parameters=state.best?.parameters??state.mean,weights=decode(parameters),seedBase=Number(process.env.SUITE_TEST_SEED??61073003);
   const cases=Array.from({length:Number(process.env.SUITE_TESTS??12)},(_,i)=>({scenario:profiles[i%profiles.length],seed:seedBase+i*104729,variability:Math.floor(i/profiles.length)%2?.4:0}));
   const modes=(process.env.SUITE_TEST_MODES??'normal,covered').split(',');
   if(!modes.every(mode=>['normal','covered','no-instruments'].includes(mode)))throw Error('Unknown evaluation condition');
   const report={parameters,calibrationHash,sourceSHA256,backend:process.env.FLY_NATIVE_RATE==='1'?'native-exact-rate':'javascript-rate',weightSHA256:sha(Buffer.from(Float64Array.from(weights).buffer)),cases,modes,flights:[],complete:false};
   const output=path+'/'+(process.env.SUITE_TEST_OUTPUT??'selection.json');
   fs.writeFileSync(output.replace(/\.json$/,'')+'-weights.json',JSON.stringify(weights));
   const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(report));fs.renameSync(output+'.tmp',output);};
   await Promise.all(modes.flatMap(mode=>cases.map(test=>evaluate({parameters,cases:[{...test,covered:mode==='covered',instrumentLights:mode!=='no-instruments'}]}).then(result=>{const flight={...result.flights[0],mode};report.flights.push(flight);save();console.log(JSON.stringify(flight));}))));
   report.complete=true;save();
  }else if(process.argv.includes('--probe')){
   const parameters=state.best?.parameters??state.mean,cases=profiles.map((scenario,i)=>({scenario,seed:714133+i*19667,variability:i%2?.2:0}));
   const results=await Promise.all(cases.map(c=>evaluate({parameters,cases:[c],trace:true})));
   fs.writeFileSync(path+'/probe.json',JSON.stringify({parameters,calibrationHash,cases,results}));
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
   const results=await Promise.all(population.map(parameters=>evaluate({parameters,cases})));
   fs.appendFileSync(path+'/trials.jsonl',JSON.stringify({generation,calibrationHash,sourceSHA256,correlated,searchSeed,touchdownMargin,backend:process.env.FLY_NATIVE_RATE==='1'?'native-exact-rate':'javascript-rate',cases,results})+'\n');
   results.sort((a,b)=>b.fitness-a.fitness);const elites=results.slice(0,3),best=[...results].sort((a,b)=>b.landings-a.landings||b.fitness-a.fitness)[0],mean=[...state.mean],sigma=[...state.sigma];
   for(const j of active){mean[j]=elites.reduce((v,r)=>v+r.parameters[j],0)/elites.length;sigma[j]=Math.max(scales[j]*.08,.7*Math.sqrt(elites.reduce((v,r)=>v+(r.parameters[j]-mean[j])**2,0)/elites.length)+.3*sigma[j]);}
   const nextCovariance=correlated?covariance.map((row,i)=>row.map((v,j)=>active.includes(i)&&active.includes(j)?.65*elites.reduce((sum,r)=>sum+(r.parameters[i]-mean[i])*(r.parameters[j]-mean[j]),0)/elites.length+.35*v+(i===j?(scales[i]*.05)**2:0):v)):undefined;
   const entry={generation,episodes:state.episodes+population.length*cases.length,score:best.score,fitness:best.fitness,touchdownMargin,landings:best.landings,batch:cases.length,parameters:best.parameters,flights:best.flights};
   state={...state,generation,episodes:entry.episodes,mean,sigma,covariance:nextCovariance,correlated,best,calibrationHash,sourceSHA256,profiles,history:[...state.history,entry]};
   const cp={...freshEmbodied(),weights:decode(best.parameters),generation,episodes:state.episodes,scenario:profiles[0],sensoryPresentation:FLIGHT_PANEL,autoOdor:false,instrumentLights:true,initialization:'Presented-signal calibration followed by reward-only flight learning',trainingScope:profiles,trainingMethod:'Full-network reward-only search on calibrated sensory directions'+(correlated?' with learned parameter covariance':''),sensoryBasis:basis.names,parameters:best.parameters,calibrationHash,sourceSHA256,history:state.history};
   fs.writeFileSync(path+'/state.json.tmp',JSON.stringify(state));fs.renameSync(path+'/state.json.tmp',path+'/state.json');
   fs.writeFileSync(path+'/candidate.json',JSON.stringify(cp));console.log(JSON.stringify(entry));
  }
 }finally{await Promise.all(workers.map(w=>w.terminate()));}
}
