// Fixed-readout odor × visual-input assay. This is not a living-fly experiment.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {FLIGHT_PANEL} from '../dist/flight-instruments.js';
import {validCheckpoint,isEmbodied} from '../dist/full-controller.js';

const checkpoint='dist/assets/embodied-starter.json';
const output=process.argv[2]??'artifacts/odor-interface/visual-context-v1.json';
const levels=(process.argv[3]??'.25,1').split(',').map(Number);
assert(levels.length>0&&levels.every(v=>Number.isFinite(v)&&v>0&&v<=1)&&new Set(levels).size===levels.length,'Supply distinct model levels in (0,1]');
if(fs.existsSync(output))throw Error('Preserve the completed assay; choose a new output path');
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(checkpoint),brain=JSON.parse(bytes);
assert(validCheckpoint(brain)&&isEmbodied(brain));
assert.equal(brain.sensoryPresentation,FLIGHT_PANEL);
const net=loadFullNetwork();net.setInputMode('embodied');net.setActivationGain(brain.activationGain??1);
const conditions=[{name:'clean air',levels:[0,0,0,0]}];
for(const level of levels)for(const [name,channels] of [['ethyl acetate',[0,1]],['geosmin',[2,3]]])
 conditions.push({name:`${name} ${level}`,levels:Array.from({length:4},(_,i)=>channels.includes(i)?level:0)});
