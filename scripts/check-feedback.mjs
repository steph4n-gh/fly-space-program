import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,advance} from '../dist/engine3d.js';
const net=loadFullNetwork(),records=[],groups={actuatorPosition:[24,25,26,27,28,29,30,31,32,33,34,35],acceleration:[36,37,38],deckAttitude:[39,40],previousCommands:[41,42,43,44,45]};
for(const [name,scenario] of [['full-pilot',1],['full-specialist',6],['full-expert',7],['full-orbital',24]]){
 const weights=JSON.parse(fs.readFileSync(`dist/assets/${name}.json`)).weights,s=createFlight(864773,scenario,.4);net.reset();
 for(let i=0;i<40&&!s.done;i++){const a=net.decide(fullSensors(s),weights);for(let j=0;j<3&&!s.done;j++)advance(s,a);}
 const obs=fullSensors(s),before=net.snapshot(),commands=Array.from(net.decide(obs,weights)),live=net.snapshot(),effects={};net.restore(before);assert.deepEqual(Array.from(net.decide(obs,weights)),commands);
 for(const [group,indices] of Object.entries(groups)){const ablated=[...obs];for(const i of indices)ablated[i]=0;net.restore(before);const changed=Array.from(net.decide(ablated,weights));effects[group]=changed.map((v,i)=>v-commands[i]);assert(effects[group].some(v=>Math.abs(v)>1e-9),`${name}: ${group} affects complete-graph commands`);}
 net.restore(live);assert.deepEqual(net.snapshot(),live);records.push({name,scenario,seed:s.seed,time:s.t,weightSHA256:createHash('sha256').update(Buffer.from(Float64Array.from(weights).buffer)).digest('hex'),commands,effects});
}
fs.mkdirSync('/tmp/fly-v8',{recursive:true});fs.writeFileSync('/tmp/fly-v8/feedback-interventions.json',JSON.stringify({method:'Replay the exact pre-decision graph state with one feedback group neutralized; report changed command minus actual command.',limitation:'One sampled decision per pilot. These tests establish command sensitivity and exact state restoration, not a whole-flight benefit or independent learning advantage.',groups,records},null,2));console.log('PASS: all four learned pilots respond to actuator position, acceleration, deck attitude and previous commands; isolated full-graph replays restore live state exactly.');
