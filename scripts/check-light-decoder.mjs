import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight} from '../dist/engine3d.js';
import {sampleEmbodied,renderRetinas,paintLandingIndicators} from '../dist/perception.js';
const net=loadFullNetwork();net.setInputMode('embodied');
const basis=JSON.parse(fs.readFileSync('artifacts/landing-training/sensory-basis.json')),weights=Array(21300).fill(0),rows=[];
for(const seed of [881119,7197731,178913])for(const levels of [[.5,.5],[.1,.5],[.9,.5],[.5,.1],[.5,.9]]){
 const s=createFlight(seed,0);s.autoOdor=false;s.instrumentLights=false;
 const p=sampleEmbodied(s),obs=[...p.observations];paintLandingIndicators(p.screens[1],levels);
 const eyes=renderRetinas(s,p.screens);
 for(let k=0;k<2;k++)for(let j=0;j<768;j++){const d=eyes[k].data,i=j*4;obs[k*768+j]=3*(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;}
 net.reset();for(let i=0;i<12;i++)net.decide(obs,weights);
 const predicted=basis.basis.map(b=>{let v=b[2129];for(let j=0;j<2129;j++)v+=b[j]*net.activity[net.motorIndices[j]];return v;});
 rows.push({seed,target:[levels[0],2*levels[1]-1,-1,-1],predicted});
}
const report={trials:rows.length,RMSE:basis.names.map((name,j)=>({name,error:Math.sqrt(rows.reduce((t,r)=>t+(r.predicted[j]-r.target[j])**2,0)/rows.length)})),rows};
fs.writeFileSync('artifacts/landing-training/light-independence-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify({trials:report.trials,RMSE:report.RMSE,firstContext:rows.slice(0,5)}));
