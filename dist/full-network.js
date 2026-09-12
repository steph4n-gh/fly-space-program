// The complete retained graph powers the activity atlas. The trained 96-cell
// motor controller supplies its model activations; the remaining cells propagate
// an approximate signed rate signal and send feedback into that motor circuit.
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
  const [rows,incoming,signs,channels,groups]=await Promise.all([
    compressedArray(base+nodes.rows.file,Uint32Array),compressedArray(base+nodes.incoming.file,Float32Array),
    compressedArray(base+nodes.signs.file,Int8Array),compressedArray(base+nodes.channels.file,Uint8Array),compressedArray(base+nodes.groups.file,Uint8Array),
  ]);
  let next=0;
  const download=async()=>{while(next<manifest.parts.length){const part=manifest.parts[next++];const [p,w]=await Promise.all([compressedArray(base+part.pre.file,Uint32Array),compressedArray(base+part.weight.file,Uint16Array)]);if(p.length!==part.count||w.length!==part.count)throw new Error('Incomplete graph block');pre.set(p,part.start);weight.set(w,part.start);completed+=part.count;onProgress(completed,manifest.edges);}};
  await Promise.all([download(),download(),download()]);
  if(rows.length!==n+1||rows[n]!==manifest.edges)throw new Error('Invalid complete graph index');
  return new FullNetwork({manifest,pre,weight,rows,incoming,signs,channels,groups});
}
export class FullNetwork{
  constructor(data){Object.assign(this,data);this.n=data.manifest.neurons;this.activity=new Float32Array(this.n);this.next=new Float32Array(this.n);this.signed=new Float32Array(this.n);this.feedback=new Float32Array(data.manifest.coreIndices.length);this.normalizer=Float32Array.from(data.incoming,v=>v>0?.72/v:0);this.iteration=0;this.pulse=null;}
  reset(){this.activity.fill(0);this.next.fill(0);this.feedback.fill(0);this.iteration=0;this.pulse=null;}
  step(observations,coreActivity){
    const {n,pre,weight,rows,normalizer,signs,channels,activity:a,next:b,signed}=this;
    for(let i=0;i<n;i++)signed[i]=a[i]*signs[i];
    for(let i=0;i<n;i++){
      let v=0;for(let k=rows[i],end=rows[i+1];k<end;k++)v+=weight[k]*signed[pre[k]];
      const channel=channels[i],drive=channel<8?.28*Math.tanh((observations[channel]??0)*2):0;
      b[i]=Math.tanh(a[i]*.42+v*normalizer[i]+drive);
    }
    if(this.pulse){b[this.pulse.index]=Math.min(1.5,b[this.pulse.index]+1.2);if(--this.pulse.steps<=0)this.pulse=null;}
    // Motor neurons are advanced at the faster flight-controller cadence. Their
    // whole-network candidate rates feed the next motor update, completing the loop.
    for(let i=0;i<this.manifest.coreIndices.length;i++){const id=this.manifest.coreIndices[i];this.feedback[i]=b[id];b[id]=coreActivity[i]??0;}
    this.activity=b;this.next=a;this.iteration++;
    let active=0,peak=0;const groupSum=[0,0,0,0,0],groupCount=[0,0,0,0,0];
    for(let i=0;i<n;i++){const v=Math.abs(b[i]);if(v>.01)active++;if(v>peak)peak=v;groupSum[this.groups[i]]+=v;groupCount[this.groups[i]]++;}
    return {active,peak,iteration:this.iteration,regions:groupSum.map((v,i)=>v/Math.max(1,groupCount[i]))};
  }
}
