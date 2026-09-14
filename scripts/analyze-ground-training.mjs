// Exactly six recorded-action physical reconstructions; never runs a controller.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root='/Users/sarrington/Documents/ChatGPT/connectome';
const base=path.join(root,'artifacts/suite-training/ground-all-training-diagnostic');
const planSHA='65f8e0b14114e0837913e1233ef997f02d67372e1d50daddc00b82a426f98573';
const expectedCases=[[7,641145,0],[7,890529,.4],[13,703491,0],[13,952875,.4],[22,797010,0],[22,1046394,.4]];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inputHashes={};
const read=(file,expected)=>{
 const bytes=fs.readFileSync(file),actual=sha(bytes);inputHashes[file]=actual;
 if(expected!==undefined)assert.equal(actual,expected,file+' SHA256');
 return bytes;
};
const json=(file,expected)=>JSON.parse(read(file,expected));
const finite=(value,label)=>assert(Number.isFinite(value),label+' must be finite');
const vector=(value,length,label)=>{assert(Array.isArray(value)&&value.length===length,label+' dimensions');value.forEach(v=>finite(v,label));};
const hashValue=value=>assert(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'Expected SHA256');
const args=process.argv.slice(2),options={};
assert.equal(args.length,6,'Use --root-confirmation FILE --freeze-record FILE --output DIRECTORY');
for(let i=0;i<args.length;i+=2){assert(['--root-confirmation','--freeze-record','--output'].includes(args[i])&&!options[args[i]],'Unexpected or duplicate option');assert(path.isAbsolute(args[i+1]),'All paths must be absolute');options[args[i]]=args[i+1];}

// Check root's original terminal evidence before reading the plan or any outcome.
const receipt=json(options['--root-confirmation']);
assert.equal(receipt.schema,'ground-training-six-original-terminal-observation-v1');
assert.equal(receipt.confirmedBy,'/root');assert.equal(receipt.originalSessionId,59628);
assert.equal(receipt.originalAttempt,true);assert.equal(receipt.exitCode,0);
assert.equal(receipt.planSHA256,planSHA);hashValue(receipt.probeSHA256);hashValue(receipt.launchSHA256);
assert(Number.isFinite(Date.parse(receipt.observedAt)),'Root observation time');
vector(receipt.decisions,6,'Root decision counts');assert(receipt.decisions.every(n=>Number.isInteger(n)&&n>0));
const freeze=json(options['--freeze-record']),self=fileURLToPath(import.meta.url),selfSHA=sha(fs.readFileSync(self));
assert.equal(freeze.schema,'ground-training-six-physical-freeze-v1');assert.equal(freeze.frozenBy,'/root');
assert.equal(freeze.planSHA256,planSHA);assert.equal(freeze.analyzerSHA256,selfSHA);
assert.equal(freeze.terminalObservationSHA256,inputHashes[options['--root-confirmation']]);
assert.equal(freeze.originalNeuralSessionId,59628);assert.equal(freeze.physicalReplayBudget,6);
assert.equal(freeze.newNeuralRuns,0);assert.equal(freeze.frozenBeforePhysicalReplay,true);
assert(path.isAbsolute(freeze.outputDirectory)&&path.resolve(freeze.outputDirectory)===freeze.outputDirectory,'Canonical frozen output path');
assert.equal(freeze.outputDirectory,options['--output'],'Use the single frozen output directory');
assert(Number.isFinite(Date.parse(freeze.createdAt))&&Date.parse(freeze.createdAt)<=Date.now(),'Freeze must predate execution');
inputHashes[self]=selfSHA;
const plan=json(path.join(base,'plan.json'),planSHA);
assert.equal(plan.schema,'ground-training-six-replay-v1');assert.equal(plan.status,'FROZEN_BEFORE_TRAINING_REPLAYS');
assert.equal(plan.expectedNeuralFlights,6);assert.equal(plan.expectedRecordedActionPhysicalReplays,6);
assert.deepEqual(plan.cases.map(c=>[c.scenario,c.seed,c.variability]),expectedCases);
assert.equal(process.version,plan.nodeVersion);assert.equal(fs.realpathSync(process.execPath),plan.nodeExecutable);
read(process.execPath,plan.nodeExecutableSHA256);assert.equal(process.execArgv.length,0,'No preload or execution flags');
for(const key of ['NODE_OPTIONS','NODE_PATH'])assert(!process.env[key],key+' must be absent');
const runtime=path.join(root,plan.runtimeDirectory);assert.equal(fs.realpathSync(runtime),runtime);
assert.equal(Object.keys(plan.runtimeSHA256).length,71);
for(const [relative,expected] of Object.entries(plan.runtimeSHA256)){
 const file=fs.realpathSync(path.join(runtime,relative));assert(file.startsWith(runtime+path.sep),relative+' escaped runtime');read(file,expected);
}
read(path.join(root,plan.driverFile),plan.driverSHA256);
for(const [relative,expected] of Object.entries(plan.evidenceSHA256))read(path.join(root,relative),expected);
const checkpoint=json(path.join(root,plan.model.file),plan.model.sha256);
assert.equal(checkpoint.generation,6);assert.equal(checkpoint.episodes,3456);
vector(checkpoint.parameters,28,'Parameters');vector(checkpoint.weights,21300,'Weights');
const basisFile=path.join(runtime,'artifacts/suite-training/sensory-basis-flights.json');
const basis=json(basisFile,plan.runtimeSHA256['artifacts/suite-training/sensory-basis-flights.json']);
assert.equal(checkpoint.calibrationHash,inputHashes[basisFile]);
assert.equal(basis.names.length,28);assert.equal(new Set(basis.names).size,28);assert.equal(basis.basis.length,28);
basis.basis.forEach(w=>vector(w,2130,'Basis direction'));

