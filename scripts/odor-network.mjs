import fs from 'node:fs';
import {loadFullNetwork} from './full-network-node.mjs';

export const ODOR_OFFSET=1554;
export function loadOdorNetwork(){
 const atlas=JSON.parse(fs.readFileSync(new URL('../artifacts/odor-interface/odor-atlas.json',import.meta.url))),network=loadFullNetwork();
 if(atlas.neurons!==network.n)throw Error('Odor atlas and graph differ');
 const used=new Set();
 for(let g=0;g<atlas.units.length;g++)for(const [side,key] of ['left','right'].entries())for(const cell of atlas.units[g][key]){
  if(used.has(cell))throw Error('Olfactory cell mapped twice');used.add(cell);
  network.receptorChannels[cell]=ODOR_OFFSET+g*2+side;network.receptorPolarity[cell]=1;
 }
 network.setInputMode('embodied');
 return{network,atlas,inputs:ODOR_OFFSET+atlas.units.length*2};
}

// A signed deviation around the matched spontaneous response. A null entry
// produces no modeled deviation and remains marked unknown in the atlas.
// Levels are dimensionless interpolation factors, never physical doses.
export function odorObservation(base,atlas,stimuli=[]){
 const obs=new Float64Array(ODOR_OFFSET+atlas.units.length*2);obs.set(base.slice(0,ODOR_OFFSET));
 for(const {odor,left=0,right=0} of stimuli)for(let g=0;g<atlas.units.length;g++){
  const delta=odor.delta[g];if(delta===null)continue;
  obs[ODOR_OFFSET+g*2]+=delta*left;obs[ODOR_OFFSET+g*2+1]+=delta*right;
 }
 for(let i=ODOR_OFFSET;i<obs.length;i++)obs[i]=Math.max(-1,Math.min(1,obs[i]));
 return obs;
}
