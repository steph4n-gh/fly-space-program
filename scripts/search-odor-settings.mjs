import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,advance,decisionSteps} from '../dist/engine3d.js';
import {sampleEmbodied} from '../dist/perception.js';
import {isEmbodied,validCheckpoint,flightResult} from '../dist/full-controller.js';

// Exhaustive first screen of four existing model odor channels. The neural
// readout is immutable; only sustained external input levels change. These
// dimensionless settings are NOT chemical concentrations or a hardware recipe.
const file=process.argv[2]??'dist/assets/embodied-starter.json',output=process.argv[3]??'artifacts/embodied-training/odor-search.json';
const bytes=fs.readFileSync(file),c=JSON.parse(bytes);if(!validCheckpoint(c)||!isEmbodied(c))throw Error('Expected an embodied checkpoint');
const network=loadFullNetwork();network.setInputMode('embodied');network.setActivationGain(c.activationGain??1);
const trainingSeeds=[5200103,5208019,5221027],validationSeeds=[7100009,7109021,7117033,7125053];
function evaluate(levels,seeds){
 const flights=[];
 for(const seed of seeds){
  const s=createFlight(seed,0,.4);s.styleEnabled=false;s.autoOdor=levels===null;s.activationGain=c.activationGain??1;network.reset();
  while(!s.done){const obs=[...sampleEmbodied(s).observations];if(levels)obs.splice(1554,4,...levels);
   const action=network.decide(obs,c.weights);for(let j=0,steps=decisionSteps(s);j<steps&&!s.done;j++)advance(s,action);
  }flights.push(flightResult(s));
 }return{landings:flights.filter(s=>s.landed).length,score:flights.reduce((v,s)=>v+s.score,0)/flights.length,flights};
}
const trials=[];let best;
for(let mask=0;mask<16;mask++){
 const levels=Array.from({length:4},(_,i)=>Number((mask>>i)&1)),result={mask,levels,...evaluate(levels,trainingSeeds)};trials.push(result);
 if(!best||result.landings>best.landings||result.landings===best.landings&&result.score>best.score)best=result;
 console.log(JSON.stringify({mask,levels,landings:result.landings,score:result.score}));
}
const validation={selected:evaluate(best.levels,validationSeeds),cleanAir:evaluate([0,0,0,0],validationSeeds),shippedAutoOdor:evaluate(null,validationSeeds)};
const report={checkpoint:file,checkpointSHA256:createHash('sha256').update(bytes).digest('hex'),readoutFixed:true,scope:'Landing school only; sustained binary levels in four existing model channels',channels:['ethyl acetate left','ethyl acetate right','geosmin left','geosmin right'],exposureUnit:'Dimensionless model drive; not a measured chemical concentration',inputMode:'embodied',neurons:network.n,edges:network.pre.length,style:false,variability:.4,trainingSeeds,validationSeeds,selection:'More landings first, higher mean flight reward second; training seeds only',selectedLevels:best.levels,trials,validation,totalTrainingFlights:trials.length*trainingSeeds.length,totalValidationFlights:validationSeeds.length*3};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,selectedLevels:best.levels,validation:Object.fromEntries(Object.entries(validation).map(([k,v])=>[k,{landings:v.landings,score:v.score}]))}));
