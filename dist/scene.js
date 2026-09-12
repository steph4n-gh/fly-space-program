function fit(canvas) {
  const ratio=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);return{ctx,w,h};
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
