import * as T from './vendor/three.module.js';
import {PLANET_RADIUS as R} from './orbital.js?v=7.3';
export class OrbitalWorld{
 constructor(scene){
  this.group=new T.Group();scene.add(this.group);
  const geometry=new T.SphereGeometry(R,128,64),positions=geometry.attributes.position,colors=[];
  for(let i=0;i<positions.count;i++){
   const x=positions.getX(i)/R,y=positions.getY(i)/R,z=positions.getZ(i)/R;
   const terrain=Math.sin(x*5+z*3)+Math.sin(z*8-y*4)*.55+Math.sin(x*13+y*9+z*6)*.2;
   const color=new T.Color(Math.abs(y)>.9?'#d8ede4':terrain>.6?'#7cac81':terrain>.45?'#c0c69b':'#176680');colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  this.planet=new T.Mesh(geometry,new T.ShaderMaterial({vertexColors:true,vertexShader:'varying vec3 tint,n;void main(){tint=color;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 tint,n;void main(){float light=.35+.65*max(0.,dot(normalize(n),normalize(vec3(-.6,.4,.7))));light=floor(light*5.)/5.;gl_FragColor=vec4(tint*light,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));this.planet.position.y=-R;this.group.add(this.planet);
  const glow=new T.Mesh(new T.SphereGeometry(R*1.022,80,40),new T.ShaderMaterial({transparent:true,side:T.BackSide,depthWrite:false,blending:T.AdditiveBlending,uniforms:{},vertexShader:'varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n,v;void main(){float a=pow(1.-abs(dot(n,v)),3.);gl_FragColor=vec4(.2,.65,.88,a*.23);}'}));glow.position.y=-R;this.group.add(glow);
  this.guide=new T.LineLoop(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#71c5d0',transparent:true,opacity:.35}));this.group.add(this.guide);
  this.beacon=new T.Mesh(new T.SphereGeometry(50,12,8),new T.MeshBasicMaterial({color:'#ffb565'}));this.group.add(this.beacon);
  this.port=new T.Mesh(new T.SphereGeometry(42,12,8),new T.MeshBasicMaterial({color:'#b5efd7'}));this.group.add(this.port);
  const stars=[];for(let i=0;i<1200;i++){const y=1-2*(i+.5)/1200,a=i*2.39996,r=Math.sqrt(1-y*y);stars.push(Math.cos(a)*r*40000,y*40000-R,Math.sin(a)*r*40000);}
  this.stars=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(stars,3)),new T.PointsMaterial({color:'#dcebef',size:1.5,sizeAttenuation:false,transparent:true,opacity:.85}));scene.add(this.stars);
 }
 update(s,map){
  const altitude=s.y-8,phi=s.x/R,r=R+altitude;
  this.group.visible=altitude>250;this.stars.visible=altitude>500;this.beacon.visible=this.port.visible=map;this.guide.visible=map;
  this.beacon.position.set(Math.sin(phi)*r,Math.cos(phi)*r-R,s.z);this.port.position.set(0,0,0);
  const target=s.orbitConfig.orbitHeight;if(this.height!==target){this.height=target;const points=Array.from({length:360},(_,i)=>{const a=i/360*Math.PI*2;return new T.Vector3(Math.sin(a)*(R+target),Math.cos(a)*(R+target)-R,0);});this.guide.geometry.dispose();this.guide.geometry=new T.BufferGeometry().setFromPoints(points);}
 }
 hide(){this.group.visible=false;this.stars.visible=false;}
}