const contexts=[0,1,9,17].map((scenario,i)=>({scenario,seed:163700003+i*104729}));
const angles=[-.12,0,.12],steps=32,pulseStart=8,pulseEnd=20;
const sourceFiles=['scripts/assay-odor-visual-context.mjs','scripts/full-network-node.mjs','dist/full-network.js','dist/perception.js','dist/flight-instruments.js','dist/engine3d.js','dist/missions.js','dist/full-controller.js','dist/assets/connectome/manifest.json','dist/assets/connectome/sensory-map.json'];
const report={schema:'odor-visual-context-v1',createdAt:new Date().toISOString(),complete:false,checkpoint,checkpointSHA256:sha(bytes),weightSHA256:sha(Buffer.from(Float64Array.from(brain.weights).buffer)),sourceSHA256:Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(f))])),backend:'javascript-rate',neurons:net.n,edges:net.pre.length,passesPerDecision:2,activationGain:net.activationGain,sensoryPresentation:brain.sensoryPresentation,conditions,contexts,angles,protocol:{steps,pulseStart,pulseEnd,timeUnit:'Neural decisions, without biological time calibration',exposureUnit:'Dimensionless existing model drive, not physical concentration',visualInput:'A rendered pitch-view step from the mission starting pose; not a panoramic optic-flow or biological motion-vision assay',bodyInput:'Exactly the same fixed 18 body values in every condition within a context',readout:'Frozen released controller; no learning or command replacement',state:'Cold network reset for every trajectory; all startup, pulse and washout decisions retained',controls:'Matched clean air, zero visual step, covered eyes, and post-pulse washout',analysis:'Deterministic paired differences and odor × visual interaction; contexts are not biological replicates or independent connectomes'},trials:[],effects:[]};
fs.mkdirSync(path.dirname(output),{recursive:true});
const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(report));fs.renameSync(output+'.tmp',output);};
fs.copyFileSync(new URL(import.meta.url),path.join(path.dirname(output),'visual-context-source-'+report.sourceSHA256[sourceFiles[0]]+'.mjs'));save();
const odorCells=Array.from({length:4},(_,channel)=>Array.from(net.inputChannel).flatMap((v,i)=>v===1554+channel?[i]:[]));
assert(odorCells.every(p=>p.length>0));report.odorInputCellCounts=odorCells.map(p=>p.length);
for(const context of contexts){
 const make=angle=>{const s=createFlight(context.seed,context.scenario);s.sensoryPresentation=brain.sensoryPresentation;s.autoOdor=false;s.styleEnabled=false;s.angle=angle;return sampleEmbodied(s).observations;};
 const s=createFlight(context.seed,context.scenario);s.sensoryPresentation=brain.sensoryPresentation;s.autoOdor=false;s.styleEnabled=false;
 const base=sampleEmbodied(s).observations;base.fill(0,1554);
 const images=angles.map(delta=>make(s.angle+delta).slice(0,1536));
 for(const covered of [false,true])for(let a=0;a<angles.length;a++)for(const condition of conditions){
  net.reset();const samples=[];
  for(let decision=0;decision<steps;decision++){
   const active=decision>=pulseStart&&decision<pulseEnd,obs=[...base];
   if(active)obs.splice(0,1536,...images[a]);
   if(covered)obs.fill(0,0,1536);
   obs.splice(1554,4,...condition.levels.map(v=>active?v:0));
   assert.deepEqual(obs.slice(1536,1554),base.slice(1536,1554));
   const commands=Array.from(net.decide(obs,brain.weights));
   assert(commands.every(Number.isFinite));
   samples.push({decision,commands,odorInputActivity:odorCells.map(pool=>pool.reduce((v,i)=>v+net.activity[i],0)/pool.length)});
  }
  report.trials.push({...context,covered,angle:angles[a],condition:condition.name,samples});
 }
 save();console.log(JSON.stringify({completedContext:context,trials:report.trials.length,expectedTrials:contexts.length*2*angles.length*conditions.length}));
}
const same=(t,c)=>t.scenario===c.scenario&&t.seed===c.seed;
const mean=(trial,start,end)=>Array.from({length:10},(_,j)=>trial.samples.slice(start,end).reduce((s,x)=>s+x.commands[j],0)/(end-start));
for(const context of contexts)for(const covered of [false,true]){
 const get=(condition,angle)=>{const found=report.trials.filter(t=>same(t,context)&&t.covered===covered&&t.condition===condition&&t.angle===angle);assert.equal(found.length,1);return found[0];};
 const baselineSlope=mean(get('clean air',.12),pulseStart,pulseEnd).map((v,j)=>(v-mean(get('clean air',-.12),pulseStart,pulseEnd)[j])/.24);
 for(const condition of conditions.slice(1)){
  const air=get('clean air',0),odor=get(condition.name,0),airMean=mean(air,pulseStart,pulseEnd),odorMean=mean(odor,pulseStart,pulseEnd);
  const plus=mean(get(condition.name,.12),pulseStart,pulseEnd),minus=mean(get(condition.name,-.12),pulseStart,pulseEnd),slope=plus.map((v,j)=>(v-minus[j])/.24);
  const washout=odor.samples.at(-1).commands.map((v,j)=>v-air.samples.at(-1).commands[j]);
  report.effects.push({...context,covered,condition:condition.name,odorOnlyCommandDelta:odorMean.map((v,j)=>v-airMean[j]),cleanAirVisualSlope:baselineSlope,odorVisualSlope:slope,visualInteraction:slope.map((v,j)=>v-baselineSlope[j]),lastWashoutCommandDelta:washout});
 }
 for(const angle of angles)for(const condition of conditions){
  const trial=get(condition.name,angle),air=get('clean air',angle);
  assert.deepEqual(trial.samples.slice(0,pulseStart),air.samples.slice(0,pulseStart));
  if(covered)assert.deepEqual(trial.samples,get(condition.name,0).samples);
 }
}
assert.equal(report.trials.length,contexts.length*2*angles.length*conditions.length);
assert.equal(sha(fs.readFileSync(checkpoint)),report.checkpointSHA256);
report.complete=true;save();
console.log(JSON.stringify({output,complete:true,trials:report.trials.length,decisions:report.trials.length*steps,maxOdorOnlyCommandDelta:Math.max(...report.effects.flatMap(e=>e.odorOnlyCommandDelta.map(Math.abs))),maxVisualInteraction:Math.max(...report.effects.flatMap(e=>e.visualInteraction.map(Math.abs)))}));
