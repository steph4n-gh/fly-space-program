// Physical positive control for the outcome measure, not a learned flight.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {PLANET_RADIUS,PLANET_MU,orbitalElements} from '../dist/orbital.js';
import {createInsertionHold,updateInsertionHold} from './insertion-hold.mjs';

const flight=createFlight(1703,24),record=createInsertionHold();
flight.y=1008;flight.vx=Math.sqrt(PLANET_MU/(PLANET_RADIUS+1000));
flight.liftedOff=true;flight.spaceReached=true;flight.orbitPhase=1;
flight.styleEnabled=false;
while(flight.t<3.5){
 const before=flight.t;advance(flight,[-1,0,0,0,0,0,0,0,-1,0]);
 const untouched=JSON.stringify(flight),quality=updateInsertionHold(record,flight,flight.t-before);
 assert.equal(JSON.stringify(flight),untouched,'Measuring reward mutated the flight');
 if(flight.t<3){assert(quality<1);assert(!flight.milestones.some(m=>m.name==='Stable orbit'));}
}
assert(flight.milestones.some(m=>m.name==='Stable orbit'));
assert(Math.abs(record.best-1)<1e-12);
assert(!flight.orbitComplete&&!flight.landed,'The reward must not complete the mission');

// Independently sum each trailing interval from the complete physical history.
// This checks mixed 50/250 ms intervals against the production rolling queue.
let completeReplays=0,maxDifference=0;
for(const directory of ['orbital-calibrated-probe','orbital-calibrated-g6-probe']){
 const base='artifacts/suite-training/'+directory;
 const probe=JSON.parse(fs.readFileSync(base+'/probe.json')),summary=JSON.parse(fs.readFileSync(base+'/hold-summary.json'));
 for(const [index,result] of probe.results.entries()){
  const raw=result.flights[0],s=createFlight(raw.seed,raw.scenario,raw.variation.level);s.styleEnabled=false;
  const intervals=[];let best=0;
  for(const row of raw.trajectory)for(let j=0,n=decisionSteps(s);j<n&&!s.done;j++){
   const start=s.t;advance(s,row.action);
   const e=orbitalElements(s),target=s.orbitConfig.orbitHeight;
   const altitudePenalty=(Math.max(800-e.periapsis,0)+Math.max(Math.abs(e.apoapsis-target)-200,0))/200;
   const speedPenalty=Math.max(Math.abs(s.vy)-5,0)/5;
   const value=Math.exp(-altitudePenalty-speedPenalty);
   intervals.push({start,end:s.t,value});
   let integral=0;
   for(let k=intervals.length-1;k>=0&&intervals[k].end>s.t-3;k--){
    const part=intervals[k];integral+=part.value*(part.end-Math.max(part.start,s.t-3));
   }
   best=Math.max(best,integral/3);
  }
  assert(s.done&&s.t===raw.time);
  const difference=Math.abs(best-summary.flights[index].insertionHoldQuality);
  assert(difference<1e-11);maxDifference=Math.max(maxDifference,difference);completeReplays++;
 }
}
assert.equal(completeReplays,6);
console.log('PASS: physical stable-orbit positive control without premature mission completion; six complete mixed-step replays independently verify the rolling insertion measure. Maximum difference: '+maxDifference);
