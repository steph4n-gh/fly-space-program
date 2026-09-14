// Outcome-only proximity to the existing three-second insertion requirement.
// This module neither changes a flight nor supplies observations or actions.
import {orbitalElements} from '../dist/orbital.js';

export function createInsertionHold(){return{segments:[],duration:0,integral:0,best:0};}
export function updateInsertionHold(record,flight,dt){
 if(!Number.isFinite(dt)||dt<=0)throw Error('Insertion measurement requires a positive physical interval');
 const e=orbitalElements(flight),target=flight.orbitConfig.orbitHeight;
 // Each deficit is zero inside the original insertion limits. The distance
 // scales use the existing 200 m altitude tolerance and 5 m/s speed limit.
 const deficit=Math.max(0,800-e.periapsis)/200+
  Math.max(0,Math.abs(e.apoapsis-target)-200)/200+
  Math.max(0,Math.abs(flight.vy)-5)/5;
 const quality=Number.isFinite(deficit)?Math.exp(-deficit):0;
 record.segments.push({duration:dt,quality});record.duration+=dt;record.integral+=quality*dt;
 while(record.duration>3){
  const first=record.segments[0],trim=Math.min(first.duration,record.duration-3);
  record.duration-=trim;record.integral-=first.quality*trim;first.duration-=trim;
  if(first.duration<1e-12)record.segments.shift();
 }
 record.best=Math.max(record.best,Math.min(1,Math.max(0,record.integral/3)));
 return record.best;
}
