// Shared by the spectator, browser trainer, and Node trainer: one physics model.
export const DT = 0.05;
export const PARAMS = 39; // 3 × (8 sensor features + bias), 12 synaptic gain groups.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rng(seed) {
  let s = seed >>> 0;
  const random = () => { s += 0x6D2B79F5; let t=s; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
  random.normal = () => Math.sqrt(-2*Math.log(Math.max(1e-10,random())))*Math.cos(2*Math.PI*random());
  return random;
}
export const SCENARIOS = [
  {name:'Flight school',subtitle:'Vertical descent · calm air',amplitude:0,wind:0,spread:8,height:95},
  {name:'Ocean rendezvous',subtitle:'Moving ship · crosswind',amplitude:17,wind:0.45,spread:36,height:165},
  {name:'Bad idea',subtitle:'Rough seas · stronger gusts',amplitude:28,wind:1.3,spread:48,height:210},
];
export function createFlight(seed=1, scenario=0) {
  const r=rng(seed), c=SCENARIOS[scenario];
  return {seed,scenario,t:0,step:0,x:(r()-.5)*2*c.spread,y:c.height+r()*30,vx:scenario?(r()-.5)*(scenario+1)*2:0,vy:-8-r()*5,angle:scenario?(r()-.5)*.22:0,omega:0,fuel:1,phase:r()*Math.PI*2,padX:0,padVx:0,throttle:0,gimbal:0,rcs:0,reward:0,done:false,landed:false,reason:'',touchdown:null,trail:[]};
}
export function deck(s,t=s.t) {
  const c=SCENARIOS[s.scenario], a=c.amplitude;
  return {x:a*Math.sin(t*.11+s.phase),vx:a*.11*Math.cos(t*.11+s.phase),y:3};
}
export function sensors(s) {
  const p=deck(s), altitude=Math.max(0,s.y-8);
  // Radar altitude supplies a stopping-distance descent cue. An artificial sensor,
  // shared by every checkpoint; it never supplies a throttle or steering command.
  const descent=-Math.min(12,Math.sqrt(2*1.8*altitude)+.5);
  return [(s.x-p.x)/55,(s.vx-p.vx)/10,(s.vy-descent)/12,Math.sin(s.angle)*2,s.omega,(s.y-8)/160,s.fuel-.5,p.vx/5].map(v=>clamp(v,-3,3));
}
export function prepareCircuit(data) {
  const n=data.neurons.length;
  const connections=[];
  for (let dst=0;dst<n;dst++) for(let src=0;src<n;src++) if(data.matrix[dst][src]) connections.push([src,dst,data.matrix[dst][src],src%12]);
  return {...data,n,connections,enc:Float64Array.from(data.encoder.flat()),dec:Float64Array.from(data.decoder.flat())};
}
export function createBrain(circuit,weights,feedback=null) {
  const c=circuit.n?circuit:prepareCircuit(circuit);
  return {c,feedback,weights:Float64Array.from(weights),activity:new Float64Array(c.n),base:new Float64Array(c.n),next:new Float64Array(c.n),features:new Float64Array(8),action:[0,0,0],gains:Float64Array.from({length:12},(_,i)=>Math.exp(clamp(weights[27+i]??0,-1.1,1.1)))};
}
export function think(brain,obs) {
  const {c,weights:w,base,next,activity:a,features:f,gains}=brain,n=c.n;
  for(let j=0;j<n;j++) {
    let v=0; for(let k=0;k<8;k++) v+=c.enc[j*8+k]*obs[k];
    base[j]=Math.tanh(v); next[j]=.65*base[j];
  }
  for(let e=0;e<c.connections.length;e++) {const [src,dst,weight,group]=c.connections[e]; next[dst]+=weight*gains[group]*base[src];}
  for(let j=0;j<n;j++) a[j]=Math.tanh(next[j]+.12*(brain.feedback?.[j]??0));
  for(let k=0;k<8;k++) {let v=0;for(let j=0;j<n;j++)v+=c.dec[k*n+j]*a[j];f[k]=v;}
  for(let k=0;k<3;k++) {let v=w[k*9+8];for(let i=0;i<8;i++)v+=w[k*9+i]*f[i];brain.action[k]=Math.tanh(v);}
  return brain.action;
}
export function advance(s,action) {
  if(s.done)return s;
  const throttle=s.fuel>0?clamp((action[0]+1)*.5,0,1):0;
  const gimbal=clamp(action[1],-1,1)*.22,rcs=clamp(action[2],-1,1);
  s.throttle=throttle;s.gimbal=gimbal;s.rcs=rcs;
  const c=SCENARIOS[s.scenario], wind=c.wind*(Math.sin(s.t*.71+s.phase)+.45*Math.sin(s.t*2.4))+(s.gust??0);
  s.gust=(s.gust??0)*Math.exp(-DT*.6);
  const accel=throttle*24/(.82+.18*s.fuel);
  s.vx+=(Math.sin(s.angle+gimbal)*accel+wind-.012*s.vx)*DT;
  s.vy+=(Math.cos(s.angle+gimbal)*accel-9.81-.006*s.vy)*DT;
  s.omega+=(-gimbal*throttle*3.4+rcs*2.5-.45*s.omega)*DT;
  s.angle+=s.omega*DT;s.x+=s.vx*DT;s.y+=s.vy*DT;
  s.fuel=Math.max(0,s.fuel-throttle*.016*DT);s.t+=DT;s.step++;
  const p=deck(s);s.padX=p.x;s.padVx=p.vx;
  const o=sensors(s);
  s.reward-=DT*(.12+.8*o[0]**2+.25*o[1]**2+2.5*o[2]**2+1.7*o[3]**2+.18*o[4]**2+.015*throttle);
  if(s.y<=8) {
    const error=Math.abs(s.x-p.x), speed=Math.abs(s.vy), lateral=Math.abs(s.vx-p.vx), tilt=Math.abs(s.angle);
    s.landed=error<10 && speed<3.4 && lateral<2.8 && tilt<.18;
    s.done=true;s.touchdown={error,speed,lateral,tilt};
    s.reason=s.landed?'Touchdown':error>=10?'Missed the ship':tilt>=.18?'Attitude at impact':speed>=3.4?'Hard landing':'Lateral impact';
    s.reward+=s.landed?100+3*s.fuel:-30-Math.min(300,error*.4+speed*speed*1.2+lateral*lateral*.5+tilt*20);
  } else if(Math.abs(s.x)>220 || s.y>420 || Math.abs(s.angle)>2.6) {
    s.done=true;s.reason='Flight terminated';s.reward-=1000;
  } else if(s.t>=42) {s.done=true;s.reason='Approach timed out';s.reward-=22+Math.max(0,s.y-8)*2;}
  return s;
}
export function fly(circuit,weights,seed,scenario=0,record=false,feedback=null) {
  const s=createFlight(seed,scenario), b=createBrain(circuit,weights,feedback);let a=[0,0,0];
  while(!s.done) {if(s.step%3===0)a=think(b,sensors(s));advance(s,a);if(record&&s.step%4===0)s.trail.push([s.x,s.y]);}
  return s;
}
export function evaluate(circuit,weights,seeds,scenario=0,feedback=null) {
  let score=0,landings=0;const flights=[];
  for(const seed of seeds) {const f=fly(circuit,weights,seed,scenario,false,feedback);score+=f.reward;landings+=Number(f.landed);flights.push({seed,score:f.reward,landed:f.landed,reason:f.reason,touchdown:f.touchdown});}
  return {score:score/seeds.length,landings,episodes:seeds.length,flights};
}
export function newWeights(seed=74) {const r=rng(seed);return Array.from({length:PARAMS},(_,i)=>i<9?r.normal()*.025:0);}

