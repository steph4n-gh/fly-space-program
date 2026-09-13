import {loadNetwork} from './full-network.js?v=5.1';
import {FullTrainer,validCheckpoint} from './full-controller.js?v=5.1';
let network,trainer,running=false,busy=false;
async function train(data){
 if(busy)return;busy=true;running=true;
 try{
  network??=await loadNetwork('assets/connectome/',(loaded,total)=>postMessage({type:'loading',percent:Math.round(loaded/total*100)}));
  if(!running)return;
  if(!validCheckpoint(data.checkpoint))throw new Error('Incompatible full-network checkpoint');
  trainer=new FullTrainer(network,data.checkpoint);trainer.scenario=data.scenario;trainer.style=data.style;
  let last=0;
  while(running){const result=await trainer.generation(progress=>{if(performance.now()-last>500){last=performance.now();postMessage({type:'progress',...progress});}});if(result)postMessage({type:'generation',result,checkpoint:trainer.checkpoint()});}
 }catch(error){postMessage({type:'error',message:error.message});}
 finally{running=false;busy=false;postMessage({type:'stopped',checkpoint:trainer?.checkpoint()});}
}
onmessage=({data})=>{if(data.type==='start')train(data);else if(data.type==='stop'){running=false;if(trainer)trainer.running=false;}};
