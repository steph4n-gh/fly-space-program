// Compare numerical precision using fixed training starts. No policy changes.
import fs from 'node:fs';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {flightResult} from '../dist/full-controller.js';
const folder='artifacts/suite-training';
if(!isMainThread){
 const net=loadFullNetwork();net.setInputMode('embodied');
 const checkpoint=JSON.parse(fs.readFileSync('dist/assets/embodied-starter.json'));
 const basis=JSON.parse(fs.readFileSync('artifacts/landing-training/sensory-basis.json'));
 parentPort.on('message',({seed,precision,variability})=>{
  const Type=precision===64?Float64Array:Float32Array;
  net.activity=new Type(net.n);net.next=new Type(net.n);net.signed=new Type(net.n);net.reset();
  const s=createFlight(seed,0,variability);s.styleEnabled=false;s.autoOdor=false;
  const started=performance.now(),errors=[],trajectory=[];
  while(!s.done){
   const packet=sampleEmbodied(s),action=net.decide(packet.observations,checkpoint.weights);
   const decoded=basis.basis.map(w=>net.motorIndices.reduce((v,k,i)=>v+w[i]*net.activity[k],w[2129]));
   const lights=[packet.screens[1].data[(4*64+20)*4],packet.screens[1].data[(41*64+20)*4]],target=[(lights[0]-16)/224,2*((lights[1]-16)/224-.5)];
   errors.push(decoded.slice(0,2).map((v,i)=>v-target[i]));trajectory.push({t:s.t,y:s.y,vy:s.vy,decoded,action:action[0]});
   for(let j=0,n=decisionSteps(s);j<n&&!s.done;j++)advance(s,action);
  }
  parentPort.postMessage({precision,...flightResult(s),wallSeconds:(performance.now()-started)/1000,lightRMSE:[0,1].map(i=>Math.sqrt(errors.reduce((v,e)=>v+e[i]**2,0)/errors.length)),trajectory});
 });
}else{
 fs.mkdirSync(folder,{recursive:true});
 const cases=[714133,910747,2753039,319874].map((seed,i)=>({seed,variability:i%2?.2:0}));
 const workers=Array.from({length:4},()=>new Worker(new URL(import.meta.url))),queue=[],results=[];
 const dispatch=()=>{for(const w of workers)if(!w.busy&&queue.length){const job=queue.shift();w.busy=true;w.resolve=job.resolve;w.postMessage(job.data);}};
 const evaluate=data=>new Promise(resolve=>{queue.push({data,resolve});dispatch();});
 for(const w of workers){w.busy=false;w.on('message',result=>{w.busy=false;w.resolve(result);dispatch();});w.on('error',e=>{console.error(e);process.exit(1);});}
 try{await Promise.all([32,64].flatMap(precision=>cases.map(c=>evaluate({...c,precision}).then(r=>{results.push(r);fs.writeFileSync(folder+'/precision-probe.json',JSON.stringify({cases,results}));console.log(JSON.stringify({...r,trajectory:undefined}));}))));}
 finally{await Promise.all(workers.map(w=>w.terminate()));}
}
