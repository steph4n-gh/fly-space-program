import {collectLesson,lessonLoss,fitLesson} from './visual-lesson.js?v=9.5';
import {sampleEmbodied} from './perception.js?v=9.5';
import {FLIGHT_PANEL} from './flight-instruments.js?v=9.5';
import {EMBODIED_CONTROLLER,EMBODIED_SCHEMA,EMBODIED_INPUTS} from './sensory-inputs.js?v=9.5';
import {createFlight,fullSensors,advance,rng,decisionSteps} from './engine3d.js?v=9.5';
export const CONTROLLER_ID='malecns-full-rate-v2',READOUT_SIZE=21300;
export function validCheckpoint(c){return c?.version===5&&((c.circuit===CONTROLLER_ID&&c.sensorSchema==='flight-senses-46-v1')||(c.circuit===EMBODIED_CONTROLLER&&c.sensorSchema===EMBODIED_SCHEMA))&&(c.sensoryPresentation===undefined||(c.circuit===EMBODIED_CONTROLLER&&['landing-light-indicators-v1',FLIGHT_PANEL].includes(c.sensoryPresentation)))&&c.weights?.length===READOUT_SIZE&&c.weights.every(Number.isFinite)&&(c.activationGain===undefined||(Number.isFinite(c.activationGain)&&c.activationGain>=1&&c.activationGain<=1.05))&&Number.isFinite(c.generation)&&Number.isFinite(c.episodes);}
export const isEmbodied=c=>c?.circuit===EMBODIED_CONTROLLER;
export function freshEmbodied(){const c=freshCheckpoint(),r=rng(7449);return{...c,circuit:EMBODIED_CONTROLLER,sensorSchema:EMBODIED_SCHEMA,inputs:EMBODIED_INPUTS,weights:c.weights.map((_,i)=>(i+1)%2130===0?(Math.floor(i/2130)===8?-1:0):r.normal()*10),initialization:'Independent random readout; no flight demonstrations',scenario:0};}
export function freshCheckpoint(){const r=rng(74);return{version:5,circuit:CONTROLLER_ID,sensorSchema:'flight-senses-46-v1',inputs:46,activationGain:1,weights:Array.from({length:READOUT_SIZE},(_,i)=>i===9*2130-1?-1:r.normal()*.02),generation:0,episodes:0,history:[],scenario:1};}
export function* rollout(network,weights,seed,scenario,style=true,variability=0,activationGain=1,inputMode='telemetry',autoOdor=true,eyesCovered=false,instrumentLights=true,sensoryPresentation){
 network.setInputMode(inputMode);const s=createFlight(seed,scenario,variability);s.styleEnabled=style;s.autoOdor=autoOdor;s.eyesCovered=eyesCovered;s.instrumentLights=instrumentLights;s.sensoryPresentation=sensoryPresentation;s.activationGain=activationGain;network.setActivationGain(activationGain);network.reset();
 while(!s.done){const action=network.decide(inputMode==='embodied'?sampleEmbodied(s).observations:fullSensors(s),weights);for(let j=0,steps=decisionSteps(s);j<steps&&!s.done;j++)advance(s,action);yield s;}
 return s;
}
export function flightResult(s){return{seed:s.seed,scenario:s.scenario,activationGain:s.activationGain??1,score:s.reward,landed:s.landed,styleBonus:s.styleBonus,styleRecovered:s.styleRecovered,turnDegrees:(s.heading-s.styleStart)*180/Math.PI,reason:s.reason,variation:s.variation??null,touchdown:s.touchdown,time:s.t,...(s.orbital?{orbitComplete:s.orbitComplete,orbits:s.orbitTravel/(Math.PI*2),maxAltitude:s.maxAltitude,milestones:s.milestones}:{} )};}
const better=(a,b)=>a.landings>b.landings||(a.landings===b.landings&&a.score>b.score);
export class FullTrainer{
 constructor(network,checkpoint){this.network=network;this.data={...checkpoint,weights:[...checkpoint.weights],history:[...checkpoint.history]};this.scenario=checkpoint.scenario??1;this.style=true;this.variability=.4;this.profiles=[this.scenario];this.running=true;this.random=rng(19403+checkpoint.generation*7919);}
 async evaluate(weights,cases,onProgress,pause){
  const flights=[];
  for(const {seed,scenario,variability=0} of cases){let last;for(const s of rollout(this.network,weights,seed,scenario,this.style,variability,this.data.activationGain??1,isEmbodied(this.data)?'embodied':'telemetry',this.data.autoOdor!==false,!!this.data.eyesCovered,this.data.instrumentLights!==false,this.data.sensoryPresentation)){if(!this.running)return null;last=s;onProgress?.({completed:this.data.episodes,flightTime:s.t,scenario});await pause();}this.data.episodes++;flights.push(flightResult(last));}
  return{score:flights.reduce((v,s)=>v+s.score,0)/flights.length,landings:flights.filter(s=>s.landed).length,styles:flights.filter(s=>s.styleBonus>0).length,flights};
 }
 async generation(onProgress,pause=()=>new Promise(r=>setTimeout(r,0))){
  if(this.lesson&&isEmbodied(this.data))return this.visualGeneration(onProgress,pause);
  const r=this.random,count=this.profiles.length>1?4:3,cases=Array.from({length:count},(_,i)=>({seed:Math.floor(r()*1e8),scenario:this.profiles[(this.data.generation*count+i)%this.profiles.length],variability:i===0?0:this.variability})),base=this.data.weights;
  // Correlated gain changes explore useful control directions while small
  // independent perturbations keep every readout coefficient trainable.
  const stride=base.length/10,gains=Array.from({length:10},()=>r.normal()*.03);
  const noise=Float64Array.from(base,(v,i)=>v*gains[Math.floor(i/stride)]+r.normal()*(isEmbodied(this.data)?((i+1)%stride===0?.03:.3):.003)),plus=base.map((v,i)=>v+noise[i]),minus=base.map((v,i)=>v-noise[i]);
  const old=await this.evaluate(base,cases,onProgress,pause);if(!old)return null;
  let best=old,weights=base;for(const candidate of [plus,minus]){const result=await this.evaluate(candidate,cases,onProgress,pause);if(!result)return null;if(better(result,best)){best=result;weights=candidate;}}
  const accepted=weights!==base;this.data.weights=weights;delete this.data.evaluation;this.data.generation++;this.data.scenario=this.scenario;this.data.curriculum=[...this.profiles];
  const entry={generation:this.data.generation,episodes:this.data.episodes,scenario:this.scenario,score:best.score,landings:best.landings,styles:best.styles,batch:cases.length,profiles:cases.map(c=>c.scenario),variability:this.variability,activationGain:this.data.activationGain??1,perturbation:isEmbodied(this.data)?'head gain 0.03 + coefficient noise 0.3, bias noise 0.03':'head gain 0.03 + coefficient noise 0.003',accepted};this.data.history.push(entry);this.data.history=this.data.history.slice(-400);return entry;
 }
 async visualGeneration(onProgress,pause){
  this.network.setActivationGain(this.data.activationGain??1);const seeds=Array.from({length:40},()=>Math.floor(this.random()*1e8)),samples=await collectLesson(this.network,seeds,{covered:!!this.data.eyesCovered,pause,running:()=>this.running,progress:completed=>onProgress?.({lesson:'visual orientation',completed:this.data.episodes+completed,flightTime:completed,scenario:this.scenario})});if(!samples)return null;
  const cut=Math.floor(samples.length*.75),training=samples.slice(0,cut),validation=samples.slice(cut);if(validation.length<2)throw Error('Too few visible visual-lesson samples');const candidate=fitLesson(this.data.weights,training),before=lessonLoss(this.data.weights,validation),after=lessonLoss(candidate,validation),accepted=after<before;if(accepted)this.data.weights=candidate;
  this.data.generation++;this.data.episodes+=samples.length;this.data.initialization='Image-based gaze curriculum; no flight demonstrations';delete this.data.evaluation;
  const entry={generation:this.data.generation,episodes:this.data.episodes,scenario:this.scenario,lesson:'visual orientation',loss:accepted?after:before,previousLoss:before,score:-(accepted?after:before),landings:0,styles:0,batch:samples.length,profiles:[this.scenario],accepted};this.data.history.push(entry);this.data.history=this.data.history.slice(-400);return entry;
 }
 checkpoint(){return this.data;}
}
