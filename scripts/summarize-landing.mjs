// Package only measured results for the exact frozen checkpoint used in testing.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {validCheckpoint,isEmbodied} from '../dist/full-controller.js';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
const folder='artifacts/landing-training';
const tests=JSON.parse(fs.readFileSync(folder+'/landing-test.json'));
const checkpoint=JSON.parse(fs.readFileSync(tests.checkpoint));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const weightSHA256=sha(Buffer.from(Float64Array.from(checkpoint.weights).buffer));
if(!validCheckpoint(checkpoint)||!isEmbodied(checkpoint)||weightSHA256!==tests.weightSHA256)throw Error('Checkpoint and tests do not match');
const summarize=mode=>{
 const flights=tests.flights.filter(f=>f.mode===mode),keys=new Set(flights.map(f=>f.seed));
 if(flights.length!==tests.cases.length||keys.size!==tests.cases.length||tests.cases.some(c=>!keys.has(c.seed)))throw Error('Incomplete paired test: '+mode);
 return {landings:flights.filter(f=>f.landed).length,episodes:flights.length,meanScore:flights.reduce((s,f)=>s+f.score,0)/flights.length,conditions:[0,.4].map(level=>{const rows=flights.filter(f=>f.variation.level===level);return{variability:level,landings:rows.filter(f=>f.landed).length,episodes:rows.length};}),failures:flights.filter(f=>!f.landed).map(f=>({seed:f.seed,reason:f.reason})),flights:flights.map(({trajectory,...f})=>f)};
};
const evaluation=summarize('normal'),controls=Object.fromEntries(tests.modes.filter(m=>m!=='normal').map(m=>[m,summarize(m)]));
if(!evaluation.landings)throw Error('No demonstrated landing to package');
for(const f of evaluation.flights.filter(f=>f.landed))if(!f.touchdown||f.touchdown.error>=11||f.touchdown.speed>=3.6||f.touchdown.lateral>=3||f.touchdown.tilt>=.2)throw Error('A reported landing fails the simulator limits');
// Audit whether the automatic rule actually delivered a stimulus. This replays
// recorded actions solely to inspect exposure; it is not a neural flight test.
if(controls.automaticOdor){
 const stride=2130,action=Array(10).fill(0);
 for(let k=1;k<10;k++){
  if(checkpoint.weights.slice(k*stride,(k+1)*stride-1).some(v=>v!==0))throw Error('Exposure replay requires the neutral-attitude lesson');
  action[k]=Math.tanh(checkpoint.weights[(k+1)*stride-1]);
 }
 controls.automaticOdor.exposureAudit=tests.flights.filter(f=>f.mode==='automaticOdor').map(f=>{
  const s=createFlight(f.seed,0,f.variation.level);s.styleEnabled=false;s.autoOdor=true;
  const exposure={seed:f.seed,releases:0,peakAcetate:0,peakGeosmin:0};
  for(const row of f.trajectory){
   if(Math.abs(s.y-row.height)>1e-8||Math.abs(s.vy-row.verticalSpeed)>1e-8||Math.abs(s.t-row.time)>1e-8)throw Error('Recorded exposure replay diverged');
   const packet=sampleEmbodied(s);
   exposure.releases+=Number(s.odor.lastRelease===s.t);
   exposure.peakAcetate=Math.max(exposure.peakAcetate,packet.odor.acetate);exposure.peakGeosmin=Math.max(exposure.peakGeosmin,packet.odor.geosmin);
   action[0]=row.command;for(let j=0,n=decisionSteps(s);j<n&&!s.done;j++)advance(s,action);
  }
  if(s.landed!==f.landed||Math.abs(s.t-f.time)>1e-8)throw Error('Exposure replay final state differs');
  return exposure;
 });
 controls.automaticOdor.exposureMethod='Stimulus audit replayed the recorded neural commands and checked every recorded height, speed, time and final outcome. Landing counts come from the original full-graph tests.';
}
let previousStarter=null;
if(fs.existsSync(folder+'/previous-starter-test.json')){
 const prior=JSON.parse(fs.readFileSync(folder+'/previous-starter-test.json'));
 if(JSON.stringify(prior.cases)!==JSON.stringify(tests.cases)||prior.flights.length!==tests.cases.length)throw Error('Previous-starter comparison is incomplete or uses different starts');
 const priorCheckpoint=JSON.parse(fs.readFileSync(prior.checkpoint));
 if(sha(Buffer.from(Float64Array.from(priorCheckpoint.weights).buffer))!==prior.weightSHA256)throw Error('Previous starter and its comparison hash do not match');
 previousStarter={weightSHA256:prior.weightSHA256,landings:prior.flights.filter(f=>f.landed).length,episodes:prior.flights.length,conditions:'Same starts, updated optical presentation, style and automatic odors off.',flights:prior.flights.map(({trajectory,...f})=>f)};
}
const report={schema:'complete-graph-landing-report-v1',createdAt:new Date().toISOString(),controller:checkpoint.circuit,sensorSchema:checkpoint.sensorSchema,weightSHA256,evaluation,controls,previousStarter,cases:tests.cases,
 scope:'Stationary Landing school deck; level entry, zero lateral velocity, neutral attitude/gaze outputs, single engine. All other missions remain untrained.',
 graph:{neurons:166700,directedConnections:25582938,synapticContacts:124177617,passesPerDecision:2,outputNeurons:2129,readoutWeights:21300},
 sensoryPresentation:{id:checkpoint.sensoryPresentation,eyePixels:1536,bodyAndOdorChannels:22,raysPerPixel:16,altitudeLight:'0–150 m clearance above touchdown',verticalSpeedLight:'−25 to +25 m/s',automaticOdor:false,independentSensorNoise:false},
 criteria:{positionErrorBelow:11,verticalSpeedBelow:3.6,lateralSpeedBelow:3,tiltBelow:.2,yawRateBelow:.3,missionDuration:65,unchanged:true},
 training:{method:checkpoint.trainingMethod,generation:checkpoint.generation,episodes:checkpoint.episodes,basis:checkpoint.sensoryBasis,calibrationSHA256:sha(fs.readFileSync(folder+'/sensory-basis.json')),calibration:JSON.parse(fs.readFileSync(folder+'/sensory-basis.json')).normalizedMSE,history:checkpoint.history},
 sourceHashes:Object.fromEntries(['dist/full-network.js','dist/full-controller.js','dist/engine3d.js','dist/perception.js','dist/sensory-inputs.js','scripts/train-landing.mjs','scripts/test-landing.mjs','scripts/fit-landing-basis.py','scripts/collect-landing-features.mjs','scripts/collect-independent-lights.mjs'].map(p=>[p,sha(fs.readFileSync(p))])),
 limitations:['External decoder learning with a fixed anatomical graph and modeled sensory tuning.','Visible instrument-mediated control, not camera-only navigation.','No validated prediction of a living fly, measured muscle control, chemical dose or biological learning.','Final tests cover only the stationary first landing lesson; they do not establish general mission competence.']};
fs.writeFileSync('dist/assets/embodied-starter.json',JSON.stringify(checkpoint));
fs.writeFileSync('dist/assets/landing-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({weightSHA256,normal:{landings:evaluation.landings,episodes:evaluation.episodes},controls:Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,{landings:v.landings,episodes:v.episodes}]))}));
