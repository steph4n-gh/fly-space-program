import {loadNetwork} from './full-network.js';
let network,drive={observations:Array(8).fill(0),coreActivity:Array(96).fill(0),flightId:0,paused:false},running=false,lastFlight=-1;
async function boot(){
  if(running)return;running=true;
  try{network=await loadNetwork('assets/connectome/',(loaded,total)=>postMessage({type:'progress',loaded,total}));postMessage({type:'ready',neurons:network.n,edges:network.manifest.edges});tick();}
  catch(error){running=false;postMessage({type:'error',message:error.message});}
}
function tick(){
  if(!running)return;
  if(!drive.paused){
    if(lastFlight!==drive.flightId){network.reset();lastFlight=drive.flightId;}
    const started=performance.now(),stats=network.step(drive.observations,drive.coreActivity),elapsed=performance.now()-started;
    const values=network.activity.slice(),feedback=network.feedback.slice();postMessage({type:'activity',values,feedback,stats,milliseconds:elapsed,flightId:drive.flightId},[values.buffer,feedback.buffer]);
    setTimeout(tick,Math.max(30,160-elapsed));
  }else setTimeout(tick,80);
}
onmessage=({data})=>{if(data.type==='start')boot();else if(data.type==='drive')drive=data;else if(data.type==='pulse'&&network&&Number.isInteger(data.index)&&data.index>=0&&data.index<network.n)network.pulse={index:data.index,steps:8};};
