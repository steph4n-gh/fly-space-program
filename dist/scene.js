import {deck,clamp} from './engine.js';
function fit(canvas) {
  const ratio=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);return{ctx,w,h};
}
export class FlightScene {
  constructor(canvas){this.canvas=canvas;this.particles=[];this.lastStep=-1;this.lastFlight=null;this.burst=false;}
  draw(s,time) {
    const {ctx:g,w,h}=fit(this.canvas);if(!w||!h)return;
    if(this.lastFlight!==s){this.lastFlight=s;this.particles=[];this.burst=false;}
    const sky=g.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#142037');sky.addColorStop(.6,'#253a50');sky.addColorStop(.82,'#53676e');sky.addColorStop(1,'#0d2534');g.fillStyle=sky;g.fillRect(0,0,w,h);
    const horizon=h*.79;
    const glow=g.createRadialGradient(w*.77,h*.33,2,w*.77,h*.33,w*.5);glow.addColorStop(0,'#ffc5860e');glow.addColorStop(1,'#ffd7a200');g.fillStyle=glow;g.fillRect(0,0,w,horizon);
    // Quiet stars and distant atmosphere stay outside the control model.
    for(let i=0;i<42;i++){const x=((i*3571)%997)/997*w,y=((i*1789)%431)/431*h*.5;g.fillStyle=`rgba(204,222,237,${.12+(i%5)*.055})`;g.fillRect(x,y,i%8===0?1.5:1,1);}
    g.beginPath();g.arc(w*.8,h*.24,15,0,Math.PI*2);g.fillStyle='#cfd3c055';g.fill();g.beginPath();g.arc(w*.8+7,h*.24-5,15,0,Math.PI*2);g.fillStyle='#1d2d42';g.fill();
    // Altitude marks: a real world-coordinate reference, scaled with the camera.
    const p=deck(s),viewHeight=Math.max(137,s.y+42),scale=(horizon-28)/viewHeight;
    const camX=p.x*.65+s.x*.35;
    const X=x=>w/2+(x-camX)*scale,Y=y=>horizon-y*scale;
    g.lineWidth=1;g.font='9px IBM Plex Mono,monospace';g.textAlign='left';
    for(let y=25;y<viewHeight;y+=25){const yy=Y(y);g.strokeStyle='#c0d4e413';g.setLineDash([2,6]);g.beginPath();g.moveTo(0,yy);g.lineTo(w,yy);g.stroke();g.setLineDash([]);g.fillStyle='#c0d4e444';g.fillText(`${y} m`,12,yy-5);}
    // Ocean surface and the moving landing platform.
    const sea=g.createLinearGradient(0,horizon,0,h);sea.addColorStop(0,'#243f50');sea.addColorStop(1,'#101f2d');g.fillStyle=sea;g.fillRect(0,horizon,w,h-horizon);
    for(let row=0;row<14;row++){
      const yy=horizon+row*8+(row*.4),spacing=19+row*2;
      g.strokeStyle=`rgba(137,176,191,${.15-row*.008})`;g.lineWidth=.7;
      g.beginPath();for(let x=-30;x<w+30;x+=4){const wave=Math.sin(x/spacing+time*.00065+row*1.7)*(1+row*.17);if(x===-30)g.moveTo(x,yy+wave);else g.lineTo(x,yy+wave);}g.stroke();
    }
    const shipX=X(p.x),shipY=Y(3);
    g.save();g.translate(shipX,shipY);
    g.fillStyle='#0b1724';g.beginPath();g.moveTo(-20*scale,2*scale);g.lineTo(19*scale,2*scale);g.lineTo(15*scale,7*scale);g.lineTo(-16*scale,7*scale);g.closePath();g.fill();
    g.fillStyle='#586879';g.fillRect(-20*scale,0,40*scale,2*scale);g.fillStyle='#829091';g.fillRect(-12*scale,-.4*scale,24*scale,.5*scale);
    g.strokeStyle='#c6d1cc';g.lineWidth=1;g.strokeRect(-9*scale,-.5*scale,18*scale,1.2*scale);
    for(let x of [-9,9]){g.fillStyle='#ffa351';g.fillRect(x*scale-2,-3,4,3);g.shadowColor='#ffae6b';g.shadowBlur=10;g.fillRect(x*scale-1,-4,2,2);g.shadowBlur=0;}
    // A short superstructure outside the landing area.
    g.fillStyle='#394b5b';g.fillRect(14*scale,-5*scale,5*scale,5*scale);g.fillStyle='#97c7ce';g.fillRect(14.7*scale,-4*scale,3.5*scale,.9*scale);g.strokeStyle='#617482';g.beginPath();g.moveTo(16*scale,-5*scale);g.lineTo(16*scale,-10*scale);g.stroke();g.fillStyle='#ff875f';g.fillRect(16*scale-1,-10*scale,2,2);
    g.font='8px IBM Plex Mono,monospace';g.fillStyle='#b7cbd49a';g.textAlign='center';g.fillText('OF COURSE I STILL LOVE FLIES',0,18*scale);g.restore();
    // Flight trail uses only positions actually traversed by this flight.
    if(s.trail.length>1){g.beginPath();s.trail.forEach(([x,y],i)=>i?g.lineTo(X(x),Y(y)):g.moveTo(X(x),Y(y)));g.strokeStyle='#c7dbe343';g.lineWidth=1;g.setLineDash([2,6]);g.stroke();g.setLineDash([]);}
    const rocketX=X(s.x),rocketY=Y(s.y);
    if(s.done&&!s.landed&&!this.burst){this.burst=true;for(let i=0;i<95;i++){const a=Math.random()*Math.PI*2,velocity=15+Math.random()*100;this.particles.push({x:rocketX,y:rocketY,vx:Math.cos(a)*velocity,vy:Math.sin(a)*velocity,life:1+Math.random(),age:0,size:1+Math.random()*4,hot:true});}}
    if(!s.done&&s.throttle>.05){for(let i=0;i<3;i++){const a=s.angle+s.gimbal;this.particles.push({x:rocketX-Math.sin(a)*6*scale,y:rocketY+Math.cos(a)*6*scale,vx:-Math.sin(a)*45+(Math.random()-.5)*15,vy:Math.cos(a)*45,life:.25+Math.random()*.5,age:0,size:1+Math.random()*2,hot:false});}}
    for(const q of this.particles){q.age+=.016;q.x+=q.vx*.016;q.y+=q.vy*.016;q.vy+=q.hot?30*.016:0;const alpha=Math.max(0,1-q.age/q.life);g.globalAlpha=alpha*.65;g.fillStyle=q.hot?'#ffad62':'#deba8b';g.beginPath();g.arc(q.x,q.y,q.size*(q.hot?1:1+q.age),0,Math.PI*2);g.fill();}g.globalAlpha=1;this.particles=this.particles.filter(q=>q.age<q.life);
    if(!s.done||s.landed) {
      g.save();g.translate(rocketX,rocketY);g.rotate(s.angle);g.scale(scale,scale);
      if(s.throttle>.03&&!s.done){g.save();g.translate(0,4.8);g.rotate(s.gimbal);const length=4+s.throttle*(8+Math.sin(time*.08)*2);const fire=g.createLinearGradient(0,0,0,length);fire.addColorStop(0,'#fcfaf4');fire.addColorStop(.25,'#ffd29d');fire.addColorStop(.6,'#ff883bbb');fire.addColorStop(1,'#ff692000');g.fillStyle=fire;g.beginPath();g.moveTo(-.7,0);g.quadraticCurveTo(-1.4,length*.35,0,length);g.quadraticCurveTo(1.4,length*.35,.7,0);g.closePath();g.fill();g.restore();}
      const metal=g.createLinearGradient(-1.3,0,1.3,0);metal.addColorStop(0,'#8ea4b6');metal.addColorStop(.4,'#f1f0e3');metal.addColorStop(.75,'#c8d4d7');metal.addColorStop(1,'#758a9c');g.fillStyle=metal;g.fillRect(-1.3,-5.2,2.6,9.1);
      g.beginPath();g.moveTo(-1.3,-5.2);g.quadraticCurveTo(-1.2,-6.7,0,-8);g.quadraticCurveTo(1.2,-6.7,1.3,-5.2);g.closePath();g.fill();
      g.fillStyle='#243240';g.fillRect(-1.3,-2.6,2.6,.65);g.fillRect(-1.3,2.8,2.6,.45);g.fillStyle='#e18043';g.fillRect(-1.32,-2,2.64,.2);g.fillStyle='#324652';g.fillRect(-.6,3.9,1.2,.8);
      g.strokeStyle='#b3c4c6';g.lineWidth=.3;g.beginPath();g.moveTo(-1,1.5);g.lineTo(-3.5,5);g.lineTo(-4.4,5);g.moveTo(1,1.5);g.lineTo(3.5,5);g.lineTo(4.4,5);g.stroke();
      g.fillStyle='#5e7482';g.beginPath();g.moveTo(-1.2,1);g.lineTo(-2.3,3.6);g.lineTo(-1.2,3.6);g.fill();g.beginPath();g.moveTo(1.2,1);g.lineTo(2.3,3.6);g.lineTo(1.2,3.6);g.fill();
      g.font='bold 1.1px monospace';g.textAlign='center';g.save();g.rotate(-Math.PI/2);g.fillStyle='#263747';g.fillText('F S P',0,.35);g.restore();
      if(Math.abs(s.rcs)>.08&&!s.done){const side=s.rcs>0?-1:1;g.fillStyle='#d4f2ffbd';g.beginPath();g.moveTo(side*1.3,-4);g.lineTo(side*(2+Math.abs(s.rcs)*3),-4.5);g.lineTo(side*1.3,-4.6);g.closePath();g.fill();}
      g.restore();
    }
    // Landing corridor and a lateral error readout.
    g.strokeStyle='#b4d4d33c';g.lineWidth=1;g.setLineDash([3,7]);g.beginPath();g.moveTo(shipX,Y(9));g.lineTo(shipX,Y(42));g.stroke();g.setLineDash([]);
    if(!s.done&&s.y<75){g.font='10px IBM Plex Mono,monospace';g.textAlign='left';g.fillStyle='#c7dddd99';g.fillText(`Δ ${Math.abs(s.x-p.x).toFixed(1)} m`,shipX+10,Y(22));}
    const vignette=g.createRadialGradient(w/2,h*.4,h*.15,w/2,h*.4,w*.72);vignette.addColorStop(0,'#03081600');vignette.addColorStop(1,'#03081655');g.fillStyle=vignette;g.fillRect(0,0,w,h);
  }
}
export function drawChart(canvas,history) {
  const {ctx:g,w,h}=fit(canvas);g.clearRect(0,0,w,h);
  for(let y=15;y<h;y+=25){g.strokeStyle='#98aec014';g.setLineDash([2,5]);g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}g.setLineDash([]);
  if(history.length<2){g.fillStyle='#73879c';g.font='11px IBM Plex Mono,monospace';g.fillText('Awaiting flight data',3,h/2);return;}
  const rows=history.slice(-180),min=Math.min(...rows.map(r=>r.score)),max=Math.max(...rows.map(r=>r.score)),range=Math.max(1,max-min);
  const points=rows.map((r,i)=>[i/(rows.length-1)*(w-3)+1,h-7-(r.score-min)/range*(h-15)]);
  g.beginPath();g.moveTo(points[0][0],h);points.forEach(p=>g.lineTo(...p));g.lineTo(w,h);g.closePath();const fill=g.createLinearGradient(0,0,0,h);fill.addColorStop(0,'#ff97452b');fill.addColorStop(1,'#ff974500');g.fillStyle=fill;g.fill();
  g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.lineWidth=1.5;g.strokeStyle='#eca268';g.stroke();
}
