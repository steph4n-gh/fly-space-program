import {Trainer} from './engine.js';
let trainer, running=false, pending=false;
function train() {
  pending=false;
  if(!running || !trainer)return;
  try {
    const result=trainer.trainGeneration(14,3);
    postMessage({type:'generation',result,checkpoint:trainer.checkpoint()});
    if(running){pending=true;setTimeout(train,15);}
  } catch(error){running=false;postMessage({type:'error',message:String(error.message)});}
}
onmessage=({data})=>{
  if(data.type==='start') {
    trainer=new Trainer(data.circuit,data.checkpoint);trainer.scenario=data.scenario;
    running=true;if(!pending){pending=true;setTimeout(train,0);}
  } else if(data.type==='stop'){running=false;postMessage({type:'stopped',checkpoint:trainer?.checkpoint()});}
  else if(data.type==='scenario'&&trainer)trainer.scenario=data.scenario;
  else if(data.type==='feedback'&&trainer)trainer.feedback=Float32Array.from(data.feedback);
};
