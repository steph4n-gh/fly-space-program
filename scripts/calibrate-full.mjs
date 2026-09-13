import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createBrain,think,rng} from '../dist/engine3d.js';
const net=loadFullNetwork(),stride=net.motorIndices.length+1,r=rng(187521),count=2400;
const json=f=>JSON.parse(fs.readFileSync('dist/assets/'+f)),c=json('circuit-3d.json'),brains=['falcon-ocean.json','falcon-specialist.json','falcon-expert.json'].map(f=>createBrain(c,json(f).weights));
const x=new Float64Array(count*stride),y=new Float64Array(count*30),zero=new Float64Array(stride*10);
const ranges=[1.1,.8,.9,.4,.6,2.5,.5,.6,1.1,.8,.4,.6,.6,2,2.3,1,2,2,1];
for(let t=0;t<count;t++){
 const obs=ranges.map((scale,i)=>i===5||i>=16?scale*r():r.normal()*scale*.55);
 obs[13]=-2.1*r();obs[14]=r()*2.4-.2;obs[15]=t%3===0?-1:t%3===1?-.52:0;obs[18]=t%2;
 if(t%5===0){obs[13]=0;obs[14]=r.normal()*.15;}if(t%29===0)net.reset();
 net.decide(obs,zero);for(let j=0;j<stride-1;j++)x[t*stride+j]=net.activity[net.motorIndices[j]];x[t*stride+stride-1]=1;
 const teacherObs=[...obs];teacherObs[13]=0;teacherObs[14]=0;
 brains.forEach((brain,k)=>{const a=Array.from(think(brain,teacherObs));a[5]=Math.tanh(-1.8*obs[13]-1.4*obs[14]);for(let j=0;j<10;j++)y[t*30+k*10+j]=Math.atanh(Math.max(-.9999,Math.min(.9999,a[j])));});
 if(t%200===0)console.log(JSON.stringify({sample:t,total:count}));
}
fs.mkdirSync('/tmp/fly-full',{recursive:true});
fs.writeFileSync('/tmp/fly-full/features.bin',Buffer.from(x.buffer));fs.writeFileSync('/tmp/fly-full/targets.bin',Buffer.from(y.buffer));fs.writeFileSync('/tmp/fly-full/meta.json',JSON.stringify({samples:count,stride,sensory:net.sensoryCount,method:'independent synthetic telemetry and graph-history calibration',seed:187521}));
