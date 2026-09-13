import {loadNetwork} from './full-network.js?v=8.4';
let network,weights,flightId=-1,lastDecision,selectedControl=0;
onmessage=async({data})=>{
 try{
  if(data.type==='start'){
   network=await loadNetwork('assets/connectome/',(loaded,total)=>postMessage({type:'progress',loaded,total}));
   postMessage({type:'ready',neurons:network.n,edges:network.manifest.edges,motors:network.motorIndices.length,sensory:network.sensoryCount});
  }else if(data.type==='reset'&&network){network.setActivationGain(data.activationGain??1);network.reset();weights=Float64Array.from(data.weights);flightId=data.flightId;lastDecision=null;}
  else if(data.type==='decide'&&network&&data.flightId===flightId){
   const before=network.snapshot(),started=performance.now(),commands=Array.from(network.decide(data.observations,weights));
   lastDecision={before,observations:data.observations,commands,step:data.step};
   const values=network.activity.slice();postMessage({type:'decision',commands,motorTrace:network.traceControl(weights,selectedControl),step:data.step,flightId,values,stats:network.stats(),milliseconds:performance.now()-started},[values.buffer]);
  }else if(data.type==='trace-control'&&network){selectedControl=data.control;if(lastDecision)postMessage({type:'motor-trace',flightId,step:lastDecision.step,motorTrace:network.traceControl(weights,selectedControl)});
  }else if(data.type==='explain'&&lastDecision&&data.flightId===flightId){
   const {before,observations,commands,step}=lastDecision;postMessage({type:'explanation',flightId,step,...network.explain(observations,weights,before,commands)});
  }else if(data.type==='pulse'&&network&&Number.isInteger(data.index)&&data.index>=0&&data.index<network.n)network.pulse={index:data.index,steps:8};
 }catch(error){postMessage({type:'error',message:error.message});}
};
