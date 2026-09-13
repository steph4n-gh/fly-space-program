// Every retained neuron and directed edge is evaluated on every recurrent pass.
// Sensory observations enter annotated sensory cells; only graph activity reaches readout.
import {NETWORK_INPUTS} from './signals.js?v=9.2';
export {NETWORK_INPUTS};
import {SENSORY_GROUPS,EMBODIED_INPUTS} from './sensory-inputs.js?v=9.2';
export const NETWORK_PASSES=2;
export const isMotorClass=name=>['descending_neuron','cb_motor','vnc_motor'].includes(name);
export async function compressedArray(url,Type){
  const response=await fetch(url);if(!response.ok)throw new Error(`Missing connectome asset: ${url}`);
  const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Type(await new Response(stream).arrayBuffer());
}
export async function loadNetwork(base,onProgress=()=>{}){
  const response=await fetch(base+'manifest.json');if(!response.ok)throw new Error('Connectome manifest unavailable');
  const manifest=await response.json(),n=manifest.neurons;
  const pre=new Uint32Array(manifest.edges),weight=new Uint16Array(manifest.edges);
  const nodes=manifest.nodes;let completed=0;
  const [rows,incoming,signs,channels,groups,classes,labels]=await Promise.all([
    compressedArray(base+nodes.rows.file,Uint32Array),compressedArray(base+nodes.incoming.file,Float32Array),
    compressedArray(base+nodes.signs.file,Int8Array),compressedArray(base+nodes.channels.file,Uint8Array),compressedArray(base+nodes.groups.file,Uint8Array),
    compressedArray(base+nodes.classes.file,Uint8Array),fetch(base+'labels.json').then(r=>r.json()),
  ]);
  let next=0;
  const download=async()=>{while(next<manifest.parts.length){const part=manifest.parts[next++];const [p,w]=await Promise.all([compressedArray(base+part.pre.file,Uint32Array),compressedArray(base+part.weight.file,Uint16Array)]);if(p.length!==part.count||w.length!==part.count)throw new Error('Incomplete graph block');pre.set(p,part.start);weight.set(w,part.start);completed+=part.count;onProgress(completed,manifest.edges);}};
  await Promise.all([download(),download(),download()]);
  if(rows.length!==n+1||rows[n]!==manifest.edges)throw new Error('Invalid complete graph index');
  const [receptorChannels,receptorPolarity]=await Promise.all([compressedArray(base+'receptor-channels.bin.gz',Int16Array),compressedArray(base+'receptor-polarity.bin.gz',Int8Array)]);
  return new FullNetwork({manifest,pre,weight,rows,incoming,signs,channels,groups,classes,labels,receptorChannels,receptorPolarity});
}
export class FullNetwork{
  constructor(data){
    Object.assign(this,data);this.n=data.manifest.neurons;
    this.activity=new Float32Array(this.n);this.next=new Float32Array(this.n);this.signed=new Float32Array(this.n);
    this.normalizer=Float32Array.from(data.incoming,v=>v>0?.55/v:0);
    this.inputChannel=new Int16Array(this.n).fill(-1);this.inputPolarity=new Int8Array(this.n);
    const motor=[];let sensory=0;
    for(let i=0;i<this.n;i++){
      const label=data.labels.classes[data.classes[i]];
      if(isMotorClass(label))motor.push(i);
      if(label.includes('sensory')){this.inputChannel[i]=sensory%NETWORK_INPUTS;this.inputPolarity[i]=(Math.floor(sensory/NETWORK_INPUTS)%2)?-1:1;sensory++;}
    }
    this.motorIndices=Uint32Array.from(motor);this.sensoryCount=sensory;this.activationGain=1;this.inputMode='telemetry';this.telemetryChannels=this.inputChannel.slice();this.telemetryPolarity=this.inputPolarity.slice();this.reset();
  }
  setInputMode(mode='telemetry'){
    if(!['telemetry','embodied'].includes(mode))throw Error('Unknown sensory mode');
    if(mode==='embodied'&&(this.receptorChannels?.length!==this.n||this.receptorPolarity?.length!==this.n))throw Error('Missing anatomical sensory map');
    this.inputMode=mode;this.inputChannel.set(mode==='embodied'?this.receptorChannels:this.telemetryChannels);this.inputPolarity.set(mode==='embodied'?this.receptorPolarity:this.telemetryPolarity);
  }
  setActivationGain(gain=1){if(!Number.isFinite(gain)||gain<1||gain>1.05)throw Error('Circuit gain must be between 1.00 and 1.05');this.activationGain=gain;}
  reset(){this.activity.fill(0);this.next.fill(0);this.signed.fill(0);this.iteration=0;this.pulse=null;this.lastPulseIndex=-1;}
  step(observations){
    const {n,pre,weight,rows,normalizer,signs,inputChannel,inputPolarity,activity:a,next:b,signed}=this;
    for(let i=0;i<n;i++)signed[i]=a[i]*signs[i];
    for(let i=0;i<n;i++){
      let v=0;for(let k=rows[i],end=rows[i+1];k<end;k++)v+=weight[k]*signed[pre[k]];
      const channel=inputChannel[i],drive=channel>=0?.7*Math.tanh((observations[channel]??0)*.15)*inputPolarity[i]:0;
      b[i]=Math.tanh((a[i]*.05+v*normalizer[i]+drive)*this.activationGain);
    }
    this.lastPulseIndex=this.pulse?.index??-1;
    if(this.pulse){b[this.pulse.index]+=1.2;if(--this.pulse.steps<=0)this.pulse=null;}
    this.activity=b;this.next=a;this.iteration++;
  }
  decide(observations,weights){
    for(let pass=0;pass<NETWORK_PASSES;pass++)this.step(observations);
    const stride=this.motorIndices.length+1,commands=new Float64Array(10);
    for(let k=0;k<10;k++){let v=weights[k*stride+stride-1];for(let j=0;j<stride-1;j++)v+=weights[k*stride+j]*this.activity[this.motorIndices[j]];commands[k]=Math.tanh(v);}
    return commands;
  }
  stats(){let active=0;for(const rate of this.activity)if(Math.abs(rate)>.01)active++;return{active,iteration:this.iteration};}
  snapshot(){return{inputMode:this.inputMode,activationGain:this.activationGain,activity:this.activity.slice(),signed:this.signed.slice(),lastPulseIndex:this.lastPulseIndex,iteration:this.iteration,pulse:this.pulse?{...this.pulse}:null};}
  restore(snapshot){if(this.inputMode!==(snapshot.inputMode??'telemetry'))this.setInputMode(snapshot.inputMode??'telemetry');this.activationGain=snapshot.activationGain??1;this.activity.set(snapshot.activity);this.signed.set(snapshot.signed);this.lastPulseIndex=snapshot.lastPulseIndex;this.iteration=snapshot.iteration;this.pulse=snapshot.pulse?{...snapshot.pulse}:null;}
  traceControl(weights,control){
    if(!Number.isInteger(control)||control<0||control>=10)throw Error('Invalid traced control');
    const stride=this.motorIndices.length+1,bias=weights[control*stride+stride-1],rows=[];let sum=bias;
    for(let j=0;j<stride-1;j++){const index=this.motorIndices[j],rate=this.activity[index],weight=weights[control*stride+j],contribution=rate*weight;sum+=contribution;rows.push({index,rate,weight,contribution});}
    rows.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
    const command=Math.tanh(sum),neurons=rows.slice(0,4);
    const withRate=(index,rate)=>{let value=bias;for(let j=0;j<stride-1;j++){const cell=this.motorIndices[j];value+=weights[control*stride+j]*(cell===index?rate:this.activity[cell]);}return Math.tanh(value);};
    for(const neuron of neurons){
      const edges=[];
      for(let e=this.rows[neuron.index];e<this.rows[neuron.index+1];e++){
        const pre=this.pre[e],term=this.weight[e]*this.signed[pre]*this.normalizer[neuron.index];
        edges.push({edge:e,pre,post:neuron.index,contacts:this.weight[e],sign:this.signs[pre],rate:this.signed[pre]*this.signs[pre],term});
      }
      const leak=.05*this.signed[neuron.index]*this.signs[neuron.index];
      edges.sort((a,b)=>Math.abs(b.term)-Math.abs(a.term));neuron.edges=edges.slice(0,2);neuron.incomingCount=edges.length;
      for(const edge of neuron.edges){let remaining=0;for(let e=this.rows[neuron.index];e<this.rows[neuron.index+1];e++)if(e!==edge.edge)remaining+=this.weight[e]*this.signed[this.pre[e]];let removedRate=Math.fround(Math.tanh((leak+remaining*this.normalizer[neuron.index])*this.activationGain));if(neuron.index===this.lastPulseIndex)removedRate=Math.fround(removedRate+1.2);edge.commandDelta=withRate(neuron.index,removedRate)-command;}
      neuron.commandDelta=withRate(neuron.index,0)-command;
    }
    return{control,bias,sum,command,activationGain:this.activationGain,neurons,other:sum-bias-neurons.reduce((v,n)=>v+n.contribution,0),totalOutputs:stride-1,pass:this.iteration};
  }
  explain(observations,weights,before,commands){
    const live=this.snapshot(),replay=obs=>{this.restore(before);return Array.from(this.decide(obs,weights));};
    try{
      const baseline=replay(observations),groups=this.inputMode==='embodied'?SENSORY_GROUPS:observations.map((_,i)=>[i]),neutralCommands=groups.map(indices=>{const changed=[...observations];for(const i of indices)changed[i]=0;return replay(changed);});
      this.reset();const withoutHistory=Array.from(this.decide(observations,weights));
      return{neutralCommands,withoutHistory,replayError:Math.max(...commands.map((v,i)=>Math.abs(v-baseline[i])))};
    }finally{this.restore(live);}
  }
}
