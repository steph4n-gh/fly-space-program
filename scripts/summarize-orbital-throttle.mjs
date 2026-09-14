import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]??path.join(root,'artifacts/suite-training/orbital-hold-g6-probe/throttle-audit'));
fs.mkdirSync(out,{recursive:true});
const probeDir='artifacts/suite-training/orbital-hold-g6-probe';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p));
const plan=json(probeDir+'/plan.json'),probe=json(probeDir+'/probe.json'),hold=json(probeDir+'/hold-summary.json');
const candidatePath='artifacts/suite-training/orbital-hold/candidate.json',candidate=json(candidatePath),basis=json(plan.basisFile);
const sourceChecks={};
for(const [file,expected] of Object.entries({...plan.testedSourceHashes,...hold.sourceSHA256})){
 const checkedFile=file in plan.testedSourceHashes?probeDir+'/tested-runtime/'+file:file;
 sourceChecks[file]={checkedFile,expected,actual:sha(read(checkedFile))};assert.equal(sourceChecks[file].actual,expected,file);
}
for(const [file,expected] of [[candidatePath,plan.initialSHA256],[plan.initialFile,plan.initialSHA256],[plan.basisFile,plan.basisSHA256]]){
 const checkedFile=file in plan.testedSourceHashes?probeDir+'/tested-runtime/'+file:file;
 sourceChecks[file]={checkedFile,expected,actual:sha(read(checkedFile))};assert.equal(sourceChecks[file].actual,expected,file);
}
assert.deepEqual(probe.cases,plan.cases);assert.equal(probe.results.length,6);assert.equal(hold.flights.length,6);
assert.deepEqual(probe.parameters,candidate.parameters);assert.deepEqual(probe.parameters,hold.parameters);
assert.equal(probe.calibrationHash,plan.basisSHA256);assert.equal(probe.sourceSHA256,plan.sourceSHA256);
assert.deepEqual(candidate.sensoryBasis,basis.names);
const trainingSource='artifacts/suite-training/orbital-hold/source-'+candidate.sourceSHA256+'.mjs';
assert.equal(sha(read(trainingSource)),candidate.sourceSHA256);
const extractDirections=text=>JSON.parse(text.match(/const directions=(\[[\s\S]*?\n\]);/)[1].replace(/\/\/[^\n]*/g,'').replaceAll("'",'"').replace(/([[,])\s*\.(\d)/g,(_,p,n)=>p+'0.'+n).replace(/,\s*([\]}])/g,'$1'));
const directions=extractDirections(read(probeDir+'/tested-runtime/scripts/train-suite.mjs').toString());
assert.deepEqual(directions,extractDirections(read(trainingSource).toString()));
const network=read(probeDir+'/tested-runtime/dist/full-network.js').toString(),orbital=read(probeDir+'/tested-runtime/dist/orbital.js').toString();
assert(network.includes('commands[k]=Math.tanh(v)'));
assert(orbital.includes('s.throttle=s.fuel>0?servo(s.throttle,clamp((a[0]+1)/2,0,1),3):0'));
const stride=2130,weights=Array(stride*10).fill(0),parameters=probe.parameters;
for(let k=0;k<directions.length;k++)for(const [head,name,gain] of directions[k]){
 const value=parameters[k]??0;if(!value)continue;
 if(name==='bias')weights[head*stride+stride-1]+=value*gain;
 else{const i=basis.names.indexOf(name);assert(i>=0);for(let j=0;j<stride;j++)weights[head*stride+j]+=value*gain*basis.basis[i][j];}
}
assert.deepEqual(weights,candidate.weights);
const throttleDirections=directions.map((terms,index)=>({index,parameter:parameters[index],terms:terms.filter(t=>t[0]===0).map(([,name,gain])=>({name,gain,basisIndex:name==='bias'?null:basis.names.indexOf(name)}))})).filter(d=>d.terms.length);
const signalCoefficients={};
for(const d of throttleDirections)for(const term of d.terms)signalCoefficients[term.name]=(signalCoefficients[term.name]??0)+d.parameter*term.gain;
const decompose=(row,index)=>{
 let logit=0,presentedLogit=0;const terms=[];
 for(const d of throttleDirections){let decoded=0,presented=0;
  for(const term of d.terms){const coefficient=d.parameter*term.gain;decoded+=coefficient*(term.name==='bias'?1:row.decoded[term.basisIndex]);presented+=coefficient*(term.name==='bias'?1:row.presented[term.basisIndex]);}
  terms.push({direction:d.index,decoded,presented,error:decoded-presented});logit+=decoded;presentedLogit+=presented;
 }
 const command=Math.tanh(logit),recorded=row.action[0],positiveSum=terms.reduce((s,v)=>s+Math.max(0,v.decoded),0),negativeSum=terms.reduce((s,v)=>s+Math.min(0,v.decoded),0);
 return{index,time:row.t,altitude:row.y-8,verticalSpeed:row.vy,pitch:row.pitch,roll:row.roll,physicalThrottleAtDecision:(row.presented[basis.names.indexOf('body_0')]+1)/2,recordedCommand:recorded,reconstructedCommand:command,absoluteCommandError:Math.abs(command-recorded),inverseRecordedLogit:Math.atanh(recorded),logit,presentedLogit,weightedReadoutError:logit-presentedLogit,throttleTarget:(recorded+1)/2,positiveSum,negativeSum,absoluteContributionSum:positiveSum-negativeSum,cancellationFraction:1-Math.abs(logit)/(positiveSum-negativeSum),tanhSlope:1-command**2,presented:row.presented,decoded:row.decoded,contributions:terms};
};
const compact=row=>row?Object.fromEntries(Object.entries(row).filter(([k])=>!['presented','decoded'].includes(k))):null;
const caseSummaries=[],all=[];let maxCommandError=0,maxLogitError=0,maxSignalGroupedError=0,exactCommands=0;
for(let caseIndex=0;caseIndex<6;caseIndex++){
 const test=probe.cases[caseIndex],result=probe.results[caseIndex],summary=hold.flights[caseIndex],flight=result.flights[0];
 assert.equal(result.flights.length,1);assert.deepEqual(result.parameters,parameters);assert.equal(flight.censored,false);
 assert.deepEqual([flight.scenario,flight.seed,flight.variation.level],[test.scenario,test.seed,test.variability]);
 assert.deepEqual([summary.flight.scenario,summary.flight.seed],[test.scenario,test.seed]);assert(summary.exactPhysicalReplay);
 assert.equal(summary.longestPhysicalInsertionHoldSeconds,0);assert.equal(summary.flight.reason,'Flight left the recovery corridor');
 const rows=flight.trajectory.map(decompose);assert.equal(rows[0].time,0);
 for(let i=0;i<rows.length;i++){
  const row=rows[i],end=rows[i+1]?.time??flight.time;assert(end>row.time);assert.equal(row.decoded.length,basis.names.length);assert.equal(row.presented.length,basis.names.length);
  assert(row.absoluteCommandError<=1e-10,'Throttle reconstruction beyond double-roundoff tolerance');
  const signalLogit=Object.entries(signalCoefficients).reduce((sum,[name,coefficient])=>sum+coefficient*(name==='bias'?1:row.decoded[basis.names.indexOf(name)]),0);
  const signalError=Math.abs(Math.tanh(signalLogit)-row.recordedCommand);assert(signalError<=1e-10);
  maxSignalGroupedError=Math.max(maxSignalGroupedError,signalError);
  row.nextDecisionOrEndpointTime=end;row.duration=end-row.time;
  maxCommandError=Math.max(maxCommandError,row.absoluteCommandError);maxLogitError=Math.max(maxLogitError,Math.abs(row.logit-row.inverseRecordedLogit));if(row.reconstructedCommand===row.recordedCommand)exactCommands++;
  all.push({caseIndex,...test,...row});
 }
 const eventSummary=(name,event)=>{
  const before=rows.filter(r=>r.time<event.time).at(-1),at=rows.find(r=>r.time===event.time),atOrBefore=at??before;
  assert(atOrBefore);return{name,eventPhysicalState:event,analysisDecision:compact(atOrBefore),analysisDecisionOffsetSeconds:atOrBefore.time-event.time,exactDecisionAtEvent:!!at,commandAppliedImmediatelyBeforeEvent:compact(before)};
 };
 const phases={instantaneousProxyPeak:eventSummary('Archived instantaneous-quality peak; not rolling-hold maximum',summary.peak),firstTargetCrossing:eventSummary('First physical destination-altitude crossing',summary.firstTargetCrossing),escape:eventSummary('Original recovery-corridor endpoint',summary.terminal)};
 const summarizeInterval=(name,start,end)=>{
  const selected=rows.map(r=>({row:r,dt:Math.max(0,Math.min(end,r.nextDecisionOrEndpointTime)-Math.max(start,r.time))})).filter(v=>v.dt>0),duration=end-start;
  assert(Math.abs(selected.reduce((s,v)=>s+v.dt,0)-duration)<1e-9);
  const range=key=>[Math.min(...selected.map(v=>v.row[key])),Math.max(...selected.map(v=>v.row[key]))];
  const mean=key=>selected.reduce((s,v)=>s+v.dt*v.row[key],0)/duration;
  const fraction=pred=>selected.reduce((s,v)=>s+v.dt*Number(pred(v.row)),0)/duration;
  return{name,start,end,duration,overlappingDecisionCount:selected.length,throttleTargetRange:range('throttleTarget'),throttleTargetTimeMean:mean('throttleTarget'),logitRange:range('logit'),logitTimeMean:mean('logit'),weightedReadoutErrorRange:range('weightedReadoutError'),tanhSlopeRange:range('tanhSlope'),timeFractionTargetBelow0_1:fraction(r=>r.throttleTarget<.1),timeFractionTargetBelow0_25:fraction(r=>r.throttleTarget<.25),timeFractionTargetAtLeast0_45:fraction(r=>r.throttleTarget>=.45),timeFractionPresentedVerticalSpeedAtPlus1:fraction(r=>r.presented[1]===1),timeFractionPresentedTangentSpeedAtPlus1:fraction(r=>r.presented[8]===1),directionMeanContributions:Object.fromEntries(throttleDirections.map((d,j)=>[d.index,selected.reduce((s,v)=>s+v.dt*v.row.contributions[j].decoded,0)/duration]))};
 };
 caseSummaries.push({caseIndex,...test,decisions:rows.length,endpoint:summary.flight,holdQuality:summary.insertionHoldQuality,longestPhysicalInsertionHoldSeconds:summary.longestPhysicalInsertionHoldSeconds,maximumCommandError:Math.max(...rows.map(r=>r.absoluteCommandError)),phases,intervals:[summarizeInterval('Complete trip',0,flight.time),summarizeInterval('Before instantaneous proxy peak',0,summary.peak.time),summarizeInterval('Proxy peak to first destination crossing',summary.peak.time,summary.firstTargetCrossing.time),summarizeInterval('Destination crossing to escape',summary.firstTargetCrossing.time,flight.time)]});
}
const displayedUpperThreshold=1-1/224;
const panelLimits={verticalSpeedScale:12,tangentSpeedScale:350,displayStep:1/112,encodedThresholdForTopPixel:displayedUpperThreshold,verticalSpeedTopPixelThresholdMetersPerSecond:12*Math.atanh(displayedUpperThreshold),tangentSpeedTopPixelThresholdMetersPerSecond:350*displayedUpperThreshold,hardTangentClampMetersPerSecond:350};
const aggregate={cases:6,decisions:all.length,exactCommandMatches:exactCommands,maximumCommandError:maxCommandError,maximumInverseLogitError:maxLogitError,maximumIndependentSignalGroupedCommandError:maxSignalGroupedError,commandTolerance:1e-10,all21300CandidateWeightsMatchFrozenDirections:true,physicalInsertionHoldSecondsAllCases:0,throttleTargetRange:[Math.min(...all.map(v=>v.throttleTarget)),Math.max(...all.map(v=>v.throttleTarget))]};
const manifest={purpose:'Offline algebra only on all SIX already-completed final orbital-hold G6 traces. No graph inference, physics integration, parameter selection, fitting, or controller changes; writes analysis artifacts only.',createdAt:new Date().toISOString(),sourceChecks,trainingSourceSHA256:candidate.sourceSHA256,analysisSourceSHA256:sha(fs.readFileSync(import.meta.filename)),inputs:{plan:probeDir+'/plan.json',probe:probeDir+'/probe.json',holdSummary:probeDir+'/hold-summary.json',basis:plan.basisFile,candidate:candidatePath},inputSHA256:Object.fromEntries([probeDir+'/plan.json',probeDir+'/probe.json',probeDir+'/hold-summary.json',plan.basisFile,candidatePath].map(p=>[p,sha(read(p))])),formula:'action[0] = tanh(sum_k parameter[k] * sum_(head=0,name,gain in direction[k]) gain * (name==bias ? 1 : recordedDecoded[name]))',actuatorFormula:'targetThrottle=(action[0]+1)/2; physical throttle follows the original servo while fuel remains, otherwise zero.',basisNames:basis.names,parameters,throttleDirections,signalCoefficients,panelLimits,aggregate,phaseConvention:'Physical event comes from the completed exact-replay summary. Analysis decision is the decision at that timestamp if present, otherwise the last preceding decision. The command applied immediately before the event is also retained separately. No synthetic terminal decision is introduced. Peak means archived instantaneous-quality peak; the rolling-hold maximum timestamp was not recorded.'};
for(const [name,value] of [['manifest.json',manifest],['summary.json',{aggregate,cases:caseSummaries}]])fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2)+'\n');
fs.writeFileSync(out+'/all-decisions.jsonl',all.map(r=>JSON.stringify(r)).join('\n')+'\n');
const csvKeys=['caseIndex','scenario','seed','variability','index','time','nextDecisionOrEndpointTime','duration','altitude','verticalSpeed','recordedCommand','reconstructedCommand','absoluteCommandError','logit','presentedLogit','weightedReadoutError','throttleTarget','physicalThrottleAtDecision','positiveSum','negativeSum','cancellationFraction','tanhSlope'];
const termKeys=throttleDirections.map(d=>'direction_'+d.index);
fs.writeFileSync(out+'/all-decisions.csv',[csvKeys.concat(termKeys).join(','),...all.map(r=>csvKeys.map(k=>r[k]).concat(r.contributions.map(v=>v.decoded)).join(','))].join('\n')+'\n');
manifest.outputSHA256=Object.fromEntries(['summary.json','all-decisions.jsonl','all-decisions.csv'].map(name=>[name,sha(fs.readFileSync(out+'/'+name))]));
fs.writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({aggregate,signalCoefficients,panelLimits,cases:caseSummaries.map(c=>({scenario:c.scenario,seed:c.seed,decisions:c.decisions,phases:Object.fromEntries(Object.entries(c.phases).map(([name,p])=>[name,{eventTime:p.eventPhysicalState.time,decisionTime:p.analysisDecision.time,target:p.analysisDecision.throttleTarget,actualAtDecision:p.analysisDecision.physicalThrottleAtDecision,physicalAtEvent:p.eventPhysicalState.throttle,logit:p.analysisDecision.logit,presentedLogit:p.analysisDecision.presentedLogit,terms:p.analysisDecision.contributions.map(v=>[v.direction,v.decoded]),cancellation:p.analysisDecision.cancellationFraction,tanhSlope:p.analysisDecision.tanhSlope}])),postCross:c.intervals.at(-1)}))},null,2));
