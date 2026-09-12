// An articulated pilot, not a prerecorded animation: hands and pedals follow
// the same three commands applied by the rocket physics on the current frame.
export class CockpitView{
  constructor(canvas){this.canvas=canvas;this.history=[];this.lastStep=-1;this.lastFlight=null;}
  draw(s,time,mode){
    const canvas=this.canvas,pixel=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;if(canvas.width!==Math.round(w*pixel)||canvas.height!==Math.round(h*pixel)){canvas.width=Math.round(w*pixel);canvas.height=Math.round(h*pixel);}
    const g=canvas.getContext('2d');g.setTransform(pixel,0,0,pixel,0,0);g.clearRect(0,0,w,h);
    const X=v=>v*w,Y=v=>v*h;g.fillStyle='#0b1420';g.fillRect(0,0,w,h);
    const ambient=g.createRadialGradient(w*.5,h*.45,1,w*.5,h*.45,w*.55);ambient.addColorStop(0,'#243747');ambient.addColorStop(1,'#0b142000');g.fillStyle=ambient;g.fillRect(0,0,w,h);
    // Seat and inset flight console.
    g.fillStyle='#1f2c3b';g.strokeStyle='#3c4c5e';g.lineWidth=1;g.beginPath();g.roundRect(X(.36),Y(.4),X(.28),Y(.5),16);g.fill();g.stroke();
    g.fillStyle='#131f2e';g.beginPath();g.roundRect(X(.03),Y(.08),X(.94),Y(.47),12);g.fill();g.strokeStyle='#2f4358';g.stroke();
    g.fillStyle='#223449';g.fillRect(X(.08),Y(.12),X(.23),Y(.035));g.fillRect(X(.69),Y(.12),X(.23),Y(.035));
    for(let i=0;i<6;i++){g.fillStyle=i<s.throttle*6?'#f5a85d':'#394859';g.fillRect(X(.09+i*.034),Y(.126),X(.022),Y(.022));}
    g.font='10px IBM Plex Mono,monospace';g.textAlign='center';g.fillStyle='#899eaf';g.fillText('THROTTLE',X(.2),Y(.06));g.fillText('GIMBAL',X(.8),Y(.06));
    // Left hand physically rides the throttle handle.
    const throttle=s.done?0:s.throttle,rcs=s.done?0:s.rcs,gimbal=s.done?0:s.gimbal/.22;
    const left=[X(.2),Y(.43-throttle*.19)],right=[X(.8+gimbal*.065),Y(.29-Math.abs(gimbal)*.018)];
    g.fillStyle='#070d14';g.beginPath();g.roundRect(X(.175),Y(.21),X(.05),Y(.24),5);g.fill();g.strokeStyle='#526174';g.lineWidth=1;g.beginPath();g.moveTo(X(.2),Y(.22));g.lineTo(X(.2),Y(.44));g.stroke();
    g.strokeStyle='#a6b7bd';g.lineWidth=4;g.beginPath();g.moveTo(...left);g.lineTo(X(.2),left[1]+Y(.04));g.stroke();g.fillStyle='#ffa45b';g.beginPath();g.roundRect(left[0]-X(.045),left[1]-4,X(.09),8,3);g.fill();
    // Right-hand stick moves in the commanded direction.
    g.fillStyle='#25374a';g.beginPath();g.ellipse(X(.8),Y(.43),X(.07),Y(.028),0,0,Math.PI*2);g.fill();g.strokeStyle='#a9b9bd';g.lineWidth=5;g.beginPath();g.moveTo(X(.8),Y(.43));g.lineTo(...right);g.stroke();g.fillStyle='#e9aa69';g.beginPath();g.ellipse(...right,X(.024),Y(.04),-.15*gimbal,0,Math.PI*2);g.fill();
    const pedalL=[X(.28),Y(.86-Math.max(0,-rcs)*.04)],pedalR=[X(.72),Y(.86-Math.max(0,rcs)*.04)];
    for(const [p,amount] of [[pedalL,Math.max(0,-rcs)],[pedalR,Math.max(0,rcs)]]){g.fillStyle=amount>.08?'#44756f':'#263c4a';g.strokeStyle='#567780';g.beginPath();g.roundRect(p[0]-X(.055),p[1]-Y(.027),X(.11),Y(.055),4);g.fill();g.stroke();for(let j=-1;j<=1;j++){g.strokeStyle='#a2bec155';g.beginPath();g.moveTo(p[0]-X(.035),p[1]+j*4);g.lineTo(p[0]+X(.035),p[1]+j*4);g.stroke();}}
    // Wings and their veins are attached to the animated insect body.
    for(const side of [-1,1]){g.save();g.translate(X(.5+side*.12),Y(.53));g.rotate(side*.45);g.fillStyle='#b4d9df25';g.strokeStyle='#c2e5e247';g.lineWidth=1;g.beginPath();g.ellipse(0,0,X(.14),Y(.065),0,0,Math.PI*2);g.fill();g.stroke();for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(-X(.1),0);g.quadraticCurveTo(0,Y(i*.022),X(.115),Y(i*.016));g.stroke();}g.restore();}
    const limb=(shoulder,elbow,hand,color='#9eb3a4')=>{g.lineCap='round';g.lineJoin='round';g.strokeStyle='#060e14';g.lineWidth=7;g.beginPath();g.moveTo(...shoulder);g.lineTo(...elbow);g.lineTo(...hand);g.stroke();g.strokeStyle=color;g.lineWidth=3;g.stroke();g.fillStyle='#c5cab0';g.beginPath();g.arc(...elbow,2.7,0,Math.PI*2);g.fill();g.strokeStyle='#a7b8a1';g.lineWidth=1.6;g.beginPath();g.moveTo(hand[0]-3,hand[1]+2);g.lineTo(hand[0],hand[1]-2);g.lineTo(hand[0]+4,hand[1]+1);g.stroke();};
    // Six limbs: the forelegs work the controls; hind legs work attitude pedals.
    limb([X(.46),Y(.63)],[X(.37),Y(.75)],pedalL);limb([X(.54),Y(.63)],[X(.63),Y(.75)],pedalR);
    limb([X(.44),Y(.51)],[X(.34),Y(.62)],[X(.29),Y(.68)],'#667f78');limb([X(.56),Y(.51)],[X(.66),Y(.62)],[X(.71),Y(.68)],'#667f78');
    // Abdomen, thorax, and recognizable compound eyes.
    const abdomen=g.createLinearGradient(X(.44),0,X(.57),0);abdomen.addColorStop(0,'#435345');abdomen.addColorStop(.45,'#95a27d');abdomen.addColorStop(1,'#30433e');g.fillStyle=abdomen;g.beginPath();g.ellipse(X(.5),Y(.62),X(.061),Y(.16),0,0,Math.PI*2);g.fill();
    g.strokeStyle='#253932';g.lineWidth=3;for(const y of [.56,.61,.66,.7]){g.beginPath();g.ellipse(X(.5),Y(y),X(.052-(y-.56)*.10),Y(.022),0,.1,Math.PI-.1);g.stroke();}
    const thorax=g.createRadialGradient(X(.48),Y(.42),1,X(.5),Y(.46),X(.083));thorax.addColorStop(0,'#a7aa89');thorax.addColorStop(.55,'#687c68');thorax.addColorStop(1,'#253f37');g.fillStyle=thorax;g.beginPath();g.ellipse(X(.5),Y(.46),X(.07),Y(.09),0,0,Math.PI*2);g.fill();
    // Little flight harness, leaving the insect's anatomy legible.
    g.strokeStyle='#e99751';g.lineWidth=3;g.beginPath();g.moveTo(X(.455),Y(.42));g.lineTo(X(.53),Y(.52));g.moveTo(X(.545),Y(.42));g.lineTo(X(.47),Y(.52));g.stroke();g.fillStyle='#e5dcc0';g.fillRect(X(.484),Y(.465),X(.032),Y(.032));
    limb([X(.45),Y(.42)],[X(.34),Y(.31+throttle*.035)],left);limb([X(.55),Y(.42)],[X(.665),Y(.32-Math.abs(gimbal)*.025)],right);
    g.fillStyle='#81937b';g.beginPath();g.ellipse(X(.5),Y(.325),X(.072),Y(.075),0,0,Math.PI*2);g.fill();
    for(const side of [-1,1]){g.save();g.translate(X(.5+side*.047),Y(.308));g.rotate(side*.18);const eye=g.createRadialGradient(-X(.008),-Y(.012),0,0,0,X(.04));eye.addColorStop(0,'#ffa28a');eye.addColorStop(.28,'#d15b4d');eye.addColorStop(1,'#5d2532');g.fillStyle=eye;g.beginPath();g.ellipse(0,0,X(.033),Y(.061),0,0,Math.PI*2);g.fill();g.fillStyle='#efb99833';for(let row=-2;row<=2;row++)for(let col=-1;col<=1;col++){g.beginPath();g.arc(col*X(.014)+(row%2)*2,row*Y(.018),1,0,Math.PI*2);g.fill();}g.restore();}
    g.strokeStyle='#bac3a4';g.lineWidth=1.4;for(const side of [-1,1]){g.beginPath();g.moveTo(X(.5+side*.015),Y(.269));g.quadraticCurveTo(X(.5+side*.025),Y(.23),X(.5+side*.047),Y(.224));g.stroke();}
    g.fillStyle='#b8bd9e';g.beginPath();g.ellipse(X(.5),Y(.27),X(.012),Y(.025),0,0,Math.PI*2);g.fill();
    g.font='11px IBM Plex Mono,monospace';g.textAlign='center';g.fillStyle='#a6b9cb';g.fillText(`${Math.round(throttle*100)}%`,X(.2),Y(.55));g.fillText(`${(gimbal*.22*180/Math.PI).toFixed(1)}°`,X(.8),Y(.55));g.font='10px IBM Plex Mono,monospace';g.fillStyle='#718da3';g.fillText('ATTITUDE JETS',X(.5),Y(.965));
    if(mode==='human'){g.fillStyle='#07111abf';g.fillRect(0,0,w,26);g.fillStyle='#d4dfdf';g.font='11px IBM Plex Mono,monospace';g.fillText('HUMAN OVERRIDE · YOUR INPUTS',w/2,17);}
    if(this.lastFlight!==s){this.history=[];this.lastFlight=s;this.lastStep=-1;}
    if(s.step!==this.lastStep){this.history.push([s.t,s.throttle,s.gimbal/.22,s.rcs]);if(this.history.length>180)this.history.shift();this.lastStep=s.step;}
  }
  drawTrace(canvas){
    const pixel=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;if(canvas.width!==Math.round(w*pixel)||canvas.height!==Math.round(h*pixel)){canvas.width=Math.round(w*pixel);canvas.height=Math.round(h*pixel);}const g=canvas.getContext('2d');g.setTransform(pixel,0,0,pixel,0,0);g.clearRect(0,0,w,h);
    const names=['THRUST','GIMBAL','RCS'],colors=['#f4a25d','#83dac8','#a897e6'];
    for(let k=0;k<3;k++){const y=14+k*(h/3);g.fillStyle='#899eb1';g.font='10px IBM Plex Mono,monospace';g.fillText(names[k],1,y+3);g.strokeStyle='#304456';g.lineWidth=.7;g.beginPath();g.moveTo(60,y);g.lineTo(w,y);g.stroke();if(this.history.length>1){g.strokeStyle=colors[k];g.lineWidth=1.2;g.beginPath();this.history.forEach((r,i)=>{const x=62+i/(this.history.length-1)*(w-65),v=k===0?r[1]*2-1:r[k+1],yy=y-v*9;i?g.lineTo(x,yy):g.moveTo(x,yy);});g.stroke();}}
  }
}
