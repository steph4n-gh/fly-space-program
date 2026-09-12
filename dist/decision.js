import {createBrain,think,deck,descentCue,actionTargets} from './engine3d.js';

export const SIGNALS=[
  ['X position error','m','Centered on deck'],['X relative velocity','m/s','Moving with deck'],
  ['Descent speed error','m/s','Matching descent cue'],['X tilt','°','Upright'],
  ['X rotation rate','rad/s','No rotation'],['Radar altitude','m','At deck level'],
  ['Remembered fuel','%','50% fuel'],['Deck X velocity','m/s','Deck stationary on X'],
  ['Z position error','m','Centered on deck'],['Z relative velocity','m/s','Moving with deck'],
  ['Z tilt','°','Upright'],['Z rotation rate','rad/s','No rotation'],
  ['Deck Z velocity','m/s','Deck stationary on Z'],['Heading','°','Zero heading'],
  ['Yaw rate','rad/s','No rotation'],['Remembered engine health','%','100% engine health'],
  ['Fuel reading age','s','Fresh reading'],['Engine reading age','s','Fresh reading'],
];
export const CONTROLS=[
  ['Throttle','throttle','%'],['Gimbal X','gimbal','°'],['Attitude jets X','rcs','%'],
  ['Gimbal Z','gimbalZ','°'],['Attitude jets Z','rcsZ','%'],['Yaw jets','yawJet','%'],
  ['Fin X lever','finX','%'],['Fin Z lever','finZ','%'],['Engine selector','selector','%'],['Gaze','gaze','%'],
];

// Called immediately after the live think(). Replays use private scratch state;
// neither the live brain nor the graph worker receives these diagnostic inputs.
export function captureDecision(s,brain,observations,action,network={}) {
  const p=deck(s),cue=descentCue(s),degrees=180/Math.PI;
  const obs=Array.from(observations),commands=Array.from(action);
  const weights=Array.from(brain.weights),feedback=Array.from(brain.feedback??new Float64Array(96));
  const probe=createBrain(brain.c,weights,feedback),baseline=Array.from(think(probe,obs));
  const neutralCommands=obs.map((_,i)=>{const changed=[...obs];changed[i]=0;return Array.from(think(probe,changed));});
  probe.feedback=null;const withoutFeedback=Array.from(think(probe,obs));
  return {
    time:s.t,step:s.step,seed:s.seed,observations:obs,commands,targets:actionTargets(commands),
    weights,feedback,neutralCommands,withoutFeedback,
    replayError:Math.max(...commands.map((a,i)=>Math.abs(a-baseline[i]))),
    feedbackTick:network.tick??null,feedbackReceivedAt:network.receivedAt??null,
    raw:[s.x-p.x,s.vx-p.vx,s.vy-cue,s.angle*degrees,s.omega,Math.max(0,s.y-8),s.seenFuel*100,p.vx,s.z-p.z,s.vz-p.vz,s.angleZ*degrees,s.omegaZ,p.vz,s.heading*degrees,s.omegaYaw,s.seenEngine*100,s.fuelAge,s.engineAge],
    situation:{x:s.x-p.x,z:s.z-p.z,vx:s.vx-p.vx,vz:s.vz-p.vz,vy:s.vy,cue,altitude:Math.max(0,s.y-8),fuel:s.fuel,seenFuel:s.seenFuel,fuelAge:s.fuelAge,engine:s.engineHealth,seenEngine:s.seenEngine,engineAge:s.engineAge,finFailed:s.finFailed},
  };
}

const number=(v,digits=2)=>Number(v).toFixed(digits);
const signed=(v,digits=2)=>(v>0?'+':'')+number(v,digits);
const displayControl=(k,v)=>CONTROLS[k][2]==='°'?`${signed(v*180/Math.PI,1)}°`:`${number(v*100,1)}%`;

