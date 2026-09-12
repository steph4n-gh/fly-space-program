import {DT,SCENARIOS,clamp,createFlight,createBrain,prepareCircuit,think,sensors,advance,newWeights} from './engine.js';
import {FlightScene,drawBrain,drawChart} from './scene.js';

const $=id=>document.getElementById(id),STORE='fly-space-program-brain-v1';
const scene=new FlightScene($('flight-canvas'));
let circuit,prepared,graduate,school,trainee,worker,flight,brain,training=false,paused=false,speed=1,mode='graduate',scenario=0;
let flightIndex=0,observed=0,landed=0,doneAt=null,lastTime=0,accumulator=0,uiTime=0,ready=false,currentAction=[0,0,0],manualThrottle=.4;
const keys=new Set();let notifyTimer;
function notify(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>$('notice').hidden=true,4500);}
function validCheckpoint(c){return c?.version===1&&c.circuit==='malecns-96-v1'&&Array.isArray(c.weights)&&c.weights.length===39&&c.weights.every(Number.isFinite)&&Number.isFinite(c.generation)&&Number.isFinite(c.episodes);}
function saveTrainee(){if(!trainee)return;try{localStorage.setItem(STORE,JSON.stringify(trainee));$('save-status').textContent='Trainee saved on this device';}catch{$('save-status').textContent='Use Save brain to keep progress';}}
function activeCheckpoint(){if(mode==='rookie')return{version:1,circuit:'malecns-96-v1',weights:newWeights(),generation:0,episodes:0,history:[],scenario};if(mode==='trainee')return trainee??(scenario===0?school:graduate);return scenario===0?school:graduate;}
function updateLedger(c){if(!c)return;$('training-count').textContent=c.episodes.toLocaleString();$('generation').textContent=`GEN ${String(c.generation).padStart(3,'0')}`;drawChart($('learning-chart'),c.history??[]);}
function resetFlight(seed=Math.floor(Math.random()*1e8)) {
  if(!ready)return;
  flight=createFlight(seed,scenario);brain=createBrain(prepared,activeCheckpoint().weights);currentAction=[0,0,0];doneAt=null;accumulator=0;flightIndex++;
  $('result').hidden=true;$('flight-number').textContent=`FLIGHT ${String(flightIndex).padStart(3,'0')}`;
  $('manual-controls').hidden=mode!=='human';
  $('pilot-label').textContent=mode==='human'?'Human / Very confident':mode==='rookie'?'Fly / First day on the job':mode==='trainee'?'Fly / Learning on this device':'Fly / Trained checkpoint';
  $('scenario-kicker').textContent=SCENARIOS[scenario].name.toUpperCase();$('scenario-description').textContent=SCENARIOS[scenario].subtitle;
  $('flight-instruction').textContent=['Bring it home, little guy.','Catch a moving ship.','What could possibly go wrong?'][scenario];
  if(!training)updateLedger(activeCheckpoint());
}
function setMode(value){if(!['graduate','rookie','trainee','human'].includes(value))throw new Error('Unknown pilot');mode=value;$('pilot').value=value;keys.clear();resetFlight();if(!training)updateMessage();}
function setScenario(value){if(!Number.isInteger(value)||value<0||value>2)throw new Error('Mission must be 0, 1, or 2');scenario=value;$('scenario').value=String(value);observed=0;landed=0;updateOutcomes();if(training)worker.postMessage({type:'scenario',scenario});resetFlight();updateMessage();}
function updateMessage(){
  if(training)return;
  const c=activeCheckpoint();
  $('learning-status').textContent=mode==='rookie'?'UNTRAINED':mode==='trainee'?'YOUR CHECKPOINT':'CHECKPOINT';$('learning-status').classList.remove('live');
  if(mode==='human')$('training-message').textContent='Your turn. Keep it upright, scrub off speed, and aim between the landing lights.';
  else if(mode==='rookie')$('training-message').textContent='No flight experience. Train this recruit and watch its attempts become a flight record.';
  else if(mode==='trainee'&&!trainee)$('training-message').textContent='No local trainee yet. Train the fly to start from this mission’s checkpoint.';
  else if(c.evaluation?.scenario===scenario)$('training-message').textContent=`Checkpoint evaluation: ${c.evaluation.landings} / ${c.evaluation.episodes} landings on separate flights. Train further or try a harder mission.`;
  else $('training-message').textContent='An experimental assignment. Train on this mission to adapt the pilot to these conditions.';
  $('system-status').textContent=mode==='human'?'Human has the controls':'Flight circuit online';
}
function startTraining(){
  if(!ready)throw new Error('Flight circuit is still loading');if(training)return;
  const start=activeCheckpoint();trainee={...start,weights:[...start.weights],history:[...(start.history??[])],scenario};delete trainee.evaluation;
  training=true;mode='trainee';$('pilot').value=mode;
  $('train-button').innerHTML='<span>Ⅱ</span> Pause training';$('train-button').classList.add('training');
  $('learning-status').textContent='LEARNING';$('learning-status').classList.add('live');$('system-status').textContent='Flight school is running';
  $('training-message').textContent='Trying small changes to the brain. Each batch keeps changes that earn a better reward.';
  worker.postMessage({type:'start',circuit,checkpoint:trainee,scenario});saveTrainee();resetFlight();
}
function stopTraining(){if(!training)return;training=false;worker.postMessage({type:'stop'});$('train-button').innerHTML='<span>✦</span> Train the fly';$('train-button').classList.remove('training');saveTrainee();updateMessage();}
function setPause(value){paused=Boolean(value);$('pause-flight').textContent=paused?'▶':'Ⅱ';$('pause-flight').setAttribute('aria-label',paused?'Resume flight':'Pause flight');accumulator=0;}
function updateOutcomes(){$('flight-outcomes').textContent=observed?`${landed} landed / ${observed} observed`:'Waiting for first touchdown';}
function finishFlight(time){
  observed++;landed+=Number(flight.landed);updateOutcomes();doneAt=time;$('result').hidden=false;$('result').classList.toggle('success',flight.landed);
  $('result-kicker').textContent=flight.landed?'TOUCHDOWN CONFIRMED':'FAILURE IS FLIGHT DATA';
  $('result-title').textContent=flight.landed?(mode==='human'?'YOU LANDED IT.':'THE FLY LANDED IT.'):(mode==='human'?'TRICKIER THAN IT LOOKS.':'BACK TO FLIGHT SCHOOL.');
  $('result-description').textContent=flight.landed?`${flight.touchdown.speed.toFixed(1)} m/s at contact · ${Math.round(flight.fuel*100)}% fuel remaining`:flight.reason+(mode==='human'?' · Try another flight.':' · Next attempt incoming.');
}
function manualAction(){
  if(keys.has('w')||keys.has('arrowup'))manualThrottle=clamp(manualThrottle+.45*DT,0,1);
  if(keys.has('s')||keys.has('arrowdown'))manualThrottle=clamp(manualThrottle-.45*DT,0,1);
  $('manual-throttle').value=String(Math.round(manualThrottle*100));
  return [manualThrottle*2-1,(keys.has('e')?1:0)-(keys.has('q')?1:0),(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)];
}
function telemetry(){
  const s=flight,alt=Math.max(0,s.y-8),degrees=s.angle*180/Math.PI;
  $('altitude').innerHTML=`${alt.toFixed(0)}<small>m</small>`;$('vertical-speed').innerHTML=`${s.vy.toFixed(1)}<small>m/s</small>`;$('attitude').innerHTML=`${degrees.toFixed(1)}<small>°</small>`;$('fuel').innerHTML=`${Math.round(s.fuel*100)}<small>%</small>`;
  $('altitude-meter').style.width=`${clamp(alt/2.4,0,100)}%`;$('speed-meter').style.width=`${clamp(Math.abs(s.vy)*4,0,100)}%`;$('attitude-meter').style.width=`${clamp(Math.abs(degrees)*3,0,100)}%`;$('fuel-meter').style.width=`${s.fuel*100}%`;
  $('attitude-meter').style.background=Math.abs(degrees)>12?'#ff9845':'#c2d0dd';
  $('thrust-output').style.width=`${s.throttle*100}%`;$('thrust-value').textContent=`${Math.round(s.throttle*100)}%`;
  const bipolar=(id,value)=>{const node=$(id);node.style.left=`${value>=0?50:50+value*50}%`;node.style.width=`${Math.abs(value)*50}%`;};
  bipolar('gimbal-output',s.gimbal/.22);bipolar('rcs-output',s.rcs);$('gimbal-value').textContent=`${(s.gimbal*180/Math.PI).toFixed(0)}°`;$('rcs-value').textContent=`${Math.round(s.rcs*100)}%`;
  const minutes=Math.floor(s.t/60),seconds=s.t%60;$('flight-clock').textContent=`${String(minutes).padStart(2,'0')}:${seconds.toFixed(1).padStart(4,'0')}`;
}
function frame(time){
  const elapsed=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;
  if(ready){
    if(!paused){
      if(!flight.done){accumulator+=elapsed*(mode==='human'?1:speed);let count=0;while(accumulator>=DT&&!flight.done&&count++<30){if(mode==='human')currentAction=manualAction();else if(flight.step%3===0)currentAction=think(brain,sensors(flight));advance(flight,currentAction);if(flight.step%4===0)flight.trail.push([flight.x,flight.y]);accumulator-=DT;}if(flight.done)finishFlight(time);}
      else if(mode!=='human'&&time-doneAt>2800)resetFlight();
    }
    scene.draw(flight,time);
    if(time-uiTime>90){telemetry();drawBrain($('brain-canvas'),circuit,brain,time);uiTime=time;}
  }
  requestAnimationFrame(frame);
}
$('train-button').addEventListener('click',()=>training?stopTraining():startTraining());
$('new-flight').addEventListener('click',()=>resetFlight());$('pause-flight').addEventListener('click',()=>setPause(!paused));
$('scenario').addEventListener('change',e=>setScenario(Number(e.target.value)));
$('pilot').addEventListener('change',e=>setMode(e.target.value));
document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{speed=Number(button.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('selected',b===button));}));
$('manual-throttle').addEventListener('input',e=>{manualThrottle=Number(e.target.value)/100;});
document.querySelectorAll('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.key));});
window.addEventListener('keydown',e=>{if(mode!=='human'||['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)||$('about').open)return;if(['w','s','a','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
$('about-button').addEventListener('click',()=>$('about').showModal());$('close-about').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
$('export-button').addEventListener('click',()=>{const c=training?trainee:activeCheckpoint();const url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`fly-brain-gen-${c.generation}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Brain checkpoint downloaded.');});
window.addEventListener('beforeunload',saveTrainee);
window.addEventListener('resize',()=>{if(ready)updateLedger(training?trainee:activeCheckpoint());});

async function boot(){
  try {
    const load=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`Could not load ${path}`);return r.json();};
    [circuit,graduate,school]=await Promise.all([load('assets/circuit.json'),load('assets/graduate.json'),load('assets/flight-school.json')]);
    if(!validCheckpoint(graduate)||!validCheckpoint(school))throw new Error('The shipped checkpoint is incompatible.');
    prepared=prepareCircuit(circuit);
    try{const saved=JSON.parse(localStorage.getItem(STORE));if(validCheckpoint(saved))trainee=saved;}catch{/* A missing or old local checkpoint does not block the shipped pilot. */}
    worker=new Worker('trainer-worker.js',{type:'module'});
    worker.onmessage=({data})=>{
      if(data.type==='generation'){
        if(!validCheckpoint(data.checkpoint))return;trainee=data.checkpoint;
        if(training){updateLedger(trainee);const r=data.result;$('training-message').textContent=`Batch ${r.generation}: ${r.landings} / ${r.batch} landings. ${r.accepted?'Kept an improved brain.':'Kept the previous brain.'} Next flight uses the latest weights.`;}
        if(trainee.generation%5===0)saveTrainee();
      }else if(data.type==='stopped'){if(validCheckpoint(data.checkpoint)){trainee=data.checkpoint;saveTrainee();}if(!training){updateLedger(activeCheckpoint());updateMessage();}}
      else if(data.type==='error'){stopTraining();notify(`Training stopped: ${data.message}`);}
    };
    worker.onerror=()=>{stopTraining();notify('The training worker stopped. Your last saved brain is still available.');};
    ready=true;$('loading').hidden=true;$('train-button').disabled=false;$('export-button').disabled=false;
    const ev=school.evaluation;if(ev)$('validation-summary').textContent=`Flight-school evaluation: the fresh brain landed ${ev.baseline} of ${ev.episodes} trials; the trained checkpoint landed ${ev.landings}. Evaluation flights use separate initial conditions. Other missions are harder and can fail.`;
    resetFlight();updateMessage();registerTools();
  } catch(error){$('loading-message').textContent=`Flight deck unavailable: ${error.message}. Please reload to retry.`;$('system-status').textContent='Loading failed';$('loading').querySelector('.loader').style.display='none';console.error(error);}
}
function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const state=()=>({ready,scenario:SCENARIOS[scenario].name,pilot:mode,training,paused,generation:(training?trainee:activeCheckpoint())?.generation,trainingAttempts:(training?trainee:activeCheckpoint())?.episodes,observedFlights:observed,landings:landed});
  const tools=[
    {name:'get_flight_program',description:'Read the current mission, pilot, training status and observed landing counts.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>state()},
    {name:'configure_flight',description:'Select a mission and pilot, then start a new simulated flight using the same controls as the flight deck.',inputSchema:{type:'object',properties:{mission:{type:'integer',minimum:0,maximum:2},pilot:{type:'string',enum:['graduate','trainee','rookie','human']}},required:['mission','pilot'],additionalProperties:false},execute:input=>{if(!Number.isInteger(input?.mission)||input.mission<0||input.mission>2||!['graduate','trainee','rookie','human'].includes(input?.pilot))throw new Error('Invalid mission or pilot');setScenario(input.mission);setMode(input.pilot);return state();}},
    {name:'set_fly_training',description:'Start or pause local reward training. Starting uses the selected pilot checkpoint and saves improvements on this device.',inputSchema:{type:'object',properties:{running:{type:'boolean'}},required:['running'],additionalProperties:false},execute:input=>{if(typeof input?.running!=='boolean')throw new Error('running must be boolean');input.running?startTraining():stopTraining();return state();}},
  ];
  for(const tool of tools)try{Promise.resolve(context.registerTool({...tool,annotations:{readOnlyHint:false,...tool.annotations,untrustedContentHint:false}})).catch(()=>{});}catch{/* Optional browser support. */}
}
requestAnimationFrame(frame);boot();
