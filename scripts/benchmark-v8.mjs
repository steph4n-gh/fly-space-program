import fs from 'node:fs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {SCENARIOS} from '../dist/missions.js';
import {BASELINE,previous,LegacyNetwork,legacyMeasuredSensors} from './legacy-v7.mjs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,advance} from '../dist/engine3d.js';
import {flightResult} from '../dist/full-controller.js';
const files={center:'full-pilot',degraded:'full-specialist',out:'full-expert',orbital:'full-orbital'},hash=w=>createHash('sha256').update(Buffer.from(Float64Array.from(w).buffer)).digest('hex');
if(isMainThread){
 const seeds=[941101,947213,953327,967441,971557,983669,991783,997897],cases=[];
 for(let k=0;k<seeds.length;k++)for(let scenario=0;scenario<27;scenario++)for(const controller of ['current','baseline'])cases.push({seed:seeds[k],scenario,variability:k<4?0:.4,controller});
 const checkpoints=Object.fromEntries(Object.entries(files).map(([family,name])=>[family,JSON.parse(fs.readFileSync(`dist/assets/${name}.json`))]));const hashes=Object.fromEntries(Object.entries(checkpoints).map(([family,c])=>[family,hash(c.weights)])),flights=[],started=Date.now(),dir='/tmp/fly-v8';let next=0,active=0;
 if(Object.values(checkpoints).some(c=>(c.activationGain??1)!==1))throw Error('The main comparison evaluates baseline gain only');
 const output={activationGain:1,controller:'malecns-full-rate-v2',baseline:BASELINE,seeds,hashes,flights};
 await new Promise((resolve,reject)=>{for(let i=0;i<4;i++){const worker=new Worker(new URL(import.meta.url),{workerData:{checkpoints}});active++;const dispatch=()=>{if(next<cases.length)worker.postMessage(cases[next++]);else {worker.postMessage(null);if(--active===0)resolve();}};worker.on('message',result=>{flights.push(result);fs.writeFileSync(dir+'/benchmark-progress.json',JSON.stringify(output));console.log(JSON.stringify({completed:flights.length,total:cases.length,seconds:Math.round((Date.now()-started)/1000),...result}));dispatch();});worker.on('error',reject);dispatch();}});
 flights.sort((a,b)=>a.scenario-b.scenario||a.seed-b.seed||a.controller.localeCompare(b.controller));output.seconds=Math.round((Date.now()-started)/1000);fs.writeFileSync(dir+'/benchmark.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify({complete:true,seconds:output.seconds,current:flights.filter(f=>f.controller==='current'&&f.landed).length,baseline:flights.filter(f=>f.controller==='baseline'&&f.landed).length,flightsPerController:cases.length/2}));
}else{
 const net=loadFullNetwork(),old=new LegacyNetwork(net),teachers=Object.fromEntries(Object.entries(files).map(([family,name])=>[family,JSON.parse(previous(`dist/assets/${name}.json`))]));
 parentPort.on('message',task=>{if(!task){parentPort.close();return;}const {scenario,seed,variability,controller}=task,family=SCENARIOS[scenario].family,legacy=controller==='baseline',network=legacy?old:net,weights=(legacy?teachers:workerData.checkpoints)[family].weights,s=createFlight(seed,scenario,variability);network.reset();while(!s.done){const action=network.decide(legacy?legacyMeasuredSensors(s):fullSensors(s),weights);for(let i=0;i<3&&!s.done;i++)advance(s,action);}parentPort.postMessage({...flightResult(s),controller,variability});});
}
