// Replay recorded actions through the original physics to inspect a full trip.
// These measurements are analysis only; they do not supply controller inputs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {orbitalElements} from '../dist/orbital.js';
import {flightResult} from '../dist/full-controller.js';

const file=process.argv[2];
assert(file?.endsWith('/probe.json'),'Pass a completed probe.json');
const probe=JSON.parse(fs.readFileSync(file)),flights=[];
assert.equal(probe.results.length,probe.cases.length);
for(const [index,result] of probe.results.entries()){
 assert.equal(result.flights.length,1);
 assert.deepEqual(result.parameters,probe.parameters);
 const f=result.flights[0],test=probe.cases[index];
 assert.equal(f.censored,false);assert(f.trajectory.length>0);
 assert.deepEqual([f.seed,f.scenario,f.variation.level],[test.seed,test.scenario,test.variability]);
 const s=createFlight(test.seed,test.scenario,test.variability);s.styleEnabled=false;
 const snapshot=()=>({time:s.t,altitude:s.y-8,verticalSpeed:s.vy,...(s.orbital?{tangentSpeed:s.vx}:{velocityX:s.vx}),
  pitch:s.angle,roll:s.angleZ,throttle:s.throttle,fuel:s.fuel,engineBank:s.engineBank,
  ...(s.orbital?orbitalElements(s):{})});
 const axes=[{head:1,key:'gimbal',feedbackIndex:13},{head:3,key:'gimbalZ',feedbackIndex:14}].map(axis=>({...axis,
  commandMinimum:Infinity,commandMaximum:-Infinity,commandSquares:0,changedDecisions:0,
  physicalDegreesMinimum:0,physicalDegreesMaximum:0,previousCommand:null}));
 let quality=0,peak=null,nearTime=0,qualityIntegral=0,longestHold=0,firstTargetCrossing=null;
 const thresholds=[.5,.7,.9],timeAbove=Object.fromEntries(thresholds.map(q=>[q,0]));
 for(const row of f.trajectory){
  assert(!s.done,'Trajectory extends beyond the physical endpoint');
  assert.deepEqual([s.t,s.y,s.vy,s.x-s.padX,s.z-s.padZ,s.angle,s.angleZ],
   [row.t,row.y,row.vy,row.x,row.z,row.pitch,row.roll]);
  assert.equal(row.action.length,10);assert(row.action.every(Number.isFinite));
  for(const axis of axes){
   assert.equal(row.presented[axis.feedbackIndex],s[axis.key]/.22,'Recorded actuator feedback differs from physical replay');
   const command=row.action[axis.head];axis.commandMinimum=Math.min(axis.commandMinimum,command);
   axis.commandMaximum=Math.max(axis.commandMaximum,command);axis.commandSquares+=command**2;
   if(axis.previousCommand!==null&&command!==axis.previousCommand)axis.changedDecisions++;
   axis.previousCommand=command;
  }
  const start=s.t;
  for(let j=0,n=decisionSteps(s);j<n&&!s.done;j++){
   advance(s,row.action);
   for(const axis of axes){const degrees=s[axis.key]*180/Math.PI;axis.physicalDegreesMinimum=Math.min(axis.physicalDegreesMinimum,degrees);axis.physicalDegreesMaximum=Math.max(axis.physicalDegreesMaximum,degrees);}
   if(s.orbital){
    longestHold=Math.max(longestHold,s.orbitHold);
    if(!firstTargetCrossing&&s.y-8>=s.orbitConfig.orbitHeight)firstTargetCrossing=snapshot();
   }
  }
  if(s.orbital){
  const e=orbitalElements(s),target=s.orbitConfig.orbitHeight;
  const distance=(Math.abs(e.periapsis-target)+Math.abs(e.apoapsis-target))/target+Math.abs(s.vy)/40;
  const current=Number.isFinite(distance)?Math.exp(-distance*.25):0,dt=s.t-start;
  if(current>quality){quality=current;peak=snapshot();}
  qualityIntegral+=current*dt;
  for(const threshold of thresholds)if(current>=threshold)timeAbove[threshold]+=dt;
  if(e.periapsis>800&&Math.abs(e.apoapsis-target)<200&&Math.abs(s.vy)<5)nearTime+=dt;
  }
 }
 assert(s.done,'Trajectory stopped before the physical endpoint');
 const replay=flightResult(s);
 for(const [key,value] of Object.entries(replay))assert.deepEqual(value,f[key],key);
 if(s.orbital){
  assert.equal(quality,f.insertionQuality);
  assert.equal(1200*quality+200*Math.min(1,s.maxAltitude/s.orbitConfig.orbitHeight),f.insertionReward);
 }
 flights.push({flight:replay,decisions:f.trajectory.length,exactPhysicalReplay:true,
  axes:axes.map(({key,feedbackIndex,previousCommand,commandSquares,...axis})=>({...axis,commandRMS:Math.sqrt(commandSquares/f.trajectory.length)})),
  terminal:snapshot(),...(s.orbital?{insertionQuality:quality,peak,firstTargetCrossing,
  qualityTimeIntegral:qualityIntegral,secondsAboveQuality:timeAbove,
  qualifyingDecisionSeconds:nearTime,longestPhysicalInsertionHoldSeconds:longestHold}:{})});
}
const sources=[file,'scripts/summarize-flight-probe.mjs','dist/engine3d.js','dist/engine.js','dist/orbital.js','dist/missions.js','dist/full-controller.js'];
const sha=content=>crypto.createHash('sha256').update(content).digest('hex');
const archive=file.slice(0,file.lastIndexOf('/'))+'/replay-source';fs.mkdirSync(archive,{recursive:true});
const sourceSHA256={[file]:sha(fs.readFileSync(file))},replayedSourceFiles={};
for(const source of sources.slice(1)){
 const content=fs.readFileSync(source),hash=sha(content),copy=archive+'/'+hash+'-'+source.split('/').at(-1);
 if(fs.existsSync(copy))assert.equal(sha(fs.readFileSync(copy)),hash);else fs.writeFileSync(copy,content);
 sourceSHA256[copy]=hash;replayedSourceFiles[source]=copy;
}
const report={purpose:'Complete development-trajectory replay. Quality duration is sampled at decision endpoints; the insertion hold is measured at every original physics step. No mission criterion or controller action is changed.',
 parameters:probe.parameters,flights,replayedSourceFiles,sourceSHA256};
const output=file.replace(/probe\.json$/,'trajectory-summary.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,flights}));
