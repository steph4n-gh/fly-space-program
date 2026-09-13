import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {rollout,flightResult} from '../dist/full-controller.js';
import {familyProfiles} from '../dist/missions.js';
const family=process.argv[2]??'center',count=Number(process.argv[3]??2),name={center:'full-pilot',degraded:'full-specialist',out:'full-expert'}[family];
const net=loadFullNetwork(),results={};
for(const [version,directory] of [['baseline','/tmp/fly-v5-baseline'],['trained','dist/assets']]){
 const checkpoint=JSON.parse(fs.readFileSync(`${directory}/${name}.json`)),flights=[];
 for(const scenario of familyProfiles(family))for(let i=0;i<count;i++){
  let last;for(const state of rollout(net,checkpoint.weights,731003+i*1171,scenario,true))last=state;
  const result=flightResult(last);flights.push(result);console.log(JSON.stringify({version,...result}));
 }
 results[version]=flights;
}
fs.mkdirSync('/tmp/fly-v6',{recursive:true});fs.writeFileSync(`/tmp/fly-v6/${family}.json`,JSON.stringify(results,null,2));
