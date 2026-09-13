import {DT,SCENARIOS,clamp,createFlight,fullSensors,advance,actionTargets} from './engine3d.js?v=5.1';
import {drawChart} from './scene.js';
import {FlightScene3D as FlightScene,Cockpit3D as CockpitView} from './scene3d.js';
import {ConnectomeView} from './connectome-view.js?v=5.1';
import {captureDecision,DecisionView} from './decision.js?v=5.1';
import {validCheckpoint,freshCheckpoint} from './full-controller.js?v=5.1';

const $=id=>document.getElementById(id),STORE='fly-space-program-brain-v4';
let scene,cockpit,decisionView,decisionTrace=null,pendingSample=null,decisionPending=false,stepsRemaining=0,styleEnabled=true;
let atlas,networkWorker,networkReady=false,selectedNeuron=-1,lastAtlasDraw=0;
let graduate,specialist,expert,trainee,worker,flight,training=false,paused=false,speed=1,mode='graduate',scenario=1;
let flightIndex=0,observed=0,landed=0,doneAt=null,lastTime=0,accumulator=0,uiTime=0,ready=false,currentAction=Array(10).fill(0),manualThrottle=.4;
const keys=new Set();let notifyTimer,manualBank=1,manualGaze=0,landingStreak=0;
$('scenario').innerHTML=SCENARIOS.map((s,i)=>`<option value="${i}" ${i===scenario?'selected':''}>${s.name}</option>`).join('');
function notify(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>$('notice').hidden=true,4500);}
function saveTrainee(){if(!trainee)return;try{localStorage.setItem(STORE,JSON.stringify(trainee));$('save-status').textContent='Trainee saved on this device';}catch{$('save-status').textContent='Use Save brain to keep progress';}}
function activeCheckpoint(){const shipped=scenario===7?expert:scenario===6?specialist:graduate;return mode==='rookie'?freshCheckpoint():mode==='trainee'?(trainee??shipped):shipped;}
function updateLedger(c){if(!c)return;$('training-count').textContent=c.episodes.toLocaleString();$('generation').textContent=`GEN ${String(c.generation).padStart(3,'0')}`;drawChart($('learning-chart'),c.history??[]);}
function resetFlight(seed=Math.floor(Math.random()*1e8)) {
  if(!ready)return;
  flight=createFlight(seed,scenario);flight.styleEnabled=styleEnabled;currentAction=[-1,0,0,0,0,0,0,0,-1,0];decisionTrace=null;pendingSample=null;decisionPending=false;stepsRemaining=0;doneAt=null;accumulator=0;flightIndex++;
  networkWorker.postMessage({type:'reset',flightId:flightIndex,weights:activeCheckpoint().weights});
  atlas?.updateActivity(new Float32Array(166700));
  $('result').hidden=true;$('flight-number').textContent=`FLIGHT ${String(flightIndex).padStart(3,'0')}`;
  $('manual-controls').hidden=mode!=='human';
  $('pilot-label').textContent=mode==='human'?'Human / Very confident':mode==='rookie'?'Fly / First day on the job':mode==='trainee'?'Fly / Learning on this device':'Fly / Full-connectome pilot';
  $('scenario-kicker').textContent=SCENARIOS[scenario].name.toUpperCase();$('scenario-description').textContent=SCENARIOS[scenario].subtitle;
  $('flight-instruction').textContent=['Bring it home, little guy.','Catch a moving ship.','Mind the closing speed.','The ocean has opinions.','Trust your instruments.','One fin has other plans.','Pick your engines wisely.','Everything is absolutely nominal.'][scenario];
  if(!training)updateLedger(activeCheckpoint());
  decisionView?.update(null,flight,mode,paused);
}
function setMode(value){if(!['graduate','rookie','trainee','human'].includes(value))throw new Error('Unknown pilot');mode=value;$('pilot').value=value;landingStreak=0;keys.clear();resetFlight();if(!training)updateMessage();}
function setScenario(value){if(!Number.isInteger(value)||value<0||value>=SCENARIOS.length)throw new Error('Unknown mission');scenario=value;$('scenario').value=String(value);observed=0;landed=0;landingStreak=0;updateOutcomes();if(training)stopTraining();resetFlight();updateMessage();}
function updateMessage(){
  if(training)return;
  const c=activeCheckpoint();
  $('learning-status').textContent=mode==='rookie'?'UNTRAINED':mode==='trainee'?'YOUR CHECKPOINT':'CHECKPOINT';$('learning-status').classList.remove('live');
  if(mode==='human')$('training-message').textContent='Your turn. Keep it upright, scrub off speed, and aim between the landing lights.';
  else if(mode==='rookie')$('training-message').textContent='No flight experience. Train this recruit and watch its attempts become a flight record.';
  else if(mode==='trainee'&&!trainee)$('training-message').textContent='No local trainee yet. Train the fly to start from this mission’s checkpoint.';
  else if(c.evaluation)$('training-message').textContent=`Full-network evaluation: ${c.evaluation.landings} / ${c.evaluation.episodes} landings · ${c.evaluation.styles} style bonuses banked. Local training uses complete graph rollouts.`;
  else $('training-message').textContent='An experimental assignment. Train on this mission to adapt the pilot to these conditions.';
  $('system-status').textContent=mode==='human'?'Human has the controls':networkReady?'Whole connectome online':'Loading the complete controller';
}
function startTraining(){
  if(!ready)throw new Error('The full graph is still loading');if(training)return;if($('train-button').disabled)throw new Error('The previous training run is stopping');
  const start=activeCheckpoint();trainee={...start,weights:[...start.weights],history:[...(start.history??[])],scenario};delete trainee.evaluation;
  training=true;mode='trainee';$('pilot').value=mode;
  $('train-button').innerHTML='<span>Ⅱ</span> Pause training';$('train-button').classList.add('training');
  $('learning-status').textContent='LEARNING';$('learning-status').classList.add('live');$('system-status').textContent='Flight school is running';
  $('training-message').textContent='Trying small changes to the brain. Every trial runs the complete graph. Safe landings come first; recovered style earns up to 25 extra points.';
  worker.postMessage({type:'start',checkpoint:trainee,scenario,style:styleEnabled});saveTrainee();resetFlight();
}
function stopTraining(){if(!training)return;training=false;$('train-button').disabled=true;worker.postMessage({type:'stop'});$('train-button').innerHTML='<span>✦</span> Train the fly';$('train-button').classList.remove('training');saveTrainee();updateMessage();}
function setPause(value){paused=Boolean(value);if(paused&&networkReady&&mode!=='human')networkWorker.postMessage({type:'explain',flightId:flightIndex});$('pause-flight').textContent=paused?'▶':'Ⅱ';$('pause-flight').setAttribute('aria-label',paused?'Resume flight':'Pause flight');accumulator=0;if(networkReady)$('network-rate').textContent=paused?'paused':'— Hz';}
function updateOutcomes(){$('flight-outcomes').textContent=observed?`${landed} landed / ${observed} observed`:'Waiting for first touchdown';}
function finishFlight(time){
  if(networkReady)$('network-rate').textContent='hold';observed++;landed+=Number(flight.landed);landingStreak=flight.landed?landingStreak+1:0;updateOutcomes();doneAt=time;$('result').hidden=false;$('result').classList.toggle('success',flight.landed);
  $('result-kicker').textContent=flight.landed?'TOUCHDOWN CONFIRMED':'FAILURE IS FLIGHT DATA';
  $('result-title').textContent=flight.landed?(mode==='human'?'YOU LANDED IT.':'THE FLY LANDED IT.'):(mode==='human'?'TRICKIER THAN IT LOOKS.':'BACK TO FLIGHT SCHOOL.');
  $('result-description').textContent=flight.landed?`${flight.touchdown.speed.toFixed(1)} m/s at contact · ${Math.round(flight.fuel*100)}% fuel · ${flight.styleBonus?'+25 style: turn recovered':'no style bonus'}`:flight.reason+(mode==='human'?' · Try another flight.':' · Next attempt incoming.');
}
function manualAction(){
  if(keys.has('w'))manualThrottle=clamp(manualThrottle+.45*DT,0,1);
  if(keys.has('s'))manualThrottle=clamp(manualThrottle-.45*DT,0,1);
  $('manual-throttle').value=String(Math.round(manualThrottle*100));
  return [manualThrottle*2-1,(keys.has('l')?1:0)-(keys.has('j')?1:0),(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),(keys.has('i')?1:0)-(keys.has('k')?1:0),(keys.has('arrowup')?1:0)-(keys.has('arrowdown')?1:0),(keys.has('e')?1:0)-(keys.has('q')?1:0),(keys.has('c')?1:0)-(keys.has('z')?1:0),(keys.has('o')?1:0)-(keys.has('u')?1:0),manualBank===3?1:-1,manualGaze];
}
function telemetry(){
  const s=flight,alt=Math.max(0,s.y-8),degrees=Math.hypot(s.angle,s.angleZ??0)*180/Math.PI;
  $('altitude').innerHTML=`${alt.toFixed(0)}<small>m</small>`;$('vertical-speed').innerHTML=`${s.vy.toFixed(1)}<small>m/s</small>`;$('attitude').innerHTML=`${degrees.toFixed(1)}<small>°</small>`;$('fuel').innerHTML=`${Math.round(s.fuel*100)}<small>%</small>`;
  $('altitude-meter').style.width=`${clamp(alt/2.4,0,100)}%`;$('speed-meter').style.width=`${clamp(Math.abs(s.vy)*4,0,100)}%`;$('attitude-meter').style.width=`${clamp(Math.abs(degrees)*3,0,100)}%`;$('fuel-meter').style.width=`${s.fuel*100}%`;
  $('attitude-meter').style.background=Math.abs(degrees)>12?'#ff9845':'#c2d0dd';
  $('thrust-output').style.width=`${s.throttle*100}%`;$('thrust-value').textContent=`${Math.round(s.throttle*100)}%`;
  const bipolar=(id,value)=>{const node=$(id);node.style.left=`${value>=0?50:50+value*50}%`;node.style.width=`${Math.abs(value)*50}%`;};
  bipolar('gimbal-output',s.gimbal/.22);bipolar('rcs-output',s.rcs);$('gimbal-value').textContent=`${(s.gimbal*180/Math.PI).toFixed(0)}°`;$('rcs-value').textContent=`${Math.round(s.rcs*100)}%`;
  $('style-status').textContent=s.styleBonus?'+25 STYLE BANKED':s.done?'STYLE +0':!s.styleClean&&s.styleEnabled?'STYLE INELIGIBLE · BRING IT HOME':s.styleRecovered?'TURN RECOVERED · LAND TO BANK':s.styleTurn?'TURN COMPLETE · SETTLE ROTATION':s.styleEnabled?`${Math.min(360,Math.abs(s.heading-s.styleStart)*180/Math.PI).toFixed(0)}° / 360° · BONUS PENDING`:'RECOVERY ONLY';
  updateCrew();
  const minutes=Math.floor(s.t/60),seconds=s.t%60;$('flight-clock').textContent=`${String(minutes).padStart(2,'0')}:${seconds.toFixed(1).padStart(4,'0')}`;
}
function frame(time){
  const elapsed=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;
  if(ready){
    if(!paused){
      if(!flight.done){accumulator=Math.min(.3,accumulator+elapsed*(mode==='human'?1:speed));let count=0;while(accumulator>=DT&&!flight.done&&count++<30){
        if(mode==='human')currentAction=manualAction();
        else if(stepsRemaining===0){requestDecision();break;}
        advance(flight,currentAction);if(mode!=='human')stepsRemaining--;if(flight.step%4===0)flight.trail.push([flight.x,flight.y,flight.z]);accumulator-=DT;
      }if(flight.done)finishFlight(time);}
      else if(mode!=='human'&&time-doneAt>2800){if($('auto-advance').checked&&landingStreak>=3&&scenario<SCENARIOS.length-1){setScenario(scenario+1);notify('Three safe landings. Moving to the next mission.');}else resetFlight();}
    }
    scene.draw(flight,time);cockpit.draw(flight,time,mode);
    if(time-uiTime>90){telemetry();cockpit.drawTrace($('control-trace'));decisionView.update(decisionTrace,flight,mode,paused);uiTime=time;}
  }
  if(atlas&&time-lastAtlasDraw>33){atlas.draw();lastAtlasDraw=time;}
  requestAnimationFrame(frame);
}
document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{if(!scene)return;scene.view=button.dataset.camera;document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('selected',b===button));}));
$('train-button').addEventListener('click',()=>training?stopTraining():startTraining());
$('new-flight').addEventListener('click',()=>resetFlight());$('pause-flight').addEventListener('click',()=>setPause(!paused));
$('scenario').addEventListener('change',e=>setScenario(Number(e.target.value)));
$('pilot').addEventListener('change',e=>setMode(e.target.value));
document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{speed=Number(button.dataset.speed);document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('selected',b===button));}));
$('manual-throttle').addEventListener('input',e=>{manualThrottle=Number(e.target.value)/100;});
document.querySelectorAll('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.key));});
window.addEventListener('keydown',e=>{if(mode!=='human'||['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)||e.target===$('brain-canvas')||$('about').open)return;if(['w','s','a','d','q','e','i','k','j','l','z','c','u','o','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
$('about-button').addEventListener('click',()=>$('about').showModal());$('close-about').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
$('export-button').addEventListener('click',()=>{const c=training?trainee:activeCheckpoint();const url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`fly-brain-gen-${c.generation}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Brain checkpoint downloaded.');});
window.addEventListener('beforeunload',saveTrainee);
window.addEventListener('resize',()=>{if(ready)updateLedger(training?trainee:activeCheckpoint());});

async function boot(){
  try {
    scene=new FlightScene($('flight-canvas'));cockpit=new CockpitView($('cockpit-canvas'));decisionView=new DecisionView($('decision-panel'));
    const load=async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw new Error(`Could not load ${path}`);return r.json();};
    [graduate,specialist,expert]=await Promise.all(['full-pilot','full-specialist','full-expert'].map(name=>load(`assets/${name}.json?v=5.1`)));
    if(![graduate,specialist,expert].every(validCheckpoint))throw new Error('The shipped checkpoint is incompatible.');
    try{const saved=JSON.parse(localStorage.getItem(STORE));if(validCheckpoint(saved))trainee=saved;}catch{/* A missing or old local checkpoint does not block the shipped pilot. */}
    worker=new Worker('trainer-worker.js?v=5.1',{type:'module'});
    worker.onmessage=({data})=>{
      if(data.type==='generation'){
        if(!validCheckpoint(data.checkpoint))return;trainee=data.checkpoint;
        if(training){updateLedger(trainee);const r=data.result;$('training-message').textContent=`Batch ${r.generation}: ${r.landings} / ${r.batch} landings · ${r.styles} recovered turns. ${r.accepted?'Kept an improved brain.':'Kept the previous brain.'} Next flight uses the latest weights.`;}
        if(trainee.generation%5===0)saveTrainee();
      }else if(data.type==='loading'){$('training-message').textContent=`Loading the training graph · ${data.percent}%`; }else if(data.type==='progress'){$('training-message').textContent=`Complete-graph trial · ${data.flightTime.toFixed(1)} simulated seconds · ${data.completed} completed training flights`; }else if(data.type==='stopped'){$('train-button').disabled=false;if(validCheckpoint(data.checkpoint)){trainee=data.checkpoint;saveTrainee();}if(!training){updateLedger(activeCheckpoint());updateMessage();}}
      else if(data.type==='error'){stopTraining();notify(`Training stopped: ${data.message}`);}
    };
    worker.onerror=()=>{stopTraining();$('train-button').disabled=true;notify('The training worker stopped. Your last saved brain is still available.');};
    const report=await load('assets/full-pilot-report.json');
    $('validation-summary').textContent=report.evaluation?`Full-network evaluation: ${report.evaluation.landings}/${report.evaluation.episodes} safe landings, ${report.evaluation.styles} recovered turns banked at landing. Night and engine-fault missions remain unreliable. These are finite simulator tests, not a reliability guarantee. See the full report for every seed and mission.`:'Full-network evaluation pending.';
    bootConnectome();registerTools();
  } catch(error){$('loading-message').textContent=`Flight deck unavailable: ${error.message}. Please reload to retry.`;$('system-status').textContent='Loading failed';$('loading').querySelector('.loader').style.display='none';console.error(error);}
}
function updateCrew(){
  const s=flight,mood=cockpit.expression;$('crew-mood').textContent=mood.toUpperCase();
  $('crew-mood').dataset.mood=mood;
  let phrase=s.done?(s.landed?(landingStreak>=3?'Three in a row. Requesting a raise.':'I meant to do that.'):'I would like to speak to gravity’s manager.'):
    cockpit.boopUntil>performance.now()?'Please do not boop the flight hardware.':mood==='panic'?'Okay. Tiny hands. STEADY HANDS.':
    s.engineFailed?(s.engineHealth===0?'Center engine has left the conversation.':'Center engine is having a personal day.'):s.finFailed?'That fin has chosen independence.':
    s.gaze<-.25?'Checking snacks. Also fuel.':s.gaze>.25?'Counting engines. Still fewer than my eyes.':
    scenario===7?'Mission control said this would build character.':s.y<45?'Nobody breathe on the landing pad.':'Six limbs. Still only two cupholders.';
  $('crew-radio').textContent=phrase;
  $('engine-mode').textContent=s.engineBank===3?'THREE-ENGINE BANK':'CENTER ENGINE';
  document.querySelectorAll('[data-engine]').forEach(e=>{const i=Number(e.dataset.engine),active=s.throttle>.01&&!s.done&&((i===0&&s.engineHealth>.01)||(s.engineBank===3&&(i===1||i===5)));e.classList.toggle('firing',active);e.classList.toggle('failed',i===0&&s.engineFailed);});
  $('fin-status').textContent=s.finFailed?'FIN 01 JAMMED':`${Math.round(s.finX*100)} / ${Math.round(s.finZ*100)}%`;
  $('landing-error').textContent=`${Math.hypot(s.x-s.padX,s.z-s.padZ).toFixed(1)} m`;
  $('gaze-status').textContent=s.gaze<-.25?'FUEL PANEL':s.gaze>.25?'ENGINE PANEL':'FORWARD';
  $('lateral-speed').textContent=`${Math.hypot(s.vx-s.padVx,s.vz-s.padVz).toFixed(1)} m/s`;
}
$('manual-bank').addEventListener('click',()=>{manualBank=manualBank===1?3:1;$('manual-bank').textContent=`${manualBank} engine${manualBank>1?'s':''}`;});
$('manual-gaze').addEventListener('input',e=>manualGaze=Number(e.target.value));
$('fault-engine').addEventListener('click',()=>{if(!ready||flight.done)return;flight.engineFailed=true;flight.engineHealth=.48;notify('Center engine thrust reduced. Auxiliary engines remain available.');});
$('fault-fin').addEventListener('click',()=>{if(!ready||flight.done)return;flight.finFailed=true;notify('Grid fin 01 jammed. The other fins still respond.');});
$('cockpit-view').addEventListener('click',()=>{if(!cockpit)return;cockpit.eyeView=!cockpit.eyeView;$('cockpit-view').textContent=cockpit.eyeView?'See the fly':'Fly’s view';});
$('inspect-decision').addEventListener('click',()=>setPause(!paused));

function showNeuron(neuron){
  selectedNeuron=neuron?.index??-1;$('neuron-inspector').hidden=!neuron;
  if(!neuron)return;
  $('neuron-region').textContent=neuron.region+(neuron.motor?' · MOTOR INTERFACE':'');
  $('neuron-type').textContent=neuron.type||neuron.class||'Unassigned cell type';
  $('neuron-details').textContent=`ID ${neuron.id} · rate ${neuron.activity.toFixed(3)}`;
  $('pulse-neuron').disabled=!networkReady;
}
function requestDecision(){
 if(decisionPending||!networkReady)return;
 const observations=fullSensors(flight);pendingSample=captureDecision(flight,observations);decisionPending=true;
 networkWorker.postMessage({type:'decide',flightId:flightIndex,step:flight.step,observations});
}
function gust(){if(!ready||flight.done){notify('Start a new flight to throw a gust.');return;}if(paused){notify('Resume flight to throw a gust.');return;}flight.gust=(Math.random()<.5?-1:1)*6;flight.gustZ=(Math.random()<.5?-1:1)*4;notify('Sudden crosswind. Let’s see the recovery.');}
function pulse(){if(!networkReady||selectedNeuron<0)return;if(paused||flight.done){notify('Pulse a neuron during a running flight.');return;}networkWorker.postMessage({type:'pulse',index:selectedNeuron});notify(`Excitation injected into neuron ${atlas.ids[selectedNeuron]}.`);}
function bootConnectome(){
  try{atlas=new ConnectomeView($('brain-canvas'),showNeuron);atlas.load((done,total)=>{$('atlas-progress').value=done/total*100;$('atlas-loading-text').textContent=`Loading measured anatomy · ${Math.round(done/total*100)}%`;}).then(()=>{$('atlas-loading').hidden=true;}).catch(error=>{$('atlas-loading-text').textContent=`Anatomy unavailable: ${error.message}`;$('atlas-progress').hidden=true;});}
  catch(error){$('atlas-loading-text').textContent=error.message;$('atlas-progress').hidden=true;}
  networkWorker=new Worker('connectome-worker.js?v=5.1',{type:'module'});
  const fail=message=>{networkReady=false;ready=false;$('loading').hidden=false;$('loading-message').textContent=`Full controller unavailable: ${message}`;$('network-status').textContent='Controller unavailable · flight stopped';$('network-rate').textContent='offline';$('pulse-neuron').disabled=true;console.error(message);};
  networkWorker.onmessage=({data})=>{
    if(data.type==='progress'){$('network-status').textContent=`Connecting all edges · ${Math.round(data.loaded/data.total*100)}%`;$('loading-message').textContent=$('network-status').textContent;}
    else if(data.type==='ready'){
      networkReady=true;ready=true;$('loading').hidden=true;$('train-button').disabled=false;$('export-button').disabled=false;
      $('network-dot').style.background='var(--mint)';$('network-status').textContent='166,700 neurons → 2,129 output cells';
      if(selectedNeuron>=0)$('pulse-neuron').disabled=false;resetFlight();updateMessage();
    }else if(data.type==='decision'&&data.flightId===flightIndex){
      decisionPending=false;currentAction=data.commands;stepsRemaining=3;
      decisionTrace={...pendingSample,commands:data.commands,targets:actionTargets(data.commands),iteration:data.stats.iteration};
      atlas?.updateActivity(data.values);
      $('network-rate').textContent=`${(1000/data.milliseconds).toFixed(1)} decisions/s`;
      $('network-status').textContent=`${data.stats.active.toLocaleString()} cells above 0.01 rate · two full passes / decision`;
    }else if(data.type==='explanation'&&data.flightId===flightIndex&&data.step===decisionTrace?.step){decisionTrace={...decisionTrace,...data};}
    else if(data.type==='error')fail(data.message);
  };
  networkWorker.onerror=event=>fail(event.message);networkWorker.postMessage({type:'start'});
}
function atlasChoice(first,second,chosen){for(const id of [first,second]){$(id).classList.toggle('selected',id===chosen);$(id).setAttribute('aria-pressed',String(id===chosen));}}
$('activity-view').addEventListener('click',()=>{if(atlas)atlas.anatomy=false;atlasChoice('activity-view','anatomy-view','activity-view');});
$('anatomy-view').addEventListener('click',()=>{if(atlas)atlas.anatomy=true;atlasChoice('activity-view','anatomy-view','anatomy-view');});
$('brain-only').addEventListener('click',()=>{if(atlas){atlas.fullCNS=false;atlas.resetView();}atlasChoice('brain-only','full-cns','brain-only');});
$('full-cns').addEventListener('click',()=>{if(atlas){atlas.fullCNS=true;atlas.resetView();}atlasChoice('brain-only','full-cns','full-cns');});
$('motor-spotlight').addEventListener('click',()=>{if(!atlas)return;atlas.motorOnly=!atlas.motorOnly;atlas.select(-1);$('motor-spotlight').setAttribute('aria-pressed',String(atlas.motorOnly));});
$('reset-brain').addEventListener('click',()=>atlas?.resetView());
function expandAtlas(value){$('atlas-panel').classList.toggle('expanded',value);document.body.classList.toggle('atlas-open',value);$('expand-brain').setAttribute('aria-pressed',String(value));$('expand-brain').setAttribute('aria-label',value?'Collapse brain explorer':'Expand brain explorer');}
$('expand-brain').addEventListener('click',()=>expandAtlas(!$('atlas-panel').classList.contains('expanded')));
window.addEventListener('keydown',event=>{if(event.key==='Escape')expandAtlas(false);});
$('clear-neuron').addEventListener('click',()=>atlas?.select(-1));$('pulse-neuron').addEventListener('click',pulse);$('gust-button').addEventListener('click',gust);

function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const state=()=>({controller:'malecns-full-rate-v1',readoutNeurons:2129,trainableWeights:21300,styleEnabled,style:flight?{turn:flight.styleTurn,recovered:flight.styleRecovered,bonus:flight.styleBonus,degrees:(flight.heading-flight.styleStart)*180/Math.PI}:null,flight:flight?{time:flight.t,seed:flight.seed,done:flight.done,landed:flight.landed,reward:flight.reward,reason:flight.reason}:null,ready,scenario:SCENARIOS[scenario].name,pilot:mode,training,paused,initialization:activeCheckpoint()?.initialization,generation:(training?trainee:activeCheckpoint())?.generation,trainingAttempts:(training?trainee:activeCheckpoint())?.episodes,observedFlights:observed,landings:landed,wholeConnectomeReady:networkReady,neurons:166700,edges:25582938});
  const tools=[
    {name:'get_control_decision',description:'Read the exact latest motor-controller input sample, commands, and isolated replays shown in the decision inspector. No control changes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({pilot:mode,paused,decision:mode==='human'?null:decisionTrace})},
    {name:'get_flight_program',description:'Read the current mission, pilot, training status and observed landing counts.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>state()},
    {name:'configure_flight',description:'Select a mission and pilot, then start a new simulated flight using the same controls as the flight deck.',inputSchema:{type:'object',properties:{mission:{type:'integer',minimum:0,maximum:SCENARIOS.length-1},pilot:{type:'string',enum:['graduate','trainee','rookie','human']}},required:['mission','pilot'],additionalProperties:false},execute:input=>{if(!Number.isInteger(input?.mission)||input.mission<0||input.mission>=SCENARIOS.length||!['graduate','trainee','rookie','human'].includes(input?.pilot))throw new Error('Invalid mission or pilot');setScenario(input.mission);setMode(input.pilot);return state();}},
    {name:'set_fly_training',description:'Start or pause local reward training. Starting uses the selected pilot checkpoint and saves improvements on this device.',inputSchema:{type:'object',properties:{running:{type:'boolean'}},required:['running'],additionalProperties:false},execute:input=>{if(typeof input?.running!=='boolean')throw new Error('running must be boolean');input.running?startTraining():stopTraining();return state();}},
    {name:'throw_crosswind',description:'Apply a sudden lateral gust during the running simulated rocket flight.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{gust();return state();}},
  ];
  for(const tool of tools)try{Promise.resolve(context.registerTool({...tool,annotations:{readOnlyHint:false,...tool.annotations,untrustedContentHint:false}})).catch(()=>{});}catch{/* Optional browser support. */}
}
requestAnimationFrame(frame);boot();

$('style-flight').addEventListener('change',event=>{styleEnabled=event.target.checked;if(training)stopTraining();resetFlight();});
