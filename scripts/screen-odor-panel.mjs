import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createFlight} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {loadOdorNetwork,odorObservation} from './odor-network.mjs';

const out='artifacts/odor-interface/odor-screen.json';
if(!isMainThread){
 const {network,atlas}=loadOdorNetwork(),c=workerData.checkpoint,state=createFlight(731033,0);state.autoOdor=false;
 const base=sampleEmbodied(state).observations,clean=odorObservation(base,atlas);
 for(let i=0;i<12;i++)network.decide(clean,c.weights);const before=network.snapshot();
 const readPools=()=>Object.fromEntries(Object.entries(atlas.motorGroups).map(([name,pool])=>[name,Object.fromEntries(['L','R'].map(side=>[side,pool[side].reduce((sum,i)=>sum+network.activity[i],0)/pool[side].length]))]));
 const run=stimuli=>{network.restore(before);const trace=[];
  for(let i=0;i<24;i++){const commands=Array.from(network.decide(i<12?odorObservation(base,atlas,stimuli):clean,c.weights));trace.push({decision:i+1,commands,pools:readPools()});}
  return trace;
 };
 const baseline=run([]);
 parentPort.on('message',index=>{
  const odor=atlas.odors[index],trials=[];
  for(const side of ['left','right']){
   const trace=run([{odor,[side]:1}]),last=trace[11],ref=baseline[11];
   trials.push({side,commandDelta:last.commands.map((v,i)=>v-ref.commands[i]),poolDelta:Object.fromEntries(Object.keys(last.pools).map(name=>[name,{L:last.pools[name].L-ref.pools[name].L,R:last.pools[name].R-ref.pools[name].R,bilateralDifference:last.pools[name].L-last.pools[name].R-ref.pools[name].L+ref.pools[name].R}])),trace});
  }parentPort.postMessage({index,key:odor.key,name:odor.name,measuredUnits:odor.measuredUnits,coverage:odor.coverage,trials});
 });
}else{
 const bytes=fs.readFileSync('dist/assets/embodied-starter.json'),checkpoint=JSON.parse(bytes),atlasBytes=fs.readFileSync('artifacts/odor-interface/odor-atlas.json'),atlas=JSON.parse(atlasBytes);
 const tasks=atlas.odors.flatMap((o,i)=>o.measuredUnits>=20?[i]:[]),total=tasks.length,results=[];
 await Promise.all(Array.from({length:3},()=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{checkpoint}});
  const next=()=>{const index=tasks.shift();if(index===undefined)worker.terminate().then(resolve);else worker.postMessage(index);};
  worker.on('error',reject);worker.on('message',result=>{results.push(result);if(results.length%10===0)console.log(JSON.stringify({completed:results.length,total}));next();});next();
 })));
 results.sort((a,b)=>a.index-b.index);
 const ranked=results.flatMap(o=>o.trials.map(t=>({name:o.name,key:o.key,side:t.side,wingDifference:t.poolDelta.wm.bilateralDifference,yawCommandDelta:t.commandDelta[5],coverage:o.coverage}))).sort((a,b)=>a.wingDifference-b.wingDifference);
 const report={schema:'odor-panel-screen-v1',checkpointSHA256:createHash('sha256').update(bytes).digest('hex'),atlasSHA256:createHash('sha256').update(atlasBytes).digest('hex'),sourceCommit:atlas.sourceCommit,license:atlas.license,neurons:atlas.neurons,edges:25582938,passesPerDecision:2,screenedOdors:total,minimumMeasuredUnits:20,readoutFixed:true,protocol:{scenario:0,seed:731033,prewarmDecisions:12,pulseDecisions:12,washoutDecisions:12,level:1,unit:'Dimensionless deviation from matched spontaneous-response reference',staticInputs:true},lowestWingDifference:ranked.slice(0,8),highestWingDifference:ranked.slice(-8).reverse(),results};
 fs.writeFileSync(out,JSON.stringify(report));console.log(JSON.stringify({out,lowest:report.lowestWingDifference,highest:report.highestWingDifference}));
}
