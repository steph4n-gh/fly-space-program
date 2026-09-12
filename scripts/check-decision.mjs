import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFlight,createBrain,prepareCircuit,think,sensors,advance,actionTargets} from '../dist/engine3d.js';
import {captureDecision,SIGNALS,CONTROLS} from '../dist/decision.js';
const read=p=>JSON.parse(fs.readFileSync(p));
const circuit=prepareCircuit(read('dist/assets/circuit-3d.json'));
const weights=read('dist/assets/falcon-ocean.json').weights;
assert.equal(SIGNALS.length,18);assert.equal(CONTROLS.length,10);
let samples=0;
for(const scenario of [0,1,6,7]) {
  const s=createFlight(8723,scenario),feedback=Float32Array.from({length:96},(_,i)=>Math.sin(i)*.2),brain=createBrain(circuit,weights,feedback);
  for(let step=0;step<150&&!s.done;step++) {
    const obs=sensors(s),action=think(brain,obs);
    if(step%6===0) {
      const before=JSON.stringify(brain),trace=captureDecision(s,brain,obs,action,{tick:step});
      assert.equal(JSON.stringify(brain),before,'Inspection must not mutate live brain arrays or feedback');
      assert.equal(trace.replayError,0,'Captured replay must match the actual control decision exactly');
      assert.deepEqual(trace.observations,obs);assert.deepEqual(trace.commands,Array.from(action));
      for(let i=0;i<18;i++) {
        const changed=[...obs];changed[i]=0;
        const fresh=createBrain(circuit,trace.weights,trace.feedback);
        assert.deepEqual(Array.from(think(fresh,changed)),trace.neutralCommands[i],'Every isolated replay must match a fresh controller call');
      }
      assert.deepEqual(Array.from(think(createBrain(circuit,trace.weights),obs)),trace.withoutFeedback);
      const saved=JSON.stringify(trace);brain.feedback[0]+=.001;brain.weights[0]+=.001;brain.action[0]+=.001;
      assert.equal(JSON.stringify(trace),saved,'Trace must own copies, not references to changing live buffers');
      samples++;
    }
    advance(s,action);
  }
}
const stale=createFlight(1,1);stale.fuel=.42;stale.seenFuel=.81;stale.engineHealth=0;stale.seenEngine=1;stale.fuelAge=2;stale.engineAge=4;
const brain=createBrain(circuit,weights),obs=sensors(stale),trace=captureDecision(stale,brain,obs,think(brain,obs));
assert.equal(trace.raw[6],81);assert.equal(trace.raw[15],100);assert.equal(trace.raw[16],2);assert.equal(trace.raw[17],4);
assert.equal(trace.situation.fuel,.42);assert.equal(trace.situation.engine,0);assert.equal(trace.observations[15],0);
const extreme=Array(10).fill(1),targets=actionTargets(extreme),actuated=createFlight(1,0);actuated.y=300;
for(let i=0;i<10;i++)advance(actuated,extreme);
for(let i=0;i<10;i++)assert.equal(actuated[CONTROLS[i][1]],targets[i],`${CONTROLS[i][0]} display must match the actual actuator mapping`);
assert.equal(actionTargets(Array(10).fill(-1))[8],0);assert.equal(actionTargets(Array(10).fill(1))[8],1);
console.log(`PASS: ${samples} live decisions, all 18 isolated input replays × 10 outputs, fixed feedback, snapshot isolation, instrument memory, and every actuator mapping.`);
