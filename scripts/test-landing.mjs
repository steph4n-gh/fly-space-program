// Frozen-checkpoint tests. Only the named sensory intervention changes between
// paired flights; all physics, graph edges and landing criteria remain intact.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {sampleEmbodied,renderRetinas} from '../dist/perception.js';
import {flightResult,validCheckpoint,isEmbodied} from '../dist/full-controller.js';

const folder='artifacts/landing-training';
if(!isMainThread){
 const net=loadFullNetwork();net.setInputMode('embodied');
 const blackCamera={width:64,height:48,data:new Uint8ClampedArray(64*48*4)};
 parentPort.on('message',job=>{
  const {seed,variability,mode}=job,s=createFlight(seed,0,variability);s.styleEnabled=false;s.autoOdor=mode==='automaticOdor';s.eyesCovered=mode==='covered';s.instrumentLights=mode!=='indicatorsOff';s.activationGain=job.activationGain;net.setActivationGain(job.activationGain);net.reset();
  const trajectory=[];
  while(!s.done){
   const senses=sampleEmbodied(s),obs=[...senses.observations];
   if(mode==='cameraOff'){
    const eyes=renderRetinas(s,[senses.screens[0],blackCamera,senses.screens[2]]);
    for(let k=0;k<2;k++)for(let i=0;i<768;i++){const d=eyes[k].data,j=i*4;obs[k*768+i]=3*(.2126*d[j]+.7152*d[j+1]+.0722*d[j+2])/255;}
   }
   const action=net.decide(obs,job.weights);
   trajectory.push({time:s.t,height:s.y,verticalSpeed:s.vy,throttle:s.throttle,command:action[0],fuel:s.fuel});
   for(let j=0,steps=decisionSteps(s);j<steps&&!s.done;j++)advance(s,action);
  }
  parentPort.postMessage({mode,...flightResult(s),trajectory});
 });
}else{
 const file=process.env.LANDING_CHECKPOINT??folder+'/successful-candidate.json',checkpoint=JSON.parse(fs.readFileSync(file));
 if(!validCheckpoint(checkpoint)||!isEmbodied(checkpoint))throw Error('A valid embodied checkpoint is required');
 const modes=(process.env.LANDING_TEST_MODES??'normal,covered,indicatorsOff,automaticOdor').split(',');
 if(modes.some(m=>!['normal','covered','cameraOff','indicatorsOff','automaticOdor'].includes(m)))throw Error('Unknown sensory intervention');
 const cases=Array.from({length:Number(process.env.LANDING_TESTS??24)},(_,i)=>({seed:Number(process.env.LANDING_TEST_SEED??73310219)+i*Number(process.env.LANDING_TEST_STRIDE??104729),variability:i%2?Number(process.env.LANDING_TEST_VARIABILITY??.4):0}));
 const workers=Array.from({length:4},()=>new Worker(new URL(import.meta.url))),queue=[];
 const evaluate=data=>new Promise(resolve=>{queue.push({data,resolve});dispatch();});
 const dispatch=()=>{for(const w of workers)if(!w.busy&&queue.length){const job=queue.shift();w.busy=true;w.resolve=job.resolve;w.postMessage(job.data);}};
 for(const w of workers){w.busy=false;w.on('message',result=>{w.busy=false;w.resolve(result);dispatch();});w.on('error',e=>{console.error(e);process.exit(1);});}
 const report={schema:'landing-test-v1',checkpoint:file,weightSHA256:crypto.createHash('sha256').update(Buffer.from(Float64Array.from(checkpoint.weights).buffer)).digest('hex'),controller:checkpoint.circuit,sensorSchema:checkpoint.sensorSchema,cases,modes,flights:[]};
 const out=process.env.LANDING_TEST_OUTPUT??folder+'/landing-test.json';
 try{
  for(const mode of modes){
   await Promise.all(cases.map(test=>evaluate({...test,mode,weights:checkpoint.weights,activationGain:checkpoint.activationGain??1}).then(result=>{
    report.flights.push(result);fs.writeFileSync(out+'.tmp',JSON.stringify(report));fs.renameSync(out+'.tmp',out);
    console.log(JSON.stringify({mode,seed:result.seed,landed:result.landed,reason:result.reason,touchdown:result.touchdown,time:result.time,completed:report.flights.length,total:cases.length*modes.length}));
   })));
  }
 }finally{await Promise.all(workers.map(w=>w.terminate()));}
}
