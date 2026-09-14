// Verify the complete matched odor flight pilot without selecting a controller.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {SCENARIOS} from '../dist/missions.js';

const read=file=>JSON.parse(fs.readFileSync(file));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const folder='artifacts/suite-training/odor-closed-loop';
const planFile='artifacts/odor-interface/closed-loop-plan.json',plan=read(planFile);
const reportFile=folder+'/odor-flights.json',r=read(reportFile);
const releaseFile='docs/assets/four-mission-report.json',release=read(releaseFile);
const resolvedSources={};
const verifySource=(file,digest)=>{
 const resolved=fs.existsSync(file)&&sha(file)===digest?file:'artifacts/odor-interface/four-mission-runtime/'+file;
 assert.equal(sha(resolved),digest,file);resolvedSources[file]=resolved;
};
assert(r.complete,'Wait for all matched flights');
assert.equal(r.backend,'javascript-rate');assert.equal(r.nativeBuild,null);
verifySource(plan.checkpoint,plan.checkpointSHA256);
assert.equal(sha(plan.sourceAssay),plan.sourceAssaySHA256);
assert.equal(sha(plan.frozenParameterFile),plan.frozenParameterSHA256);
assert.deepEqual(r.parameters.slice(0,13),read(plan.frozenParameterFile).parameters);
assert(r.parameters.slice(13).every(v=>v===0));
assert.equal(r.calibrationHash,sha('artifacts/suite-training/sensory-basis-flights.json'));
assert.equal(sha(folder+'/source-'+r.sourceSHA256+'.mjs'),r.sourceSHA256);
for(const [file,digest] of Object.entries(release.sourceHashes))if(file.startsWith('dist/'))verifySource(file,digest);
const weights=read(folder+'/odor-flights-weights.json');
const weightSHA256=crypto.createHash('sha256').update(Buffer.from(Float64Array.from(weights).buffer)).digest('hex');
assert.equal(weightSHA256,r.weightSHA256);assert.equal(weightSHA256,release.weightSHA256);
assert.deepEqual(r.cases,plan.cases);assert.deepEqual(r.modes,plan.conditions);
assert.equal(r.odorIntervention.level,plan.level);
assert.deepEqual(r.odorIntervention.conditions,{normal:[0,0,0,0],'ethyl-acetate':[plan.level,plan.level,0,0],geosmin:[0,0,plan.level,plan.level]});
assert.equal(r.flights.length,plan.expectedFlights);
assert.equal(r.flights.length,r.cases.length*r.modes.length);
assert.equal(new Set(r.cases.map(c=>c.seed)).size,r.cases.length);
const earlierSeeds=new Set(release.evaluation.flights.map(f=>f.seed));
assert(r.cases.every(c=>!earlierSeeds.has(c.seed)));
const layoutFile='artifacts/suite-training/odor-layout-check/selection.json',layout=read(layoutFile);
assert(layout.complete&&layout.backend==='javascript-rate'&&layout.flights.length===1);
assert.deepEqual(layout.flights[0],release.evaluation.flights.find(f=>f.seed===93500003&&f.scenario===0));

const matched=r.cases.map(test=>{
 const flights={};
 for(const mode of r.modes){
  const found=r.flights.filter(f=>f.seed===test.seed&&f.scenario===test.scenario&&f.mode===mode);assert.equal(found.length,1);
  const f=found[0];assert.equal(f.variation.level,test.variability);assert.equal(f.censored,false);
  assert(Number.isFinite(f.score)&&Number.isFinite(f.time)&&f.time>0);
  assert.equal(f.activationGain,1);assert.equal(f.styleBonus,0);
  assert.equal(f.landed,f.reason==='Touchdown');
  if(f.touchdown)assert(Object.values(f.touchdown).every(Number.isFinite));
  if(f.landed)assert(f.touchdown.error<SCENARIOS[test.scenario].landingRadius&&f.touchdown.speed<3.6&&f.touchdown.lateral<3&&f.touchdown.tilt<.2);
  flights[mode]=f;
 }
 return {...test,title:SCENARIOS[test.scenario].title,flights};
});
for(const scenario of plan.profiles)for(const variability of [0,.4])assert.equal(matched.filter(c=>c.scenario===scenario&&c.variability===variability).length,2);
const count=flights=>({landings:flights.filter(f=>f.landed).length,episodes:flights.length,meanScore:flights.reduce((v,f)=>v+f.score,0)/flights.length,failures:flights.filter(f=>!f.landed).reduce((out,f)=>(out[f.reason]=(out[f.reason]??0)+1,out),{})});
const conditions=r.modes.map(mode=>({mode,...count(matched.map(c=>c.flights[mode])),physics:[0,.4].map(variability=>({variability,...count(matched.filter(c=>c.variability===variability).map(c=>c.flights[mode]))})),missions:plan.profiles.map(scenario=>({scenario,title:SCENARIOS[scenario].title,...count(matched.filter(c=>c.scenario===scenario).map(c=>c.flights[mode]))}))}));
const comparisons=r.modes.filter(m=>m!=='normal').map(mode=>{
 const outcomes=matched.map(c=>({seed:c.seed,scenario:c.scenario,variability:c.variability,baselineLanded:c.flights.normal.landed,odorLanded:c.flights[mode].landed,scoreDelta:c.flights[mode].score-c.flights.normal.score}));
 return {mode,rescued:outcomes.filter(c=>!c.baselineLanded&&c.odorLanded).length,harmed:outcomes.filter(c=>c.baselineLanded&&!c.odorLanded).length,bothLanded:outcomes.filter(c=>c.baselineLanded&&c.odorLanded).length,bothFailed:outcomes.filter(c=>!c.baselineLanded&&!c.odorLanded).length,meanScoreDelta:outcomes.reduce((v,c)=>v+c.scoreDelta,0)/outcomes.length,outcomes};
});
const summary={schema:'odor-closed-loop-summary-v1',createdAt:new Date().toISOString(),plan,planSHA256:sha(planFile),reportFile,reportSHA256:sha(reportFile),releaseFile,releaseSHA256:sha(releaseFile),resolvedSources,trainerSHA256:r.sourceSHA256,weightSHA256,backend:r.backend,fullFlights:r.flights.length,layoutCheck:{file:layoutFile,SHA256:sha(layoutFile),exactMatch:true},conditions,comparisons,matched,interpretation:'A fixed-readout software pilot on 16 prespecified matched starts. Record landing benefits and harms together. No chemical dose, biological effect, new controller selection or deployment is established.'};
const output='docs/odor-closed-loop-results.json';fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({output,verifiedFlights:r.flights.length,conditions:conditions.map(({mode,landings,episodes})=>({mode,landings,episodes})),comparisons:comparisons.map(({outcomes,...c})=>c)}));
