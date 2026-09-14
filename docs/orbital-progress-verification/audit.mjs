// Frozen, single-use evaluation audit. No network, controller, worker, or sampler.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root='/Users/sarrington/Documents/ChatGPT/connectome';
const base=path.join(root,'artifacts/suite-training/orbital-progress-comparison');
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'replay');
const planSHA='ecd27042dae78467a42111660e44e5da4d1fa8717852118626d920a7a6fdb8a7';
const executionSHA='443fa06996ee9bd763bfc9fd65043c905bb05ccf7fc90864a9b0edd595c49d5a';
const terminalSHA='bb4da37e3d1273af356027335e131b375b4e649c23a3bf1fe0da7e93a01e4f5d';
const helperSHA='6994920ca33ec4d1388ec468cb6433b5cdf0687d6ac48912be3611fe0b2f8b7f';
const sessions={control:86855,conditional_periapsis:48145},arms=Object.keys(sessions);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(path.resolve(root,file));
const json=file=>JSON.parse(read(file));
const hashes={};
const track=file=>{file=path.resolve(root,file);const value=sha(read(file));hashes[file]=value;return value;};
const check=(file,wanted)=>assert.equal(track(file),wanted,file);
const stringify=(value,space)=>JSON.stringify(value,(_,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v,space);
const write=(name,value)=>fs.writeFileSync(path.join(out,name),stringify(value,2)+'\n',{flag:'wx'});
const append=(name,value)=>fs.appendFileSync(path.join(out,name),stringify(value)+'\n');
const serial=value=>JSON.parse(JSON.stringify(value));
const exact=(actual,expected,label)=>assert.deepEqual(serial(actual),expected,label);
const keys=(value,wanted,label)=>assert.deepEqual(Object.keys(value).sort(),[...wanted].sort(),label);
const finiteArray=(a,n,label)=>assert(Array.isArray(a)&&a.length===n&&a.every(Number.isFinite),label);
const within=(actual,expected,tolerance,label)=>{assert(Number.isFinite(actual)&&Number.isFinite(expected),label);const error=Math.abs(actual-expected);assert(error<=tolerance,label+': '+error);return error;};
const counters={physicalReplaysStarted:0,physicalReplaysCreated:0,physicalReplaysCompleted:0,physicalAdvanceCalls:0,physicalStepsCompleted:0,decisionsVerified:0,exactStateValues:0,exactPresentedValues:0,exactEndpoints:0,neuralFlights:0};
let activeCase=null;

// These are direct parent-review arguments, not a self-authored mutable manifest.
assert.equal(process.argv.length,4,'Usage: node audit.mjs SOURCE_SHA256 METHOD_SHA256');
assert(process.argv.slice(2).every(s=>/^[0-9a-f]{64}$/.test(s)));
check(fileURLToPath(import.meta.url),process.argv[2]);
check(path.join(here,'method.md'),process.argv[3]);
check(path.join(here,'presented.mjs'),helperSHA);
const terminalFile=path.join(base,'original-evaluation-terminal-confirmation.json');
check(terminalFile,terminalSHA);
const terminal=json(terminalFile);
assert.equal(terminal.schema,'orbital-progress-original-evaluation-completion-v1');
assert.equal(terminal.confirmedBy,'/root');
assert.equal(terminal.planSHA256,planSHA);
assert.equal(terminal.evaluationFreezeSHA256,executionSHA);
assert.equal(terminal.originalAttempt,true);
assert.equal(terminal.bothOriginalTerminalsObservedComplete,true);
assert.equal(terminal.noRestarts,true);
keys(terminal.arms,arms,'Both original arms');
for(const arm of arms){assert.equal(terminal.arms[arm].originalSessionId,sessions[arm]);assert.equal(terminal.arms[arm].exitCode,0);assert.equal(terminal.arms[arm].originalAttempt,true);}

// Exclusive output creation makes every invocation single-use, including failures.
fs.mkdirSync(out);
write('root-terminal-confirmation.json',terminal);
try {
 const planFile=path.join(base,'plan.json'),executionFile=path.join(base,'evaluation-execution/freeze.json');
 check(planFile,planSHA);check(executionFile,executionSHA);
 const plan=json(planFile),execution=json(executionFile),runtime=path.join(root,plan.runtimeDirectory);
 assert.equal(execution.schema,'orbital-progress-evaluation-execution-v1');
 assert.equal(execution.root,root);assert.equal(execution.baseDirectory,base);
 assert.equal(execution.trainingAuditPassed,true);
 assert.equal(process.version,execution.node.version);
 assert.equal(fs.realpathSync(process.execPath),fs.realpathSync(execution.node.path));
 check(process.execPath,execution.node.sha256);
 assert.equal(process.execArgv.length,0);assert(!('NODE_OPTIONS' in process.env));assert(!('NODE_PATH' in process.env));
 for(const [file,digest] of Object.entries(execution.inputSHA256))check(file,digest);
 assert.equal(Object.keys(plan.runtimeSHA256).length,72);
 assert.equal(fs.realpathSync(runtime),runtime);
 for(const [file,digest] of Object.entries(plan.runtimeSHA256)){
  const full=path.join(runtime,file);assert(fs.realpathSync(full).startsWith(runtime+path.sep));check(full,digest);
 }
 const finalFile=path.join(base,'completion-audit/training-audit/final-controller-freeze.json');
 check(finalFile,'06957abe0f49dc4af5e6a0e27cbf1bcec31e60a3af97ced3352f97b783215b2d');
 const final=json(finalFile);
 assert.equal(final.frozenBeforeFinalEvaluation,true);assert.equal(final.planSHA256,planSHA);
 assert.equal(final.comparisonFlightsPerArm,6);assert.equal(final.totalComparisonFlights,12);
 const tests=Array.from({length:6},(_,i)=>({scenario:24+i%3,seed:94617031+i*104729,variability:i<3?0:.4,mode:'normal'}));
 exact(plan.comparison.cases,tests,'Frozen six cases');exact(final.prescribedComparisonCases,tests,'Final candidate cases');
 assert.equal(plan.comparison.flightsPerArm,6);assert.equal(plan.comparison.totalFlights,12);
 const caseKey=test=>JSON.stringify([test.scenario,test.seed,test.variability,test.mode]);
 const flightKey=flight=>caseKey({...flight,variability:flight.variation?.level});
 const reports={},ordered={},identities={};
 const endpointKeys=['seed','scenario','activationGain','score','landed','styleBonus','styleRecovered','turnDegrees','reason','variation','touchdown','time','orbitComplete','orbits','maxAltitude','milestones'];
 const progressKeys=['longestStrictInsertionHoldSeconds','conditionalPeriapsis','conditionalPeriapsisEligibleSeconds','strictInsertionHoldProgress','conditionalPeriapsisProgress'];
 const rewardKeys=['insertionQuality','insertionReward','insertionHoldQuality','insertionHoldReward'];
 const rowKeys=['t','y','vy','x','z','pitch','roll','action','presented','decoded'];
 const milestoneNames=['Launch','Space','Stable orbit','One full orbit','Deorbit','Atmospheric entry','Final approach','Barge touchdown'];
 // Validate BOTH complete outputs and all twelve trajectories before importing physics.
 for(const arm of arms){
  const setting=plan.executionArms[arm],model=final.candidates[arm];
  check(model.file,model.fileSHA256);const checkpoint=json(model.file);
  assert.equal(checkpoint.generation,4);assert.equal(checkpoint.episodes,288);
  finiteArray(checkpoint.parameters,28,'Final parameters');finiteArray(checkpoint.weights,21300,'Final weights');
  const parameterBytes=Buffer.alloc(28*8);checkpoint.parameters.forEach((value,i)=>parameterBytes.writeDoubleLE(value,i*8));
  assert.equal(sha(parameterBytes),model.parameterSHA256);
  assert.equal(sha(Buffer.from(Float64Array.from(checkpoint.weights).buffer)),model.weightSHA256);
  const completionFile=path.join(base,'training-completion-'+arm+'.json');
  track(completionFile);const completion=json(completionFile);
  assert.equal(completion.exitCode,0);assert.equal(completion.planSHA256,planSHA);
  for(const [file,digest] of Object.entries(completion.outputSHA256))check(file,digest);
  const launchFile=path.join(base,'launch-'+arm+'-evaluate.json');track(launchFile);const launch=json(launchFile);
  assert.equal(launch.arm,arm);assert.equal(launch.stage,'evaluate');assert.equal(launch.planSHA256,planSHA);
  assert.equal(launch.launcherSHA256,execution.inputSHA256[execution.launcherFile]);
  assert.equal(launch.workingDirectory,runtime);exact(launch.command,plan.evaluationCommand,'Evaluation command');
  exact(launch.explicitEnvironment,setting.evaluationEnvironment,'Explicit evaluation environment');assert.equal(launch.verifiedRuntimeFiles,72);
  const rootLaunchFile=path.join(base,'root-execution-'+arm+'-evaluate.json');track(rootLaunchFile);const rootLaunch=json(rootLaunchFile);
  assert.equal(rootLaunch.arm,arm);assert.equal(rootLaunch.freezeSHA256,executionSHA);
  assert.equal(rootLaunch.wrapperSHA256,execution.wrapperSHA256);assert.equal(rootLaunch.preflightOnly,false);
  exact(rootLaunch.node,execution.node,'Clean launch node');exact(rootLaunch.baseEnvironment,execution.baseEnvironment,'Clean base environment');
  exact(rootLaunch.effectiveEvaluationEnvironment,{...execution.baseEnvironment,...setting.evaluationEnvironment},'Complete evaluation environment');
  assert.equal(rootLaunch.command.length,4);assert(path.isAbsolute(rootLaunch.command[0]));
  exact(rootLaunch.command.slice(1),[execution.launcherFile,arm,'evaluate'],'Root launch command');
  const reportFile=path.join(root,setting.comparisonFile),weightFile=reportFile.replace(/\.json$/,'-weights.json');
  assert.equal(terminal.arms[arm].reportFile,reportFile);assert.equal(terminal.arms[arm].weightsFile,weightFile);
  check(reportFile,terminal.arms[arm].reportSHA256);check(weightFile,terminal.arms[arm].weightsFileSHA256);
  const report=json(reportFile),weights=json(weightFile);reports[arm]=report;
  finiteArray(weights,21300,'Evaluation weight file');exact(weights,checkpoint.weights,'Frozen evaluation weights');
  keys(report,['parameters','calibrationHash','sourceSHA256','insertionRewardSourceSHA256','insertionProgress','insertionProgressSourceSHA256','backend','nativeBuild','weightSHA256','cases','modes','flights','complete'],'Report schema');
  exact(report.parameters,checkpoint.parameters,'Evaluation parameters');assert.equal(report.calibrationHash,plan.basisSHA256);
  assert.equal(report.sourceSHA256,plan.trainingSourceSHA256);assert.equal(report.insertionProgressSourceSHA256,plan.progressSourceSHA256);
  assert.equal(report.insertionRewardSourceSHA256,plan.runtimeSHA256['scripts/insertion-hold.mjs']);
  assert.equal(report.insertionProgress,setting.mode);assert.equal(report.backend,'native-exact-rate');exact(report.nativeBuild,plan.nativeBuild,'Native build');
  assert.equal(report.weightSHA256,model.weightSHA256);assert.equal(report.complete,true);
  exact(report.cases,tests.map(({mode,...test})=>test),'Report grid');exact(report.modes,['normal'],'Only normal mode');
  assert(Array.isArray(report.flights)&&report.flights.length===6);
  const indexed=new Map();
  for(const flight of report.flights){
   keys(flight,[...endpointKeys,...progressKeys,...rewardKeys,'trajectory','censored','mode'],'Flight schema');
   const key=flightKey(flight);assert(tests.some(test=>caseKey(test)===key),'Unexpected case');assert(!indexed.has(key),'Duplicate case');indexed.set(key,flight);
   assert.equal(flight.mode,'normal');assert.equal(flight.censored,false);assert.equal(flight.activationGain,1);
   assert.equal(typeof flight.landed,'boolean');assert.equal(typeof flight.orbitComplete,'boolean');
   assert.equal(typeof flight.reason,'string');assert(flight.reason.length>0);
   assert.equal(flight.styleRecovered,false);assert.equal(flight.styleBonus,0);
   assert(flight.variation&&typeof flight.variation==='object'&&!Array.isArray(flight.variation));
   keys(flight.variation,['level','mass','thrust','servo','wind','deck','noise'],'Variation schema');
   assert(Object.values(flight.variation).every(Number.isFinite));
   if(flight.touchdown!==null){
    assert(flight.touchdown&&typeof flight.touchdown==='object'&&!Array.isArray(flight.touchdown));
    keys(flight.touchdown,['error','speed','lateral','tilt'],'Touchdown schema');
    assert(Object.values(flight.touchdown).every(value=>Number.isFinite(value)&&value>=0));
   }
   assert(Array.isArray(flight.milestones));const names=new Set();let previousMilestoneTime=-1;
   for(const milestone of flight.milestones){
    keys(milestone,['name','time','altitude'],'Milestone schema');
    assert(milestoneNames.includes(milestone.name)&&!names.has(milestone.name));names.add(milestone.name);
    assert(Number.isFinite(milestone.time)&&milestone.time>=0&&milestone.time>=previousMilestoneTime&&milestone.time<=flight.time);
    assert(Number.isFinite(milestone.altitude));previousMilestoneTime=milestone.time;
   }
   assert.equal(flight.orbitComplete,names.has('One full orbit'));assert.equal(flight.landed,names.has('Barge touchdown'));
   if(flight.landed){
    assert(flight.touchdown!==null&&flight.orbitComplete&&names.has('Deorbit')&&names.has('Atmospheric entry'));
    assert(flight.touchdown.error<11&&flight.touchdown.speed<3.6&&flight.touchdown.lateral<3&&flight.touchdown.tilt<.2);
   }
   for(const key of ['score','styleBonus','turnDegrees','time','orbits','maxAltitude',...rewardKeys,...progressKeys.filter(k=>k!=='conditionalPeriapsis')])assert(Number.isFinite(flight[key]),key);
   assert(flight.conditionalPeriapsis===null||Number.isFinite(flight.conditionalPeriapsis));
   assert(Array.isArray(flight.trajectory)&&flight.trajectory.length>0);let previous=-1;
   for(const row of flight.trajectory){
    keys(row,rowKeys,'Decision schema');
    for(const key of rowKeys.slice(0,7))assert(Number.isFinite(row[key]),key);
    assert(row.t>previous&&row.t<flight.time,'Decision order/end');previous=row.t;
    finiteArray(row.action,10,'Action');assert(row.action.every(x=>Math.abs(x)<=1));
    finiteArray(row.presented,28,'Presented measurements');finiteArray(row.decoded,28,'Decoded measurements');
   }
   assert.equal(flight.trajectory[0].t,0);
  }
  ordered[arm]=tests.map(test=>indexed.get(caseKey(test)));assert(ordered[arm].every(Boolean));
  identities[arm]={sessionId:sessions[arm],reportFile,reportSHA256:hashes[reportFile],weightFile,weightsFileSHA256:hashes[weightFile],finalCandidate:model};
 }
 write('input-identities-before.json',hashes);
 write('evaluation-completion-audit.json',{status:'PASS',physicalReplaysStarted:0,allReportsComplete:true,arms:identities,cases:tests});
 const {createFlight,advance,decisionSteps}=await import(pathToFileURL(path.join(runtime,'dist/engine3d.js')));
 const {reconstructPresented,orbitalMetrics,presentedNames}=await import(pathToFileURL(path.join(here,'presented.mjs')));
 const basis=json(path.join(runtime,'artifacts/suite-training/sensory-basis-orbital.json'));exact(basis.names,presentedNames,'Presented layout');
 const endpoint=s=>({seed:s.seed,scenario:s.scenario,activationGain:s.activationGain??1,score:s.reward,landed:s.landed,styleBonus:s.styleBonus,styleRecovered:s.styleRecovered,turnDegrees:(s.heading-s.styleStart)*180/Math.PI,reason:s.reason,variation:s.variation??null,touchdown:s.touchdown,time:s.t,orbitComplete:s.orbitComplete,orbits:s.orbitTravel/(Math.PI*2),maxAltitude:s.maxAltitude,milestones:s.milestones});
 const stateFields=s=>({t:s.t,y:s.y,vy:s.vy,x:s.x-s.padX,z:s.z-s.padZ,pitch:s.angle,roll:s.angleZ});
 const snapshot=s=>({time:s.t,step:s.step,x:s.x,y:s.y,z:s.z,altitude:s.y-8,relativeX:s.x-s.padX,relativeZ:s.z-s.padZ,tangentSpeed:s.vx,verticalSpeed:s.vy,crossSpeed:s.vz,pitch:s.angle,wrappedPitch:Math.atan2(Math.sin(s.angle),Math.cos(s.angle)),roll:s.angleZ,heading:s.heading,omega:s.omega,omegaZ:s.omegaZ,omegaYaw:s.omegaYaw,throttle:s.throttle,gimbal:s.gimbal,gimbalZ:s.gimbalZ,rcs:s.rcs,rcsZ:s.rcsZ,yawJet:s.yawJet,finX:s.finX,finZ:s.finZ,fuel:s.fuel,selector:s.selector,engineBank:s.engineBank,orbitPhase:s.orbitPhase,simulatorOrbitHold:s.orbitHold,destinationAltitude:s.orbitConfig.orbitHeight,done:s.done,reason:s.reason});
 const metricKeys=['strictInsertionHoldProgress','conditionalPeriapsisProgress','longestStrictInsertionHoldSeconds','conditionalPeriapsisEligibleSeconds','conditionalPeriapsis','insertionHoldQuality','insertionHoldReward','insertionQuality','insertionReward','score','fitness','time','maxAltitude'];
 const cases=[],maximumError={rollingQuality:0,rollingReward:0};
 for(const arm of arms)for(let caseIndex=0;caseIndex<6;caseIndex++){
  const test=tests[caseIndex],flight=ordered[arm][caseIndex],id={arm,caseIndex,...test};activeCase=id;
  assert(counters.physicalReplaysStarted<12);counters.physicalReplaysStarted++;append('case-lifecycle.jsonl',{event:'start',...id,counters});
  const s=createFlight(test.seed,test.scenario,test.variability);counters.physicalReplaysCreated++;
  s.styleEnabled=false;s.autoOdor=false;s.eyesCovered=false;s.instrumentLights=true;s.sensoryPresentation='measured-flight-panel-v2';
  assert.equal(s.orbital,true);const initial=snapshot(s),steps=[],segments=[];
  let currentHold=0,longestHold=0,eligibleSeconds=0,conditionalPeriapsis=null,qualifyingSeconds=0;
  let queueDuration=0,queueIntegral=0,queueBest=0,overlapBest=0,instantaneousBest=0;
  let firstEligible=null,firstQualifying=null,conditionalPeak=null,longestHoldEnd=null,rollingPeak=null;
  const patterns=Object.fromEntries(Array.from({length:8},(_,i)=>[i.toString(2).padStart(3,'0'),0]));
  const deficitSummary=Object.fromEntries(['periapsis','apoapsis','verticalSpeed'].map(k=>[k,{minimum:Infinity,maximum:-Infinity,timeIntegral:0,positiveSeconds:0,nonfiniteSeconds:0}]));
  const startStepCount=counters.physicalStepsCompleted;
  for(let decisionIndex=0;decisionIndex<flight.trajectory.length;decisionIndex++){
   assert(!s.done,'Extra decision after endpoint');const record=flight.trajectory[decisionIndex];
   for(const [key,value] of Object.entries(stateFields(s))){exact(value,record[key],arm+'/'+caseIndex+'/'+decisionIndex+'/'+key);counters.exactStateValues++;}
   exact(reconstructPresented(s),record.presented,'All presented measurements');counters.exactPresentedValues+=28;counters.decisionsVerified++;
   const decision={...id,decisionIndex,recorded:record,physical:snapshot(s)};
   const n=decisionSteps(s);
   for(let j=0;j<n&&!s.done;j++){
    const start=s.t;counters.physicalAdvanceCalls++;advance(s,record.action);counters.physicalStepsCompleted++;
    const dt=s.t-start;assert(Number.isFinite(dt)&&dt>0);const physical=snapshot(s),metric=orbitalMetrics(s),target=s.orbitConfig.orbitHeight;
    const pass={periapsis:Number.isFinite(metric.periapsis)&&metric.periapsis>800,apoapsis:Number.isFinite(metric.apoapsis)&&Math.abs(metric.apoapsis-target)<200,verticalSpeed:Number.isFinite(s.vy)&&Math.abs(s.vy)<5};
    const eligible=Number.isFinite(metric.periapsis)&&pass.apoapsis&&pass.verticalSpeed,qualifies=eligible&&pass.periapsis;
    currentHold=qualifies?currentHold+dt:0;qualifyingSeconds+=qualifies?dt:0;
    if(currentHold>longestHold){longestHold=currentHold;longestHoldEnd=s.t;}
    if(eligible){eligibleSeconds+=dt;if(firstEligible===null)firstEligible=s.t;const next=Math.max(conditionalPeriapsis??-6000,metric.periapsis);if(conditionalPeriapsis===null||next>conditionalPeriapsis)conditionalPeak={time:s.t,periapsis:metric.periapsis,physical};conditionalPeriapsis=next;}
    if(qualifies&&firstQualifying===null)firstQualifying=s.t;
    const pattern=Object.values(pass).map(Number).join('');patterns[pattern]+=dt;
    const physicalDeficits={periapsis:Math.max(0,800-metric.periapsis),apoapsis:Math.max(0,Math.abs(metric.apoapsis-target)-200),verticalSpeed:Math.max(0,Math.abs(s.vy)-5)};
    for(const [key,value] of Object.entries(physicalDeficits)){const d=deficitSummary[key];d.minimum=Math.min(d.minimum,value);d.maximum=Math.max(d.maximum,value);d.timeIntegral+=value*dt;d.positiveSeconds+=value>0?dt:0;d.nonfiniteSeconds+=Number.isFinite(value)?0:dt;}
    // Same queue arithmetic validates recorded old reward exactly.
    segments.push({duration:dt,quality:metric.quality});queueDuration+=dt;queueIntegral+=metric.quality*dt;
    while(queueDuration>3){const first=segments[0],trim=Math.min(first.duration,queueDuration-3);queueDuration-=trim;queueIntegral-=first.quality*trim;first.duration-=trim;if(first.duration<1e-12)segments.shift();}
    queueBest=Math.max(queueBest,Math.min(1,Math.max(0,queueIntegral/3)));
    const step={...id,stepIndex:steps.length,decisionIndex,start,end:s.t,dt,physical,orbital:metric,physicalDeficits,strictPass:pass,passPattern:pattern,eligible,qualifies,action:record.action,currentStrictHoldSeconds:currentHold,longestStrictHoldSeconds:longestHold,eligibleSeconds,conditionalPeriapsis,H:Math.min(3,longestHold)/3,P:(Math.max(-6000,Math.min(800,conditionalPeriapsis??-6000))+6000)/6800};
    steps.push(step);let integral=0;
    for(let k=steps.length-1;k>=0&&steps[k].end>s.t-3;k--)integral+=Math.max(0,Math.min(steps[k].end,s.t)-Math.max(steps[k].start,s.t-3))*steps[k].orbital.quality;
    step.rollingIntegral=integral;step.rollingQuality=Math.min(1,Math.max(0,integral/3));
    if(rollingPeak===null||step.rollingQuality>overlapBest)rollingPeak={time:s.t,quality:step.rollingQuality,physical,orbital:metric};
    overlapBest=Math.max(overlapBest,step.rollingQuality);step.runningBestRollingQuality=overlapBest;step.queueBest=queueBest;
    append('physical-steps.jsonl',step);
   }
   const e=orbitalMetrics(s),distance=(Math.abs(e.periapsis-s.orbitConfig.orbitHeight)+Math.abs(e.apoapsis-s.orbitConfig.orbitHeight))/s.orbitConfig.orbitHeight+Math.abs(s.vy)/40;
   if(Number.isFinite(distance))instantaneousBest=Math.max(instantaneousBest,Math.exp(-distance*.25));
   decision.nextDecisionOrEndpointTime=s.t;decision.archivedInstantaneousProxy={distance,quality:Number.isFinite(distance)?Math.exp(-distance*.25):0,runningBest:instantaneousBest};append('decisions.jsonl',decision);
  }
  assert(s.done,'Incomplete recorded trajectory');const finalEndpoint=endpoint(s);
  for(const [key,value] of Object.entries(finalEndpoint))exact(value,flight[key],'Endpoint '+arm+'/'+caseIndex+'/'+key);counters.exactEndpoints++;
  const progress={longestStrictInsertionHoldSeconds:longestHold,conditionalPeriapsis,conditionalPeriapsisEligibleSeconds:eligibleSeconds,strictInsertionHoldProgress:Math.min(3,longestHold)/3,conditionalPeriapsisProgress:(Math.max(-6000,Math.min(800,conditionalPeriapsis??-6000))+6000)/6800};
  for(const [key,value] of Object.entries(progress))exact(value,flight[key],'Recomputed '+key);
  const altitudeReward=200*Math.min(1,s.maxAltitude/s.orbitConfig.orbitHeight);
  exact(queueBest,flight.insertionHoldQuality,'Original queue quality');exact(1200*queueBest+altitudeReward,flight.insertionHoldReward,'Original queue reward');
  exact(instantaneousBest,flight.insertionQuality,'Original instantaneous quality');exact(1200*instantaneousBest+altitudeReward,flight.insertionReward,'Original instantaneous reward');
  maximumError.rollingQuality=Math.max(maximumError.rollingQuality,within(overlapBest,flight.insertionHoldQuality,1e-11,'Independent rolling quality'));
  maximumError.rollingReward=Math.max(maximumError.rollingReward,within(1200*overlapBest+altitudeReward,flight.insertionHoldReward,2e-8,'Independent rolling reward'));
  const fitness=s.reward*.1+flight.insertionHoldReward-3*(s.landed?s.touchdown.speed**2+s.touchdown.lateral**2:0);
  counters.physicalReplaysCompleted++;
  const summary={...id,...finalEndpoint,...progress,...Object.fromEntries(rewardKeys.map(key=>[key,flight[key]])),fitness,physicalSteps:counters.physicalStepsCompleted-startStepCount,decisions:flight.trajectory.length,initial,finalPhysical:snapshot(s),qualifyingSeconds,firstEligible,firstQualifying,longestHoldEnd,conditionalPeak,rollingPeak,passPatternSeconds:patterns,passPatternBitOrder:['periapsis','apoapsis','verticalSpeed'],componentPhysicalDeficits:deficitSummary,noEligibleSample:conditionalPeriapsis===null,exactPhysicalReplay:true,exactPresentedReplay:true};
  cases.push(summary);append('cases.jsonl',summary);append('case-lifecycle.jsonl',{event:'complete',...id,counters});activeCase=null;
 }
 assert.equal(counters.physicalReplaysStarted,12);assert.equal(counters.physicalReplaysCreated,12);assert.equal(counters.physicalReplaysCompleted,12);assert.equal(counters.exactEndpoints,12);assert.equal(counters.physicalAdvanceCalls,counters.physicalStepsCompleted);
 const mean=values=>values.reduce((sum,v)=>sum+v,0)/values.length;
 const aggregates=Object.fromEntries(arms.map(arm=>{const selected=cases.filter(c=>c.arm===arm);return[arm,{flights:selected.length,landings:selected.filter(c=>c.landed).length,completeOrbits:selected.filter(c=>c.orbitComplete).length,milestones:Object.fromEntries(milestoneNames.map(name=>[name,selected.filter(c=>c.milestones.some(m=>m.name===name)).length])),means:Object.fromEntries(metricKeys.filter(k=>k!=='conditionalPeriapsis').map(k=>[k,mean(selected.map(c=>c[k]))])),noEligibleCases:selected.filter(c=>c.noEligibleSample).length,conditionalPeriapsisEveryCase:selected.map(c=>c.conditionalPeriapsis),allReasons:selected.map(c=>({caseIndex:c.caseIndex,reason:c.reason})),elapsedFlightSeconds:selected.reduce((sum,c)=>sum+c.time,0)}];}));
 const pairs=tests.map((test,i)=>{const control=cases.find(c=>c.arm==='control'&&c.caseIndex===i),changed=cases.find(c=>c.arm==='conditional_periapsis'&&c.caseIndex===i);return{caseIndex:i,...test,control,conditional_periapsis:changed,conditionalMinusControl:Object.fromEntries(metricKeys.map(k=>[k,control[k]===null||changed[k]===null?null:changed[k]-control[k]])),exactRecordedActionsAndStates:JSON.stringify(ordered.control[i].trajectory)===JSON.stringify(ordered.conditional_periapsis[i].trajectory),exactRecordedEndpoint:JSON.stringify(Object.fromEntries(endpointKeys.map(k=>[k,ordered.control[i][k]])))===JSON.stringify(Object.fromEntries(endpointKeys.map(k=>[k,ordered.conditional_periapsis[i][k]])))};});
 write('cases.json',cases);write('paired-cases.json',pairs);write('aggregates.json',aggregates);
 const csvKeys=['arm','caseIndex','scenario','seed','variability','mode','landed','orbitComplete',...metricKeys,'noEligibleSample','reason'];
 const cell=v=>JSON.stringify(v===null?'NO_ELIGIBLE_SAMPLE':v??'');
 fs.writeFileSync(path.join(out,'cases.csv'),csvKeys.join(',')+'\n'+cases.map(c=>csvKeys.map(k=>cell(c[k])).join(',')).join('\n')+'\n',{flag:'wx'});
 const after={};for(const [file,digest] of Object.entries(hashes)){after[file]=sha(read(file));assert.equal(after[file],digest,'Input changed: '+file);}write('input-identities-after.json',after);
 const outputHashes=Object.fromEntries(fs.readdirSync(out).sort().map(name=>[name,sha(fs.readFileSync(path.join(out,name)))]));write('output-identities.json',outputHashes);
 // Publish successful replay status last, after every output and hash check succeeds.
 write('summary.json',{status:'PASS',schema:'orbital-progress-evaluation-recorded-action-audit-v1',createdAt:new Date().toISOString(),methodSHA256:process.argv[3],sourceSHA256:process.argv[2],terminalConfirmationSHA256:terminalSHA,executionFreezeSHA256:executionSHA,planSHA256:planSHA,counters,maximumError,aggregates,allSixPairsRetained:true,allInputsUnchanged:true,noNeuralFlights:true,releaseEligible:false,capabilityRule:plan.comparison.capabilityRule,trainingProvenanceLimit:execution.trainingProvenanceLimit});
 console.log(stringify({status:'PASS',outputDirectory:out,counters,aggregates}));
} catch(error){
 const successFile=path.join(out,'summary.json');if(fs.existsSync(successFile))fs.unlinkSync(successFile);
 write('failure.json',{status:'FAIL',createdAt:new Date().toISOString(),activeCase,counters,error:{name:error.name,message:error.message,stack:error.stack},inputIdentities:hashes});
 console.error(stringify({status:'FAIL',activeCase,counters,error:error.message}));process.exitCode=1;
}
