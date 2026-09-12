import fs from 'node:fs';
import {Trainer,evaluate,prepareCircuit} from '../dist/engine3d.js';
const raw=JSON.parse(fs.readFileSync('dist/assets/circuit-3d.json'));
const source=process.argv.includes('--resume')?'dist/assets/falcon-graduate.json':'dist/assets/falcon-seed.json';
const initial=JSON.parse(fs.readFileSync(source));
const trainer=new Trainer(raw,initial),generations=Number(process.argv[2]??100),scenario=Number(process.argv[3]??1);trainer.scenario=scenario;
for(let i=0;i<generations;i++){const result=trainer.trainGeneration(12,3);if(i%10===0||i===generations-1){console.log(JSON.stringify(result));fs.writeFileSync('dist/assets/falcon-graduate.json',JSON.stringify(trainer.checkpoint())+'\n');}}
const seeds=Array.from({length:12},(_,i)=>730001+i*973);const result=evaluate(prepareCircuit(raw),trainer.weights,seeds,scenario);
const checkpoint=trainer.checkpoint();checkpoint.evaluation={scenario,episodes:result.episodes,landings:result.landings,score:result.score,feedback:'No full-network feedback in this evaluation'};
fs.writeFileSync('dist/assets/falcon-graduate.json',JSON.stringify(checkpoint)+'\n');
fs.writeFileSync('dist/assets/falcon-training-report.json',JSON.stringify({scenario,trainingEpisodes:checkpoint.episodes,initialization:source,inputs:18,outputs:10,parameters:202,evaluation:result,scope:'Twelve evaluation flights with seeds separate from training. Local 3D dynamics with fixed zero upstream feedback; live asynchronous full-connectome flights can differ.'},null,2)+'\n');console.log('EVALUATION',JSON.stringify(checkpoint.evaluation));
