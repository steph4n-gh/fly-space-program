import assert from 'node:assert/strict';
import {createOrbitalFlight,advanceOrbital,orbitalElements,PLANET_RADIUS as R,PLANET_MU as mu,orbitalGuidance} from '../dist/orbital.js';
import {createFlight,fullSensors,advance,physicsStep} from '../dist/engine3d.js';
import {captureDecision,ORBIT_SIGNALS} from '../dist/decision.js';
import {teacher} from './prototype-orbit.mjs';
const s=createOrbitalFlight(1,24,{orbitHeight:1000}),radius=R+1000;s.y=1008;s.vx=Math.sqrt(mu/radius);s.orbitPhase=2;s.orbitStart=0;s.liftedOff=true;s.spaceReached=true;s.engineHealth=0;
const initial=orbitalElements(s);assert.ok(Math.abs(initial.apoapsis-1000)<1e-5);assert.ok(Math.abs(initial.periapsis-1000)<1e-5);
const energy=state=>(state.vx**2+state.vy**2)/2-mu/(R+state.y-8),before=energy(s),period=2*Math.PI*Math.sqrt(radius**3/mu);
while(s.t<period+1)advanceOrbital(s,[-1,0,0,0,0,0,0,0,-1,0]);
assert.ok(s.orbitComplete);assert.ok(Math.abs(energy(s)/before-1)<.001);assert.ok(Math.abs(s.y-1008)<3);assert.ok(s.milestones.find(m=>m.name==='One full orbit').time>=period-1);
const early=createFlight(1,24);early.y=8.01;early.vy=-1;early.liftedOff=true;advance(early,[-1,0,0,0,0,0,0,0,-1,0]);assert.equal(early.landed,false);assert.match(early.reason,/before completing/);
for(const scenario of [24,25,26]){
 const flight=createFlight(1703,scenario);let sawCoarse=false,sawFine=false;
 while(!flight.done){const obs=fullSensors(flight),trace=captureDecision(flight,obs),g=orbitalGuidance(flight);assert.equal(ORBIT_SIGNALS.length,19);assert.deepEqual(trace.observations,obs);assert.equal(trace.raw[7],g.throttle*100);assert.ok(Math.abs(trace.raw[3]-g.angleError*180/Math.PI)<1e-12);sawCoarse||=physicsStep(flight)===.25;sawFine||=physicsStep(flight)===.05;const action=teacher(obs);for(let i=0;i<3&&!flight.done;i++)advance(flight,action);}
 assert.ok(flight.landed,`${scenario}: reference dynamics must permit a complete round trip`);assert.ok(sawCoarse&&sawFine);const names=flight.milestones.map(m=>m.name);for(const name of ['Launch','Space','Stable orbit','One full orbit','Deorbit','Atmospheric entry','Final approach','Barge touchdown'])assert.ok(names.includes(name));assert.ok(names.indexOf('One full orbit')<names.indexOf('Deorbit'));assert.ok(flight.orbitTravel>=2*Math.PI);assert.ok(flight.fuel>0);
}
console.log('PASS: orbital elements and engine-off orbit conservation; no premature success; ordered complete-round-trip milestones; variable physics steps and exact orbital sensor traces. Reference-policy tests validate dynamics, not neural reliability.');
