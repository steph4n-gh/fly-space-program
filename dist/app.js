import {sampleEmbodied,paintImage} from './perception.js?v=9.3';
import {EMBODIED_CONTROLLER,EMBODIED_SCHEMA,EMBODIED_INPUTS} from './sensory-inputs.js?v=9.3';
import {DT,physicsStep,decisionSteps,SCENARIOS,clamp,createFlight,fullSensors,advance,actionTargets} from './engine3d.js?v=9.3';
import {ORBIT_PHASES,orbitalElements} from './orbital.js?v=9.3';
import {missionFamily,missionOptions,familyProfiles} from './missions.js?v=9.3';
import {drawChart} from './scene.js?v=9.3';
import {FlightScene3D as FlightScene,Cockpit3D as CockpitView} from './scene3d.js?v=9.3';
import {ConnectomeView} from './connectome-view.js?v=9.3';
import {captureDecision,DecisionView} from './decision.js?v=9.3';
import {WiringView} from './wiring-view.js?v=9.3';
import {CONTROL_LIMBS} from './kinematics.js?v=9.3';
import {FlightPresentation} from './presentation.js?v=9.3';
import {CONTROLS} from './decision.js?v=9.3';
import {validCheckpoint,freshCheckpoint,freshEmbodied,isEmbodied,CONTROLLER_ID} from './full-controller.js?v=9.3';

import {SENSOR_SCHEMA} from './signals.js?v=9.3';

const $=id=>document.getElementById(id),STORE='fly-space-program-brains-v6';
const presentation=new FlightPresentation();let wiringView,traceControl=0,profileGroup='All',renderFPS=0,frameCount=0,fpsStart=0,decisionMs=70;
let workspaceView='mission',quality='high',activationGain=1;
let scene,cockpit,decisionView,decisionTrace=null,pendingSample=null,decisionPending=false,styleEnabled=true;
let atlas,networkWorker,networkReady=false,selectedNeuron=-1;
const trainees={};let evaluationReport,embodiedReport,embodiedStarter=freshEmbodied();
let graduate,specialist,expert,orbitalPilot,trainee,worker,flight,training=false,paused=false,speed=1,mode='embodied',scenario=0;
let flightIndex=0,observed=0,landed=0,doneAt=null,lastTime=0,accumulator=0,uiTime=0,ready=false,currentAction=Array(10).fill(0),manualThrottle=.4;
const visible=new Set();const visibility=new IntersectionObserver(entries=>{for(const e of entries)e.isIntersecting?visible.add(e.target.id):visible.delete(e.target.id);},{rootMargin:'80px'});for(const id of ['flight-canvas','cockpit-canvas','brain-canvas'])visibility.observe($(id));
const keys=new Set();let notifyTimer,manualBank=1,manualGaze=0,landingStreak=0;
$('scenario').innerHTML=missionOptions();$('scenario').value=String(scenario);
function setWorkspaceView(view){
 if(!['mission','cockpit','lab'].includes(view))return;workspaceView=view;document.body.dataset.view=view;
 $('view-title').innerHTML=({mission:'Mission control',cockpit:'The crew pod',lab:'Flight lab'}[view])+'<span>.</span>';
 $('lab-workspace').hidden=view!=='lab';$('cockpit-detail').hidden=view!=='cockpit';
 for(const button of document.querySelectorAll('[data-view]')){if(button===document.body)continue;const on=button.dataset.view===view;button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));}
 if(cockpit)cockpit.expanded=view==='cockpit';if(atlas)atlas.dirty=true;
}
for(const button of document.querySelectorAll('button[data-view]'))button.addEventListener('click',()=>{setWorkspaceView(button.dataset.view);window.scrollTo({top:0,behavior:'smooth'});});
document.querySelector('.decision-jump').addEventListener('click',()=>setWorkspaceView('lab'));
$('quality-button').addEventListener('click',()=>{quality=quality==='high'?'balanced':quality==='balanced'?'low':'high';scene?.setQuality?.(quality);cockpit?.setQuality?.(quality);const name=quality[0].toUpperCase()+quality.slice(1);$('quality-button').textContent='Quality · '+name;$('quality-button').setAttribute('aria-label','Graphics quality: '+quality);});
function notify(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>$('notice').hidden=true,4500);}
function saveTrainee(){if(trainee)trainees[isEmbodied(trainee)?'embodied':missionFamily(trainee.scenario??1)]=trainee;try{localStorage.setItem(STORE,JSON.stringify(trainees));$('save-status').textContent='Trainee saved on this device';}catch{$('save-status').textContent='Use Save brain to keep progress';}}
function activeCheckpoint(){const family=missionFamily(scenario),shipped=family==='orbital'?orbitalPilot:family==='out'?expert:family==='degraded'?specialist:graduate;return mode==='graduate'?shipped:mode==='rookie'?freshEmbodied():mode==='trainee'?(trainees.embodied??embodiedStarter):embodiedStarter;}
function updateLedger(c){if(!c)return;$('training-count').textContent=c.episodes.toLocaleString();$('generation').textContent=`GEN ${String(c.generation).padStart(3,'0')}`;drawChart($('learning-chart'),c.history??[]);}
function resetFlight(seed=Math.floor(Math.random()*1e8)) {
  if(!ready)return;
  flight=createFlight(seed,scenario,$('varied-flight').checked?.4:0);flight.styleEnabled=styleEnabled;flight.activationGain=activationGain;flight.autoOdor=$('auto-odor').checked;flight.eyesCovered=$('cover-eyes').checked;flight.instrumentLights=$('instrument-lights').checked;currentAction=[-1,0,0,0,0,0,0,0,-1,0];decisionTrace=null;pendingSample=null;decisionPending=false;doneAt=null;accumulator=0;flightIndex++;presentation.reset(flight);
  networkWorker.postMessage({type:'reset',flightId:flightIndex,activationGain,inputMode:isEmbodied(activeCheckpoint())?'embodied':'telemetry',weights:activeCheckpoint().weights});
  atlas?.updateActivity(new Float32Array(166700));
  $('result').hidden=true;$('flight-number').textContent=`FLIGHT ${String(flightIndex).padStart(3,'0')}`;
  $('manual-controls').hidden=mode!=='human';$('orbital-panel').hidden=!flight.orbital;$('auto-pace-control').hidden=!flight.orbital;
  for(const id of ['release-acetate','release-geosmin'])$(id).disabled=!isEmbodied(activeCheckpoint());
  $('pilot-label').textContent=mode==='human'?'Human / Very confident':mode==='rookie'?'Fly / First day on the job':mode==='trainee'?'Fly / Learning on this device':mode==='graduate'?'Reference / Instrument-trained pilot':'Fly / Eyes, body and antennae';
  $('scenario-kicker').textContent=SCENARIOS[scenario].name.toUpperCase();$('scenario-description').textContent=SCENARIOS[scenario].subtitle;
  $('flight-instruction').textContent=['Bring it home, little guy.','Catch a moving ship.','Mind the closing speed.','The ocean has opinions.','Trust your instruments.','One fin has other plans.','Pick your engines wisely.','Everything is absolutely nominal.'][scenario]??SCENARIOS[scenario].title;
  if(!training)updateLedger(activeCheckpoint());
  decisionView?.update(null,flight,mode,paused);renderProfiles();
}
function updateOrbitalStatus(){
 const s=flight;if(!s.orbital)return;$('flight-instruction').textContent=ORBIT_PHASES[s.orbitPhase];$('scenario-description').textContent=s.orbitPhase===2?(s.orbitComplete?'One revolution complete · lining up the return burn':`${(s.orbitTravel/(Math.PI*2)*100).toFixed(0)}% of a complete revolution · coast and hold orbit`):s.orbitPhase===5?'Match the moving deck · settle rotation · land safely':'Full neural control · scaled orbital world';const elements=orbitalElements(s);$('orbit-phase').textContent=ORBIT_PHASES[s.orbitPhase];$('orbit-count').textContent=`${Math.min(1,s.orbitTravel/(Math.PI*2)).toFixed(2)} / 1 required`;$('orbit-apsides').textContent=`${Math.max(-6000,elements.periapsis).toFixed(0)} / ${Number.isFinite(elements.apoapsis)?elements.apoapsis.toFixed(0):'escape'} m`;$('orbit-speed').textContent=`${Math.hypot(s.vx,s.vy).toFixed(1)} m/s`;
 const steps=['Launch','Space','Stable orbit','One full orbit','Deorbit','Atmospheric entry','Barge touchdown'];for(const [i,node] of Array.from($('orbit-milestones').children).entries()){const reached=s.milestones.find(m=>m.name===steps[i]);node.classList.toggle('complete',!!reached);node.querySelector('small').textContent=reached?`${reached.time.toFixed(1)} s`:'Pending';} }