// Antithetic evolution strategies: rewards optimize both output weights and gains
// on existing biological edges. No flight teacher, scripted autopilot, or API model.
export class Trainer {
  constructor(circuit,checkpoint={}) {
    this.c=prepareCircuit(circuit);this.weights=Float64Array.from(checkpoint.weights??newWeights());
    this.generation=checkpoint.generation??0;this.episodes=checkpoint.episodes??0;
    this.history=checkpoint.history??[];this.scenario=checkpoint.scenario??0;
    this.random=rng(8123+this.generation*7919);this.sigma=.12;this.rate=.055;
  }
  trainGeneration(directions=16,batch=3) {
    const random=this.random,seeds=Array.from({length:batch},()=>Math.floor(random()*1e8));
    const sigma=this.sigma, results=[];
    for(let d=0;d<directions;d++) {
      const noise=Float64Array.from({length:PARAMS},(_,i)=>random.normal()*(this.scenario===0&&i>=9&&i<27?0:i>=27?.3:1));
      const plus=Float64Array.from(this.weights,(w,i)=>w+noise[i]*sigma);
      const minus=Float64Array.from(this.weights,(w,i)=>w-noise[i]*sigma);
      const p=evaluate(this.c,plus,seeds,this.scenario,this.feedback),m=evaluate(this.c,minus,seeds,this.scenario,this.feedback);
      results.push({noise,p:p.score,m:m.score});
    }
    results.sort((a,b)=>Math.max(b.p,b.m)-Math.max(a.p,a.m));
    const elite=results.slice(0,Math.max(4,Math.floor(directions/2)));
    const scores=elite.flatMap(r=>[r.p,r.m]),mean=scores.reduce((a,b)=>a+b,0)/scores.length;
    const std=Math.max(.05,Math.sqrt(scores.reduce((sum,v)=>sum+(v-mean)**2,0)/scores.length));
    const candidate=Float64Array.from(this.weights);
    for(let i=0;i<PARAMS;i++) {
      let update=0;for(const r of elite)update+=(r.p-r.m)*r.noise[i];
      candidate[i]+=this.rate/(elite.length*std)*update;
      candidate[i]=clamp(candidate[i],i>=27?-1.1:-8,i>=27?1.1:8);
    }
    const old=evaluate(this.c,this.weights,seeds,this.scenario,this.feedback),next=evaluate(this.c,candidate,seeds,this.scenario,this.feedback);
    // Accept a reward improvement on identical initial conditions; never choose
    // a lucky flight against a differently seeded incumbent.
    const accepted=next.score>=old.score;
    if(accepted)this.weights=candidate;
    this.episodes+=(directions*2+2)*batch;this.generation++;
    const result=accepted?next:old;
    const entry={generation:this.generation,episodes:this.episodes,score:result.score,landings:result.landings,batch,scenario:this.scenario};
    this.history.push(entry);if(this.history.length>400)this.history.shift();
    return {...entry,accepted,weights:Array.from(this.weights)};
  }
  checkpoint() {return {version:1,circuit:'malecns-96-v1',weights:Array.from(this.weights),generation:this.generation,episodes:this.episodes,scenario:this.scenario,history:this.history};}
}
