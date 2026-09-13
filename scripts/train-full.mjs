import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {FullTrainer} from '../dist/full-controller.js';
const scenario=Number(process.argv[2]??1),generations=Number(process.argv[3]??3),file='dist/assets/'+(scenario===7?'full-expert':scenario===6?'full-specialist':'full-pilot')+'.json';
const trainer=new FullTrainer(loadFullNetwork(),JSON.parse(fs.readFileSync(file)));trainer.scenario=scenario;
for(let i=0;i<generations;i++){const result=await trainer.generation(null,()=>Promise.resolve());fs.writeFileSync(file,JSON.stringify(trainer.checkpoint()));console.log(JSON.stringify(result));}
