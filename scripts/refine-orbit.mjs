import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,advance} from '../dist/engine3d.js';
import {teacher} from './prototype-orbit.mjs';
const net=loadFullNetwork(),weights=JSON.parse(fs.readFileSync('dist/assets/full-orbital.json')).weights,x=[],y=[];
for(const scenario of [24,25,26]){
 const s=createFlight(829417,scenario);net.reset();while(!s.done){const obs=fullSensors(s),a=net.decide(obs,weights),target=teacher(obs),repeat=s.orbitPhase===5?3:1;for(let n=0;n<repeat;n++){for(const j of net.motorIndices)x.push(net.activity[j]);x.push(1);for(const v of target)y.push(Math.atanh(Math.max(-.999999,Math.min(.999999,v))));}for(let i=0;i<3&&!s.done;i++)advance(s,a);}
 console.log(JSON.stringify({scenario,landed:s.landed,reason:s.reason,offset:[s.x-s.padX,s.z-s.padZ],vertical:s.vy,tilt:[s.angle,s.angleZ],samples:x.length/2130}));
}
fs.writeFileSync('/tmp/fly-orbit/trajectory-features.bin',Buffer.from(Float64Array.from(x).buffer));fs.writeFileSync('/tmp/fly-orbit/trajectory-targets.bin',Buffer.from(Float64Array.from(y).buffer));
