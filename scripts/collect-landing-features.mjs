import fs from 'node:fs';
import {createFlight,advance,decisionSteps,rng} from '../dist/engine3d.js';
import {sampleEmbodied,renderRetinas} from '../dist/perception.js';
import {loadFullNetwork} from './full-network-node.mjs';

// Policy exploration, with neutral attitude controls. Labels describe received
// pixels and body feedback. World state is retained for offline diagnostics;
// the final light-basis fitter does not use it as a label or runtime input.
const net=loadFullNetwork();net.setInputMode('embodied');
const out='artifacts/landing-training';fs.mkdirSync(out,{recursive:true});
const stride=net.motorIndices.length+1,weights=Array(stride*10).fill(0);weights[9*stride-1]=-1;
const im=()=>({width:64,height:48,data:new Uint8ClampedArray(64*48*4)}),screens=[im(),im(),im()];screens[1].data.fill(255);
const mask=renderRetinas(createFlight(1,0),screens).flatMap(eye=>Array.from({length:32*24},(_,i)=>eye.data[i*4]>200));
const records=[],flights=[];
for(let episode=0;episode<18;episode++){
 const seed=431003+episode*7919,s=createFlight(seed,0,episode%3===0?.4:0),random=rng(seed+49);
 s.styleEnabled=false;s.autoOdor=false;net.reset();
 let previous=null;
 const base=[.0,.2,.35,.45,.6,.85][episode%6];
 while(!s.done&&s.t<20){
  const packet=sampleEmbodied(s),obs=packet.observations;
  let mass=0,mx=0,my=0,mxx=0,myy=0,light=0,count=0;
  for(let i=0;i<1536;i++)if(mask[i]){
   const x=i%32-15.5,y=Math.floor(i%768/32)-11.5,v=Math.max(0,obs[i]-.65);
   mass+=v;mx+=v*x;my+=v*y;mxx+=v*x*x;myy+=v*y*y;light+=obs[i];count++;
  }
  const features=[mass/count,mass?mx/mass:0,mass?my/mass:0,mass?Math.sqrt(Math.max(0,(mxx+myy)/mass-(mx/mass)**2-(my/mass)**2)):0,light/count,...obs.slice(1536,1554)];
  // Random changes are a training policy, applied through its bias coefficient.
  const throttle=Math.max(0,Math.min(1,base+(episode>=12?.2*Math.sin(s.t*.8+random()*.4):0)));
  weights[stride-1]=Math.atanh(Math.max(-.999,Math.min(.999,throttle*2-1)));
  const action=net.decide(obs,weights);
  const target=features.concat(previous?features.slice(0,5).map((v,i)=>(v-previous[i])/.15):[0,0,0,0,0]);
  records.push({episode,seed,time:s.t,features:Array.from(net.motorIndices,i=>net.activity[i]),target,lights:[packet.screens[1].data[(4*64+20)*4]/255,packet.screens[1].data[(41*64+20)*4]/255],groundTruth:{cameraRange:s.y-2.28,verticalVelocity:s.vy}});previous=features;
  for(let j=0,steps=decisionSteps(s);j<steps&&!s.done;j++)advance(s,action);
 }
 flights.push({episode,seed,time:s.t,landed:s.landed,reason:s.reason,touchdown:s.touchdown,censored:!s.done});
 console.log(JSON.stringify({episode,records:records.length,...flights.at(-1)}));
}
fs.writeFileSync(out+'/perception-features.json',JSON.stringify({schema:'landing-neural-perception-v2',optics:'4x4 retinal-area integration',neurons:net.n,edges:net.pre.length,maskPixels:mask.filter(Boolean).length,labels:'Presented indicator brightness and physical body feedback; camera light moments and world state retained for diagnostics',records,flights}));
