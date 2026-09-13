import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LegacyNetwork} from './legacy-v7.mjs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,advance} from '../dist/engine3d.js';
import {FullTrainer,validCheckpoint} from '../dist/full-controller.js';
const net=loadFullNetwork(),c=JSON.parse(fs.readFileSync('dist/assets/full-pilot.json')),s=createFlight(78181,1);
// Use the pinned prior activation rule with the current sensory assignment.
const old=new LegacyNetwork(net);old.inputChannel.set(net.inputChannel);old.inputPolarity.set(net.inputPolarity);
for(let i=0;i<8;i++){const obs=fullSensors(s),a=net.decide(obs,c.weights),b=old.decide(obs,c.weights);assert.deepEqual(a,b,'Baseline commands must remain bit-for-bit identical');assert.deepEqual(net.activity,old.activity,'Every baseline neuron rate is unchanged');for(let j=0;j<3;j++)advance(s,a);}
net.setActivationGain(1.05);const before=net.snapshot(),obs=fullSensors(s),a=Array.from(net.decide(obs,c.weights)),live=net.snapshot(),result=net.explain(obs,c.weights,before,a);assert.equal(result.replayError,0);assert.deepEqual(net.snapshot(),live);net.restore(before);net.setActivationGain(1);const baseline=Array.from(net.decide(obs,c.weights));assert(a.some((v,i)=>Math.abs(v-baseline[i])>1e-5));net.restore(live);
for(const neuron of net.traceControl(c.weights,0).neurons)for(const edge of neuron.edges){let sum=0;for(let e=net.rows[neuron.index];e<net.rows[neuron.index+1];e++)if(e!==edge.edge)sum+=net.weight[e]*net.signed[net.pre[e]];const rate=Math.fround(Math.tanh((net.signed[neuron.index]*net.signs[neuron.index]*.05+sum*net.normalizer[neuron.index])*1.05));let value=c.weights[2129];for(let j=0;j<2129;j++){const index=net.motorIndices[j];value+=c.weights[j]*(index===neuron.index?rate:net.activity[index]);}assert(Math.abs((Math.tanh(value)-a[0])-edge.commandDelta)<1e-12);}
assert.throws(()=>net.setActivationGain(NaN));assert.throws(()=>net.setActivationGain(2));assert(validCheckpoint({...c,activationGain:1.02}));assert(!validCheckpoint({...c,activationGain:1.5}));
const trainer=new FullTrainer(net,{...c,activationGain:1.02});trainer.style=false;const trained=await trainer.evaluate(c.weights,[{seed:291,scenario:0}],null,()=>Promise.resolve());assert.equal(trained.flights[0].activationGain,1.02);assert.equal(trainer.checkpoint().activationGain,1.02);
console.log('PASS: baseline gain is bit-for-bit unchanged for every neuron and command; elevated gain affects commands; exact replays and edge interventions preserve gain; training uses and saves the selected gain.');
