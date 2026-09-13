// The embodied pilot receives light at the eyes and sensations from its body.
// World coordinates, mission guidance, velocity and fuel values are not inputs.
export const RETINA_WIDTH=32,RETINA_HEIGHT=24,EYE_PIXELS=RETINA_WIDTH*RETINA_HEIGHT;
export const BODY_SIGNALS=[
 ['Left foreleg · throttle position','%','Lever centered'],
 ['Right foreleg · gimbal X position','%','Stick centered'],
 ['Right foreleg · gimbal Z position','%','Stick centered'],
 ['Left hindleg · attitude pedal','%','Pedal centered'],
 ['Right hindleg · attitude pedal','%','Pedal centered'],
 ['Hindlegs · yaw pedal','%','Pedal centered'],
 ['Right middle leg · fin X lever','%','Lever centered'],
 ['Right middle leg · fin Z lever','%','Lever centered'],
 ['Left middle leg · engine selector','%','Selector centered'],
 ['Neck · head position','%','Looking forward'],
 ['Haltere analogue · pitch rotation','rad/s','No pitch rotation'],
 ['Haltere analogue · roll rotation','rad/s','No roll rotation'],
 ['Haltere analogue · yaw rotation','rad/s','No yaw rotation'],
 ['Body load · longitudinal','g','No longitudinal load'],
 ['Body load · lateral X','g','No X load'],
 ['Body load · lateral Z','g','No Z load'],
 ['Touch · contact load','relative','No contact'],
 ['Vibration · engine sound','relative','Quiet'],
 ['Ethyl acetate · left antenna','relative','No odor'],
 ['Ethyl acetate · right antenna','relative','No odor'],
 ['Geosmin · left antenna','relative','No odor'],
 ['Geosmin · right antenna','relative','No odor'],
];
export const EMBODIED_INPUTS=EYE_PIXELS*2+BODY_SIGNALS.length;
export const EMBODIED_SCHEMA='retina-body-1558-v1';
export const EMBODIED_CONTROLLER='malecns-embodied-rate-v1';
export const PERCEPTION_SIGNALS=[['Left eye · mean light','%','Left eye covered'],['Right eye · mean light','%','Right eye covered'],...BODY_SIGNALS];
export const SENSORY_GROUPS=[Array.from({length:EYE_PIXELS},(_,i)=>i),Array.from({length:EYE_PIXELS},(_,i)=>i+EYE_PIXELS),...BODY_SIGNALS.map((_,i)=>[EYE_PIXELS*2+i])];
