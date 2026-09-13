import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {rollout,flightResult} from '../dist/full-controller.js';
const net=loadFullNetwork(),checkpoints=['full-pilot','full-specialist','full-expert'].map(name=>JSON.parse(fs.readFileSync('dist/assets/'+name+'.json')));
const flights=[],count=Number(process.argv[2]??1),offset=Number(process.argv[3]??0);
for(let scenario=0;scenario<8;scenario++)for(let i=0;i<count;i++){
 let last;for(const s of rollout(net,checkpoints[scenario===7?2:scenario===6?1:0].weights,88001+offset+i*1009,scenario,true))last=s;
 const result=flightResult(last);flights.push(result);console.log(JSON.stringify(result));
}
const evaluation={landings:flights.filter(f=>f.landed).length,episodes:flights.length,styles:flights.filter(f=>f.styleBonus>0).length,styleEnabled:true,allEdgesPerPass:net.manifest.edges,passesPerDecision:2,physicsStepsPerDecision:3,seeds:flights.map(f=>f.seed),flights};
fs.mkdirSync('/tmp/fly-full',{recursive:true});
fs.writeFileSync('/tmp/fly-full/evaluation.json',JSON.stringify(evaluation,null,2));
console.log(JSON.stringify({landings:evaluation.landings,episodes:evaluation.episodes,styles:evaluation.styles}));

const recoveryOnly=[];for(const scenario of [0,1]){let last;for(const s of rollout(net,checkpoints[0].weights,1000003,scenario,false))last=s;recoveryOnly.push(flightResult(last));}
fs.writeFileSync('/tmp/fly-full/recovery-only.json',JSON.stringify(recoveryOnly));
console.log(JSON.stringify({recoveryOnly}));
