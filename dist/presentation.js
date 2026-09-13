const KEYS=['t','x','y','z','vx','vy','vz','angle','angleZ','heading','omega','omegaZ','omegaYaw','throttle','gimbal','gimbalZ','rcs','rcsZ','yawJet','finX','finZ','selector','gaze','fuel','padX','padZ','padVx','padVz','deckRoll','deckPitch'];
// Rendering follows a small timestamped buffer. It never feeds interpolated
// values back into physics, sensors, rewards or the decision inspector.
export class FlightPresentation{
 reset(state){this.samples=[{...state,finAngles:[...state.finAngles]}];this.time=state.t;this.view={...state};this.identity=state;return this.view;}
 push(state){this.samples.push({...state,finAngles:[...state.finAngles]});}
 sample(elapsed,speed,paused=false){
  const samples=this.samples,last=samples.at(-1);if(!paused)this.time=Math.min(last.t,Math.max(this.time,this.time+elapsed*speed));
  while(samples.length>2&&samples[1].t<=this.time)samples.shift();
  const a=samples[0],b=samples[1]??a,alpha=b.t===a.t?1:Math.max(0,Math.min(1,(this.time-a.t)/(b.t-a.t)));
  Object.assign(this.view,alpha>=1?b:a);for(const key of KEYS)if(Number.isFinite(a[key])&&Number.isFinite(b[key]))this.view[key]=a[key]+(b[key]-a[key])*alpha;
  this.view.finAngles=a.finAngles.map((v,i)=>v+(b.finAngles[i]-v)*alpha);return this.view;
 }
 get ahead(){return this.samples.at(-1).t-this.time;}
}
