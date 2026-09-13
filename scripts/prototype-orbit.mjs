import {createOrbitalFlight,orbitalSensors,advanceOrbital,orbitalElements} from '../dist/orbital.js';
export function teacher(obs){return[Math.tanh(obs[7]*3),0,Math.tanh(-1.2*obs[3]-.55*obs[4]),0,Math.tanh(-1.2*obs[10]-.55*obs[11]),Math.tanh(-1.4*obs[13]-1.1*obs[14]),0,0,Math.tanh(-3*obs[18]-1),.4];}
if(process.argv[1]?.endsWith('prototype-orbit.mjs')){
 const s=createOrbitalFlight(17,24,{orbitHeight:1000,wind:0,amplitude:0,landingRadius:11});let log=-1;
 while(!s.done){const a=teacher(orbitalSensors(s));for(let i=0;i<3&&!s.done;i++)advanceOrbital(s,a);if(Math.floor(s.t/10)!==log){log=Math.floor(s.t/10);console.log(JSON.stringify({t:s.t,phase:s.orbitPhase,h:s.y-8,x:s.x,vx:s.vx,vy:s.vy,fuel:s.fuel,angle:s.angle,throttle:s.throttle,orbit:s.orbitTravel/(2*Math.PI),...orbitalElements(s)}));}}
 console.log(JSON.stringify({landed:s.landed,reason:s.reason,touchdown:s.touchdown,milestones:s.milestones}));
}
