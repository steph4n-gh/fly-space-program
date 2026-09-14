import * as T from './vendor/three.module.js?v=9.5';

// Authored mesh assets. Geometry is shared or instanced where parts repeat.
export const palette={ivory:'#e5e9e4',titanium:'#374b58',dark:'#102332',copper:'#996746',amber:'#f3a358',ruby:'#b62622',glass:'#16394c'};
export const material=(color,roughness=.55,metalness=.1)=>new T.MeshStandardMaterial({color,roughness,metalness});
const unitBox=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,28,20),cylinder=new T.CylinderGeometry(1,1,1,16);
export const M={ivory:material(palette.ivory,.45,.28),dark:material(palette.dark,.55,.3),metal:material('#76909d',.32,.8),black:material('#142430',.66,.3),amber:material('#e79745',.38,.32),copper:material(palette.copper,.38,.48),rubber:material('#101b21',.9,.05)};
export function mesh(parent,geometry,mat,position=[0,0,0],scale=[1,1,1]){const m=new T.Mesh(geometry,mat);m.position.set(...position);m.scale.set(...scale);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
export function box(parent,mat,position,scale){return mesh(parent,unitBox,mat,position,scale);}
export function ellipsoid(parent,mat,position,scale){return mesh(parent,sphere,mat,position,scale);}
const va=new T.Vector3(),vb=new T.Vector3(),vdir=new T.Vector3(),vnorm=new T.Vector3(),up=new T.Vector3(0,1,0);
export function moveRod(m,a,b,r){va.set(...a);vb.set(...b);vdir.subVectors(vb,va);m.position.copy(va.add(vb).multiplyScalar(.5));m.quaternion.setFromUnitVectors(up,vnorm.copy(vdir).normalize());m.scale.set(r,vdir.length(),r);}
export function rod(parent,a,b,r,mat=M.metal){const m=mesh(parent,cylinder,mat);moveRod(m,a,b,r);return m;}
export function tube(parent,points,r,mat=M.metal){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(parent,new T.TubeGeometry(curve,Math.max(8,points.length*4),r,5,false),mat);}
export function bevelBox(w,h,d,r=.08){
 const s=new T.Shape(),x=-w/2+r,y=-h/2+r,W=w-2*r,H=h-2*r;
 s.moveTo(x,y-r);s.lineTo(x+W,y-r);s.quadraticCurveTo(x+W+r,y-r,x+W+r,y);s.lineTo(x+W+r,y+H);s.quadraticCurveTo(x+W+r,y+H+r,x+W,y+H+r);s.lineTo(x,y+H+r);s.quadraticCurveTo(x-r,y+H+r,x-r,y+H);s.lineTo(x-r,y);s.quadraticCurveTo(x-r,y-r,x,y-r);
 const g=new T.ExtrudeGeometry(s,{depth:Math.max(.01,d-2*r),bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r*.35,bevelThickness:r,curveSegments:4});g.translate(0,0,-d/2+r);return g;
}
export function batch(parent,geometry,mat,items){const m=new T.InstancedMesh(geometry,mat,items.length),o=new T.Object3D();items.forEach((item,i)=>{o.position.set(...item.p);o.scale.set(...(item.s??[1,1,1]));o.rotation.set(...(item.r??[0,0,0]));o.updateMatrix();m.setMatrixAt(i,o.matrix);});m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
export function decal(text,{color='#c7e0e7',background=null,width=1024,height=256,size=82}={}){
 const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.clearRect(0,0,width,height);if(background){g.fillStyle=background;g.fillRect(0,0,width,height);}g.fillStyle=color;g.font=`600 ${size}px sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,width/2,height/2,width*.9);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return new T.MeshBasicMaterial({map:tex,transparent:!background,side:T.DoubleSide,depthWrite:false});
}
export function createPod(parent,cutaway=false){
 const p=new T.Group();p.name='Dragonfly crew capsule';parent.add(p);
 const profile=[[1.24,0],[1.31,.14],[1.30,.30],[1.2,.65],[1.02,1.20],[.78,1.79],[.45,2.17],[.15,2.35],[0,2.36]].map(v=>new T.Vector2(...v));
 const shell=mesh(p,new T.LatheGeometry(profile,56,cutaway?Math.PI*.5:0,cutaway?Math.PI:Math.PI*2),cutaway?material('#607785',.58,.28):M.ivory);shell.material.side=T.DoubleSide;
 mesh(p,new T.CylinderGeometry(1.32,1.28,.16,56),M.black,[0,.03,0]);
 for(const y of [.22,.42]){const ring=mesh(p,new T.TorusGeometry(y===.22?1.29:1.265,.018,5,56,cutaway?Math.PI:Math.PI*2),M.metal,[0,y,0]);ring.rotation.x=Math.PI/2;ring.rotation.z=cutaway?Math.PI/2:0;}
 if(!cutaway){for(const side of [-1,1]){const win=ellipsoid(p,new T.MeshPhysicalMaterial({color:'#103650',roughness:.12,metalness:.45,clearcoat:1}),[side*.57,1.53,.62],[.31,.32,.065]);win.rotation.y=side*.42;const rim=mesh(p,new T.TorusGeometry(.295,.026,6,28),M.dark,[side*.57,1.53,.675],[1,1.05,.7]);rim.rotation.y=side*.42;}
  const hatch=mesh(p,new T.TorusGeometry(.29,.025,5,32),M.metal,[0,.86,1.13],[1,1.3,1]);mesh(p,new T.PlaneGeometry(.34,.1),decal('FSP / 01',{size:60}),[0,.86,1.16]);
 }
 rod(p,[0,2.34,0],[.06,2.85,0],.019);ellipsoid(p,M.amber,[.06,2.86,0],[.055,.055,.055]);
 p.userData.antennaTip=p.children[p.children.length-1];return p;
}
export function createRocket(deckTexture){
 const root=new T.Group();root.name='FSP Kestrel booster';
 const body=mesh(root,new T.CylinderGeometry(1.83,1.83,40.7,64),new T.MeshStandardMaterial({map:deckTexture,roughness:.49,metalness:.25}),[0,25.7,0]);
 mesh(root,new T.CylinderGeometry(1.88,1.88,4.2,64),M.dark,[0,45.9,0]);
 const ringItems=[];for(const y of [5.35,7.6,15.3,21.5,30,37.6,43.65,47.9]){const ring=mesh(root,new T.TorusGeometry(1.833,.023,5,64),M.metal,[0,y,0]);ring.rotation.x=Math.PI/2;for(let j=0;j<18;j++)ringItems.push({p:[Math.cos(j*Math.PI/9)*1.842,y+.1,Math.sin(j*Math.PI/9)*1.842],s:[.021,.021,.021]});}
 batch(root,sphere,M.metal,ringItems);
 for(const a of [1.8,4.3]){rod(root,[Math.cos(a)*1.854,8,Math.sin(a)*1.854],[Math.cos(a)*1.854,42,Math.sin(a)*1.854],.062,M.ivory);const side=box(root,M.ivory,[Math.cos(a)*1.87,23,Math.sin(a)*1.87],[.2,9,.24]);side.rotation.y=-a;}
 for(const y of [8.3,43.5])mesh(root,new T.CylinderGeometry(1.843,1.843,.42,64),M.amber,[0,y,0]);
 mesh(root,new T.CylinderGeometry(1.81,1.66,2.1,40),M.black,[0,4.55,0]);
 const vents=[];for(let i=0;i<24;i++){const a=i*Math.PI/12;vents.push({p:[Math.cos(a)*1.83,44.65,Math.sin(a)*1.83],s:[.2,.45,.055],r:[0,Math.PI/2-a,0]});}batch(root,unitBox,M.rubber,vents);
 const badge=mesh(root,new T.PlaneGeometry(1.8,6),decal('F S P',{color:'#172a36',width:256,height:1024,size:80}),[0,30,1.835]);badge.rotation.z=-Math.PI/2;badge.scale.set(.9,.33,1);
 const pod=createPod(root);pod.position.y=48;pod.scale.setScalar(.97);
 const fins=[];for(let i=0;i<4;i++){const a=i*Math.PI/2,pivot=new T.Group();pivot.position.set(Math.cos(a)*1.86,40.5,Math.sin(a)*1.86);pivot.rotation.y=-a;root.add(pivot);rod(pivot,[0,0,0],[1.1,0,0],.12,M.black);const panel=new T.Group();panel.position.x=1.7;pivot.add(panel);const cells=[];for(const side of [-1,1]){cells.push({p:[side*1.25,0,0],s:[.16,.25,2.35]},{p:[0,0,side*1.13],s:[2.65,.25,.14]});}for(let j=0;j<8;j++)cells.push({p:[-1.05+j*.3,0,0],s:[.048,.23,2.14]});for(let j=0;j<7;j++)cells.push({p:[0,0,-.97+j*.32],s:[2.35,.23,.048]});batch(panel,unitBox,M.dark,cells);box(pivot,M.metal,[.22,0,0],[.45,.35,.44]);fins.push(pivot);}
 const legs=[];for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,leg=new T.Group();leg.position.set(Math.cos(a)*1.67,11.5,Math.sin(a)*1.67);leg.rotation.y=-a;root.add(leg);const whiteStrut=mesh(leg,new T.CylinderGeometry(.13,.23,9.8,12),M.ivory,[2.1,-4.4,0]);whiteStrut.rotation.z=.46;const inner=rod(leg,[.05,-5.0,0],[4.42,-9.18,0],.11,M.metal);const foot=mesh(leg,bevelBox(1.7,.3,1.5,.09),M.black,[4.45,-9.2,0]);box(leg,M.metal,[4.45,-9,0],[1.2,.15,1.1]);ellipsoid(leg,M.metal,[0,0,0],[.28,.32,.3]);legs.push(leg);}
 const engines=[];for(let i=0;i<9;i++){const a=(i-1)*Math.PI/4,e=new T.Group();e.name='Engine '+i;e.position.set(i?Math.cos(a)*1.05:0,4.2,i?Math.sin(a)*1.05:0);root.add(e);const bellProfile=[[.26,0],[.22,-.18],[.24,-.44],[.34,-.77],[.48,-1.18],[.49,-1.28]].map(v=>new T.Vector2(...v));mesh(e,new T.LatheGeometry(bellProfile,24),new T.MeshStandardMaterial({color:'#536675',roughness:.38,metalness:.86,side:T.DoubleSide}));mesh(e,new T.CylinderGeometry(.45,.46,.035,24),M.rubber,[0,-1.23,0]);for(const y of [-.13,-.6,-1.25]){const r=mesh(e,new T.TorusGeometry(y===-1.25?.485:y===-.6?.29:.25,.018,5,24),M.metal,[0,y,0]);r.rotation.x=Math.PI/2;}tube(e,[[.2,.1,.1],[.45,-.1,.2],[.4,-.5,.25],[.25,-.7,.2]],.025,M.copper);engines.push(e);}
 return{root,pod,fins,legs,engines};
}
export function createBarge(texture){
 const root=new T.Group();root.name='Pelagic recovery vessel';
 const shape=new T.Shape();shape.moveTo(-27,-36);shape.lineTo(-23,-43);shape.lineTo(23,-43);shape.lineTo(27,-36);shape.lineTo(27,39);shape.quadraticCurveTo(27,42,24,42);shape.lineTo(-24,42);shape.quadraticCurveTo(-27,42,-27,39);shape.closePath();
 const hull=mesh(root,new T.ExtrudeGeometry(shape,{depth:3,bevelEnabled:true,bevelThickness:.35,bevelSize:.3,bevelSegments:2,steps:1}),M.dark);hull.rotation.x=Math.PI/2;hull.position.y=1.9;
 const deck=mesh(root,new T.PlaneGeometry(53.6,83.6),new T.MeshStandardMaterial({map:texture,roughness:.78,metalness:.34}),[0,2.28,0]);deck.rotation.x=-Math.PI/2;deck.castShadow=false;
 const rails=[];for(const side of [-1,1]){for(let z=-39;z<=39;z+=4.5){rails.push({p:[side*26.65,3.0,z],s:[.11,1.4,.11]});rails.push({p:[side*27.55,.7,z],s:[1,2.9,2.2]});}rod(root,[side*26.65,3.7,-40],[side*26.65,3.7,40],.07);rod(root,[side*26.65,3.0,-40],[side*26.65,3.0,40],.045);}
 batch(root,unitBox,M.rubber,rails);
 const lights=[];for(let z=-36;z<=36;z+=9)for(const x of [-25,25])lights.push({p:[x,2.38,z],s:[.25,.08,1.2]});batch(root,unitBox,new T.MeshBasicMaterial({color:'#ccebe5'}),lights);
 for(const x of [-24,24])for(const z of [-38,38]){mesh(root,new T.CylinderGeometry(.36,.45,.6,12),M.metal,[x,2.7,z]);mesh(root,new T.CylinderGeometry(.25,.25,.3,12),new T.MeshBasicMaterial({color:'#ffb653'}),[x,3.12,z]);}
 for(const [x,z,w,d] of [[-20,-30,7,16],[18.7,-30,10,17]]){mesh(root,bevelBox(w,3.3,d,.16),x<0?M.amber:M.ivory,[x,4,z]);const vents=[];for(let zz=z-d/2+1;zz<z+d/2;zz+=1)vents.push({p:[x-w/2-.1,4,zz],s:[.08,2.9,.07]});batch(root,unitBox,x<0?M.copper:M.metal,vents);}
 mesh(root,bevelBox(8,3,10,.15),M.ivory,[19,7.2,-32]);box(root,new T.MeshPhysicalMaterial({color:'#0d4059',roughness:.12,metalness:.45,clearcoat:1}),[19,7.5,-26.92],[7,1.25,.08]);rod(root,[21,8.8,-33],[21,19,-33],.15);rod(root,[18,15.5,-33],[24,15.5,-33],.07);mesh(root,new T.CylinderGeometry(.7,.7,.15,20),M.ivory,[21,19,-33]);
 for(const x of [-20,20])for(const z of [30,35]){mesh(root,new T.CylinderGeometry(.3,.3,.7,12),M.metal,[x,2.7,z]);rod(root,[x-.65,3.0,z],[x+.65,3.0,z],.15,M.metal);}
 mesh(root,new T.PlaneGeometry(37,2.8),decal('PELAGIC / FSP RECOVERY',{size:65}),[0,.6,42.35]);return root;
}
export function createFly(parent){
 const root=new T.Group();root.position.set(0,1.1,.05);root.name='Drosophila pilot';parent.add(root);
 const chitin=new T.MeshPhysicalMaterial({color:'#9d7149',roughness:.43,metalness:.18,clearcoat:.65,clearcoatRoughness:.3});
 const thorax=ellipsoid(root,chitin,[0,.46,-.01],[.47,.61,.50]);
 // Abdomen plates taper toward the rear and retain an insect silhouette.
 for(let i=0;i<6;i++){const f=1-i*.095;ellipsoid(root,i%2?M.dark:chitin,[0,.18-i*.033,-.39-i*.19],[.43*f,.31*f,.23]);}
 tube(root,[[-.3,.87,.06],[-.22,.95,-.13],[0,1.01,-.23],[.22,.95,-.13],[.3,.87,.06]],.022,M.dark);
 const head=new T.Group();head.position.set(0,1.38,.25);root.add(head);
 const headSkin=ellipsoid(head,chitin.clone(),[0,0,0],[.49,.4,.35]);
 const eyes=[];for(const side of [-1,1]){const e=new T.Group();e.position.set(side*.37,.06,.16);e.rotation.y=side*.29;head.add(e);const eyeMat=new T.MeshPhysicalMaterial({color:'#b52a21',roughness:.25,metalness:.15,clearcoat:1,clearcoatRoughness:.18});const eye=mesh(e,new T.IcosahedronGeometry(1,4),eyeMat,[0,0,0],[.335,.43,.30]);const facet=new T.LineSegments(new T.WireframeGeometry(new T.IcosahedronGeometry(1,3)),new T.LineBasicMaterial({color:'#ef875b',transparent:true,opacity:.085}));facet.scale.set(.337,.432,.302);e.add(facet);ellipsoid(e,new T.MeshBasicMaterial({color:'#fff0d7',transparent:true,opacity:.85}),[-.085,.18,.248],[.045,.075,.018]);eyes.push(e);}
 const antennae=[];for(const side of [-1,1]){const a=new T.Group();a.position.set(side*.16,.21,.30);head.add(a);ellipsoid(a,chitin,[side*.03,.1,.05],[.055,.14,.07]);rod(a,[side*.03,.17,.05],[side*.19,.50,.12],.014,M.dark);for(let i=0;i<5;i++)rod(a,[side*(.06+i*.025),.23+i*.045,.08],[side*(.15+i*.034),.28+i*.045,.10],.005,M.dark);antennae.push(a);}
 const mouth=ellipsoid(head,M.copper,[0,-.31,.34],[.095,.12,.10]);ellipsoid(head,M.dark,[0,-.34,.425],[.075,.045,.025]);
 // Fine bristles are grouped into one geometry, not hundreds of draw calls.
 const hair=[];for(let i=0;i<110;i++){const u=i*2.39996,y=1-2*(i+.5)/110,r=Math.sqrt(1-y*y),x=Math.cos(u)*r*.46,z=Math.sin(u)*r*.49;hair.push(x,.45+y*.58,z,x*1.075,.45+y*.62,z*1.10);}const bristles=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(hair,3)),new T.LineBasicMaterial({color:'#332b24',transparent:true,opacity:.65}));root.add(bristles);
 const wings=[];for(const side of [-1,1]){const wing=new T.Group();wing.position.set(side*.29,.76,-.14);wing.rotation.y=side*.38;root.add(wing);const outline=[[0,0],[side*.35,-.28],[side*.78,-1.1],[side*.70,-1.72],[side*.46,-1.95],[side*.17,-1.80],[0,-.8]];const shape=new T.Shape(outline.map(([x,z])=>new T.Vector2(x,z)));const g=new T.ShapeGeometry(shape,14);g.rotateX(Math.PI/2);const wm=new T.MeshPhysicalMaterial({color:'#bed9de',transparent:true,opacity:.25,roughness:.19,metalness:.12,side:T.DoubleSide,depthWrite:false,iridescence:.6});mesh(wing,g,wm);const veinMat=material('#92b9ba',.4,.25);tube(wing,outline.map(([x,z])=>[x,-.008,z]).concat([[0,-.008,0]]),.008,veinMat);for(let j=0;j<4;j++)tube(wing,[[0,0,0],[side*(.13+j*.10),-.008,-.55],[side*(.17+j*.16),-.008,-1.35],[side*(.18+j*.14),-.008,-1.75]],.006,veinMat);tube(wing,[[side*.10,0,-.75],[side*.5,0,-.9],[side*.7,0,-1.13]],.005,veinMat);wings.push(wing);}
 // Small halteres and the flight harness remain clearly separate from biology.
 for(const side of [-1,1]){rod(root,[side*.42,.5,-.25],[side*.67,.42,-.41],.017,chitin);ellipsoid(root,chitin,[side*.68,.42,-.42],[.06,.07,.06]);tube(root,[[side*.3,.9,.25],[side*.37,.58,.49],[side*.18,.15,.47]],.038,M.amber);}
 mesh(root,bevelBox(.22,.18,.055,.025),M.metal,[0,.31,.505]);rod(root,[-.37,.31,.42],[.37,.31,.42],.027,M.dark);
 const limbs=[];for(let i=0;i<6;i++){const side=i%2?1:-1,level=Math.floor(i/2),start=[side*.42,1.99-level*.40,.18-level*.19],upper=rod(parent,start,[side,.8,1],.055,chitin.clone()),lower=rod(parent,[side,.8,1],[side*1.4,1,1.4],.035,chitin.clone()),tarsus=rod(parent,[side*1.4,1,1.4],[side*1.4,1,1.6],.023,chitin.clone()),foot=ellipsoid(parent,chitin.clone(),[0,0,0],[.085,.05,.12]),joint=ellipsoid(parent,M.dark,[0,0,0],[.065,.065,.065]);for(const part of [upper,lower,tarsus,foot,joint])part.userData.limb=i;const claws=[];for(const k of [-1,1])claws.push(rod(parent,[0,0,0],[0,.06,0],.009,M.dark));limbs.push({side,level,start,upper,lower,tarsus,foot,joint,claws});}
 return{root,head,headSkin,eyes,antennae,mouth,wings,limbs};
}
export function createCockpit(scene){
 const shell=new T.Group();shell.name='Crew pod interior';scene.add(shell);
 // An open sectional shell keeps the pilot and every control visible.
 const body=mesh(shell,new T.CylinderGeometry(2.42,2.9,4.9,56,1,true,Math.PI*.5,Math.PI),new T.MeshStandardMaterial({color:'#415d6d',roughness:.62,metalness:.35,side:T.DoubleSide}),[0,1.78,-.35]);
 const lining=mesh(shell,new T.CylinderGeometry(2.36,2.84,4.8,56,1,true,Math.PI*.5,Math.PI),new T.MeshStandardMaterial({color:'#182f40',roughness:.73,metalness:.15,side:T.DoubleSide}),[0,1.78,-.34]);
 const ribMat=material('#bdcacb',.36,.58);for(const y of [-.5,1.0,2.8,4.2]){const curve=[];for(let i=0;i<=32;i++){const a=Math.PI/2+i*Math.PI/32;curve.push([Math.sin(a)*(2.87-(y+.5)*.1),y,Math.cos(a)*(2.87-(y+.5)*.1)-.35]);}tube(shell,curve,.035,ribMat);}
 const seam=[];for(let j=0;j<9;j++){const a=Math.PI/2+j*Math.PI/8;for(let i=0;i<5;i++)seam.push({p:[Math.sin(a)*(2.74-i*.08),.1+i*.78,Math.cos(a)*(2.74-i*.08)-.35],s:[.018,.035,.018]});}batch(shell,sphere,M.metal,seam);
 const lightMat=new T.MeshBasicMaterial({color:'#a9dfe9'});for(const x of [-1.95,1.95])tube(shell,[[x,-.2,-1.8],[x,1.2,-1.75],[x*.84,3.4,-1.68]],.025,lightMat);
 mesh(scene,new T.CylinderGeometry(2.91,3.0,.18,56),M.dark,[0,-.58,-.35]);const floorLines=[];for(let i=-5;i<=5;i++)floorLines.push({p:[i*.48,-.473,.15],s:[.012,.005,3.5]});batch(scene,unitBox,M.metal,floorLines);
 const seat=new T.Group();scene.add(seat);mesh(seat,bevelBox(1.36,1.9,.28,.15),M.ivory,[0,1.35,-.62]);mesh(seat,bevelBox(1.06,1.5,.13,.1),M.rubber,[0,1.34,-.43]);mesh(seat,bevelBox(1.38,.23,1.23,.1),M.ivory,[0,.49,-.13]);mesh(seat,bevelBox(1.18,.12,1.02,.07),M.rubber,[0,.65,-.06]);for(const side of [-1,1])rod(seat,[side*.51,-.43,-.45],[side*.51,.43,-.12],.07,M.metal);
 const console=new T.Group();scene.add(console);mesh(console,bevelBox(4.5,.24,1.18,.12),M.dark,[0,.90,1.7]);box(console,M.metal,[0,.68,1.7],[4.0,.16,.75]);for(const side of [-1,1]){rod(console,[side*1.6,-.42,1.6],[side*1.6,.72,1.7],.055);mesh(console,bevelBox(.42,.65,1.0,.05),M.ivory,[side*1.94,1.17,1.56]);}
 const screens=[];for(const x of [-1.35,0,1.35]){const mount=new T.Group();mount.position.set(x,1.22,1.77);mount.rotation.x=-1.5;console.add(mount);mesh(mount,bevelBox(1.2,.79,.11,.05),M.black);const canvas=document.createElement('canvas');canvas.width=768;canvas.height=448;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.center.set(.5,.5);mesh(mount,new T.PlaneGeometry(1.08,.66),new T.MeshBasicMaterial({map:texture}),[0,0,.066]);for(const side of [-1,1])ellipsoid(mount,M.metal,[side*.545,.335,.06],[.025,.025,.01]);screens.push({canvas,texture});}
 const buttons=[];for(let i=0;i<14;i++)buttons.push({p:[-1.72+i*.265,1.035,2.31],s:[.12,.05,.10]});batch(console,unitBox,M.metal,buttons);for(const side of [-1,1]){mesh(console,new T.CylinderGeometry(.075,.075,.10,18),M.amber,[side*2.01,1.58,1.30]);}
 const throttleBase=mesh(scene,bevelBox(.49,.11,.88,.05),M.black,[-1.6,1.51,1.56]);rod(scene,[-1.6,1.57,1.20],[-1.6,1.57,1.86],.015,M.metal);const throttle=mesh(scene,bevelBox(.39,.12,.19,.04),M.amber,[-1.6,1.8,1.55]);const throttleStem=rod(scene,[-1.6,1.58,1.55],[-1.6,1.8,1.55],.034,M.metal);
 ellipsoid(scene,M.rubber,[.7,1.59,1.6],[.20,.13,.20]);const stick=rod(scene,[.7,1.68,1.55],[.7,2.08,1.6],.045,M.black),stickBall=mesh(scene,bevelBox(.15,.20,.17,.045),M.amber,[.7,2.08,1.6]);const finStick=rod(scene,[1.6,1.68,1.4],[1.6,1.95,1.4],.035,M.metal),finKnob=ellipsoid(scene,M.ivory,[1.6,1.95,1.4],[.07,.08,.07]);const selector=mesh(scene,bevelBox(.23,.12,.15,.03),M.amber,[-.5,1.8,1.7]);
 const pedals=[-1,1].map(side=>{const p=mesh(scene,bevelBox(.40,.13,.55,.055),M.metal,[side*.5,-.13,1.4]);for(let z=-.18;z<=.18;z+=.09)box(p,M.rubber,[0,.068,z],[.31,.02,.025]);return p;});
 for(const side of [-1,1]){const x=side*1.14;mesh(scene,new T.CylinderGeometry(.14,.115,.24,20),M.ivory,[x,.54,-.12]);mesh(scene,new T.CylinderGeometry(.128,.128,.009,20),material('#4a3429',.3,0),[x,.662,-.12]);mesh(scene,new T.TorusGeometry(.095,.023,6,18),M.ivory,[x+side*.14,.55,-.12]).rotation.y=Math.PI/2;}
 mesh(shell,new T.PlaneGeometry(1.05,.2),decal('DROSOPHILA / 01',{color:'#c8e0e9',size:70}),[0,3.54,-2.52]);
 return{shell,console,screens,throttle,throttleStem,stick,stickBall,finStick,finKnob,selector,pedals};
}
