import assert from 'node:assert/strict';
import {createFlight,sensorSnapshot,fullSensors,advance,deck,physicsStep} from '../dist/engine3d.js';
import {SIGNALS,NETWORK_INPUTS,SENSOR_SCHEMA} from '../dist/signals.js';
assert.equal(NETWORK_INPUTS,46);assert.equal(new Set(SIGNALS.map(s=>s[0])).size,46);assert.equal(SENSOR_SCHEMA,'flight-senses-46-v1');
for(let scenario=0;scenario<27;scenario++){
 const a=createFlight(917231,scenario,.4),b=createFlight(917231,scenario,.4);assert.deepEqual(a,b);
 for(let i=0;i<30&&!a.done;i++){
  const packet=sensorSnapshot(a);assert.equal(packet.raw.length,46);assert.equal(packet.encoded.length,46);assert(packet.raw.every(Number.isFinite));assert(packet.encoded.every(v=>Number.isFinite(v)&&v>=-3&&v<=3));assert.deepEqual(packet.encoded,fullSensors(b));
  const old=[a.vx,a.vy,a.vz],dt=physicsStep(a),action=Array.from({length:10},(_,k)=>Math.sin(i*.13+k)*.45);advance(a,action);advance(b,action);assert.deepEqual(a,b);assert.deepEqual(a.previousCommands,action);assert.deepEqual(a.motionSample,[(a.vx-old[0])/dt,(a.vy-old[1])/dt,(a.vz-old[2])/dt]);
 }
}
for(const scenario of [1,24]){
 const a=createFlight(171,scenario),b=structuredClone(a);b.throttle=.81;b.gimbal=.11;b.gimbalZ=-.11;b.finAngles[0]=.32;b.previousCommands=[.2,.3,0,.4,0,0,.5,.6,-1,0];
 const p=sensorSnapshot(b);assert.equal(p.raw[24],81);assert.equal(p.encoded[25],.5);assert.equal(p.encoded[26],-.5);assert.equal(p.encoded[32],.32/.45);assert.equal(p.encoded[41],.2);assert.equal(p.encoded[42],.3);assert.equal(p.encoded[43],.4);assert.equal(p.encoded[44],.5);assert.equal(p.encoded[45],.6);assert.notDeepEqual(p.encoded,fullSensors(a));
}
const varied=createFlight(491,11,.7);for(const t of [0,10,20]){const p=deck(varied,t),a=deck(varied,t-1e-5),b=deck(varied,t+1e-5);assert(Math.abs((b.x-a.x)/2e-5-p.vx)<1e-7);assert(Math.abs((b.z-a.z)/2e-5-p.vz)<1e-7);}
console.log('PASS: 46 stable sensor channels; authoritative actuator/history/motion feedback; deterministic randomized flights and noisy packets across 27 profiles; exact varied-deck velocities.');
