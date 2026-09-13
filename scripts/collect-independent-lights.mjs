// A sensory calibration bench, not a flight-policy demonstration. The two
// displayed light levels vary independently of the background and body signals.
import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,advance,rng} from '../dist/engine3d.js';
import {sampleEmbodied,renderRetinas,paintLandingIndicators} from '../dist/perception.js';
const net=loadFullNetwork();net.setInputMode('embodied');
const weights=Array(21300).fill(0),records=[];
for(let episode=0;episode<256;episode++){
 const seed=62001011+episode*7919,r=rng(seed),s=createFlight(seed,0,.4);
 s.y=10+r()*140;s.vy=(r()-.5)*50;s.fuel=.3+r()*.7;s.throttle=r();s.styleEnabled=false;s.autoOdor=false;
 advance(s,[s.throttle*2-1,0,0,0,0,0,0,0,-1,0]);
 const packet=sampleEmbodied(s),levels=[r(),r()];paintLandingIndicators(packet.screens[1],levels);
 const eyes=renderRetinas(s,packet.screens),obs=[...packet.observations];
 for(let k=0;k<2;k++)for(let j=0;j<768;j++){const d=eyes[k].data,i=j*4;obs[k*768+j]=3*(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;}
 const lights=[packet.screens[1].data[(4*64+20)*4]/255,packet.screens[1].data[(41*64+20)*4]/255],target=[0,0,0,0,0,...obs.slice(1536,1554)];
 net.reset();
 for(let step=0;step<10;step++){
  net.decide(obs,weights);
  if(step>=8)records.push({kind:'independent-light',episode:1000+episode,seed,time:(step+1)*.15,features:Array.from(net.motorIndices,i=>net.activity[i]),target,lights});
 }
 if((episode+1)%32===0)console.log(JSON.stringify({presentations:episode+1,records:records.length}));
}
fs.writeFileSync('artifacts/landing-training/independent-light-features.json',JSON.stringify({schema:'independent-light-calibration-v1',neurons:net.n,edges:net.pre.length,presentations:256,description:'Independent presented-light intensities, varied camera background and physical body feedback; no flight actions are labels.',records}));
