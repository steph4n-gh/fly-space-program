import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {rng} from '../dist/engine.js';
import {teacher} from './prototype-orbit.mjs';
const net=loadFullNetwork(),stride=2130,count=2400,r=rng(850194),x=new Float64Array(count*stride),y=new Float64Array(count*10),zero=new Float64Array(21300);
const ranges=[1,2,2,3,2,2,.5,2.04,1,.8,1.4,1.2,1.1,2,2,1,3,3,1];
for(let t=0;t<count;t++){
 const obs=ranges.map((range,i)=>i===5||i===12||i>=16&&i<=17?r()*range:r.normal()*range*.45);obs[7]=r()*4.08-2.04;obs[18]=[-1,0,1][t%3];obs[15]=0;
 if(t%7===0){obs[3]*=.04;obs[4]*=.04;obs[10]*=.04;obs[11]*=.04;obs[7]=-2.034;}if(t%31===0)net.reset();
 net.decide(obs,zero);for(let j=0;j<stride-1;j++)x[t*stride+j]=net.activity[net.motorIndices[j]];x[t*stride+stride-1]=1;
 const a=teacher(obs);for(let k=0;k<10;k++)y[t*10+k]=Math.atanh(Math.max(-.999999,Math.min(.999999,a[k])));
 if(t%300===0)console.log(JSON.stringify({sample:t,total:count}));
}
fs.mkdirSync('/tmp/fly-orbit',{recursive:true});fs.writeFileSync('/tmp/fly-orbit/features.bin',Buffer.from(x.buffer));fs.writeFileSync('/tmp/fly-orbit/targets.bin',Buffer.from(y.buffer));
