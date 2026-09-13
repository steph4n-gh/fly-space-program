import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,updateStyle,advance,deck} from '../dist/engine3d.js';
const net=loadFullNetwork(),weights=JSON.parse(fs.readFileSync('dist/assets/full-pilot.json')).weights;
assert.equal(net.n,166700);assert.equal(net.rows.at(-1),25582938);assert.equal(net.weight.reduce((s,v)=>s+v,0),124177617);assert.equal(net.motorIndices.length,2129);
assert(net.pre.every(v=>v<net.n));assert(net.rows.every((v,i,a)=>!i||v>=a[i-1]));
const obs=fullSensors(createFlight(91,1)),first=Array.from(net.decide(obs,weights));assert(net.activity.every(Number.isFinite));
// Independent row calculation samples the entire node index range, including its end.
const before=net.activity.slice();net.step(obs);
for(let i=0;i<net.n;i+=1667){let recurrent=0;for(let e=net.rows[i];e<net.rows[i+1];e++)recurrent+=net.weight[e]*Math.fround(before[net.pre[e]]*net.signs[net.pre[e]]);const channel=net.inputChannel[i],drive=channel<0?0:.7*Math.tanh(obs[channel]*.15)*net.inputPolarity[i];assert(Math.abs(net.activity[i]-Math.tanh(.05*before[i]+recurrent*net.normalizer[i]+drive))<1e-7);}
net.reset();const pulse=net.inputChannel.findIndex((v,i)=>v>=0&&!net.manifest.coreIndices.includes(i));net.pulse={index:pulse,steps:8};let pulsed;
for(let i=0;i<4;i++)pulsed=Array.from(net.decide(obs,weights));net.reset();let plain;for(let i=0;i<4;i++)plain=Array.from(net.decide(obs,weights));assert(pulsed.some((v,i)=>Math.abs(v-plain[i])>1e-10),'A sensory neuron outside the old pilot must affect graph-derived commands');
net.reset();assert.deepEqual(Array.from(net.decide(obs,weights)),first,'Reset yields deterministic decisions');
function contact(s){s.y=8.02;s.vy=-1;s.vx=0;s.vz=0;s.angle=0;s.angleZ=0;s.omegaYaw=0;const p=deck(s);s.x=p.x;s.z=p.z;advance(s,[-1,0,0,0,0,0,0,0,-1,0]);return s;}
const recovered=createFlight(1,0);recovered.y=70;recovered.heading=recovered.styleStart+Math.PI*2;for(let i=0;i<13;i++)updateStyle(recovered);assert(recovered.styleRecovered);contact(recovered);assert(recovered.landed);assert.equal(recovered.styleBonus,25);
const crash=createFlight(2,0);crash.styleRecovered=true;crash.y=8.02;crash.vy=-30;advance(crash,[-1,0,0,0,0,0,0,0,-1,0]);assert(!crash.landed);assert.equal(crash.styleBonus,0);
const low=createFlight(3,0);low.y=20;low.heading=low.styleStart+Math.PI*2;for(let i=0;i<20;i++)updateStyle(low);assert(!low.styleRecovered);contact(low);assert.equal(low.styleBonus,0);
const repeated=createFlight(4,0);repeated.y=80;repeated.heading+=8*Math.PI;for(let i=0;i<13;i++)updateStyle(repeated);contact(repeated);assert.equal(repeated.styleBonus,25,'Repeated turns never multiply the bonus');
const wiggle=createFlight(5,0);for(let i=0;i<100;i++){wiggle.heading=wiggle.styleStart+(i%2?2:-2);updateStyle(wiggle);}assert(!wiggle.styleTurn);
const disabled=createFlight(6,0);disabled.styleEnabled=false;disabled.styleRecovered=true;contact(disabled);assert.equal(disabled.styleBonus,0);
console.log('PASS: complete graph integrity, independent neuron calculations, actual upstream command effect, deterministic reset, and recovery/style reward gates.');
