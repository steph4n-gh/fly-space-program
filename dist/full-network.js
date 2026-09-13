// Every retained neuron and directed edge is evaluated on every recurrent pass.
// Telemetry enters annotated sensory cells; only graph activity reaches readout.
export const NETWORK_INPUTS=19,NETWORK_PASSES=2;
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
  return new FullNetwork({manifest,pre,weight,rows,incoming,signs,channels,groups,classes,labels});
}
export class FullNetwork{
  constructor(data){
    Object.assign(this,data);this.n=data.manifest.neurons;
    this.activity=new Float32Array(this.n);this.next=new Float32Array(this.n);this.signed=new Float32Array(this.n);
    this.normalizer=Float32Array.from(data.incoming,v=>v>0?.55/v:0);
    this.inputChannel=new Int8Array(this.n).fill(-1);this.inputPolarity=new Int8Array(this.n);
    const motor=[];let sensory=0;
    for(let i=0;i<this.n;i++){
      const label=data.labels.classes[data.classes[i]];
      if(isMotorClass(label))motor.push(i);
      if(label.includes('sensory')){this.inputChannel[i]=sensory%NETWORK_INPUTS;this.inputPolarity[i]=(Math.floor(sensory/NETWORK_INPUTS)%2)?-1:1;sensory++;}
    }
    this.motorIndices=Uint32Array.from(motor);this.sensoryCount=sensory;this.reset();
  }
  reset(){this.activity.fill(0);this.next.fill(0);this.iteration=0;this.pulse=null;}
  step(observations){
    const {n,pre,weight,rows,normalizer,signs,inputChannel,inputPolarity,activity:a,next:b,signed}=this;
    for(let i=0;i<n;i++)signed[i]=a[i]*signs[i];
    for(let i=0;i<n;i++){
      let v=0;for(let k=rows[i],end=rows[i+1];k<end;k++)v+=weight[k]*signed[pre[k]];
      const channel=inputChannel[i],drive=channel>=0?.7*Math.tanh((observations[channel]??0)*.15)*inputPolarity[i]:0;
      b[i]=Math.tanh(a[i]*.05+v*normalizer[i]+drive);
    }
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
  snapshot(){return{activity:this.activity.slice(),iteration:this.iteration,pulse:this.pulse?{...this.pulse}:null};}
  restore(snapshot){this.activity.set(snapshot.activity);this.iteration=snapshot.iteration;this.pulse=snapshot.pulse?{...snapshot.pulse}:null;}
  explain(observations,weights,before,commands){
    const live=this.snapshot(),replay=obs=>{this.restore(before);return Array.from(this.decide(obs,weights));};
    try{
      const baseline=replay(observations),neutralCommands=observations.map((_,i)=>{const changed=[...observations];changed[i]=0;return replay(changed);});
      this.reset();const withoutHistory=Array.from(this.decide(observations,weights));
      return{neutralCommands,withoutHistory,replayError:Math.max(...commands.map((v,i)=>Math.abs(v-baseline[i])))};
    }finally{this.restore(live);}
  }
}
