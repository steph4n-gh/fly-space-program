import fs from 'node:fs';
import crypto from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {rng} from '../dist/engine3d.js';
import {rollout,flightResult,freshEmbodied} from '../dist/full-controller.js';

const folder='artifacts/landing-training';
const basisText=fs.readFileSync(folder+'/sensory-basis.json','utf8'),basis=JSON.parse(basisText),calibrationHash=crypto.createHash('sha256').update(basisText).digest('hex');
const stride=2130;
function decode(parameters){
 const weights=Array(stride*10).fill(0);weights[9*stride-1]=-1;
 for(let j=0;j<stride;j++)for(let k=0;k<basis.basis.length;k++)weights[j]+=parameters[k+1]*basis.basis[k][j];
 weights[stride-1]+=parameters[0];return weights;
}
// Learn correlated changes: independent noise struggles when a bias change
// needs a matching change in sensory feedback to preserve a safe descent.
function cholesky(covariance){
 const n=covariance.length,L=Array.from({length:n},()=>Array(n).fill(0));
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
  let v=covariance[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];
  L[i][j]=i===j?Math.sqrt(Math.max(1e-12,v)):v/L[j][j];
 }return L;
}
if(!isMainThread){
 const net=loadFullNetwork();
 parentPort.on('message',job=>{
  const weights=job.weights??decode(job.parameters),flights=[];
  for(const test of job.cases){let last;for(const s of rollout(net,weights,test.seed,test.scenario??0,false,test.variability??0,1,'embodied',false,!!test.covered))last=s;flights.push({...flightResult(last),censored:false});}
  parentPort.postMessage({id:job.id,parameters:job.parameters,score:flights.reduce((v,s)=>v+s.score,0)/flights.length,landings:flights.filter(s=>s.landed).length,flights});
 });
}else{
 fs.mkdirSync(folder,{recursive:true});
 const workers=Array.from({length:Number(process.env.LANDING_WORKERS??4)},()=>new Worker(new URL(import.meta.url),{workerData:{}}));
 let nextId=0;const queue=[];
 for(const worker of workers){worker.busy=false;worker.on('message',result=>{worker.busy=false;worker.resolve(result);dispatch();});worker.on('error',error=>{console.error(error);process.exit(1);});}
 function dispatch(){for(const worker of workers)if(!worker.busy&&queue.length){const job=queue.shift();worker.busy=true;worker.resolve=job.resolve;worker.postMessage(job.data);}}
 const evaluate=data=>new Promise(resolve=>{queue.push({data:{...data,id:nextId++},resolve});dispatch();});
 const seed=Number(process.env.LANDING_SEARCH_SEED??923401),random=rng(seed),resume=process.argv.includes('--resume')&&fs.existsSync(folder+'/search-state.json');
 let stopping=false;process.on('SIGINT',()=>{stopping=true;console.log('Finishing the current generation before stopping.');});
 let state=resume?JSON.parse(fs.readFileSync(folder+'/search-state.json')):{mean:[-.22,...basis.names.map(()=>0)],sigma:[.12,...basis.names.map(name=>name==='altitude_light'?.3:name==='vertical_speed_light'?.6:.1)],generation:0,episodes:0,history:[],best:null};
 const count=Number(process.env.LANDING_POPULATION??12),generations=Number(process.env.LANDING_GENERATIONS??12);
 try{
  if(process.argv.includes('--evaluate')){
   const checkpoint=JSON.parse(fs.readFileSync(process.env.LANDING_CHECKPOINT??folder+'/candidate.json'));
   const cases=Array.from({length:Number(process.env.LANDING_TESTS??12)},(_,i)=>({seed:73310219+i*104729,variability:i%2?.4:0}));
   const normal=await Promise.all(cases.map(c=>evaluate({weights:checkpoint.weights,cases:[c]})));
   const covered=await Promise.all(cases.map(c=>evaluate({weights:checkpoint.weights,cases:[{...c,covered:true}]})));
   const report={checkpoint:process.env.LANDING_CHECKPOINT??folder+'/candidate.json',normal:normal.flatMap(r=>r.flights),covered:covered.flatMap(r=>r.flights)};
   fs.writeFileSync(folder+'/landing-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }else for(let gen=0;gen<generations&&!stopping;gen++){
   const generation=state.generation+1,cases=[...([714133,910747,1883171,2753039].map((seed,i)=>({seed,variability:i%2?.2:0}))),{seed:181031+generation*15427,variability:0},{seed:219617+generation*17137,variability:.2}];
   const population=[state.mean];if(state.best&&state.best.parameters.some((v,i)=>v!==state.mean[i]))population.push(state.best.parameters);
   const covariance=state.covariance??state.sigma.map((s,i)=>state.sigma.map((_,j)=>i===j?s*s:0)),L=cholesky(covariance);
   while(population.length<count){const i=population.length,center=i%3===0&&state.best?state.best.parameters:state.mean,scale=i%2?.5:1.5,z=state.mean.map(()=>random.normal());population.push(center.map((m,j)=>m+scale*L[j].reduce((v,l,k)=>v+l*z[k],0)));}
   const results=await Promise.all(population.map(parameters=>evaluate({parameters,cases})));
   fs.appendFileSync(folder+'/search-trials.jsonl',JSON.stringify({generation,calibrationHash,cases,results})+'\n');
   results.sort((a,b)=>b.score-a.score);
   const elites=results.slice(0,Math.max(3,Math.floor(count/4))),mean=state.mean.map((_,i)=>elites.reduce((v,e)=>v+e.parameters[i],0)/elites.length);
   const sigma=mean.map((m,i)=>Math.max(i===0?.025:.018,Math.sqrt(elites.reduce((v,e)=>v+(e.parameters[i]-m)**2,0)/elites.length)*.8+state.sigma[i]*.2));
   const nextCovariance=mean.map((m,i)=>mean.map((n,j)=>.65*elites.reduce((v,e)=>v+(e.parameters[i]-m)*(e.parameters[j]-n),0)/elites.length+.35*covariance[i][j]+(i===j?(i===0?.005:.012)**2:0)));
   const best=[...results].sort((a,b)=>b.landings-a.landings||b.score-a.score)[0];state={...state,generation,episodes:state.episodes+results.length*cases.length,mean,sigma,covariance:nextCovariance,best};
   const entry={generation,calibrationHash,episodes:state.episodes,score:best.score,landings:best.landings,cases,parameters:best.parameters,touchdowns:best.flights.map(f=>({seed:f.seed,landed:f.landed,time:f.time,reason:f.reason,touchdown:f.touchdown}))};state.history.push(entry);
   const checkpoint={...freshEmbodied(),weights:decode(best.parameters),generation,episodes:state.episodes,scenario:0,autoOdor:false,instrumentLights:true,sensoryPresentation:'landing-light-indicators-v1',initialization:'Presented-light calibration followed by reward-only vertical-landing search; neutral attitude readouts',history:state.history,trainingMethod:'Cross-entropy search with learned parameter covariance on a sensory basis folded into the complete-graph motor readout; complete-flight reward guides proposals and landing count selects checkpoints',trainingScope:'Landing School, stationary deck, neutral pitch/roll/yaw/gaze',optics:'4x4 retinal-area integration',sensoryBasis:basis.names};
   fs.writeFileSync(folder+'/search-state.json',JSON.stringify(state));fs.writeFileSync(folder+'/candidate.json',JSON.stringify(checkpoint));console.log(JSON.stringify(entry));
   if(best.landings>=cases.length-1){
    const validationCases=Array.from({length:6},(_,i)=>({seed:41299001+i*13757,variability:i%2?.2:0}));
    const validation=await Promise.all(validationCases.map(c=>evaluate({parameters:best.parameters,cases:[c]})));
    const passed=validation.reduce((v,r)=>v+r.landings,0);state.episodes+=validationCases.length;
    console.log(JSON.stringify({generation,validationLandings:passed,total:validationCases.length,flights:validation.flatMap(r=>r.flights)}));
    fs.writeFileSync(folder+'/validation-latest.json',JSON.stringify(validation,null,2));
    if(passed>=5){fs.writeFileSync(folder+'/successful-candidate.json',JSON.stringify(checkpoint));break;}
   }
  }
 }finally{await Promise.all(workers.map(w=>w.terminate()));}
}
