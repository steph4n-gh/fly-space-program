import {CONTROLS} from './decision.js?v=7.3';
import {CONTROL_LIMBS,limbTargets} from './kinematics.js?v=7.3';
const signed=(v,d=4)=>(v>=0?'+':'')+v.toFixed(d);
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export class WiringView{
 constructor(root,onSelect){
  this.root=root;this.last=null;this.onSelect=onSelect;
  const sources=[],motors=[],links=[];
  for(let j=0;j<4;j++){
   const y=75+j*91;motors.push(`<g class="wire-node motor" data-motor="${j}" tabindex="0" role="button"><rect x="345" y="${y-24}" width="210" height="61" rx="8"/><text x="360" y="${y-3}" data-motor-id="${j}"></text><text x="360" y="${y+18}" class="wire-small" data-motor-value="${j}"></text></g>`);
   links.push(`<path class="readout-link" data-readout-link="${j}" d="M555 ${y+5} C610 ${y+5},590 208,651 208"/>`);
   for(let e=0;e<2;e++){const i=j*2+e,sy=y-12+e*36;links.push(`<path class="bio-link" data-bio-link="${i}" d="M245 ${sy} C300 ${sy},292 ${y+5},345 ${y+5}"/>`);sources.push(`<g class="wire-node source" data-source="${i}" tabindex="0" role="button"><rect x="10" y="${sy-17}" width="235" height="31" rx="5"/><text x="22" y="${sy+3}" data-source-label="${i}"></text></g>`);}
  }
  root.querySelector('#wiring-diagram').innerHTML=`<svg viewBox="0 0 1000 437" role="img" aria-label="Measured incoming connections feed output neurons, then a learned control readout and an authored limb linkage"><defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="context-stroke"/></marker></defs><text x="10" y="22" class="wire-heading">MEASURED CONNECTIONS</text><text x="345" y="22" class="wire-heading">OUTPUT NEURONS</text><text x="660" y="22" class="wire-heading">TRAINED READOUT</text><text x="850" y="22" class="wire-heading">LIMB LINKAGE</text>${links.join('')}${sources.join('')}${motors.join('')}<rect x="650" y="151" width="171" height="113" rx="10" class="wire-command"/><text x="666" y="177" id="wire-control-name"></text><text x="666" y="215" class="wire-big" id="wire-command"></text><text x="666" y="241" class="wire-small">tanh of all 2,129 rates</text><path class="linkage-link" d="M821 208 H850"/><rect x="850" y="158" width="143" height="100" rx="9" class="wire-limb"/><text x="861" y="187" id="wire-limb-name"></text><text x="861" y="215" class="wire-small">Lit in cockpit</text><text x="861" y="239" class="wire-small">Control travel + IK</text><text x="345" y="427" class="wire-small">Four largest contributions shown; every output cell is included.</text></svg>`;
  root.addEventListener('click',e=>{const target=e.target.closest('[data-source],[data-motor]');if(!target||!this.last)return;const node=target.dataset.motor!==undefined?this.last.neurons[Number(target.dataset.motor)]?.index:this.last.neurons[Math.floor(Number(target.dataset.source)/2)]?.edges[Number(target.dataset.source)%2]?.pre;if(node!==undefined)onSelect(node);});
  root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-source],[data-motor]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
 }
 update(trace,state,atlas,mode){
  const data=trace?.motorTrace,body=this.root.querySelector('#wiring-content');body.hidden=!data||mode==='human';this.root.querySelector('#wiring-empty').hidden=!!data&&mode!=='human';
  if(!data||mode==='human')return;
  const k=data.control,limb=CONTROL_LIMBS[k],actual=state[CONTROLS[k][1]],targets=limbTargets(state),points=limb.limbs.map(i=>targets[i]);
  this.root.querySelector('#linkage-live').textContent=k===9?`Head yaw ${(-state.gaze*.65*180/Math.PI).toFixed(1)}° · ${Math.abs(state.gaze)>.25?'instrument glance':'forward view'}`:`${limb.name} · ${limb.role} · ${k===8?state.engineBank+' engines':actual.toFixed(3)+' actual control position'}`;
  this.root.querySelector('#linkage-pose').textContent=points.length?`Contact target${points.length>1?'s':''} in cockpit coordinates: ${points.map(p=>p.map(v=>v.toFixed(2)).join(', ')).join(' / ')}`:'Head turns with the gaze servo.';
  if(this.last===data)return;this.last=data;
  const name=index=>atlas?.ids?String(atlas.ids[index]):`index ${index}`;
  this.root.querySelector('#wire-control-name').textContent=CONTROLS[k][0];this.root.querySelector('#wire-command').textContent=signed(data.command,3);this.root.querySelector('#wire-command').setAttribute('title',String(data.command));this.root.querySelector('#wire-limb-name').textContent=limb.name;
  this.root.querySelector('#wire-stamp').textContent=`Sample ${trace.step} · ${trace.time.toFixed(2)} s · graph pass ${data.pass}`;
  const edgeRows=[];
  for(let j=0;j<4;j++){
   const n=data.neurons[j];if(!n)continue;
   this.root.querySelector(`[data-motor-id="${j}"]`).textContent=`ID ${name(n.index)}`;
   this.root.querySelector(`[data-motor-value="${j}"]`).textContent=`${signed(n.rate)} × ${signed(n.weight,2)} = ${signed(n.contribution)}`;
   this.root.querySelector(`[data-readout-link="${j}"]`).dataset.sign=n.contribution>=0?'positive':'negative';
   this.root.querySelector(`[data-motor="${j}"]`).setAttribute('aria-label',`Inspect output neuron ${name(n.index)}. Removing its readout contribution changes the command by ${n.commandDelta}.`);
   for(let e=0;e<2;e++){
    const i=j*2+e,edge=n.edges[e],node=this.root.querySelector(`[data-source="${i}"]`),path=this.root.querySelector(`[data-bio-link="${i}"]`);node.style.display=path.style.display=edge?'':'none';if(!edge)continue;
    this.root.querySelector(`[data-source-label="${i}"]`).textContent=`${name(edge.pre)} · ${edge.contacts} syn · ${signed(edge.term)}`;
    path.dataset.sign=edge.term>=0?'positive':'negative';path.style.strokeWidth=String(Math.min(5,1+Math.abs(edge.term)*180));
    node.setAttribute('aria-label',`Inspect neuron ${name(edge.pre)}, ${edge.contacts} measured contacts into ${name(edge.post)}`);
    edgeRows.push(`<tr><td>${escape(name(edge.pre))} → ${escape(name(edge.post))}</td><td>${edge.contacts}</td><td>${edge.sign>0?'Excitatory':'Inhibitory'}</td><td title="${edge.term}">${signed(edge.term,6)}</td><td title="${edge.commandDelta}">${signed(edge.commandDelta,6)}</td></tr>`);
   }
  }
  this.root.querySelector('#wire-sum').textContent=`Shown cells ${signed(data.neurons.reduce((v,n)=>v+n.contribution,0),6)} + remaining cells ${signed(data.other,6)} + bias ${signed(data.bias,6)} = ${signed(data.sum,6)} → tanh → ${signed(data.command,6)}`;
  this.root.querySelector('#wire-edges').innerHTML=edgeRows.join('');
 }
}