const directions=[
 [[0,'bias',1]],[[0,'clearance',1]],[[0,'verticalSpeed',1]],[[0,'body_0',1]],[[0,'body_13',1]],
 [[2,'offsetX',1],[4,'offsetZ',1]],[[2,'driftX',1],[4,'driftZ',1]],
 [[2,'pitch',1]],[[4,'roll',1]],[[2,'body_10',1],[4,'body_11',1]],[[5,'body_12',1]],
 [[0,'fuel',1]],[[8,'bias',1]],
 // Measured selector position can couple throttle to a changed engine bank.
 [[0,'body_8',.5],[0,'bias',.5]],[[8,'body_17',1]],[[8,'body_0',1]],
 // Orbital lessons can use the existing destination and motion indicators.
 [[0,'destination',.5],[0,'bias',.5]],[[0,'tangentSpeed',1]],
 [[2,'destination',.5],[2,'bias',.5]],[[2,'clearance',1]],
 [[2,'tangentSpeed',1]],[[2,'travel',.5],[2,'bias',.5]],
 [[0,'travel',.5],[0,'bias',.5]],
 // The gimbal heads can learn from the same visible and body measurements.
 // Their signs and magnitudes are selected from complete-flight outcomes.
 [[1,'offsetX',1],[3,'offsetZ',1]],[[1,'driftX',1],[3,'driftZ',1]],
 [[1,'pitch',1]],[[3,'roll',1]],[[1,'body_10',1],[3,'body_11',1]],
];

const reconstructed=Array(21300).fill(0);
directions.forEach((terms,k)=>terms.forEach(([head,name,gain])=>{
 const value=checkpoint.parameters[k];if(value===0)return;
 if(name==='bias')reconstructed[head*2130+2129]+=value*gain;
 else {const index=basis.names.indexOf(name);assert(index>=0,'Known basis name');for(let j=0;j<2130;j++)reconstructed[head*2130+j]+=value*gain*basis.basis[index][j];}
}));
assert.deepEqual(reconstructed,checkpoint.weights,'All reconstructed weights');
const weightBytes=Buffer.alloc(21300*8);reconstructed.forEach((v,i)=>weightBytes.writeDoubleLE(v,i*8));
assert.equal(sha(weightBytes),plan.model.weightSHA256);
const training=json(path.join(root,plan.trainingCasesFile),plan.evidenceSHA256[plan.trainingCasesFile]);
assert.equal(training.controllerSHA256,plan.model.sha256);assert.equal(training.cases.length,6);
const fullCasesFile=path.join(base,'replay-method/six-training-cases.json');
const fullCases=json(fullCasesFile,plan.evidenceSHA256[path.relative(root,fullCasesFile)]);
assert.equal(fullCases.cases.length,6);assert.deepEqual(fullCases.model,plan.model);
assert.deepEqual(fullCases.cases.map(row=>row.case),plan.cases);
for(let i=0;i<6;i++){
 const row=training.cases[i];assert.deepEqual([row.scenario,row.seed,row.variability],expectedCases[i]);
 for(const [key,value] of Object.entries(row.originalEndpoint))assert.deepEqual(fullCases.cases[i].originalEndpoint[key],value,'Original endpoint sources agree');
}
const launch=json(path.join(base,'launch.json'),receipt.launchSHA256);
assert.equal(launch.planSHA256,planSHA);assert.equal(launch.driverSHA256,plan.driverSHA256);
assert.equal(launch.workingDirectory,runtime);assert.equal(launch.workerFile,path.join(runtime,'scripts/train-suite.mjs'));
assert.equal(launch.expectedNeuralFlights,6);assert(Date.parse(launch.createdAt)<=Date.parse(receipt.observedAt));
assert(Object.keys(launch.workerEnvironment).every(key=>['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ',...Object.keys(plan.workerEnvironmentOverrides)].includes(key)));
for(const [key,value] of Object.entries(plan.workerEnvironmentOverrides))assert.equal(launch.workerEnvironment[key],value,key);

