import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadFullNetwork} from './full-network-node.mjs';
import {attachNativeRate} from './native-rate.mjs';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {FLIGHT_PANEL} from '../dist/flight-instruments.js';
const js=loadFullNetwork(),native=attachNativeRate(loadFullNetwork());
for(const net of [js,native])net.setInputMode('embodied');
const checkpoint=JSON.parse(fs.readFileSync('artifacts/suite-training/vertical/candidate.json'));
let javascriptMs=0,nativeMs=0,maxActivityDifference=0,maxCommandDifference=0,decisions=0;
for(const scenario of [0,1,7,17,24]){
 const s=createFlight(715033+scenario*104729,scenario,.4);s.sensoryPresentation=FLIGHT_PANEL;s.autoOdor=false;s.styleEnabled=false;
 for(const net of [js,native]){net.reset();net.setActivationGain(scenario===17?1.05:1);}
 for(let step=0;step<20&&!s.done;step++){
  const obs=sampleEmbodied(s).observations;
  if(scenario===7&&step===8)for(const net of [js,native])net.pulse={index:net.motorIndices[0],steps:2};
  const start=performance.now(),a=js.decide(obs,checkpoint.weights),middle=performance.now(),b=native.decide(obs,checkpoint.weights),end=performance.now();
  javascriptMs+=middle-start;nativeMs+=end-middle;decisions++;
  for(let i=0;i<js.n;i++)maxActivityDifference=Math.max(maxActivityDifference,Math.abs(js.activity[i]-native.activity[i]));
  for(let i=0;i<10;i++)maxCommandDifference=Math.max(maxCommandDifference,Math.abs(a[i]-b[i]));
  for(let i=0,n=decisionSteps(s);i<n&&!s.done;i++)advance(s,a);
 }
}
const report={neurons:js.n,edges:js.pre.length,decisions,passesPerDecision:2,javascriptMs,nativeMs,speedup:javascriptMs/nativeMs,maxActivityDifference,maxCommandDifference};
fs.writeFileSync('artifacts/native-rate/parity.json',JSON.stringify(report,null,2));console.log(report);
assert(maxActivityDifference<=1e-10,'Native neuron update diverges from browser arithmetic');
assert(maxCommandDifference<=1e-7,'Native commands diverge from browser arithmetic');
