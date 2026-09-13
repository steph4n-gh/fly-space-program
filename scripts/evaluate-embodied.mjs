import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {rollout,flightResult,validCheckpoint,isEmbodied} from '../dist/full-controller.js';
import {SCENARIOS} from '../dist/missions.js';

if(!isMainThread){
 const network=loadFullNetwork();
 parentPort.on('message',task=>{
  let last;const start=performance.now();
  for(const state of rollout(network,workerData.weights,task.seed,task.scenario,false,task.variability,workerData.activationGain,'embodied',true,false))last=state;
  parentPort.postMessage({...flightResult(last),wallSeconds:(performance.now()-start)/1000});
 });
}else{
 const file=process.argv[2]??'dist/assets/embodied-starter.json',output=process.argv[3]??'artifacts/embodied-training/baseline.json',count=Number(process.argv[4]??2);
 if(!Number.isInteger(count)||count<1)throw Error('Cases per mission must be a positive integer');
 const checkpointBytes=fs.readFileSync(file),c=JSON.parse(checkpointBytes);if(!validCheckpoint(c)||!isEmbodied(c))throw Error('Expected an embodied checkpoint');
 const cases=SCENARIOS.flatMap((_,scenario)=>Array.from({length:count},(_,i)=>({scenario,seed:810000001+scenario*10007+i*7919,variability:i%2?.4:0}))),flights=[];
 const total=cases.length;fs.mkdirSync(path.dirname(output),{recursive:true});
 const report=()=>({checkpoint:file,sha256:createHash('sha256').update(checkpointBytes).digest('hex'),inputMode:'embodied',style:false,autoOdor:true,eyesCovered:false,generation:c.generation,episodes:c.episodes,complete:flights.length===total,completed:flights.length,total,landings:flights.filter(f=>f.landed).length,missions:SCENARIOS.map((s,scenario)=>{const f=flights.filter(f=>f.scenario===scenario);return{scenario,title:s.title,landings:f.filter(f=>f.landed).length,episodes:f.length,meanScore:f.length?f.reduce((sum,f)=>sum+f.score,0)/f.length:null};}),flights:[...flights].sort((a,b)=>a.scenario-b.scenario||a.seed-b.seed)});
 const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(report(),null,2));fs.renameSync(output+'.tmp',output);};save();
 await Promise.all(Array.from({length:Math.min(3,cases.length)},()=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{weights:c.weights,activationGain:c.activationGain??1}});
  const next=()=>{const task=cases.shift();if(task)worker.postMessage(task);else worker.terminate().then(resolve);};
  worker.on('error',reject);worker.on('message',result=>{flights.push(result);save();console.log(JSON.stringify(result));next();});next();
 })));
 // Every case is retained, including failures. Evaluation seeds never train a policy.
 const result=report();save();
 console.log(JSON.stringify({output,landings:result.landings,total:result.total}));
}
