import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {isEmbodied,validCheckpoint} from '../dist/full-controller.js';

// A paired model assay, not a prediction of physical odor dose or living-fly behavior.
// Hold the images, body signals, initial graph state and readout fixed. Change
// only the four annotated odor inputs, and retain every command time series.
const file=process.argv[2]??'dist/assets/embodied-starter.json',output=process.argv[3]??'artifacts/embodied-training/odor-assay.json';
const bytes=fs.readFileSync(file),c=JSON.parse(bytes);if(!validCheckpoint(c)||!isEmbodied(c))throw Error('Expected an embodied checkpoint');
const network=loadFullNetwork();network.setInputMode('embodied');network.setActivationGain(c.activationGain??1);
const conditions=[{name:'clean air',levels:[0,0,0,0]}];
for(const level of [.25,1])for(const [name,channels] of [['ethyl acetate left',[0]],['ethyl acetate right',[1]],['ethyl acetate bilateral',[0,1]],['geosmin left',[2]],['geosmin right',[3]],['geosmin bilateral',[2,3]]])conditions.push({name:`${name} ${level}`,levels:Array.from({length:4},(_,i)=>channels.includes(i)?level:0)});
const contexts=[];
for(const scenario of [0,4,24]){
 const state=createFlight(620019,scenario);state.autoOdor=false;
 const observations=sampleEmbodied(state).observations;observations.fill(0,1554);
 network.reset();for(let i=0;i<12;i++)network.decide(observations,c.weights);const before=network.snapshot(),trials=[];
 for(const condition of conditions){
  network.restore(before);const samples=[];
  for(let step=0;step<32;step++){
   const obs=[...observations];obs.splice(1554,4,...condition.levels.map(v=>step<12?v:0));
   samples.push({decision:step+1,commands:Array.from(network.decide(obs,c.weights))});
  }
  const baseline=trials[0]?.samples??samples,peakDelta=Array(10).fill(0),rmsDelta=Array(10).fill(0);
  for(let j=0;j<samples.length;j++)for(let k=0;k<10;k++){const delta=samples[j].commands[k]-baseline[j].commands[k];peakDelta[k]=Math.max(peakDelta[k],Math.abs(delta));rmsDelta[k]+=delta*delta/samples.length;}
  trials.push({...condition,samples,peakDelta,rmsDelta:rmsDelta.map(Math.sqrt)});
 }
 contexts.push({scenario,seed:state.seed,observations,trials});console.log(JSON.stringify({scenario,maxCommandDelta:Math.max(...trials.flatMap(t=>t.peakDelta)),bilateral:trials.filter(t=>t.name.endsWith('bilateral 1')).map(t=>({condition:t.name,peakDelta:t.peakDelta}))}));
}
const result={checkpoint:file,checkpointSHA256:createHash('sha256').update(bytes).digest('hex'),inputMode:'embodied',neurons:network.n,edges:network.pre.length,activationGain:c.activationGain??1,readoutFixed:true,readoutWeights:21300,controlOrder:['throttle','gimbal X','RCS X','gimbal Z','RCS Z','yaw','fin X','fin Z','engine selector','gaze'],protocol:{prewarmDecisions:12,pulseDecisions:12,washoutDecisions:20,passesPerDecision:2,exposureUnit:'Dimensionless model drive; no calibrated concentration',timeUnit:'Model decisions; no biological time calibration',heldFixed:['retinal image','body input','readout','pre-pulse neural state'],scope:'Static input response assay; does not test landing performance'},contexts};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(output);
