// Independent stimulus calibration. The targets are displayed lamp values and
// body feedback, never an expert's flight controls or a hidden navigation array.
import fs from 'node:fs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,advance,rng} from '../dist/engine3d.js';
import {sampleEmbodied,renderRetinas} from '../dist/perception.js';
import {FLIGHT_PANEL,INSTRUMENT_FIELDS,FLIGHT_BODY_CHANNELS,paintFlightInstruments,presentedInstrumentValues} from '../dist/flight-instruments.js';
const dynamic=isMainThread?process.argv.includes('--dynamic'):workerData.dynamic,folder='artifacts/suite-training'+(dynamic?'/dynamic':'');
if(!isMainThread){
 const {part,count}=workerData,net=loadFullNetwork();net.setInputMode('embodied');
 const samples=count*(dynamic?18:2),features=new Float32Array(samples*2129),targets=new Float32Array(samples*28),weights=Array(21300).fill(0),contexts=[];
 let sample=0;
 for(let episode=0;episode<count;episode++){
  const id=part*count+episode+(dynamic?1000000:0),seed=83140013+id*7919,r=rng(seed),scenario=id%27,s=createFlight(seed,scenario,.4);
  s.sensoryPresentation=FLIGHT_PANEL;s.autoOdor=false;s.styleEnabled=false;s.y=20+r()*(s.orbital?2200:480);s.vy=(r()-.5)*60;s.vx=(r()-.5)*(s.orbital?600:30);s.vz=(r()-.5)*20;
  s.angle=(r()-.5)*(s.orbital?6.2:1.2);s.angleZ=(r()-.5)*.8;s.heading=(r()-.5)*Math.PI*2;
  s.omega=(r()-.5);s.omegaZ=(r()-.5);s.omegaYaw=(r()-.5);s.fuel=.25+.75*r();
  s.throttle=r();s.engineBank=r()<.5?1:3;s.selector=s.engineBank===3?1:0;s.gaze=0;
  const narrow=id%2===0,scale=narrow?.2:1,action=[s.throttle*2-1,(r()-.5)*scale,(r()-.5)*scale,(r()-.5)*scale,(r()-.5)*scale,(r()-.5)*scale,(r()-.5)*scale,(r()-.5)*scale,s.selector?1:-1,0];
  advance(s,action);s.done=false;
  const levels=INSTRUMENT_FIELDS.map(()=>r()*2-1);
  const observation=()=>{
   delete s.perception;const packet=sampleEmbodied(s);paintFlightInstruments(packet.screens[1],levels);
   const eyes=renderRetinas(s,packet.screens),obs=packet.observations.slice();
   for(let k=0;k<2;k++)for(let j=0;j<768;j++){const d=eyes[k].data,i=j*4;obs[k*768+j]=3*(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;}
   return {obs,labels:[...presentedInstrumentValues(packet.screens[1]),...FLIGHT_BODY_CHANNELS.map(i=>obs[1536+i]-(i===13?1:0))]};
  };
  let {obs,labels}=observation();
  net.reset();
  for(let step=0;step<(dynamic?18:10);step++){
   if(dynamic&&step>0){
    if(step%3===0){for(let j=0;j<8;j++)action[j]=(r()-.5)*2*(narrow?.25:1);action[0]=r()*2-1;}
    for(let j=0;j<3;j++){s.done=false;advance(s,action);}
    ({obs,labels}=observation());
   }
   net.decide(obs,weights);
   if(dynamic||step>=8){for(let j=0;j<2129;j++)features[sample*2129+j]=net.activity[net.motorIndices[j]];targets.set(labels,sample*28);contexts.push(id);sample++;}
  }
  if((episode+1)%64===0)parentPort.postMessage({part,presentations:episode+1});
 }
 fs.writeFileSync(`${folder}/calibration-${part}-features.bin`,Buffer.from(features.buffer));
 fs.writeFileSync(`${folder}/calibration-${part}-targets.bin`,Buffer.from(targets.buffer));
 if(sample!==samples)throw Error('Incomplete calibration sample buffer');
 fs.writeFileSync(`${folder}/calibration-${part}.json`,JSON.stringify({samples,contexts,dynamic,featureCount:2129,targetCount:28,dtype:'float32-le',sensoryPresentation:FLIGHT_PANEL}));
 parentPort.postMessage({part,done:true,samples});
}else{
 fs.mkdirSync(folder,{recursive:true});
 const count=Number(process.env.SUITE_CALIBRATION_CONTEXTS??2048),parts=Number(process.env.SUITE_CALIBRATION_PARTS??4);
 if(count%parts)throw Error('Calibration count must divide into worker parts');
 await Promise.all(Array.from({length:parts},(_,part)=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{part,count:count/parts,dynamic}});
  worker.on('message',r=>console.log(JSON.stringify(r)));worker.on('error',reject);worker.on('exit',code=>code?reject(Error('Calibration worker failed')):resolve());
 })));
 for(let part=0;part<parts;part++){
  const meta=JSON.parse(fs.readFileSync(`${folder}/calibration-${part}.json`)),expected=count/parts*(dynamic?18:2);
  if(meta.dynamic!==dynamic||meta.samples!==expected||meta.contexts.length!==expected||fs.statSync(`${folder}/calibration-${part}-features.bin`).size!==expected*2129*4||fs.statSync(`${folder}/calibration-${part}-targets.bin`).size!==expected*28*4)throw Error('Calibration worker output does not match this collection');
 }
 fs.writeFileSync(folder+'/calibration-manifest.json',JSON.stringify({sensoryPresentation:FLIGHT_PANEL,contexts:count,samples:count*(dynamic?18:2),dynamic,parts,features:2129,targets:28,names:[...INSTRUMENT_FIELDS.map(x=>x[0]),...FLIGHT_BODY_CHANNELS.map(i=>'body_'+i)],bodyChannels:FLIGHT_BODY_CHANNELS,neurons:166700,edges:25582938,passesPerDecision:2},null,2));
}
