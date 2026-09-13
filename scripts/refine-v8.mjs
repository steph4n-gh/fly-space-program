import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {LegacyNetwork,previous,legacySensors} from './legacy-v7.mjs';
import {createFlight,fullSensors,advance,clamp} from '../dist/engine3d.js';
import {SCENARIOS} from '../dist/missions.js';
import {flightResult} from '../dist/full-controller.js';
const family=process.argv[2]??'orbital',round=Number(process.argv[3]??1),net=loadFullNetwork(),old=new LegacyNetwork(net),stride=net.motorIndices.length+1;
const names=family==='landing'?['full-pilot','full-specialist','full-expert']:['full-orbital'],weights=names.map(n=>JSON.parse(fs.readFileSync('dist/assets/'+n+'.json')).weights),teachers=names.map(n=>JSON.parse(previous('dist/assets/'+n+'.json')).weights),x=[],y=[],importance=[],results=[];
const profiles=family==='orbital'?[24,25,26]:[0,4,6,18,7,19,2,9,14,21,23,11],started=Date.now();
// Preserve the mixed student-readout selection used in the original first capture.
// All three teacher targets are fitted at every landing state; later captures use each profile's own readout.
for(const scenario of profiles){const head=family==='orbital'?0:round===1?([6,9,12,15,18,21].includes(scenario)?1:[7,10,13,16,19,22].includes(scenario)?2:0):SCENARIOS[scenario].family==='degraded'?1:SCENARIOS[scenario].family==='out'?2:0;const s=createFlight(826411+round*1931,scenario,round>1?.4:0);net.reset();old.reset();let maxError=0,step=0;
 while(!s.done){const a=net.decide(fullSensors(s),weights[head]),b=old.decide(legacySensors(s),teachers[head]);for(let c=0;c<10;c++)maxError=Math.max(maxError,Math.abs(a[c]-b[c]));
  // Cover every state while giving the recovery maneuver extra fitting weight.
  const weight=family==='orbital'?(s.orbitPhase===5?10:s.orbitPhase>=3?3:1):s.y<90?3:1;
  for(const j of net.motorIndices)x.push(net.activity[j]);x.push(1);importance.push(weight);
  for(const teacher of teachers)for(let c=0;c<10;c++){let v=teacher[c*stride+stride-1];for(let j=0;j<stride-1;j++)v+=teacher[c*stride+j]*old.activity[old.motorIndices[j]];y.push(clamp(v,-6,6));}
  for(let i=0;i<3&&!s.done;i++)advance(s,a);step++;
 }
 const result={...flightResult(s),studentReadout:names[head],offset:[s.x-s.padX,s.z-s.padZ],maxError,samples:x.length/stride,seconds:Math.round((Date.now()-started)/1000)};results.push(result);console.log(JSON.stringify(result));
}
const dir='/tmp/fly-v8/'+family;fs.writeFileSync(dir+`/trajectory-${round}-features.bin`,Buffer.from(Float64Array.from(x).buffer));fs.writeFileSync(dir+`/trajectory-${round}-targets.bin`,Buffer.from(Float64Array.from(y).buffer));fs.writeFileSync(dir+`/trajectory-${round}-importance.bin`,Buffer.from(Float64Array.from(importance).buffer));fs.writeFileSync(dir+`/trajectory-${round}-results.json`,JSON.stringify(results,null,2));
