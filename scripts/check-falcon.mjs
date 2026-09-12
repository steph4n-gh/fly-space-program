import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {FullNetwork} from '../dist/full-network.js';
import {prepareCircuit,createFlight,createBrain,advance,think,sensors,fly,Trainer,DT} from '../dist/engine3d.js';
const readJSON=p=>JSON.parse(fs.readFileSync(p));
const raw=readJSON('dist/assets/circuit-3d.json'),c=prepareCircuit(raw),normal=readJSON('dist/assets/falcon-ocean.json'),expert=readJSON('dist/assets/falcon-expert.json');
assert.equal(c.enc.length,96*18);assert.equal(c.dec.length,18*96);assert.equal(normal.weights.length,202);
const original=readJSON('dist/assets/circuit.json');assert.deepEqual(raw.neurons,original.neurons);assert.deepEqual(raw.matrix,original.matrix);
assert.deepEqual(fly(c,normal.weights,81002,1),fly(c,normal.weights,81002,1),'Fixed-feedback replay must be deterministic');
const empty=createFlight(1,0);empty.fuel=0;advance(empty,[1,0,0,0,0,0,0,0,-1,0]);assert.equal(empty.throttle,0);assert(empty.vy<0);
const one=createFlight(1,0),three=createFlight(1,0);for(const s of [one,three]){s.engineHealth=0;s.y=300;}
for(let i=0;i<10;i++){advance(one,[1,0,0,0,0,0,0,0,-1,0]);advance(three,[1,0,0,0,0,0,0,0,1,0]);}
assert.equal(one.engineBank,1);assert.equal(three.engineBank,3);assert(three.vy>one.vy+3,'Auxiliary bank must restore actual acceleration');
const clamped=createFlight(1,0);advance(clamped,[1,1,1,1,1,1,1,1,1,1]);assert(clamped.throttle<1&&clamped.selector<1,'Controls must have finite travel');
const glance=createFlight(1,0);glance.fuel=.6;glance.engineHealth=.5;for(let i=0;i<5;i++)advance(glance,[-1,0,0,0,0,0,0,0,-1,-1]);assert(glance.seenFuel<.61);assert.equal(glance.seenEngine,1);for(let i=0;i<14;i++)advance(glance,[-1,0,0,0,0,0,0,0,-1,1]);assert.equal(glance.seenEngine,.5);
const jam=createFlight(1,0);jam.finFailed=true;advance(jam,[-1,0,0,0,0,0,-1,1,-1,0]);assert.equal(jam.finAngles[0],.32);assert(jam.finAngles[2]>0);
const trainee=new Trainer(raw,normal);const batch=trainee.trainGeneration(4,1);assert.equal(batch.episodes,normal.episodes+10);assert(trainee.weights.every(Number.isFinite));
const base='dist/assets/connectome/',manifest=readJSON(base+'manifest.json');
const read=(file,Type)=>{const b=gunzipSync(fs.readFileSync(base+file));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const pre=new Uint32Array(manifest.edges),weight=new Uint16Array(manifest.edges);for(const part of manifest.parts){pre.set(read(part.pre.file,Uint32Array),part.start);weight.set(read(part.weight.file,Uint16Array),part.start);}
const data={manifest,pre,weight};for(const [k,t]of[['rows',Uint32Array],['incoming',Float32Array],['signs',Int8Array],['channels',Uint8Array],['groups',Uint8Array]])data[k]=read(manifest.nodes[k].file,t);
const graph=new FullNetwork(data),coupled=[];
for(const [scenario,checkpoint]of[[1,normal],[7,expert]]){graph.reset();const s=createFlight(812045,scenario),b=createBrain(c,checkpoint.weights);let a,bankSteps=0,maxFin=0;const gazes=new Set();while(!s.done){if(s.step%3===0){a=think(b,sensors(s));graph.step(sensors(s),b.activity);b.feedback=graph.feedback;}advance(s,a);bankSteps+=Number(s.engineBank===3);maxFin=Math.max(maxFin,Math.abs(s.finX),Math.abs(s.finZ));gazes.add(s.gaze<-.25?'fuel':s.gaze>.25?'engine':'forward');}assert(Number.isFinite(s.reward));assert(graph.activity.every(Number.isFinite));if(scenario===7)assert(bankSteps>0,'The learned pilot must select the auxiliary bank after complete center-engine loss');coupled.push({scenario,seed:s.seed,landed:s.landed,reason:s.reason,threeEngineSeconds:bankSteps*DT,maxFin,gazeTargets:[...gazes],touchdown:s.touchdown});}
const report={checks:'passed',biologicalCircuitPreserved:true,inputs:18,outputs:10,trainableParameters:202,checksPerformed:['deterministic replay','fuel exhaustion','auxiliary-engine acceleration','finite control travel','gaze samples distinct instruments','fin jam','real training batch','full-graph coupled flights'],coupledFlights:coupled,scope:'Two numerical smoke flights with full-network updates every 150 ms of simulated time. Not browser performance testing or a landing-reliability benchmark.'};fs.writeFileSync('dist/assets/falcon-integration-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
