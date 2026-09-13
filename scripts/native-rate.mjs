import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function attachNativeRate(network){
 const native=require('../artifacts/native-rate/rate-native.node');
 network.step=function(observations){
  native.step(this.pre,this.weight,this.rows,this.normalizer,this.signs,this.inputChannel,this.inputPolarity,this.activity,this.next,this.signed,observations instanceof Float64Array?observations:Float64Array.from(observations,v=>v??0),this.activationGain);
  this.lastPulseIndex=this.pulse?.index??-1;
  if(this.pulse){this.next[this.pulse.index]+=1.2;if(--this.pulse.steps<=0)this.pulse=null;}
  const previous=this.activity;this.activity=this.next;this.next=previous;this.iteration++;
 };
 return network;
}
