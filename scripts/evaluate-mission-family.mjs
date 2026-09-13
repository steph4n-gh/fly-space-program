import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFullNetwork} from './full-network-node.mjs';
import {rollout,flightResult} from '../dist/full-controller.js';
import {familyProfiles} from '../dist/missions.js';
const family=process.argv[2]??'center',name={center:'full-pilot',degraded:'full-specialist',out:'full-expert',orbital:'full-orbital'}[family],checkpoint=JSON.parse(fs.readFileSync(`dist/assets/${name}.json`)),net=loadFullNetwork(),flights=[];
for(const scenario of familyProfiles(family))for(const seed of [531107,535226]){
 let last;for(const state of rollout(net,checkpoint.weights,seed,scenario,true))last=state;const result=flightResult(last);flights.push(result);console.log(JSON.stringify({scenario,seed,landed:result.landed,style:result.styleBonus,reason:result.reason}));
}
fs.mkdirSync('/tmp/fly-v7',{recursive:true});fs.writeFileSync(`/tmp/fly-v7/${family}.json`,JSON.stringify({family,checkpoint:name,weightSHA256:createHash('sha256').update(Buffer.from(new Float64Array(checkpoint.weights).buffer)).digest('hex'),flights},null,2));
