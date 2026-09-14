// Outcome-only ranking measurements; no flight mutation or controller input.
import {orbitalElements,PLANET_RADIUS} from '../dist/orbital.js';

export function createInsertionProgress(){
 return{currentHold:0,longestHold:0,bestEligiblePeriapsis:null,eligibleSeconds:0};
}
export function updateInsertionProgress(record,flight,dt){
 if(!Number.isFinite(dt)||dt<=0)throw Error('Insertion progress requires a positive physical interval');
 const e=orbitalElements(flight),target=flight.orbitConfig.orbitHeight;
 const eligible=Number.isFinite(e.periapsis)&&Math.abs(e.apoapsis-target)<200&&Math.abs(flight.vy)<5;
 record.currentHold=eligible&&e.periapsis>800?record.currentHold+dt:0;
 record.longestHold=Math.max(record.longestHold,record.currentHold);
 if(eligible){
  record.eligibleSeconds+=dt;
  record.bestEligiblePeriapsis=Math.max(record.bestEligiblePeriapsis??-PLANET_RADIUS,e.periapsis);
 }
}
export function insertionProgressResult(record){
 return{longestStrictInsertionHoldSeconds:record.longestHold,
  conditionalPeriapsis:record.bestEligiblePeriapsis,conditionalPeriapsisEligibleSeconds:record.eligibleSeconds,
  strictInsertionHoldProgress:Math.min(3,record.longestHold)/3,
  conditionalPeriapsisProgress:(Math.max(-PLANET_RADIUS,Math.min(800,record.bestEligiblePeriapsis??-PLANET_RADIUS))+PLANET_RADIUS)/(PLANET_RADIUS+800)};
}
export function compareInsertionProgress(a,b){
 for(const key of ['strictInsertionHoldProgress','conditionalPeriapsisProgress']){
  const mean=r=>r.flights.reduce((sum,f)=>sum+f[key],0)/r.flights.length;
  const difference=mean(b)-mean(a);if(difference)return difference;
 }
 return 0;
}
