import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {SCENARIOS,createFlight,deck,advance,fullSensors} from '../dist/engine3d.js';
import {familyProfiles} from '../dist/missions.js';
import {FlightPresentation} from '../dist/presentation.js';
import {limbTargets} from '../dist/kinematics.js';
import {loadFullNetwork} from './full-network-node.mjs';
const original=execFileSync('git',['show','0bec91b:dist/engine3d.js'],{encoding:'utf8'}).replace("'./engine.js'",JSON.stringify(pathToFileURL(process.cwd()+'/dist/engine.js').href));
const old=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));
for(let scenario=0;scenario<8;scenario++){
 const a=old.createFlight(887123,scenario),b=createFlight(887123,scenario);
 for(let step=0;step<180;step++){
  const action=Array.from({length:10},(_,k)=>Math.sin(step*.027+k)*.6);old.advance(a,action);advance(b,action);
  for(const key of Object.keys(a))if(typeof a[key]==='number')assert.equal(b[key],a[key],`Original mission ${scenario}, ${key}`);
 }
}
assert.equal(SCENARIOS.length,27);assert.deepEqual(['center','degraded','out','orbital'].flatMap(familyProfiles).sort((a,b)=>a-b),Array.from({length:27},(_,i)=>i));
for(let scenario=0;scenario<24;scenario++)for(const t of [0,5,15,32]){
 const s=createFlight(32,scenario),p=deck(s,t),a=deck(s,t-1e-5),b=deck(s,t+1e-5);
 assert.ok(Math.abs((b.x-a.x)/2e-5-p.vx)<1e-7);assert.ok(Math.abs((b.z-a.z)/2e-5-p.vz)<1e-7);
}
assert.equal(createFlight(1,14).fuel,.38);assert.equal(createFlight(1,17).omegaYaw,.8);assert.ok(createFlight(1,18).vy<=-28);
for(const scenario of [20,21,22,23]){const s=createFlight(7,scenario);s.t=SCENARIOS[scenario].faultAt-.01;advance(s,Array(10).fill(0));assert.equal(s.engineFailed,false);advance(s,Array(10).fill(0));assert.equal(s.engineHealth,SCENARIOS[scenario].engineHealth);}
const normal=createFlight(1,2),slow=createFlight(1,15);advance(normal,Array(10).fill(1));advance(slow,Array(10).fill(1));assert.equal(slow.throttle,normal.throttle*.5);
const s=createFlight(1,1),originalState=structuredClone(s),p=new FlightPresentation();p.reset(s);
s.t=.05;s.x+=10;s.heading+=7;s.finAngles[0]=1;p.push(s);s.t=.1;s.x+=10;s.done=true;p.push(s);
const rendered=p.sample(.025,1);assert.equal(rendered.x,originalState.x+5);assert.equal(rendered.heading,originalState.heading+3.5);assert.equal(rendered.finAngles[0],.5);assert.equal(rendered.done,false);
assert.equal(p.sample(1,1,true).t,.025);assert.equal(p.sample(10,1).t,.1);assert.equal(p.view.done,true);assert.equal(s.t,.1);assert.equal(p.ahead,0);p.reset(originalState);assert.equal(p.view.done,false);assert.equal(p.samples.length,1);
const poses=limbTargets(s);assert.equal(poses.length,6);s.throttle=.9;assert.notEqual(limbTargets(s)[0][2],poses[0][2]);assert.deepEqual(limbTargets(s).slice(1),poses.slice(1));
const net=loadFullNetwork(),weights=JSON.parse(fs.readFileSync('dist/assets/full-pilot.json')).weights,obs=fullSensors(createFlight(187,3));for(let i=0;i<4;i++)net.decide(obs,weights);
let checks=0;
for(const control of [0,1,8,9]){
 const live=net.snapshot(),trace=net.traceControl(weights,control),stride=2130;assert.equal(trace.totalOutputs,2129);
 const read=()=>{let sum=weights[control*stride+stride-1];for(let j=0;j<stride-1;j++)sum+=weights[control*stride+j]*net.activity[net.motorIndices[j]];return Math.tanh(sum);};
 assert.equal(read(),trace.command);
 for(const neuron of trace.neurons)for(const edge of neuron.edges){
  net.activity.set(live.signed.map((v,i)=>v*net.signs[i]));const count=net.weight[edge.edge];net.weight[edge.edge]=0;net.pulse=live.lastPulseIndex>=0?{index:live.lastPulseIndex,steps:1}:null;net.step(obs);
  assert.ok(Math.abs(read()-trace.command-edge.commandDelta)<1e-12,'Removed-edge command must match independent complete pass');net.weight[edge.edge]=count;net.restore(live);checks++;
 }
 assert.deepEqual(net.snapshot(),live);
}
console.log(`PASS: original eight mission dynamics unchanged; 24 profiles, analytical deck velocities and faults; render interpolation, pause and terminal timing; ${checks} independently removed graph edges and all-control readouts.`);
