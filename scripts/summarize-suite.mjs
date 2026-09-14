// Package a frozen mission-suite candidate only after every paired test ends.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {freshEmbodied,validCheckpoint} from '../dist/full-controller.js';
import {SCENARIOS} from '../dist/engine3d.js';
import {FLIGHT_PANEL,INSTRUMENT_FIELDS} from '../dist/flight-instruments.js';

const adaptive=process.argv.includes('--adaptive');
const folder='artifacts/suite-training',candidate=adaptive?'attitude-adaptive-g6':'attitude-g2';
const trainingFolder=adaptive?'attitude-adaptive':'attitude-correlated';
const generation=adaptive?6:2,expectedProfiles=adaptive?[0,1,6,7,9,17,20,21,22,23]:[0,1,9,17];
const output=folder+'/'+candidate+'-validation';
const read=file=>JSON.parse(fs.readFileSync(file));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const tests=read(output+'/validation.json'),weights=read(output+'/validation-weights.json');
const frozenFile=folder+'/'+candidate+'-selection/frozen-parameters.json',frozen=read(frozenFile);
const training=read(folder+'/'+trainingFolder+'/state.json'),selected=training.history.find(r=>r.generation===generation);
const basisFile=folder+'/sensory-basis-flights.json',basisText=fs.readFileSync(basisFile),basis=JSON.parse(basisText);
assert(tests.complete,'Wait for the complete paired test');
assert.equal(tests.backend,'javascript-rate','Release tests must use the browser calculation');
assert.deepEqual(tests.parameters,frozen.parameters);
assert.deepEqual(selected.parameters,frozen.parameters);
assert.equal(tests.calibrationHash,sha(basisText));
assert.equal(frozen.calibrationHash,tests.calibrationHash);
const weightSHA256=sha(Buffer.from(Float64Array.from(weights).buffer));
assert.equal(weightSHA256,tests.weightSHA256);
assert.deepEqual(tests.modes,['normal','covered','no-instruments']);
assert.equal(tests.cases.length,expectedProfiles.length*8);
assert.equal(tests.flights.length,tests.cases.length*tests.modes.length);
assert.equal(new Set(tests.cases.map(c=>c.seed)).size,tests.cases.length);
const profiles=[...new Set(tests.cases.map(c=>c.scenario))];
assert.deepEqual(profiles,expectedProfiles);
const planFile=output+'/plan.json';
let plan,selection;
if(adaptive){
 plan=read(planFile);selection=read(plan.selectionFile);
 assert.equal(sha(fs.readFileSync(frozenFile)),plan.frozenParametersSHA256);
 assert.equal(sha(fs.readFileSync(plan.selectionFile)),plan.selectionSHA256);
 assert.deepEqual(tests.cases,plan.cases);assert.deepEqual(tests.modes,plan.modes);
 assert.equal(tests.flights.length,plan.expectedFlights);assert.equal(weightSHA256,plan.weightSHA256);
 assert.deepEqual(frozen.trainingEntry,selected);assert.equal(frozen.sourceGeneration,generation);
 assert(selection.complete);assert.equal(selection.weightSHA256,weightSHA256);
 assert.deepEqual(selection.parameters,frozen.parameters);
 const developmentSeeds=new Set([...selection.cases.map(c=>c.seed),...fs.readFileSync(folder+'/'+trainingFolder+'/trials.jsonl','utf8').trim().split('\n').flatMap(line=>JSON.parse(line).cases.map(c=>c.seed))]);
 assert(tests.cases.every(c=>!developmentSeeds.has(c.seed)),'Final cases overlap model development');
}
for(const profile of profiles)for(const level of [0,.4])assert.equal(tests.cases.filter(c=>c.scenario===profile&&c.variability===level).length,4);
const summarize=mode=>{
 const flights=tests.flights.filter(f=>f.mode===mode);
 assert.equal(flights.length,tests.cases.length);
 for(const test of tests.cases){
  const rows=flights.filter(f=>f.seed===test.seed&&f.scenario===test.scenario);
  assert.equal(rows.length,1,'Every matched case must appear exactly once');
  assert.equal(rows[0].variation.level,test.variability);
  assert.equal(rows[0].censored,false);
  assert(Number.isFinite(rows[0].score)&&Number.isFinite(rows[0].time));
  assert.equal(rows[0].activationGain,1);assert.equal(rows[0].styleBonus,0);
  assert.equal(rows[0].landed,rows[0].reason==='Touchdown');
 }
 for(const f of flights.filter(f=>f.landed))assert(f.touchdown&&f.touchdown.error<SCENARIOS[f.scenario].landingRadius&&f.touchdown.speed<3.6&&f.touchdown.lateral<3&&f.touchdown.tilt<.2,'Reported touchdown exceeds original limits');
 return {landings:flights.filter(f=>f.landed).length,episodes:flights.length,meanScore:flights.reduce((s,f)=>s+f.score,0)/flights.length,
  missions:profiles.map(scenario=>{const rows=flights.filter(f=>f.scenario===scenario);return{scenario,title:SCENARIOS[scenario].title,landings:rows.filter(f=>f.landed).length,episodes:rows.length};}),
  conditions:[0,.4].map(variability=>{const rows=flights.filter(f=>f.variation.level===variability);return{variability,landings:rows.filter(f=>f.landed).length,episodes:rows.length};}),
  failures:flights.filter(f=>!f.landed).map(f=>({seed:f.seed,scenario:f.scenario,reason:f.reason})),flights};
};
const evaluation=summarize('normal'),controls={covered:summarize('covered'),indicatorsOff:summarize('no-instruments')};
assert(evaluation.landings>0,'A flight checkpoint requires demonstrated landings');
const checkpoint={...freshEmbodied(),weights,generation,episodes:selected.episodes,history:training.history.filter(r=>r.generation<=generation),scenario:0,
 sensoryPresentation:FLIGHT_PANEL,autoOdor:false,instrumentLights:true,eyesCovered:false,
 initialization:'Measured visual and body calibration followed by reward-only steering and landing lessons',
 trainingScope:profiles,trainingMethod:'Full-network reward-only search on calibrated sensory directions, with correlated parameter proposals',
 sensoryBasis:basis.names,parameters:frozen.parameters,calibrationHash:tests.calibrationHash,
 trainingEpisodeScope:selected.episodes+' trials in the final '+(adaptive?'adaptive-attitude':'attitude')+' lesson; earlier calibration and flight lessons are documented separately',
 sourceSHA256:frozen.sourceSHA256};
