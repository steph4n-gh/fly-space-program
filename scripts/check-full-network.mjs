import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {FullNetwork} from '../dist/full-network.js';
import {prepareCircuit,createBrain,createFlight,think,sensors,advance} from '../dist/engine.js';
const base=new URL('../dist/assets/connectome/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base)));
const read=(file,Type)=>{const bytes=gunzipSync(fs.readFileSync(new URL(file,base)));return new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const pre=new Uint32Array(manifest.edges),weight=new Uint16Array(manifest.edges);
for(const part of manifest.parts){pre.set(read(part.pre.file,Uint32Array),part.start);weight.set(read(part.weight.file,Uint16Array),part.start);}
const data={manifest,pre,weight};for(const [key,Type] of [['rows',Uint32Array],['incoming',Float32Array],['signs',Int8Array],['channels',Uint8Array],['groups',Uint8Array]])data[key]=read(manifest.nodes[key].file,Type);
assert.equal(manifest.neurons,166700);assert.equal(data.rows.at(-1),25582938);assert.equal(weight.reduce((s,v)=>s+v,0),124177617);
assert(pre.every(v=>v<manifest.neurons));assert(data.rows.every((v,i,a)=>i===0||v>=a[i-1]));
const graph=new FullNetwork(data),c=prepareCircuit(JSON.parse(fs.readFileSync(new URL('../dist/assets/circuit.json',import.meta.url))));
const checkpoint=JSON.parse(fs.readFileSync(new URL('../dist/assets/graduate.json',import.meta.url))),brain=createBrain(c,checkpoint.weights),flight=createFlight(440001,1);
const timings=[];let stats;
for(let i=0;i<12;i++){const action=think(brain,sensors(flight));advance(flight,action);const start=performance.now();stats=graph.step(sensors(flight),brain.activity);timings.push(performance.now()-start);brain.feedback=graph.feedback.slice();}
assert(graph.activity.every(Number.isFinite));assert(stats.active>10000);assert(graph.feedback.some(v=>Math.abs(v)>.001));
const sameSensors=sensors(flight),withFeedback=think(createBrain(c,checkpoint.weights,graph.feedback),sameSensors),withoutFeedback=think(createBrain(c,checkpoint.weights),sameSensors);
assert(withFeedback.some((v,i)=>Math.abs(v-withoutFeedback[i])>1e-6),'Whole network feedback must change motor commands');
const coreSet=new Set(manifest.coreIndices),pulseIndex=data.channels.findIndex((v,i)=>v<8&&!coreSet.has(i));
graph.reset();graph.step(sameSensors,brain.activity);const unpulsed=graph.activity[pulseIndex];graph.reset();graph.pulse={index:pulseIndex,steps:8};graph.step(sameSensors,brain.activity);assert(graph.activity[pulseIndex]>unpulsed+1);
// One coupled smoke flight: advance the complete graph every 150 ms of simulation.
// This checks integration, not a held-out benchmark or browser performance.
graph.reset();const live=createFlight(440001,1),pilot=createBrain(c,checkpoint.weights);let action=[0,0,0],updates=0;
while(!live.done){if(live.step%3===0){action=think(pilot,sensors(live));graph.step(sensors(live),pilot.activity);pilot.feedback=graph.feedback.slice();updates++;}advance(live,action);}
assert(Number.isFinite(live.reward));
const report={checks:'passed',neurons:manifest.neurons,edges:manifest.edges,synapticContacts:manifest.synapticContacts,activeAfter12Updates:stats.active,meanGraphStepMs:timings.slice(2).reduce((s,v)=>s+v,0)/10,motorCommandFeedbackEffect:withFeedback.map((v,i)=>v-withoutFeedback[i]),pulseVerified:true,coupledSmokeFlight:{seed:440001,scenario:1,graphUpdates:updates,landed:live.landed,reason:live.reason},scope:'Numerical integrity and one coupled smoke flight in Node. Not a browser benchmark or validation of landing reliability.'};
fs.writeFileSync(new URL('../dist/assets/full-network-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
