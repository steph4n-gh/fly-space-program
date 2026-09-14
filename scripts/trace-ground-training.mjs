// Replay six preselected training cases through the unchanged frozen worker.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {Worker} from 'node:worker_threads';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(root,'artifacts/suite-training/ground-all-training-diagnostic');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const planSHA=process.argv[2],preflight=process.argv.includes('--preflight');
assert(/^[a-f0-9]{64}$/.test(planSHA??''),'Pass the frozen plan SHA256');
assert(process.argv.slice(3).every(arg=>arg==='--preflight'));
assert.equal(sha(path.join(base,'plan.json')),planSHA);
const plan=read(path.join(base,'plan.json'));
assert.equal(plan.status,'FROZEN_BEFORE_TRAINING_REPLAYS');
assert.equal(sha(fileURLToPath(import.meta.url)),plan.driverSHA256);
assert.equal(process.version,plan.nodeVersion);
assert.equal(fs.realpathSync(process.execPath),plan.nodeExecutable);
assert.equal(sha(process.execPath),plan.nodeExecutableSHA256);
assert.equal(process.execArgv.length,0,'Use the pinned Node executable without preload or execution flags');
for(const name of ['NODE_OPTIONS','NODE_PATH'])assert(!process.env[name],name+' must be absent');
const runtime=path.join(root,plan.runtimeDirectory);
assert.equal(fs.realpathSync(runtime),runtime);
for(const [file,expected] of Object.entries(plan.runtimeSHA256)){
 const resolved=fs.realpathSync(path.join(runtime,file));
 assert(resolved.startsWith(runtime+path.sep),file);assert.equal(sha(resolved),expected,file);
}
assert.equal(Object.keys(plan.runtimeSHA256).length,71);
for(const [file,expected] of Object.entries(plan.evidenceSHA256))assert.equal(sha(path.join(root,file)),expected,file);
const checkpoint=read(path.join(root,plan.model.file));
assert.equal(sha(path.join(root,plan.model.file)),plan.model.sha256);
assert.equal(checkpoint.generation,6);assert.equal(checkpoint.episodes,3456);
assert.equal(checkpoint.parameters.length,28);assert.equal(checkpoint.weights.length,21300);
const bytes=Buffer.alloc(21300*8);
checkpoint.weights.forEach((value,i)=>{assert(Number.isFinite(value));bytes.writeDoubleLE(value,i*8);});
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),plan.model.weightSHA256);
const training=read(path.join(root,plan.trainingCasesFile));
assert.equal(training.controllerSHA256,plan.model.sha256);
assert.deepEqual(plan.cases,training.cases.map(({scenario,seed,variability})=>({scenario,seed,variability})));
assert.deepEqual(plan.cases.map(c=>[c.scenario,c.seed,c.variability]),
 [[7,641145,0],[7,890529,.4],[13,703491,0],[13,952875,.4],[22,797010,0],[22,1046394,.4]]);
assert.equal(plan.expectedNeuralFlights,6);assert.equal(plan.expectedRecordedActionPhysicalReplays,6);
const output=path.join(base,'probe.json'),launch=path.join(base,'launch.json');
assert(!fs.existsSync(output)&&!fs.existsSync(launch),'Preserve the original diagnostic attempt and inspect its handle');
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ'].includes(key)));
Object.assign(environment,{FLY_NATIVE_RATE:'1',SUITE_SENSORY_BASIS:path.join(runtime,'artifacts/suite-training/sensory-basis-flights.json'),SUITE_TOUCHDOWN_MARGIN:'3',SUITE_INSERTION_HOLD:'0'});
assert.deepEqual(plan.workerEnvironmentOverrides,Object.fromEntries(Object.entries(environment).filter(([key])=>key==='FLY_NATIVE_RATE'||key.startsWith('SUITE_'))));
const workerFile=path.join(runtime,'scripts/train-suite.mjs');
const record={createdAt:new Date().toISOString(),planSHA256:planSHA,driverSHA256:sha(fileURLToPath(import.meta.url)),workingDirectory:runtime,
 workerFile,workerEnvironment:environment,expectedNeuralFlights:6,status:'Preflight passed; this record does not establish later live or terminal status'};
if(preflight){console.log(JSON.stringify({...record,workerEnvironment:plan.workerEnvironmentOverrides}));process.exit(0);}
fs.writeFileSync(launch,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
process.chdir(runtime);
const worker=new Worker(pathToFileURL(workerFile),{env:environment});
const probe={planSHA256:planSHA,sourceSHA256:plan.runtimeSHA256['scripts/train-suite.mjs'],calibrationHash:checkpoint.calibrationHash,
 nativeBuild:read(path.join(runtime,'artifacts/native-rate/build.json')),parameters:checkpoint.parameters,cases:plan.cases,
 weightSHA256:plan.model.weightSHA256,results:[],endpointAgreement:[],complete:false};
const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(probe));fs.renameSync(output+'.tmp',output);};
try{
 for(const [index,test] of plan.cases.entries()){
  const result=await new Promise((resolve,reject)=>{
   const clean=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exited);};
   const message=value=>{clean();resolve(value);},error=error=>{clean();reject(error);},exited=code=>error(Error('Worker exited before completing the case: '+code));
   worker.once('message',message);worker.once('error',error);worker.once('exit',exited);
   worker.postMessage({parameters:checkpoint.parameters,cases:[test],trace:true});
  });
  assert.deepEqual(result.parameters,checkpoint.parameters);assert.equal(result.flights.length,1);
  const flight=result.flights[0],expected=training.cases[index].originalEndpoint;
  const actual=Object.fromEntries(Object.keys(expected).map(key=>[key,flight[key]]));
  probe.results.push(result);probe.endpointAgreement.push({trainingEndpointId:training.cases[index].trainingEndpointId,exact:isDeepStrictEqual(actual,expected)});save();
  console.log(JSON.stringify({caseIndex:index,...test,decisions:flight.trajectory.length,exactOriginalEndpoint:probe.endpointAgreement.at(-1).exact}));
 }
 probe.complete=true;save();
 assert(probe.endpointAgreement.every(item=>item.exact),'Preserved all six completed replays; endpoint disagreement blocks interpretation');
}finally{await worker.terminate();}
