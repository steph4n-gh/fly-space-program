import {createFlight,rng} from './engine3d.js?v=9.3';
import {renderScreens,renderRetinas} from './perception.js?v=9.3';
import {EMBODIED_INPUTS,EYE_PIXELS,RETINA_WIDTH as W} from './sensory-inputs.js?v=9.3';
const bound=x=>Math.max(-.9,Math.min(.9,x));
// A visual curriculum: a luminous marker is presented on a monitor. The label
// comes from its apparent position in the retinal image, never a flight teacher.
export function lessonStimulus(seed,covered=false){
 const r=rng(seed),s=createFlight(seed,0);s.gaze=(r()-.5)*1.2;
 const screens=renderScreens(s);for(const screen of screens){screen.data.fill(0);for(let i=3;i<screen.data.length;i+=4)screen.data[i]=255;}
 const panel=Math.floor(r()*3),cx=12+r()*40,cy=14+r()*20,im=screens[panel];
 for(let y=0;y<48;y++)for(let x=0;x<64;x++)if(Math.hypot(x-cx,y-cy)<9){const i=(y*64+x)*4;im.data.set([255,255,255,255],i);}
 const eyes=renderRetinas(s,screens),observations=Array(EMBODIED_INPUTS).fill(0);let mass=0,moment=0;
 for(let k=0;k<2;k++)for(let j=0;j<EYE_PIXELS;j++){const v=eyes[k].data[j*4]/255;observations[k*EYE_PIXELS+j]=covered?0:v*3;const contrast=Math.max(0,v-.15);mass+=contrast;moment+=contrast*((j%W+.5)/W*2-1);}
 observations[2*EYE_PIXELS+9]=s.gaze;
 return{observations,target:bound(s.gaze+(mass?moment/mass:0)*1.2),visible:mass>0,gaze:s.gaze};
}
export async function collectLesson(network,seeds,{covered=false,pause=async()=>{},progress=()=>{},running=()=>true}={}){
 network.setInputMode('embodied');const samples=[];
 for(const seed of seeds){if(!running())return null;const stimulus=lessonStimulus(seed,covered);if(!stimulus.visible)continue;network.reset();
  for(let j=0;j<6;j++){network.step(stimulus.observations);network.step(stimulus.observations);await pause();if(!running())return null;}
  samples.push({seed,target:stimulus.target,gaze:stimulus.gaze,x:Float64Array.from([...network.motorIndices].map(i=>network.activity[i]).concat([1]))});progress(samples.length);
 }return samples;
}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function lessonLoss(weights,samples){const head=weights.slice(9*2130);return samples.reduce((v,s)=>v+(Math.tanh(dot(head,s.x))-s.target)**2,0)/samples.length;}
export function fitLesson(weights,samples,regularization=.1){
 const n=samples.length,head=weights.slice(9*2130),mean=Float64Array.from({length:2129},(_,j)=>samples.reduce((v,s)=>v+s.x[j],0)/n),scale=mean.map((v,j)=>1/Math.max(1e-9,Math.sqrt(samples.reduce((a,s)=>a+(s.x[j]-v)**2,0)/n)));
 const features=samples.map(s=>s.x.slice(0,2129).map((v,j)=>(v-mean[j])*scale[j])),residual=samples.map(s=>Math.atanh(s.target)-dot(head,s.x)),offset=residual.reduce((a,b)=>a+b,0)/n;
 const matrix=features.map((s,i)=>Float64Array.from([...features.map((t,j)=>dot(s,t)/2129+(i===j?regularization:0)),residual[i]-offset]));
 // Solve the small sample-space ridge system; all 2,129 motor cells contribute.
 for(let col=0;col<n;col++){let pivot=col;for(let r=col+1;r<n;r++)if(Math.abs(matrix[r][col])>Math.abs(matrix[pivot][col]))pivot=r;[matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];const scale=matrix[col][col];if(Math.abs(scale)<1e-14)throw Error('Visual lesson fit is singular');for(let j=col;j<=n;j++)matrix[col][j]/=scale;for(let r=0;r<n;r++)if(r!==col){const v=matrix[r][col];for(let j=col;j<=n;j++)matrix[r][j]-=v*matrix[col][j];}}
 const result=[...weights];let bias=offset;for(let j=0;j<2129;j++){let delta=0;for(let i=0;i<n;i++)delta+=matrix[i][n]*features[i][j]*scale[j]/2129;result[9*2130+j]+=delta;bias-=delta*mean[j];}result[10*2130-1]+=bias;return result;
}
