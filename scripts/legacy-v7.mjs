import {execFileSync} from 'node:child_process';
import {sensors,deck,clamp,sensorSnapshot} from '../dist/engine3d.js';
import {orbitalSensors,orbitalGuidance} from '../dist/orbital.js';
export const BASELINE='a46769fdf9189f47baa65ca5a0a210efc9ff0972';
export const previous=path=>execFileSync('git',['show',BASELINE+':'+path],{maxBuffer:20*1024*1024}).toString();
export const LegacyNetwork=(await import('data:text/javascript;base64,'+Buffer.from(previous('dist/full-network.js')).toString('base64'))).FullNetwork;
export function legacySensors(s){if(s.orbital)return orbitalSensors(s);const o=sensors(s),p=deck(s),c=Math.cos(s.heading),h=Math.sin(s.heading),rotate=(x,z)=>[c*x-h*z,h*x+c*z];[o[0],o[8]]=rotate((s.x-p.x)/55,(s.z-p.z)/55);[o[1],o[9]]=rotate((s.vx-p.vx)/10,(s.vz-p.vz)/10);[o[7],o[12]]=rotate(p.vx/5,p.vz/5);o[13]=(s.heading-s.styleStart-(s.styleEnabled?2*Math.PI:0))/Math.PI;o.push(s.styleEnabled?1:0);return o.map(v=>clamp(v,-3,3));}

// Give the old policy the same measured readings and noise in its original units.
export function legacyMeasuredSensors(s){
 if(!s.variation?.noise)return legacySensors(s);
 const {raw:r}=sensorSnapshot(s),d=Math.PI/180;
 const o=s.orbital?[r[20]/1000,r[21]/100,r[2]/40,r[3]*d,r[4],r[5]/1000,r[6]/100-.5,Math.atanh(clamp(r[22]/50-1,-.99999,.99999))/3,r[8]/55,r[9]/10,r[10]*d,r[11],orbitalGuidance(s).gravity/10,r[13]/180,r[14],r[15]/100-1,r[16]/12,r[17]/12,r[19]]:[r[0]/55,r[1]/10,r[2]/12,Math.sin(r[3]*d)*2,r[4],r[5]/160,r[6]/100-.5,r[7]/5,r[8]/55,r[9]/10,Math.sin(r[10]*d)*2,r[11],r[12]/5,r[13]/180,r[14],r[15]/100-1,r[16]/12,r[17]/12,r[18]];
 return o.map(v=>clamp(v,-3,3));
}
