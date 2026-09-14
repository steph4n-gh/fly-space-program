// Physically displayable measurements and a mission destination cue. These
// lights encode no recommended control action, descent target or autopilot.
import {PLANET_RADIUS} from './orbital.js?v=9.6';
export const FLIGHT_PANEL='measured-flight-panel-v2';
export const FLIGHT_BODY_CHANNELS=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15,17];
export const INSTRUMENT_FIELDS=[
 ['clearance','Clearance','m'],['verticalSpeed','Vertical speed','m/s'],
 ['offsetX','Deck offset X','m'],['offsetZ','Deck offset Z','m'],
 ['driftX','Deck drift X','m/s'],['driftZ','Deck drift Z','m/s'],
 ['pitch','Pitch','rad'],['roll','Roll','rad'],
 ['tangentSpeed','Tangential speed','m/s'],['travel','Angular travel','turns'],
 ['destination','Destination altitude','m'],['fuel','Fuel','fraction'],
];
const clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
export function instrumentMeasurements(s){
 const c=Math.cos(s.heading),h=Math.sin(s.heading),dx=s.x-s.padX,dz=s.z-s.padZ,vx=s.vx-s.padVx,vz=s.vz-s.padVz;
 const altitude=Math.max(0,s.y-8),destination=s.orbital?s.orbitConfig.orbitHeight:0;
 const raw=[altitude,s.vy,c*dx-h*dz,h*dx+c*dz,c*vx-h*vz,h*vx+c*vz,Math.atan2(Math.sin(s.angle),Math.cos(s.angle)),s.angleZ,s.vx,s.orbital?s.x/(PLANET_RADIUS*2*Math.PI):0,destination,s.fuel];
 const encoded=[2*altitude/(altitude+100)-1,Math.tanh(raw[1]/12),Math.tanh(raw[2]/50),Math.tanh(raw[3]/50),Math.tanh(raw[4]/12),Math.tanh(raw[5]/12),raw[6]/Math.PI,Math.tanh(raw[7]/.5),raw[8]/350,raw[9]-1,2*destination/(destination+100)-1,2*s.fuel-1].map(v=>clamp(v));
 return{raw,encoded};
}
export function paintFlightInstruments(im,values){
 for(let i=0;i<im.data.length;i+=4)im.data.set([4,8,12,255],i);
 if(!values)return im;
 for(let k=0;k<12;k++){
  const column=k%3,row=Math.floor(k/3),level=16+224*(clamp(values[k])+1)/2;
  for(let y=2+row*11;y<11+row*11;y++)for(let x=2+column*21;x<20+column*21;x++)im.data.set([level,level,level,255],(y*64+x)*4);
 }
 return im;
}
export function presentedInstrumentValues(im){
 return INSTRUMENT_FIELDS.map((_,k)=>2*((im.data[((5+Math.floor(k/3)*11)*64+8+(k%3)*21)*4]-16)/224)-1);
}