// All six complete original endpoints are checked before importing physics.
const probe=json(path.join(root,plan.outputFile),receipt.probeSHA256);
assert.equal(probe.complete,true);assert.equal(probe.planSHA256,planSHA);
assert.equal(probe.sourceSHA256,plan.runtimeSHA256['scripts/train-suite.mjs']);
assert.equal(probe.calibrationHash,inputHashes[basisFile]);assert.equal(probe.weightSHA256,plan.model.weightSHA256);
assert.deepEqual(probe.nativeBuild,json(path.join(runtime,'artifacts/native-rate/build.json')));
assert.deepEqual(probe.parameters,checkpoint.parameters);assert.deepEqual(probe.cases,plan.cases);
assert.equal(probe.results.length,6);assert.equal(probe.endpointAgreement.length,6);
for(let i=0;i<6;i++){
 const result=probe.results[i],expected=fullCases.cases[i].originalEndpoint;
 assert.deepEqual(result.parameters,checkpoint.parameters);assert.equal(result.flights.length,1);
 const flight=result.flights[0];assert.equal(flight.censored,false);
 assert.deepEqual(Object.keys(flight).sort(),[...Object.keys(expected),'trajectory'].sort(),'Every original endpoint field retained');
 assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key=>[key,flight[key]])),expected,'Exact full original training endpoint '+i);
 assert.equal(probe.endpointAgreement[i].trainingEndpointId,training.cases[i].trainingEndpointId);assert.equal(probe.endpointAgreement[i].exact,true);
 assert.equal(result.score,expected.score);assert.equal(result.landings,Number(expected.landed));
 assert.equal(result.fitness,expected.score-3*(expected.landed?expected.touchdown.speed**2+expected.touchdown.lateral**2:0));
 assert(Array.isArray(flight.trajectory));assert.equal(flight.trajectory.length,receipt.decisions[i]);
 let previous=-1;
 for(const record of flight.trajectory){
  assert.deepEqual(Object.keys(record).sort(),['t','y','vy','x','z','pitch','roll','action','presented','decoded'].sort());
  for(const key of ['t','y','vy','x','z','pitch','roll'])finite(record[key],key);
  assert(record.t>previous&&record.t<flight.time,'Decision times within full endpoint');previous=record.t;
  vector(record.action,10,'Raw action');assert(record.action.every(v=>Math.abs(v)<=1));
  vector(record.presented,28,'Presented');vector(record.decoded,28,'Decoded');
 }
 assert.equal(flight.trajectory[0].t,0);
}