export class DecisionView {
  constructor(root) {
    this.root=root;this.selected=0;this.last=null;
    this.signals=root.querySelector('#decision-signals');
    this.controls=root.querySelector('#decision-controls');
    this.signals.innerHTML=SIGNALS.map(([name,unit,neutral],i)=>`<tr><th scope="row">${name}</th><td data-raw="${i}"></td><td class="encoded" data-encoded="${i}"></td><td class="effect-cell"><div class="effect-track"><i data-effect="${i}"></i></div><span data-delta="${i}"></span></td><td class="neutral-value">${neutral}</td></tr>`).join('');
    this.controls.innerHTML=CONTROLS.map(([name],i)=>`<button class="decision-control${i===0?' selected':''}" data-control="${i}" aria-pressed="${i===0}"><span>${name}</span><strong data-request="${i}">—</strong><small>Actual <b data-actual="${i}">—</b></small><div class="command-track"><i data-command-bar="${i}"></i><em data-actual-mark="${i}"></em></div></button>`).join('');
    this.controls.addEventListener('click',e=>{const button=e.target.closest('[data-control]');if(!button)return;this.selected=Number(button.dataset.control);this.controls.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});this.last=null;});
    this.nodes={};root.querySelectorAll('[id]').forEach(n=>this.nodes[n.id]=n);
    const getAll=attr=>Array.from(root.querySelectorAll(`[${attr}]`));
    this.rawNodes=getAll('data-raw');this.encodedNodes=getAll('data-encoded');this.effects=getAll('data-effect');this.deltas=getAll('data-delta');
    this.requests=getAll('data-request');this.actuals=getAll('data-actual');this.bars=getAll('data-command-bar');this.markers=getAll('data-actual-mark');
    this.nodes['influence-bars'].innerHTML=Array.from({length:3},()=>'<div class="influence-row"><span></span><div class="influence-track"><i></i></div><strong></strong></div>').join('');
  }
  update(trace,state,mode,paused) {
    const n=this.nodes;
    n['decision-empty'].hidden=!!trace&&mode!=='human';n['decision-data'].hidden=!trace||mode==='human';
    n['decision-empty'].textContent=mode==='human'?'You have the controls. Select a fly pilot to inspect its decisions.':'Waiting for the first control decision…';
    n['inspect-decision'].textContent=paused?'Resume flight':'Pause & inspect';
    if(!trace||mode==='human'){n['decision-stamp'].textContent=mode==='human'?'HUMAN CONTROL':'AWAITING SAMPLE';return;}
    n['decision-stamp'].textContent=`${paused?'PAUSED · ':''}SAMPLE ${trace.step} · ${trace.time.toFixed(2)} s · ${(state.t-trace.time).toFixed(2)} s ago`;
    for(let k=0;k<10;k++) {
      const actual=state[CONTROLS[k][1]],target=trace.targets[k];
      this.requests[k].textContent=k===8?`${target?'3':'1'} engine${target?'s':''}`:displayControl(k,target);
      this.actuals[k].textContent=k===8?`${state.engineBank} · lever ${number(actual*100,0)}%`:displayControl(k,actual);
      this.requests[k].title=`Raw command: ${trace.commands[k]}; requested position: ${target}`;this.actuals[k].title=String(actual);
      const position=(k===0||k===8)?target:(k===1||k===3)?(target/.22+1)/2:(target+1)/2;
      const actualPosition=(k===0||k===8)?actual:(k===1||k===3)?(actual/.22+1)/2:(actual+1)/2;
      this.bars[k].style.width=`${Math.max(0,Math.min(1,position))*100}%`;this.markers[k].style.left=`${Math.max(0,Math.min(1,actualPosition))*100}%`;
    }
    if(this.last===trace){if(this.radarSize!==`${n['decision-radar'].clientWidth}x${n['decision-radar'].clientHeight}`)this.drawApproach(trace.situation);return;}this.last=trace;
    const s=trace.situation,k=this.selected;
    n['influence-control'].textContent=CONTROLS[k][0];
    const ranked=trace.observations.map((_,i)=>({i,delta:trace.commands[k]-trace.neutralCommands[i][k]})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    n['influence-bars'].querySelectorAll('.influence-row').forEach((row,index)=>{const {i,delta}=ranked[index];row.querySelector('span').textContent=SIGNALS[i][0];row.querySelector('strong').textContent=signed(delta,6);row.title=`Zero input means: ${SIGNALS[i][2]}. Live command minus replay: ${delta}`;const bar=row.querySelector('i');bar.style.left=`${delta<0?50-Math.abs(delta)*25:50}%`;bar.style.width=`${Math.abs(delta)*25}%`;bar.dataset.sign=delta<0?'negative':'positive';});
    n['decision-output-name'].textContent=CONTROLS[k][0];
    n['decision-output-value'].textContent=signed(trace.commands[k],6);
    n['decision-output-value'].title=String(trace.commands[k]);
    n['decision-feedback'].textContent=trace.feedbackTick===null?'No graph feedback received for this flight':`Graph feedback tick ${trace.feedbackTick} · held fixed for every replay`;
    n['decision-replay'].textContent=trace.replayError===0?'Replay matches live command exactly':`Replay difference ${trace.replayError.toExponential(2)}`;
    n['descent-actual'].textContent=`${number(s.vy,2)} m/s`;n['descent-cue'].textContent=`${number(s.cue,2)} m/s`;
    n['descent-difference'].textContent=`${signed(s.vy-s.cue,2)} m/s error`;
    n['fuel-memory'].textContent=`${number(s.seenFuel*100,1)}% remembered · ${number(s.fuelAge,2)} s old`;
    n['fuel-truth'].textContent=`Actual at sample: ${number(s.fuel*100,1)}%`;
    n['engine-memory'].textContent=`${number(s.seenEngine*100,0)}% remembered · ${number(s.engineAge,2)} s old`;
    n['engine-truth'].textContent=`Actual at sample: ${number(s.engine*100,0)}%${s.finFailed?' · fin 01 jammed':''}`;
    n['feedback-effect'].textContent=`${signed(trace.commands[k]-trace.withoutFeedback[k],6)} command change from current feedback versus zero feedback`;
    for(let i=0;i<SIGNALS.length;i++) {
      const delta=trace.commands[k]-trace.neutralCommands[i][k];
      this.rawNodes[i].textContent=`${signed(trace.raw[i],2)} ${SIGNALS[i][1]}`;
      this.rawNodes[i].title=String(trace.raw[i]);
      this.encodedNodes[i].textContent=signed(trace.observations[i],6);
      this.encodedNodes[i].title=String(trace.observations[i]);
      this.effects[i].style.left=`${delta<0?50-Math.abs(delta)*25:50}%`;
      this.effects[i].style.width=`${Math.abs(delta)*25}%`;
      this.effects[i].dataset.sign=delta<0?'negative':'positive';
      this.deltas[i].textContent=signed(delta,6);
      this.deltas[i].title=`Live ${trace.commands[k]} minus replay ${trace.neutralCommands[i][k]}`;
    }
    this.drawApproach(s);
  }
  drawApproach(s) {
    const canvas=this.nodes['decision-radar'],w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    this.radarSize=`${w}x${h}`;
    const pixel=Math.min(devicePixelRatio||1,2);canvas.width=w*pixel;canvas.height=h*pixel;const g=canvas.getContext('2d');g.scale(pixel,pixel);
    const radius=Math.min(w/2-35,h/2-30),range=Math.max(20,Math.ceil(Math.max(Math.abs(s.x),Math.abs(s.z),Math.abs(s.x+s.vx*2),Math.abs(s.z+s.vz*2))/10)*10),scale=radius/range,cx=w/2,cy=h/2;
    g.strokeStyle='#263d4b';g.lineWidth=1;for(let i=1;i<=4;i++){g.beginPath();g.arc(cx,cy,radius*i/4,0,Math.PI*2);g.stroke();}
    g.beginPath();g.moveTo(cx-radius,cy);g.lineTo(cx+radius,cy);g.moveTo(cx,cy-radius);g.lineTo(cx,cy+radius);g.stroke();
    g.strokeStyle='#a2dfc166';g.setLineDash([4,5]);g.beginPath();g.arc(cx,cy,11*scale,0,Math.PI*2);g.stroke();g.setLineDash([]);
    const x=cx+s.x*scale,y=cy+s.z*scale,dx=s.vx*scale*2,dy=s.vz*scale*2;
    g.strokeStyle='#fab675';g.lineWidth=2;g.beginPath();g.moveTo(x,y);g.lineTo(x+dx,y+dy);g.stroke();
    if(Math.hypot(dx,dy)>3){const a=Math.atan2(dy,dx);g.beginPath();g.moveTo(x+dx-6*Math.cos(a-.5),y+dy-6*Math.sin(a-.5));g.lineTo(x+dx,y+dy);g.lineTo(x+dx-6*Math.cos(a+.5),y+dy-6*Math.sin(a+.5));g.stroke();}
    g.fillStyle='#ffd09d';g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fill();g.fillStyle='#b3e6d3';g.fillRect(cx-3,cy-3,6,6);
    g.font='12px monospace';g.fillStyle='#aabfc9';g.textAlign='center';g.fillText(`+X →   +Z ↓   ±${range} m`,cx,16);g.fillText(`X ${signed(s.x,1)} m · Z ${signed(s.z,1)} m`,cx,h-7);
  }
}
