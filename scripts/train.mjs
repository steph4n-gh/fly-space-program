import fs from 'node:fs';
import {Trainer,evaluate,newWeights,prepareCircuit} from '../dist/engine.js';
const circuit=JSON.parse(fs.readFileSync(new URL('../dist/assets/circuit.json',import.meta.url)));
const target=new URL('../dist/assets/graduate.json',import.meta.url);
const args=process.argv.slice(2),generations=Number(args[0]??220),scenario=Number(args[1]??0);
let checkpoint={};if(args.includes('--resume')&&fs.existsSync(target))checkpoint=JSON.parse(fs.readFileSync(target));
const trainer=new Trainer(circuit,checkpoint);trainer.scenario=scenario;
const validationSeeds=Array.from({length:20},(_,i)=>900000001+i*1337);
const baseline=evaluate(prepareCircuit(circuit),newWeights(),validationSeeds,scenario);
const started=Date.now();
console.log(JSON.stringify({event:'baseline',scenario,score:baseline.score,landings:baseline.landings,episodes:baseline.episodes}));
for(let i=0;i<generations;i++) {
  const r=trainer.trainGeneration(20,4);
  if(i%10===0||i===generations-1) {
    fs.writeFileSync(target,JSON.stringify({...trainer.checkpoint(),source:'Reward training on this machine',trainedAt:new Date().toISOString()}));
    console.log(JSON.stringify({generation:r.generation,score:+r.score.toFixed(2),landings:r.landings,batch:r.batch,episodes:r.episodes,seconds:Math.round((Date.now()-started)/1000)}));
  }
}
const final=evaluate(prepareCircuit(circuit),trainer.weights,validationSeeds,scenario);
const report={createdAt:new Date().toISOString(),method:'20 previously unused fixed seeds; frozen checkpoint. These evaluation results do not drive training or checkpoint selection.',scenario,baseline,trained:final};
fs.writeFileSync(new URL('../dist/assets/training-report.json',import.meta.url),JSON.stringify(report));
fs.writeFileSync(target,JSON.stringify({...trainer.checkpoint(),source:'Reward training on this machine',trainedAt:new Date().toISOString(),evaluation:{scenario,baseline:baseline.landings,landings:final.landings,episodes:20}}));
console.log(JSON.stringify({event:'evaluation',scenario,baseline:baseline.landings,trained:final.landings,score:final.score,episodes:20}));