const headMap=[[0,'throttle'],[8,'bankSelector'],[2,'pitchRcs'],[4,'rollRcs'],[5,'yawRcs'],[1,'pitchGimbal'],[3,'rollGimbal']];
const decompose=record=>headMap.map(([head,name])=>{
 let logit=0,presentedLogit=0;const contributions=[];
 directions.forEach((terms,direction)=>{
  const parameter=checkpoint.parameters[direction],selected=terms.filter(([h])=>h===head);if(!selected.length)return;
  const signals=selected.map(([,cue,gain])=>{
   const index=cue==='bias'?-1:basis.names.indexOf(cue),coefficient=parameter*gain;
   const decodedValue=index<0?1:record.decoded[index],presentedValue=index<0?1:record.presented[index];
   return {cue,gain,coefficient,decodedValue,presentedValue,decoded:coefficient*decodedValue,presented:coefficient*presentedValue,error:coefficient*(decodedValue-presentedValue)};
  });
  const decoded=signals.reduce((v,s)=>v+s.decoded,0),presented=signals.reduce((v,s)=>v+s.presented,0);
  logit+=decoded;presentedLogit+=presented;contributions.push({direction,parameter,decoded,presented,error:decoded-presented,signals});
 });
 const reconstructedCommand=Math.tanh(logit),absoluteCommandError=Math.abs(reconstructedCommand-record.action[head]);
 finite(absoluteCommandError,'Cue recombination error');
 return {head,name,recordedCommand:record.action[head],reconstructedCommand,logit,presentedLogit,offlinePresentedCommand:Math.tanh(presentedLogit),absoluteCommandError,commandRecombinationWithinTolerance:absoluteCommandError<=1e-10,weightedReadoutError:logit-presentedLogit,contributions};
});

