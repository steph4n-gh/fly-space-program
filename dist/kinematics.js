// These are the same authored linkages used by the cockpit; they are not
// biological neuromuscular mappings or learned individual joint angles.
export const CONTROL_LIMBS=[
 {name:'Left foreleg',limbs:[0],role:'Throttle lever'},
 {name:'Right foreleg',limbs:[1],role:'Two-axis gimbal stick'},
 {name:'Both hindlegs',limbs:[4,5],role:'Attitude pedals · X'},
 {name:'Right foreleg',limbs:[1],role:'Two-axis gimbal stick'},
 {name:'Both hindlegs',limbs:[4,5],role:'Attitude pedals · Z'},
 {name:'Both hindlegs',limbs:[4,5],role:'Pedal twist · yaw jets'},
 {name:'Right middle leg',limbs:[3],role:'Two-axis fin lever'},
 {name:'Right middle leg',limbs:[3],role:'Two-axis fin lever'},
 {name:'Left middle leg',limbs:[2],role:'Engine-bank selector'},
 {name:'Head',limbs:[],role:'Instrument gaze'},
];
export function limbTargets(s){return[
 [-1.6,1.8,1.85-s.throttle*.65],
 [.7+s.gimbal/.22*.35,2.08,1.6+s.gimbalZ*1.5],
 [-.5,1.8,1.75-s.selector*.5],
 [1.6+s.finX*.3,1.95,1.4+s.finZ*.3],
 [-.5+s.rcs*.1,-.03,1.4-s.rcsZ*.2-Math.max(0,-s.rcs)*.1],
 [.5+s.rcs*.1,-.03,1.4-s.rcsZ*.2-Math.max(0,s.rcs)*.1],
];}
