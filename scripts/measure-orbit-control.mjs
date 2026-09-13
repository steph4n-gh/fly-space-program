import fs from 'node:fs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,advance,decisionSteps} from '../dist/engine3d.js';
import {orbitalGuidance} from '../dist/orbital.js';
import {flightResult} from '../dist/full-controller.js';
if(isMainThread){
 const tasks=[24,25,26].flatMap(scenario=>[0,.4].flatMap(variability=>[961119,981257].map(seed=>({scenario,steps:2,seed,variability})))).concat([24,26].map(scenario=>({scenario,steps:2,seed:941101,variability:0,matched:true}))),results=[];let next=0;
 await Promise.all(Array.from({length:4},async()=>{while(next<tasks.length){const task=tasks[next++];await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:task});w.on('message',r=>{results.push(r);console.log(JSON.stringify(r));resolve();});w.on('error',reject);});}}));fs.writeFileSync('/tmp/fly-v9/orbit-regression.json',JSON.stringify(results,null,2));
}else{
 const {scenario,steps,seed,variability=0}=workerData,net=loadFullNetwork(),weights=JSON.parse(fs.readFileSync('dist/assets/full-orbital.json')).weights,s=createFlight(seed,scenario,variability),samples=[];let previous=null;
 while(!s.done){const a=net.decide(fullSensors(s),weights);if(s.orbitPhase===2&&s.t>(s.milestones.find(m=>m.name==='Stable orbit')?.time??0)+10){const g=orbitalGuidance(s);samples.push({rcs:a[2],pitch:s.angle,rate:s.omega,error:g.angleError,variation:previous===null?0:Math.abs(a[2]-previous)});previous=a[2];}for(let j=0,count=decisionSteps(s);j<count&&!s.done;j++)advance(s,a);}
 const avg=key=>samples.reduce((n,s)=>n+Math.abs(s[key]),0)/samples.length,rms=key=>Math.sqrt(samples.reduce((n,s)=>n+s[key]**2,0)/samples.length);parentPort.postMessage({steps,matched:!!workerData.matched,...flightResult(s),coast:{samples:samples.length,rcsRMS:rms('rcs'),meanCommandChange:avg('variation'),pitchRateRMS:rms('rate'),pitchErrorRMS:rms('error'),pitchRangeDegrees:(Math.max(...samples.map(s=>s.pitch))-Math.min(...samples.map(s=>s.pitch)))*180/Math.PI}});
}