assert(validCheckpoint(checkpoint));
const sourceFiles=['dist/full-network.js','dist/full-controller.js','dist/engine3d.js','dist/orbital.js','dist/missions.js','dist/perception.js','dist/flight-instruments.js','dist/sensory-inputs.js',basisFile];
for(const [directory,hash] of [[trainingFolder,frozen.sourceSHA256],[candidate+'-validation',tests.sourceSHA256]]){
 const file=folder+'/'+directory+'/source-'+hash+'.mjs';assert.equal(sha(fs.readFileSync(file)),hash);sourceFiles.push(file);
}
const report={schema:'complete-graph-landing-report-v2',createdAt:new Date().toISOString(),controller:checkpoint.circuit,sensorSchema:checkpoint.sensorSchema,weightSHA256,
 evaluation,controls,cases:tests.cases,profiles,backend:tests.backend,
 scope:profiles.length+' ground missions only: '+profiles.map(i=>SCENARIOS[i].title).join(', ')+'. Eight unseen starts per mission, four nominal and four with variability 0.4. Other missions remain unverified.',
 graph:{neurons:166700,directedConnections:25582938,synapticContacts:124177617,passesPerDecision:2,outputNeurons:2129,readoutWeights:21300},
 sensoryPresentation:{id:FLIGHT_PANEL,eyePixels:1536,bodyAndOdorChannels:22,raysPerPixel:16,fields:INSTRUMENT_FIELDS.map(([id,name,unit])=>({id,name,unit})),automaticOdor:false},
 criteria:{positionErrorBelow:11,verticalSpeedBelow:3.6,lateralSpeedBelow:3,tiltBelow:.2,yawRateBelow:.3,missionDuration:65,unchanged:true},
 training:{method:checkpoint.trainingMethod,generation,episodes:selected.episodes,episodeScope:checkpoint.trainingEpisodeScope,basis:basis.names,calibrationSHA256:tests.calibrationHash,calibrationSamples:basis.trainingSamples+basis.validationSamples,calibrationRMSE:basis.RMSE,history:checkpoint.history,...(adaptive?{nativeBuild:frozen.nativeBuild}:{})},
 sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(file))])),
 limitations:['External decoder learning with a fixed anatomical graph and modeled sensory tuning.','Visible instrument-mediated control, not camera-only navigation.','Eight final starts per mission give limited evidence; failures remain in the report.','No demonstrated mastery of all 27 missions.','No validated prediction of a living fly, measured muscle control, chemical dose or biological learning.']};
if(adaptive){
 report.finalPlan={...plan,SHA256:sha(fs.readFileSync(planFile))};
 report.modelSelection={file:plan.selectionFile,SHA256:plan.selectionSHA256,backend:selection.backend,cases:selection.cases.length,
  normalLandings:selection.flights.filter(f=>f.mode==='normal'&&f.landed).length,coveredLandings:selection.flights.filter(f=>f.mode==='covered'&&f.landed).length};
 report.sourceHashes[frozenFile]=sha(fs.readFileSync(frozenFile));
 report.sourceHashes[planFile]=sha(fs.readFileSync(planFile));
 report.sourceHashes[output+'/validation.json']=sha(fs.readFileSync(output+'/validation.json'));
}
const cacheChangeFile=output+'/cache-version-change.json';
if(fs.existsSync(cacheChangeFile)){
 const cacheChange=read(cacheChangeFile);
 for(const [file,hash] of Object.entries(cacheChange.testedSourceHashes)){
  const original=fs.readFileSync(output+'/tested-runtime/'+file);
  assert.equal(sha(original),hash);
  assert.equal(fs.readFileSync(file,'utf8').replaceAll('?v='+cacheChange.to,'?v='+cacheChange.from),original.toString(),'Runtime changed beyond the verified cache tags');
 }
 report.testedSourceHashes=cacheChange.testedSourceHashes;
 report.sourceCacheVersionChange={from:cacheChange.from,to:cacheChange.to,change:cacheChange.change};
}
fs.writeFileSync(output+'/release-candidate.json',JSON.stringify(checkpoint));
fs.writeFileSync(output+'/release-report.json',JSON.stringify(report,null,2));
if(process.argv.includes('--install')){
 fs.writeFileSync('dist/assets/embodied-starter.json',JSON.stringify(checkpoint));
 fs.writeFileSync('dist/assets/landing-report.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify({weightSHA256,evaluation:{landings:evaluation.landings,episodes:evaluation.episodes,missions:evaluation.missions},controls:Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,{landings:v.landings,episodes:v.episodes}])),installed:process.argv.includes('--install')}));
