import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,advance,actionTargets} from '../dist/engine3d.js';
import {captureDecision,SIGNALS,CONTROLS} from '../dist/decision.js';
const net=loadFullNetwork(),weights=JSON.parse(fs.readFileSync('dist/assets/full-pilot.json')).weights;
assert.equal(SIGNALS.length,19);assert.equal(CONTROLS.length,10);
const s=createFlight(8723,1);let checked=0;
for(let step=0;step<9;step++){
 const obs=fullSensors(s),before=net.snapshot(),trace=captureDecision(s,obs),commands=Array.from(net.decide(obs,weights));
 if(step===0||step===8){
  const live=net.snapshot(),result=net.explain(obs,weights,before,commands);
  assert.equal(result.replayError,0);assert.deepEqual(net.snapshot(),live,'Diagnostic replays must restore every live state and pulse');
  for(let i=0;i<obs.length;i++){net.restore(before);const changed=[...obs];changed[i]=0;assert.deepEqual(Array.from(net.decide(changed,weights)),result.neutralCommands[i]);}
  net.restore(live);assert.deepEqual(trace.observations,obs);obs[0]+=1;assert.notEqual(trace.observations[0],obs[0]);checked++;
 }
 for(let j=0;j<3;j++)advance(s,commands);
}
const stale=createFlight(1,1);stale.fuel=.42;stale.seenFuel=.81;stale.engineHealth=0;stale.seenEngine=1;stale.fuelAge=2;stale.engineAge=4;
const trace=captureDecision(stale,fullSensors(stale));
assert.equal(trace.raw[6],81);assert.equal(trace.raw[15],100);assert.equal(trace.raw[16],2);assert.equal(trace.raw[17],4);assert.equal(trace.situation.fuel,.42);assert.equal(trace.situation.engine,0);
const extreme=Array(10).fill(1),targets=actionTargets(extreme),actuated=createFlight(1,0);actuated.y=300;
for(let i=0;i<10;i++)advance(actuated,extreme);
for(let i=0;i<10;i++)assert.equal(actuated[CONTROLS[i][1]],targets[i]);
console.log(`PASS: ${checked} complete-graph decisions × 19 exact isolated replays; live-state restoration, instrument memory and all actuator mappings.`);
