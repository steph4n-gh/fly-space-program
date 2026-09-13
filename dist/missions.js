const originals=[
 {title:'Landing school',subtitle:'Calm air · stationary deck',height:95,spread:7,amplitude:0,wind:0,night:false,entrySpeed:8,descentSpeed:12},
 {title:'Atlantic return',subtitle:'Two lateral axes · moving recovery ship',height:165,spread:28,amplitude:12,wind:.25,night:false,entrySpeed:8,descentSpeed:12},
 {title:'Fast approach',subtitle:'Higher entry · faster descent',height:260,spread:40,amplitude:17,wind:.6,night:false},
 {title:'Rough seas',subtitle:'Crosswinds · rolling deck',height:230,spread:43,amplitude:24,wind:1.2,night:false},
 {title:'Night shift',subtitle:'Low visibility · instrument checks',height:270,spread:45,amplitude:27,wind:1.5,night:true},
 {title:'Fin trouble',subtitle:'One grid fin jams during approach',height:300,spread:43,amplitude:23,wind:1.6,night:true,failure:'fin'},
 {title:'Engine trouble',subtitle:'Center engine loses thrust · choose a bank',height:310,spread:50,amplitude:25,wind:1.7,night:true,failure:'engine',engineHealth:.48,family:'degraded'},
 {title:'Absolutely nominal',subtitle:'Storm · faults · very little margin',height:380,spread:60,amplitude:30,wind:2.2,night:true,failure:'both',engineHealth:0,family:'out'},
];
const advanced=[
 {title:'Precision barge',group:'Deck work',subtitle:'Seven-meter landing circle',height:185,spread:28,amplitude:10,wind:.35,landingRadius:7},
 {title:'Fast ferry',group:'Deck work',subtitle:'Faster ship · sustained lateral tracking',height:210,spread:33,amplitude:20,wind:.6,deckRateX:.16,deckRateZ:.12},
 {title:'Figure-eight deck',group:'Deck work',subtitle:'The recovery ship crosses its own wake',height:230,spread:35,amplitude:18,wind:.7,deckPattern:'figure8',deckRateX:.12},
 {title:'Turning vessel',group:'Deck work',subtitle:'A tightening turn during descent',height:245,spread:38,amplitude:22,wind:.8,deckPattern:'turn'},
 {title:'Wind wall',group:'Recovery lab',subtitle:'A strong gust arrives six seconds in',height:220,spread:30,amplitude:15,wind:.7,gustAt:6,gustStrength:3.2},
 {title:'Wind shear',group:'Recovery lab',subtitle:'Crosswind reverses below 110 meters',height:250,spread:35,amplitude:20,wind:.9,shear:2.4},
 {title:'Fuel reserve',group:'Recovery lab',subtitle:'Start with 38% propellant',height:165,spread:25,amplitude:12,wind:.35,fuel:.38,descentSpeed:12},
 {title:'Slow hands',group:'Recovery lab',subtitle:'Controls move at half their usual speed',height:220,spread:30,amplitude:15,wind:.6,servoScale:.5},
 {title:'Sideways entry',group:'Entry profiles',subtitle:'Six meters per second of initial cross-track speed',height:240,spread:40,amplitude:17,wind:.55,entryVX:6,entryVZ:-4,entryHeading:Math.PI/3},
 {title:'Spinning entry',group:'Entry profiles',subtitle:'Arrive already turning · arrest and recover',height:280,spread:35,amplitude:20,wind:.6,entryYaw:.8,entryHeading:Math.PI/2},
 {title:'High return',group:'Entry profiles',subtitle:'480-meter entry · 28 m/s initial descent',height:480,spread:55,amplitude:24,wind:1.1,entrySpeed:28},
 {title:'Tight storm',group:'Entry profiles',subtitle:'Eight-meter target in heavy crosswinds',height:310,spread:43,amplitude:25,wind:1.9,night:true,landingRadius:8},
 {title:'Early engine fade',group:'Fault combinations',subtitle:'Center thrust drops after two seconds',height:300,spread:38,amplitude:20,wind:.7,failure:'engine',faultAt:2,engineHealth:.48,family:'degraded'},
 {title:'Late engine fade',group:'Fault combinations',subtitle:'Center thrust drops ten seconds into approach',height:290,spread:40,amplitude:21,wind:1.1,failure:'engine',faultAt:10,engineHealth:.48,family:'degraded'},
 {title:'Blackout rendezvous',group:'Fault combinations',subtitle:'Night recovery with a dead center engine',height:340,spread:42,amplitude:22,wind:1.2,night:true,failure:'engine',faultAt:3,engineHealth:0,family:'out'},
 {title:'Last-call recovery',group:'Fault combinations',subtitle:'Engine out · jammed fin · limited fuel',height:360,spread:43,amplitude:23,wind:1.6,night:true,failure:'both',faultAt:6,engineHealth:0,fuel:.64,deckRateX:.12,family:'out'},
];
const orbital=[
 {title:'The complete round trip',group:'Orbital program',subtitle:'Launch · orbit once · deorbit · barge recovery',orbital:true,family:'orbital',orbitHeight:1000,height:0,spread:0,amplitude:0,wind:0},
 {title:'Ocean to orbit',group:'Orbital program',subtitle:'A full orbit with a moving recovery ship',orbital:true,family:'orbital',orbitHeight:1000,height:0,spread:0,amplitude:8,wind:.3},
 {title:'Higher orbit',group:'Orbital program',subtitle:'A 1,400-meter sandbox orbit and extended return',orbital:true,family:'orbital',orbitHeight:1400,height:0,spread:0,amplitude:6,wind:.2},
];
export const SCENARIOS=[...originals,...advanced,...orbital].map((c,i)=>({family:'center',group:i<8?'Flight school':c.group,night:false,entrySpeed:16,descentSpeed:18,landingRadius:11,faultAt:5,servoScale:1,...c,name:`${String(i+1).padStart(2,'0')} / ${c.title}`,storm:c.wind>=1.2,rolling:i>=3}));
export const missionFamily=scenario=>SCENARIOS[scenario].family;
export const familyProfiles=family=>SCENARIOS.flatMap((s,i)=>s.family===family?[i]:[]);
export function missionOptions(){return [...new Set(SCENARIOS.map(s=>s.group))].map(group=>`<optgroup label="${group}">${SCENARIOS.map((s,i)=>s.group===group?`<option value="${i}">${s.name}</option>`:'').join('')}</optgroup>`).join('');}
