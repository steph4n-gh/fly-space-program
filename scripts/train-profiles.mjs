import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {FullTrainer} from '../dist/full-controller.js';
import {familyProfiles} from '../dist/missions.js';
const family=process.argv[2]??'center',generations=Number(process.argv[3]??6),name={center:'full-pilot',degraded:'full-specialist',out:'full-expert',orbital:'full-orbital'}[family];
if(!name)throw Error('Unknown engine family');
const file=`dist/assets/${name}.json`,checkpoint=JSON.parse(fs.readFileSync(file));
fs.mkdirSync('/tmp/fly-v5-baseline',{recursive:true});if(!fs.existsSync(`/tmp/fly-v5-baseline/${name}.json`))fs.copyFileSync(file,`/tmp/fly-v5-baseline/${name}.json`);
const trainer=new FullTrainer(loadFullNetwork(),checkpoint);trainer.profiles=familyProfiles(family);
for(let i=0;i<generations;i++){const result=await trainer.generation(null,()=>Promise.resolve());fs.writeFileSync(file,JSON.stringify(trainer.checkpoint()));console.log(JSON.stringify({family,...result}));}