const output=options['--output'];assert(!fs.existsSync(output),'Output exists: preserve the original physical reconstruction attempt');
fs.mkdirSync(output,{recursive:false});
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const append=(name,value)=>fs.appendFileSync(path.join(output,name),JSON.stringify(value)+'\n');
const beganAt=new Date().toISOString();
write('attempt.json',{beganAt,planSHA256:planSHA,analyzerSHA256:selfSHA,freeze,terminalObservation:receipt,physicalReplayBudget:6,newNeuralRuns:0,interpretationAllowed:false});
let currentCase=null,currentDecision=null,completedCases=0,physicalSteps=0,decisionCount=0;
const summaries=[];
try{
 // Only frozen modules are imported. No network loader, controller, sampler or worker.
 const {createFlight,advance,decisionSteps,actionTargets,DT,SCENARIOS}=await import(pathToFileURL(path.join(runtime,'dist/engine3d.js')));
 const {instrumentMeasurements,paintFlightInstruments,presentedInstrumentValues,FLIGHT_BODY_CHANNELS,FLIGHT_PANEL}=await import(pathToFileURL(path.join(runtime,'dist/flight-instruments.js')));
 const {bodySignals}=await import(pathToFileURL(path.join(runtime,'dist/perception.js')));
 assert.equal(DT,.05);assert.equal(FLIGHT_PANEL,'measured-flight-panel-v2');
 const expectedNames=['clearance','verticalSpeed','offsetX','offsetZ','driftX','driftZ','pitch','roll','tangentSpeed','travel','destination','fuel',...FLIGHT_BODY_CHANNELS.map(i=>'body_'+i)];
 assert.deepEqual(basis.names,expectedNames);
 const targets=action=>{const t=actionTargets(action);return {throttle:t[0],pitchGimbal:t[1],pitchRcs:t[2],rollGimbal:t[3],rollRcs:t[4],yawRcs:t[5],finX:t[6],finZ:t[7],bankSelector:t[8],gaze:t[9]};};
 const snapshot=s=>({time:s.t,step:s.step,y:s.y,geometricClearance:s.y-8,x:s.x,z:s.z,relativeX:s.x-s.padX,relativeZ:s.z-s.padZ,
  vx:s.vx,vy:s.vy,vz:s.vz,padX:s.padX,padZ:s.padZ,padVx:s.padVx,padVz:s.padVz,relativeVx:s.vx-s.padVx,relativeVz:s.vz-s.padVz,
  deckRoll:s.deckRoll,deckPitch:s.deckPitch,pitch:s.angle,roll:s.angleZ,heading:s.heading,omega:s.omega,omegaZ:s.omegaZ,omegaYaw:s.omegaYaw,
  fuel:s.fuel,engineHealth:s.engineHealth,engineFailed:s.engineFailed,finFailed:s.finFailed,throttle:s.throttle,selector:s.selector,engineBank:s.engineBank,
  pitchGimbal:s.gimbal,rollGimbal:s.gimbalZ,pitchRcs:s.rcs,rollRcs:s.rcsZ,yawRcs:s.yawJet,finX:s.finX,finZ:s.finZ,gaze:s.gaze,done:s.done,reason:s.reason});
 // Exact ground branch of the frozen full-controller.js flightResult, without importing a controller.
 const endpoint=s=>({seed:s.seed,scenario:s.scenario,activationGain:s.activationGain??1,score:s.reward,landed:s.landed,styleBonus:s.styleBonus,styleRecovered:s.styleRecovered,turnDegrees:(s.heading-s.styleStart)*180/Math.PI,reason:s.reason,variation:s.variation??null,touchdown:s.touchdown,time:s.t,censored:false});
 const presented=s=>{
  const screen={width:64,height:48,data:new Uint8ClampedArray(64*48*4)};
  paintFlightInstruments(screen,instrumentMeasurements(s).encoded);
  const body=bodySignals(s);return [...presentedInstrumentValues(screen),...FLIGHT_BODY_CHANNELS.map(i=>body[i]-(i===13?1:0))];
 };
 for(let caseIndex=0;caseIndex<6;caseIndex++){
  currentCase=caseIndex;currentDecision=null;
  const test=plan.cases[caseIndex],flight=probe.results[caseIndex].flights[0];
  const s=createFlight(test.seed,test.scenario,test.variability);assert(!s.orbital,'Ground cases only');
  s.sensoryPresentation=FLIGHT_PANEL;s.autoOdor=false;s.styleEnabled=false;s.eyesCovered=false;s.instrumentLights=true;
  const mission=SCENARIOS[test.scenario];assert(typeof mission.title==='string');finite(mission.landingRadius,'Landing radius');
  const initial=snapshot(s),caseId={caseIndex,trainingEndpointId:training.cases[caseIndex].trainingEndpointId,...test};
  let steps=0,maximumCommandError=0,maximumVerticalAccelerationError=0,bankChanges=0;
  append('case-attempts.jsonl',{...caseId,status:'Original physical reconstruction started',initial});
  for(let index=0;index<flight.trajectory.length;index++){
   currentDecision=index;assert(!s.done,'Decision after original physical endpoint');
   const record=flight.trajectory[index],state=[s.t,s.y,s.vy,s.x-s.padX,s.z-s.padZ,s.angle,s.angleZ];
   assert.deepEqual(state,[record.t,record.y,record.vy,record.x,record.z,record.pitch,record.roll],'Every recorded decision-state value');
   const reproducedPresented=presented(s);
   reproducedPresented.forEach((value,j)=>assert(value===record.presented[j],'Exact presented cue '+basis.names[j]));
   const heads=decompose(record),requested=targets(record.action),before=snapshot(s);
   heads.forEach(head=>{maximumCommandError=Math.max(maximumCommandError,head.absoluteCommandError);});
   append('decisions.jsonl',{...caseId,index,time:s.t,physical:before,action:record.action,requested,
    presented:record.presented,decoded:record.decoded,cues:basis.names.map((name,j)=>({name,presented:record.presented[j],decoded:record.decoded[j],error:record.decoded[j]-record.presented[j]})),heads});
   decisionCount++;
   const n=decisionSteps(s);assert.equal(n,3,'Original ground decision cadence');
   for(let step=0;step<n&&!s.done;step++){
    const start=snapshot(s),stepIndex=steps;advance(s,record.action);steps++;physicalSteps++;
    const end=snapshot(s),dt=s.t-start.time;
    assert(dt>0&&Number.isFinite(dt));
    // Thrust uses pre-burn fuel and pre-step attitude; servo and fault states are applied first.
    const power=end.engineBank===3?end.engineHealth+1.6:end.engineHealth;
    const thrustAcceleration=end.throttle*24*power*s.variation.thrust/((.82+.18*start.fuel)*s.variation.mass);
    const verticalThrustAcceleration=Math.cos(start.pitch+end.pitchGimbal)*Math.cos(start.roll+end.rollGimbal)*thrustAcceleration;
    const predictedVerticalAcceleration=verticalThrustAcceleration-9.81-.006*start.vy;
    const observedVerticalAcceleration=(end.vy-start.vy)/DT;
    const acceleration={fuelBeforeBurn:start.fuel,fuelAfterBurn:end.fuel,appliedPower:power,thrustAccelerationUsingFuelBeforeBurn:thrustAcceleration,verticalThrustAcceleration,predictedVerticalAcceleration,observedVerticalAcceleration,error:observedVerticalAcceleration-predictedVerticalAcceleration};
    Object.values(acceleration).forEach(v=>finite(v,'Acceleration diagnostic'));
    maximumVerticalAccelerationError=Math.max(maximumVerticalAccelerationError,Math.abs(acceleration.error));
    assert(Math.abs(acceleration.error)<=1e-10,'Frozen vertical acceleration equation differs beyond roundoff');
    if(start.engineBank!==end.engineBank)bankChanges++;
    append('physical-steps.jsonl',{...caseId,index:stepIndex,decisionIndex:index,start:start.time,end:s.t,dt,requested,action:record.action,physicalBefore:start,physicalAfter:end,acceleration});
   }
  }
  assert(s.done,'Trajectory missing the original physical endpoint');
  const actual=endpoint(s),expected=fullCases.cases[caseIndex].originalEndpoint;
  assert.deepEqual(actual,expected,'Exact reconstructed full original endpoint');
  const summary={...caseId,title:mission.title,landingRadius:mission.landingRadius,exactDecisionStates:true,exactPresentedCues:true,exactFullOriginalEndpoint:true,decisions:flight.trajectory.length,physicalSteps:steps,maximumCommandError,commandRecombinationWithinTolerance:maximumCommandError<=1e-10,maximumVerticalAccelerationError,bankChanges,initial,terminal:snapshot(s),endpoint:actual};
  summaries.push(summary);completedCases++;
  append('case-attempts.jsonl',{...caseId,status:'Original physical reconstruction completed',decisions:flight.trajectory.length,physicalSteps:steps,exactFullOriginalEndpoint:true});
 }
 // Bind artifacts to the same immutable input bytes at the end as well.
 for(const [file,expected] of Object.entries(inputHashes))assert.equal(sha(fs.readFileSync(file)),expected,'Input changed during reconstruction: '+file);
 const summary={status:'PASS — six exact recorded-action physical reconstructions',planSHA256:planSHA,analyzerSHA256:selfSHA,terminalObservation:receipt,freeze,
  completedPhysicalReplays:completedCases,physicalSteps,decisions:decisionCount,newNeuralRuns:0,parameterFits:0,extraCases:0,retries:0,allOriginalEndpointsExact:true,interpretationAllowed:true,
  headMap:headMap.map(([head,name])=>({head,name})),basisNames:basis.names,cases:summaries,inputSHA256:inputHashes,
  verticalAccelerationTolerance:1e-10,cueAttributionTolerance:1e-10,commandRecombinationWithinTolerance:summaries.every(s=>s.commandRecombinationWithinTolerance),
  limitations:['Selected training failures; no reliability, generalization, final-validation or deployment claim.','Original training trajectories were not recorded; new decision states match the newly recorded neural trace, while full endpoints match the original training records.','Three historical transitive modules were not archived; the new frozen runtime does not retrospectively certify them.','offlinePresentedCommand is hypothetical offline readout arithmetic, never executed or used as a teacher, observation or replacement action.','Cue recombination changes floating-point summation order; large readout weights can amplify error. The preset 1e-10 action-space threshold describes command agreement only; small error, particularly under tanh saturation, proves neither exact per-cue attribution nor causal effect. It does not gate physical reconstruction with recorded actions.','Raw bank head > 0.35 requests selector 1; actual bank changes only above selector 0.9 or below 0.1. Acceleration uses fuel before burn and attitude before the physics step.','geometricClearance is signed y minus 8; the presented clearance cue separately follows its original clipped display encoding.']};
 write('summary.pending.json',summary);
 const identities={};for(const name of fs.readdirSync(output).sort())identities[name==='summary.pending.json'?'summary.json':name]=sha(fs.readFileSync(path.join(output,name)));
 write('output-identities.json',identities);
 fs.renameSync(path.join(output,'summary.pending.json'),path.join(output,'summary.json'));
 console.log(JSON.stringify({output,status:'PASS',completedPhysicalReplays:completedCases,decisions:decisionCount,physicalSteps,newNeuralRuns:0}));
}catch(error){
 if(fs.existsSync(path.join(output,'summary.json')))fs.renameSync(path.join(output,'summary.json'),path.join(output,'summary.incomplete.json'));
 write('failure.json',{status:'BLOCKED — preserve this original physical reconstruction attempt',error:String(error),caseIndex:currentCase,decisionIndex:currentDecision,completedCases,physicalSteps,decisions:decisionCount,newNeuralRuns:0,interpretationAllowed:false,inputSHA256:inputHashes});
 console.error(String(error));process.exitCode=2;
}