function setMode(value){if(!['embodied','graduate','rookie','trainee','human'].includes(value))throw new Error('Unknown pilot');if(training)stopTraining();mode=value;$('pilot').value=value;activationGain=activeCheckpoint()?.activationGain??1;$('neural-arousal').value=String(activationGain);updateArousalLabel();landingStreak=0;keys.clear();resetFlight();if(!training)updateMessage();}
function setScenario(value){if(!Number.isInteger(value)||value<0||value>=SCENARIOS.length)throw new Error('Unknown mission');scenario=value;$('scenario').value=String(value);observed=0;landed=0;landingStreak=0;updateOutcomes();if(training)stopTraining();activationGain=activeCheckpoint()?.activationGain??1;$('neural-arousal').value=String(activationGain);updateArousalLabel();resetFlight();updateMessage();}
function updateMessage(){
  if(training)return;
  const c=activeCheckpoint();
  $('learning-status').textContent=mode==='rookie'?'UNTRAINED':mode==='trainee'?'YOUR CHECKPOINT':'CHECKPOINT';$('learning-status').classList.remove('live');
  if(mode==='human')$('training-message').textContent='Your turn. Keep it upright, scrub off speed, and aim between the landing lights.';
  else if(mode==='rookie')$('training-message').textContent='No flight experience. Train this recruit and watch its attempts become a flight record.';
  else if(mode==='embodied'&&embodiedReport)$('training-message').textContent=scenario===0?`Learned vertical descent: ${embodiedReport.evaluation.landings} / ${embodiedReport.evaluation.episodes} safe landings on unseen starts. Visible instrument light and body feedback drive throttle; attitude controls remain neutral.`:'This checkpoint was trained on Landing school. Steering, moving decks, faults and orbital flight remain untrained.';
  else if(mode==='embodied')$('training-message').textContent='Learning from light, body feedback and odor. Start with the visual lesson, then try flight reward training.';
  else if(mode==='graduate'&&c.evaluation)$('training-message').textContent=`Historical V8 instrument-pilot evaluation at ${(c.activationGain??1).toFixed(2)}× gain: ${c.evaluation.landings} / ${c.evaluation.episodes} landings · ${c.evaluation.styles} style bonuses banked. Local training uses complete graph rollouts.`;
  else $('training-message').textContent='An experimental assignment. Train on this mission to adapt the pilot to these conditions.';
  $('system-status').textContent=mode==='human'?'Human has the controls':networkReady?'Whole connectome online'+(activationGain===1?'':` · gain ${activationGain.toFixed(2)}×`):'Loading the complete controller';
}
function startTraining(){
  if(!ready)throw new Error('The full graph is still loading');if(training)return;if($('train-button').disabled)throw new Error('The previous training run is stopping');
  const start=isEmbodied(activeCheckpoint())?activeCheckpoint():(trainees.embodied??embodiedStarter);trainee={...start,weights:[...start.weights],history:[...(start.history??[])],scenario,activationGain,autoOdor:$('auto-odor').checked,eyesCovered:$('cover-eyes').checked,instrumentLights:$('instrument-lights').checked};delete trainee.evaluation;
  training=true;mode='trainee';$('pilot').value=mode;
  $('train-button').innerHTML='<span>Ⅱ</span> Pause training';$('train-button').classList.add('training');
  $('learning-status').textContent='LEARNING';$('learning-status').classList.add('live');$('system-status').textContent='Flight school is running';
  $('training-message').textContent=$('training-course').value==='vision'?'Learning gaze responses from presented light patterns. Flight navigation is a separate training task.':'Trying small changes to the brain. Every trial runs the complete graph. Safe landings come first; recovered style earns up to 25 extra points.';
  worker.postMessage({type:'start',checkpoint:trainee,scenario,style:styleEnabled,variability:$('varied-training').checked?.4:0,lesson:$('training-course').value==='vision',profiles:$('training-course').value==='family'?familyProfiles(missionFamily(scenario)):[scenario]});saveTrainee();resetFlight();
}
function stopTraining(){if(!training)return;training=false;$('train-button').disabled=true;worker.postMessage({type:'stop'});$('train-button').innerHTML='<span>✦</span> Train the fly';$('train-button').classList.remove('training');saveTrainee();updateMessage();}
function setPause(value){paused=Boolean(value);if(paused&&flight){presentation.time=flight.t;presentation.sample(0,1,true);}if(paused&&networkReady&&mode!=='human')networkWorker.postMessage({type:'explain',flightId:flightIndex});$('pause-flight').textContent=paused?'▶':'Ⅱ';$('pause-flight').setAttribute('aria-label',paused?'Resume flight':'Pause flight');accumulator=0;if(networkReady)$('network-rate').textContent=paused?'paused':'— Hz';}
function updateOutcomes(){$('flight-outcomes').textContent=observed?`${landed} landed / ${observed} observed`:'Waiting for first touchdown';}
function finishFlight(time){
  if(networkReady)$('network-rate').textContent='hold';observed++;landed+=Number(flight.landed);landingStreak=flight.landed?landingStreak+1:0;updateOutcomes();doneAt=time;$('result').hidden=false;$('result').classList.toggle('success',flight.landed);
  $('result-kicker').textContent=flight.landed?(flight.orbital?'ROUND TRIP COMPLETE':'TOUCHDOWN CONFIRMED'):'FAILURE IS FLIGHT DATA';
  $('result-title').textContent=flight.landed?(mode==='human'?'YOU LANDED IT.':'THE FLY LANDED IT.'):(mode==='human'?'TRICKIER THAN IT LOOKS.':'BACK TO FLIGHT SCHOOL.');
  $('result-description').textContent=flight.landed?`${flight.orbital?'Launched · orbited · deorbited · ':''}${flight.touchdown.speed.toFixed(1)} m/s at contact · ${Math.round(flight.fuel*100)}% fuel · ${flight.styleBonus?'+25 style: turn recovered':'no style bonus'}`:flight.reason+(mode==='human'?' · Try another flight.':' · Next attempt incoming.');
}
function manualAction(){
  if(keys.has('w'))manualThrottle=clamp(manualThrottle+.45*physicsStep(flight),0,1);
  if(keys.has('s'))manualThrottle=clamp(manualThrottle-.45*physicsStep(flight),0,1);
  $('manual-throttle').value=String(Math.round(manualThrottle*100));
  return [manualThrottle*2-1,(keys.has('l')?1:0)-(keys.has('j')?1:0),(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),(keys.has('i')?1:0)-(keys.has('k')?1:0),(keys.has('arrowup')?1:0)-(keys.has('arrowdown')?1:0),(keys.has('e')?1:0)-(keys.has('q')?1:0),(keys.has('c')?1:0)-(keys.has('z')?1:0),(keys.has('o')?1:0)-(keys.has('u')?1:0),manualBank===3?1:-1,manualGaze];
}
function telemetry(){
  const s=flight,alt=Math.max(0,s.y-8),degrees=Math.hypot(s.orbital?Math.atan2(Math.sin(s.angle),Math.cos(s.angle)):s.angle,s.angleZ??0)*180/Math.PI;
  $('altitude').innerHTML=`${alt.toFixed(0)}<small>m</small>`;$('vertical-speed').innerHTML=`${s.vy.toFixed(1)}<small>m/s</small>`;$('attitude').innerHTML=`${degrees.toFixed(1)}<small>°</small>`;$('fuel').innerHTML=`${Math.round(s.fuel*100)}<small>%</small>`;
  $('altitude-meter').style.width=`${clamp(alt/2.4,0,100)}%`;$('speed-meter').style.width=`${clamp(Math.abs(s.vy)*4,0,100)}%`;$('attitude-meter').style.width=`${clamp(Math.abs(degrees)*3,0,100)}%`;$('fuel-meter').style.width=`${s.fuel*100}%`;
  $('attitude-meter').style.background=Math.abs(degrees)>12?'#ff9845':'#c2d0dd';
  $('thrust-output').style.width=`${s.throttle*100}%`;$('thrust-value').textContent=`${Math.round(s.throttle*100)}%`;
  const bipolar=(id,value)=>{const node=$(id);node.style.left=`${value>=0?50:50+value*50}%`;node.style.width=`${Math.abs(value)*50}%`;};
  bipolar('gimbal-output',s.gimbal/.22);bipolar('rcs-output',s.rcs);$('gimbal-value').textContent=`${(s.gimbal*180/Math.PI).toFixed(0)}°`;$('rcs-value').textContent=`${Math.round(s.rcs*100)}%`;
  $('style-status').textContent=s.styleBonus?'+25 STYLE BANKED':s.done?'STYLE +0':s.orbital&&s.orbitPhase<5?'ORBIT FIRST · FLAIR ON FINAL APPROACH':!s.styleClean&&s.styleEnabled?'STYLE INELIGIBLE · BRING IT HOME':s.styleRecovered?'TURN RECOVERED · LAND TO BANK':s.styleTurn?'TURN COMPLETE · SETTLE ROTATION':s.styleEnabled?`${Math.min(360,Math.abs(s.heading-s.styleStart)*180/Math.PI).toFixed(0)}° / 360° · BONUS PENDING`:'RECOVERY ONLY';
  updateCrew();updateOrbitalStatus();updateSensoryPanel();
  const minutes=Math.floor(s.t/60),seconds=s.t%60;$('flight-clock').textContent=`${String(minutes).padStart(2,'0')}:${seconds.toFixed(1).padStart(4,'0')}`;
}
function frame(time){
 const elapsed=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;frameCount++;
 if(time-fpsStart>900){renderFPS=frameCount*1000/(time-fpsStart);frameCount=0;fpsStart=time;}
 if(ready){
  const autoPace=flight.orbital&&$('auto-pace').checked?(flight.orbitPhase===2?4:flight.y>258?2:1):1,requestedSpeed=speed*autoPace;
  const playback=mode==='human'?requestedSpeed:Math.min(requestedSpeed,physicsStep(flight)*decisionSteps(flight)/(decisionMs/1000)*.8);
  if(!paused){
   if(!flight.done){
    if(mode==='human'){accumulator+=elapsed*playback;while(accumulator>=physicsStep(flight)&&!flight.done){const dt=physicsStep(flight);advance(flight,manualAction());presentation.push(flight);accumulator-=dt;}}
    else if(!decisionPending&&presentation.ahead<Math.max(.30,physicsStep(flight)*decisionSteps(flight)*2))requestDecision();
   }else if(doneAt!==null&&time-doneAt>2800&&mode!=='human'){
    if($('auto-advance').checked&&landingStreak>=3&&scenario<SCENARIOS.length-1){setScenario(scenario+1);notify('Three safe landings. Moving to the next mission.');}else resetFlight();
   }
  }
  const display=presentation.sample(elapsed,playback,paused);
  if(flight.done&&display.done&&doneAt===null)finishFlight(time);
  if(visible.has('flight-canvas'))scene.draw(display,time);if(visible.has('cockpit-canvas'))cockpit.draw(display,time,mode);
  if(time-uiTime>100){
   telemetry();cockpit.drawTrace($('control-trace'));decisionView.update(decisionTrace,flight,mode,paused);wiringView.update(decisionTrace,flight,atlas,mode);
   $('render-rate').textContent=`${Math.round(renderFPS)} FPS · ${playback.toFixed(1)}× SIM`;
   $('pause-wiring').textContent=paused?'Resume flight':'Pause & follow';uiTime=time;
  }
 }
 if(atlas&&visible.has('brain-canvas'))atlas.draw();
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
for(const id of ['about-button','about-footer'])$(id).addEventListener('click',()=>$('about').showModal());$('close-about').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
$('export-button').addEventListener('click',()=>{const c=training?trainee:activeCheckpoint();const url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`fly-brain-gen-${c.generation}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Brain checkpoint downloaded.');});
window.addEventListener('beforeunload',saveTrainee);
window.addEventListener('resize',()=>{if(ready)updateLedger(training?trainee:activeCheckpoint());});

async function boot(){
  try {
    scene=new FlightScene($('flight-canvas'));cockpit=new CockpitView($('cockpit-canvas'));decisionView=new DecisionView($('decision-panel'));wiringView=new WiringView($('wiring-panel'),id=>{if(!atlas?.centroids)return;if(atlas.centroids[id*3+2]>atlas.meta.brainClipZ){atlas.fullCNS=true;atlasChoice('brain-only','full-cns','full-cns');}setWorkspaceView('lab');atlas.select(id);$('atlas-panel').scrollIntoView({behavior:'smooth',block:'center'});});setTraceControl(0);
    const load=async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw new Error(`Could not load ${path}`);return r.json();};
    embodiedStarter=await load('assets/embodied-starter.json').catch(()=>freshEmbodied());if(!validCheckpoint(embodiedStarter)||!isEmbodied(embodiedStarter))throw Error('Invalid embodied starter');
    [graduate,specialist,expert,orbitalPilot]=await Promise.all(['full-pilot','full-specialist','full-expert','full-orbital'].map(name=>load(`assets/${name}.json?v=9.3`)));
    if(![graduate,specialist,expert,orbitalPilot].every(validCheckpoint))throw new Error('The shipped checkpoint is incompatible.');
    try{const saved=JSON.parse(localStorage.getItem(STORE));for(const family of ['embodied','center','degraded','out','orbital'])if(validCheckpoint(saved?.[family]))trainees[family]=saved[family];const legacy=JSON.parse(localStorage.getItem('fly-space-program-brain-v4'));if(validCheckpoint(legacy)){const family=missionFamily(legacy.scenario??1);if(!trainees[family])trainees[family]=legacy;}}catch{/* A missing or old local checkpoint does not block the shipped pilot. */}
    worker=new Worker('trainer-worker.js?v=9.3',{type:'module'});
    worker.onmessage=({data})=>{
      if(data.type==='generation'){
        if(!validCheckpoint(data.checkpoint))return;trainee=data.checkpoint;
        if(training){updateLedger(trainee);const r=data.result;$('training-message').textContent=`Batch ${r.generation}: ${r.lesson?'visual orientation loss '+r.loss.toFixed(4):r.landings+' / '+r.batch+' landings · '+r.styles+' recovered turns'}. ${r.accepted?'Kept an improved brain.':'Kept the previous brain.'} Next flight uses the latest weights.`;}
        saveTrainee();
      }else if(data.type==='loading'){$('training-message').textContent=`Loading the training graph · ${data.percent}%`; }else if(data.type==='progress'){$('training-message').textContent=data.lesson?`Visual lesson · ${data.completed} stimulus presentations processed · full graph propagation`:`Complete-graph trial · ${SCENARIOS[data.scenario]?.title??'Flight'} · ${data.flightTime.toFixed(1)} s · ${data.completed} completed training flights`; }else if(data.type==='stopped'){$('train-button').disabled=false;if(validCheckpoint(data.checkpoint)){trainee=data.checkpoint;saveTrainee();}if(!training){updateLedger(activeCheckpoint());updateMessage();}}
      else if(data.type==='error'){stopTraining();notify(`Training stopped: ${data.message}`);}
    };
    worker.onerror=()=>{stopTraining();$('train-button').disabled=true;notify('The training worker stopped. Your last saved brain is still available.');};
    const [visualReport,landingReport]=await Promise.all([load('assets/perception-report.json').catch(()=>null),load('assets/landing-report.json').catch(()=>null)]);
    const embodiedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Float64Array.from(embodiedStarter.weights).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
    embodiedReport=landingReport?.weightSHA256===embodiedHash&&landingReport.controller===EMBODIED_CONTROLLER&&landingReport.sensorSchema===EMBODIED_SCHEMA?landingReport:null;
    if(embodiedReport){$('visual-evidence').textContent=`Unseen Landing school starts: ${embodiedReport.evaluation.landings} / ${embodiedReport.evaluation.episodes} safe landings. Eyes covered: ${embodiedReport.controls.covered.landings} / ${embodiedReport.controls.covered.episodes}. Full graph, unchanged landing limits, automatic odors off.`;$('training-course').value='single';$('auto-odor').checked=embodiedStarter.autoOdor!==false;$('instrument-lights').checked=embodiedStarter.instrumentLights!==false;$('style-flight').checked=styleEnabled=false;$('auto-advance').checked=false;}
    else if(visualReport)$('visual-evidence').textContent=embodiedHash===visualReport.weightSHA256?`Starter visual lesson: ${(100*(1-visualReport.afterMSE/visualReport.beforeMSE)).toFixed(0)}% lower gaze error on ${visualReport.testSamples} held-out light patterns. Eye-covered error: ${visualReport.coveredEyeMSE.toFixed(3)} versus ${visualReport.afterMSE.toFixed(3)} with vision. This is not a landing benchmark.`:'No matching visual evaluation is available.';
    const savedReport=await load('assets/full-pilot-report.json').catch(()=>null);
    const hashes=await Promise.all([graduate,specialist,expert,orbitalPilot].map(async c=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Float64Array.from(c.weights).buffer)),b=>b.toString(16).padStart(2,'0')).join('')));
    const names=['full-pilot','full-specialist','full-expert','full-orbital'],shipped=[graduate,specialist,expert,orbitalPilot];
    const report=savedReport?.controller===CONTROLLER_ID&&savedReport.sensorSchema===SENSOR_SCHEMA&&names.every((name,i)=>savedReport.checkpoints?.find(c=>c.name===name)?.weightSHA256===hashes[i]&&(savedReport.checkpoints.find(c=>c.name===name).activationGain??1)===(shipped[i].activationGain??1))?savedReport:null;
    evaluationReport=report;renderProfiles();renderArousalEvidence();
    if(embodiedReport){const e=embodiedReport.evaluation;$('evaluation-score').textContent=`${e.landings} / ${e.episodes}`;$('evaluation-note').textContent='Safe landings on unseen Landing school starts. This checkpoint learns throttle for a stationary deck with a level entry. Harder missions remain untrained.';$('validation-summary').textContent=`The shipped perceiving checkpoint landed ${e.landings} of ${e.episodes} unseen Landing school flights, versus ${embodiedReport.controls.covered.landings} with its eyes covered. This is a simulated decoder-learning result; it does not validate a living-fly or chemical interface.`;}
    else if(report?.evaluation){$('evaluation-score').textContent='Learning';$('evaluation-note').textContent='The embodied fly has no established landing reliability. The linked V8 report is historical evidence for the instrument-trained reference only; it predates the orbital timing fix.';$('validation-summary').textContent='The embodied fly is an early perception experiment. Historical V8 results apply to the earlier instrument-trained pilot, not this controller. Visual training results and receptor routing are reported separately.';}
    else {$('evaluation-score').textContent='Pending';$('evaluation-note').textContent='An evaluation matching these pilot weights is not available yet.';$('validation-summary').textContent='A matching full-network evaluation is pending.';}
    updateArousalLabel();bootConnectome();registerTools();
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
 const packet=isEmbodied(activeCheckpoint())?sampleEmbodied(flight):null,observations=packet?.observations??fullSensors(flight);pendingSample=captureDecision(flight,observations,packet);decisionPending=true;
 networkWorker.postMessage({type:'decide',flightId:flightIndex,step:flight.step,observations});
}
function gust(){if(!ready||flight.done){notify('Start a new flight to throw a gust.');return;}if(paused){notify('Resume flight to throw a gust.');return;}flight.gust=(Math.random()<.5?-1:1)*6;flight.gustZ=(Math.random()<.5?-1:1)*4;notify('Sudden crosswind. Let’s see the recovery.');}
function pulse(){if(!networkReady||selectedNeuron<0)return;if(paused||flight.done){notify('Pulse a neuron during a running flight.');return;}networkWorker.postMessage({type:'pulse',index:selectedNeuron});notify(`Excitation injected into neuron ${atlas.ids[selectedNeuron]}.`);}
function bootConnectome(){
  try{atlas=new ConnectomeView($('brain-canvas'),showNeuron);atlas.load((done,total)=>{$('atlas-progress').value=done/total*100;$('atlas-loading-text').textContent=`Loading measured anatomy · ${Math.round(done/total*100)}%`;}).then(()=>{$('atlas-loading').hidden=true;}).catch(error=>{$('atlas-loading-text').textContent=`Anatomy unavailable: ${error.message}`;$('atlas-progress').hidden=true;});}
  catch(error){$('atlas-loading-text').textContent=error.message;$('atlas-progress').hidden=true;}
  networkWorker=new Worker('connectome-worker.js?v=9.3',{type:'module'});
  const fail=message=>{networkReady=false;ready=false;$('loading').hidden=false;$('loading-message').textContent=`Full controller unavailable: ${message}`;$('network-status').textContent='Controller unavailable · flight stopped';$('network-rate').textContent='offline';$('pulse-neuron').disabled=true;console.error(message);};
  networkWorker.onmessage=({data})=>{
    if(data.type==='progress'){$('network-status').textContent=`Connecting all edges · ${Math.round(data.loaded/data.total*100)}%`;$('loading-message').textContent=$('network-status').textContent;}
    else if(data.type==='ready'){
      networkReady=true;ready=true;$('loading').hidden=true;$('train-button').disabled=false;$('export-button').disabled=false;
      $('network-dot').style.background='var(--mint)';$('network-status').textContent='166,700 neurons → 2,129 output cells';
      if(selectedNeuron>=0)$('pulse-neuron').disabled=false;resetFlight();updateMessage();
    }else if(data.type==='decision'&&data.flightId===flightIndex){
      decisionPending=false;currentAction=data.commands;decisionMs=decisionMs*.85+data.milliseconds*.15;
      decisionTrace={...pendingSample,commands:data.commands,targets:actionTargets(data.commands),iteration:data.stats.iteration,motorTrace:data.motorTrace};
      if(!flight.done){for(let j=0,steps=decisionSteps(flight);j<steps&&!flight.done;j++){advance(flight,currentAction);if(flight.step%4===0)flight.trail.push([flight.x,flight.y,flight.z]);presentation.push(flight);}}
      if(paused){presentation.time=flight.t;presentation.sample(0,1,true);}
      atlas?.updateActivity(data.values);atlas?.setTraceEdges?.(data.motorTrace.neurons.flatMap(n=>n.edges));
      $('network-rate').textContent=`${(1000/data.milliseconds).toFixed(1)} decisions/s`;
      $('network-status').textContent=`${data.stats.active.toLocaleString()} cells above 0.01 rate · two full passes / decision`;
    }else if(data.type==='motor-trace'&&data.flightId===flightIndex&&data.step===decisionTrace?.step){decisionTrace={...decisionTrace,motorTrace:data.motorTrace};atlas?.setTraceEdges?.(data.motorTrace.neurons.flatMap(n=>n.edges));
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
  const state=()=>({controller:activeCheckpoint()?.circuit,activationGain,trainedActivationGain:activeCheckpoint()?.activationGain??1,sensorInputs:activeCheckpoint()?.inputs,sensorSchema:activeCheckpoint()?.sensorSchema,perception:flight?.perception?{time:flight.perception.time,covered:flight.perception.covered,odor:flight.perception.odor}:null,readoutNeurons:2129,missionProfiles:SCENARIOS.length,renderFPS,renderLag:flight?flight.t-presentation.time:0,trainableWeights:21300,styleEnabled,style:flight?{turn:flight.styleTurn,recovered:flight.styleRecovered,bonus:flight.styleBonus,degrees:(flight.heading-flight.styleStart)*180/Math.PI}:null,orbital:flight?.orbital?{phase:ORBIT_PHASES[flight.orbitPhase],orbits:flight.orbitTravel/(Math.PI*2),orbitComplete:flight.orbitComplete,milestones:flight.milestones,altitude:flight.y-8,...orbitalElements(flight)}:null,flight:flight?{variation:flight.variation,time:flight.t,seed:flight.seed,done:flight.done,landed:flight.landed,reward:flight.reward,reason:flight.reason}:null,ready,scenario:SCENARIOS[scenario].name,pilot:mode,training,paused,initialization:activeCheckpoint()?.initialization,generation:(training?trainee:activeCheckpoint())?.generation,trainingAttempts:(training?trainee:activeCheckpoint())?.episodes,observedFlights:observed,landings:landed,wholeConnectomeReady:networkReady,neurons:166700,edges:25582938});
  const tools=[
    {name:'get_control_decision',description:'Read the exact latest full-network controller input sample, commands, and isolated replays shown in the decision inspector. No control changes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({pilot:mode,paused,decision:mode==='human'?null:decisionTrace})},
    {name:'get_flight_program',description:'Read the current mission, pilot, training status and observed landing counts.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>state()},
    {name:'configure_flight',description:'Select a mission and pilot, then start a new simulated flight using the same controls as the flight deck.',inputSchema:{type:'object',properties:{mission:{type:'integer',minimum:0,maximum:SCENARIOS.length-1},pilot:{type:'string',enum:['embodied','graduate','trainee','rookie','human']}},required:['mission','pilot'],additionalProperties:false},execute:input=>{if(!Number.isInteger(input?.mission)||input.mission<0||input.mission>=SCENARIOS.length||!['embodied','graduate','trainee','rookie','human'].includes(input?.pilot))throw new Error('Invalid mission or pilot');setScenario(input.mission);setMode(input.pilot);return state();}},
    {name:'set_fly_training',description:'Start or pause the selected visual lesson or flight reward course for the embodied fly. Progress is saved on this device.',inputSchema:{type:'object',properties:{running:{type:'boolean'}},required:['running'],additionalProperties:false},execute:input=>{if(typeof input?.running!=='boolean')throw new Error('running must be boolean');input.running?startTraining():stopTraining();return state();}},
    {name:'set_neural_arousal',description:'Set experimental global circuit gain to baseline, +2% or +5%, then start a new flight. Pauses training. This is a model experiment, not a simulated chemical concentration.',inputSchema:{type:'object',properties:{gain:{type:'number',enum:[1,1.02,1.05]}},required:['gain'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{setArousal(input.gain);return state();}},
    {name:'throw_crosswind',description:'Apply a sudden lateral gust during the running simulated rocket flight.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{gust();return state();}},
  ];
  for(const tool of tools)try{Promise.resolve(context.registerTool({...tool,annotations:{readOnlyHint:false,...tool.annotations,untrustedContentHint:false}})).catch(()=>{});}catch{/* Optional browser support. */}
}
requestAnimationFrame(frame);boot();

$('style-flight').addEventListener('change',event=>{styleEnabled=event.target.checked;if(training)stopTraining();resetFlight();});

function setTraceControl(value){
 traceControl=Number(value);if(!Number.isInteger(traceControl)||traceControl<0||traceControl>9)return;
 for(const id of ['trace-control','limb-control'])$(id).value=String(traceControl);
 $('limb-label').textContent=`${CONTROL_LIMBS[traceControl].name} · ${CONTROL_LIMBS[traceControl].role}`;
 if(cockpit)cockpit.traceControl=traceControl;
 if(networkReady)networkWorker.postMessage({type:'trace-control',control:traceControl});
 if(decisionView){decisionView.selected=traceControl;decisionView.last=null;decisionView.controls.querySelectorAll('[data-control]').forEach(b=>{const selected=Number(b.dataset.control)===traceControl;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
}
for(const id of ['trace-control','limb-control']){$(id).innerHTML=CONTROLS.map(([name],i)=>`<option value="${i}">${name}</option>`).join('');$(id).addEventListener('change',e=>setTraceControl(Number(e.target.value)));}
$('decision-controls').addEventListener('click',e=>{const button=e.target.closest('[data-control]');if(button)setTraceControl(Number(button.dataset.control));});
$('pause-wiring').addEventListener('click',()=>setPause(!paused));
function renderProfiles(){
 const family=missionFamily(scenario),profiles=familyProfiles(family);$('course-description').textContent=$('training-course').value==='vision'?'Learn to orient the gaze toward a visible light. Targets come from the presented image; only the full graph’s output weights learn. No flight demonstrations are used.':$('training-course').value==='family'?`Each training batch tests four flights from this engine family: ${profiles.length} missions. Every candidate runs the complete network.`:'Training repeats this mission with new starting conditions.';
 $('profile-grid').innerHTML=SCENARIOS.map((c,i)=>{if(profileGroup!=='All'&&c.group!==profileGroup)return '';const embodied=isEmbodied(activeCheckpoint()),trial=evaluationReport?.evaluation?.flights?.filter(f=>f.scenario===i),result=embodied?(mode==='embodied'&&embodiedReport&&i===0?`${embodiedReport.evaluation.landings}/${embodiedReport.evaluation.episodes} unseen starts landed`:'No matching landing test'):trial?.length?`${trial.filter(f=>f.landed).length}/${trial.length} historical V8 landings · ${trial.filter(f=>f.styleBonus>0).length} style`:'';return `<button class="profile-card${i===scenario?' selected':''}" data-profile="${i}" aria-pressed="${i===scenario}"><small>${String(i+1).padStart(2,'0')} · ${c.group}</small><strong>${c.title}</strong><span>${c.subtitle}</span><small>${c.orbital?'Launch → '+c.orbitHeight+' m orbit':c.height+' m'} · ${c.landingRadius} m target · ${Math.round((c.fuel??1)*100)}% fuel</small><span class="profile-result">${embodied?(mode==='embodied'&&embodiedReport&&i===0?'Vertical descent trained':'Flight skill unverified'):c.family==='orbital'?'Orbital mission pilot':c.family==='center'?'Center-engine pilot':c.family==='degraded'?'Reduced-thrust pilot':'Engine-out pilot'}</span><small>${result}</small></button>`;}).join('');
}
$('profile-grid').addEventListener('click',e=>{const b=e.target.closest('[data-profile]');if(b)setScenario(Number(b.dataset.profile));});
$('profile-groups').innerHTML=['All',...new Set(SCENARIOS.map(s=>s.group))].map((name,i)=>`<button data-group="${name}" class="${i?'':'selected'}" aria-pressed="${!i}">${name}</button>`).join('');
$('profile-groups').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(!b)return;profileGroup=b.dataset.group;for(const node of $('profile-groups').children){node.classList.toggle('selected',node===b);node.setAttribute('aria-pressed',String(node===b));}renderProfiles();});
$('training-course').addEventListener('change',()=>{if(training)stopTraining();renderProfiles();});
renderProfiles();

$('cockpit-canvas').addEventListener('follow-limb',event=>setTraceControl([0,1,8,6,2,5][event.detail]??0));

$('varied-flight').addEventListener('change',()=>resetFlight());
$('varied-training').addEventListener('change',()=>{if(training)stopTraining();});

function updateSensoryPanel(){
 if(workspaceView!=='cockpit'||!flight)return;const s=flight,trace=decisionTrace;$('sensory-summary').innerHTML='<span><strong>'+(isEmbodied(activeCheckpoint())?'1,558':'46')+'</strong> sensory channels</span><span><strong>10</strong> motor commands</span><span><strong>'+ (trace?trace.time.toFixed(2):'—')+'</strong> s · last sample</span>';
 const packet=flight.perception;$('perception-mode-note').textContent=isEmbodied(activeCheckpoint())?'Live camera and instrument light, body feedback and odor inputs to the perceiving fly.':'Reference pilot selected: numerical telemetry is active. These eye and odor channels are not connected.';if(!packet){for(const id of ['retina-left','retina-right','outside-camera']){const c=$(id);c.getContext('2d').clearRect(0,0,c.width,c.height);}$('odor-acetate').value=0;$('odor-geosmin').value=0;$('odor-log').textContent='Odor input inactive for the reference pilot.';}if(packet){paintImage($('retina-left'),packet.eyes[0]);paintImage($('retina-right'),packet.eyes[1]);paintImage($('outside-camera'),packet.screens[1]);$('odor-acetate').value=packet.odor.acetate;$('odor-geosmin').value=packet.odor.geosmin;$('odor-log').textContent=packet.odor.events.slice(-3).reverse().map(e=>e.time.toFixed(1)+' s · '+(e.odor==='acetate'?'Ethyl acetate':'Geosmin')+' · '+e.reason).join(' | ')||'No releases yet';}
 const a=trace?.targets??[],cards=[['THROTTLE',Math.round(s.throttle*100)+'%',a[0]===undefined?'Awaiting command':'Requested '+Math.round(a[0]*100)+'%'],['GIMBAL X',(s.gimbal*180/Math.PI).toFixed(1)+'°',a[1]===undefined?'Awaiting command':'Requested '+(a[1]*180/Math.PI).toFixed(1)+'°'],['GIMBAL Z',(s.gimbalZ*180/Math.PI).toFixed(1)+'°',a[3]===undefined?'Awaiting command':'Requested '+(a[3]*180/Math.PI).toFixed(1)+'°'],['FIN 01',(s.finAngles[0]*180/Math.PI).toFixed(1)+'°',s.finFailed?'Jammed · other fins respond':'Measured fin position'],['ENGINE BANK',s.engineBank+' active','Selector '+Math.round(s.selector*100)+'%'],['FUEL READING',Math.round(s.seenFuel*100)+'%',s.fuelAge.toFixed(1)+' s since sampled'],['ENGINE READING',Math.round(s.seenEngine*100)+'%',s.engineAge.toFixed(1)+' s since sampled'],['VERTICAL RESPONSE',(s.motionSample?.[1]??0).toFixed(1)+' m/s²',s.variation?.level?'Varied physics and sensor noise':'Measured from physical motion']];
 $('feedback-grid').innerHTML=cards.map(([label,value,note])=>'<div class="feedback-card"><span>'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>').join('');
}

function updateArousalLabel(){const changed=activationGain!==(activeCheckpoint()?.activationGain??1);$('arousal-status').textContent=`Current flight: ${activationGain.toFixed(2)}× circuit gain.`+(changed?' This pilot was trained at a different gain.':' Matches this checkpoint’s training setting.');}
function setArousal(gain){if(![1,1.02,1.05].includes(gain))throw new Error('Choose baseline, +2% or +5%');if(training)stopTraining();activationGain=gain;$('neural-arousal').value=String(gain);observed=0;landed=0;landingStreak=0;updateOutcomes();resetFlight();updateMessage();updateArousalLabel();}
$('neural-arousal').addEventListener('change',event=>setArousal(Number(event.target.value)));

function renderArousalEvidence(){
 const experiment=evaluationReport?.arousalExperiment;
 if(!experiment){$('arousal-results').textContent='No matching experiment is available.';$('arousal-verdict').textContent='The arousal control remains available for your own flight and training experiments.';return;}
 $('arousal-results').innerHTML='<div class="arousal-comparison">'+experiment.summary.map(s=>`<div><span>${s.gain.toFixed(2)}× GAIN</span><strong>${s.landings} / ${s.episodes}</strong><small>safe landings</small></div>`).join('')+'</div>';
 $('arousal-verdict').textContent='Historical V8 instrument pilot: twelve matched flights per setting across six profiles, using identical weights and initial conditions. This small sample does not establish a performance benefit or measure learning speed. Baseline remains the default.';
}

for(const id of ['auto-odor','cover-eyes','instrument-lights'])$(id).addEventListener('change',()=>{if(training)stopTraining();resetFlight();});
for(const odor of ['acetate','geosmin'])$('release-'+odor).addEventListener('click',()=>{if(!flight||flight.done)return;flight.manualOdor=odor;notify('Simulated odor release queued for the next sensory sample.');});
