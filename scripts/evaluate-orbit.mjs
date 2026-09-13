import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {rollout,flightResult} from '../dist/full-controller.js';
const net=loadFullNetwork(),checkpoint=JSON.parse(fs.readFileSync('dist/assets/full-orbital.json')),flights=[];
for(const scenario of [24,25,26]){let last,logged=-1;for(const s of rollout(net,checkpoint.weights,Number(process.argv[2]??110731),scenario,true)){last=s;if(s.orbitPhase!==logged){logged=s.orbitPhase;console.log(JSON.stringify({scenario,phase:s.orbitPhase,t:s.t,alt:s.y-8,orbits:s.orbitTravel/(Math.PI*2)}));}}const result=flightResult(last);flights.push(result);console.log(JSON.stringify(result));}
fs.writeFileSync(`/tmp/fly-orbit/evaluation-${process.argv[2]??110731}.json`,JSON.stringify(flights,null,2));
