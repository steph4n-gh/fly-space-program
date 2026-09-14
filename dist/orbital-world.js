import * as T from './vendor/three.module.js?v=9.6';
import {PLANET_RADIUS as R} from './orbital.js?v=9.6';
const noise=`float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.02+vec3(13.1,7.3,2.1);a*=.5;}return v;}`;
const vertex=`varying vec3 normal0,world;void main(){normal0=normal;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`;
function marker(text,color){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#061422ce';ctx.roundRect(0,0,512,128,18);ctx.fill();ctx.fillStyle=color;ctx.font='500 47px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(1000,250,1);return sprite;}
export class OrbitalWorld{
 constructor(scene){
  this.group=new T.Group();scene.add(this.group);
  const geometry=new T.SphereGeometry(R,128,72);
  this.planet=new T.Mesh(geometry,new T.ShaderMaterial({vertexShader:vertex,fragmentShader:`varying vec3 normal0,world;${noise}
void main(){vec3 n=normalize(normal0),sun=normalize(vec3(-.48,.53,.70));float light=dot(n,sun),day=smoothstep(-.08,.14,light);float geography=fbm(n*3.1+vec3(4.2,1.7,7.3));float land=smoothstep(.46,.49,geography)*(1.-smoothstep(.78,.98,n.y));float detail=fbm(n*26.);vec3 sea=mix(vec3(.012,.068,.115),vec3(.025,.17,.22),smoothstep(.25,.47,geography));vec3 ground=mix(vec3(.12,.21,.13),vec3(.37,.38,.22),detail);ground=mix(ground,vec3(.68,.62,.44),smoothstep(.60,.73,geography));float shore=smoothstep(.455,.47,geography)*(1.-smoothstep(.47,.49,geography));vec3 color=mix(sea,ground,land);color=mix(color,vec3(.09,.35,.39),shore*.5);float ice=smoothstep(.87,.96,abs(n.z)+detail*.055);color=mix(color,vec3(.69,.82,.85),ice);vec3 eye=normalize(cameraPosition-world);float shine=pow(max(0.,dot(reflect(-sun,n),eye)),140.)*(1.-land)*(1.-ice);color=color*(.025+day*(.15+.85*max(0.,light)))+vec3(.74,.79,.73)*shine*.55;float rim=pow(1.-max(0.,dot(n,eye)),3.);color+=vec3(.04,.19,.32)*rim*day*.55;gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}));this.planet.position.y=-R;this.group.add(this.planet);
  this.clouds=new T.Mesh(new T.SphereGeometry(R*1.013,100,60),new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:{value:0}},vertexShader:vertex,fragmentShader:`uniform float clock;varying vec3 normal0,world;${noise}
void main(){vec3 n=normalize(normal0),p=n;float a=clock*.00012;p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;float cloud=fbm(p*8.+vec3(3.7,2.8,0.));float wind=fbm(p*23.);float alpha=smoothstep(.48,.66,cloud+wind*.12)*.82;float sun=dot(n,normalize(vec3(-.48,.53,.70)));vec3 c=vec3(.84,.93,.96)*(.04+smoothstep(-.08,.15,sun)*(.3+.7*max(0.,sun)));gl_FragColor=vec4(c,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}));this.clouds.position.y=-R;this.group.add(this.clouds);
  this.glow=new T.Mesh(new T.SphereGeometry(R*1.035,90,48),new T.ShaderMaterial({transparent:true,side:T.BackSide,depthWrite:false,blending:T.AdditiveBlending,vertexShader:'varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n,v;void main(){float a=pow(1.-abs(dot(n,v)),5.);gl_FragColor=vec4(.15,.51,.91,a*.42);}'}));this.glow.position.y=-R;this.group.add(this.glow);
  this.guide=new T.LineLoop(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#639bad',transparent:true,opacity:.33}));this.group.add(this.guide);
  this.traveled=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(1083),3)),new T.LineBasicMaterial({color:'#ffb470',transparent:true,opacity:.88}));this.traveled.geometry.setDrawRange(0,0);this.group.add(this.traveled);
  this.beacon=new T.Mesh(new T.SphereGeometry(43,14,10),new T.MeshBasicMaterial({color:'#ffae67'}));this.group.add(this.beacon);this.port=new T.Mesh(new T.SphereGeometry(28,12,8),new T.MeshBasicMaterial({color:'#b4eeeb'}));this.group.add(this.port);
  this.craftLabel=marker('KESTREL / 01','#ffd6ac');this.homeLabel=marker('RECOVERY','#bcf0e9');this.group.add(this.craftLabel,this.homeLabel);
  const stars=[],colors=[];for(let i=0;i<2200;i++){const y=1-2*(i+.5)/2200,a=i*2.39996,r=Math.sqrt(1-y*y);stars.push(Math.cos(a)*r*43000,y*43000-R,Math.sin(a)*r*43000);const k=.45+(i%7)/14;colors.push(k*.88,k*.95,k);}
  this.stars=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(stars,3)).setAttribute('color',new T.Float32BufferAttribute(colors,3)),new T.PointsMaterial({vertexColors:true,size:1.1,sizeAttenuation:false,transparent:true,opacity:.8}));scene.add(this.stars);
 }
 update(s,map){
  const altitude=s.y-8,phi=s.x/R,r=R+altitude;this.group.visible=altitude>240;this.stars.visible=altitude>650;this.clouds.material.uniforms.clock.value=s.t;
  for(const o of [this.beacon,this.port,this.guide,this.traveled,this.craftLabel,this.homeLabel])o.visible=map;
  this.beacon.position.set(Math.sin(phi)*r,Math.cos(phi)*r-R,s.z);this.port.position.set(0,32,0);this.craftLabel.position.copy(this.beacon.position).add(new T.Vector3(0,310,0));this.homeLabel.position.set(0,380,0);
  const target=s.orbitConfig.orbitHeight;if(this.height!==target){this.height=target;const points=Array.from({length:360},(_,i)=>{const a=i/360*Math.PI*2;return new T.Vector3(Math.sin(a)*(R+target),Math.cos(a)*(R+target)-R,0);});this.guide.geometry.dispose();this.guide.geometry=new T.BufferGeometry().setFromPoints(points);}
  if(map&&this.lastStep!==s.step){this.lastStep=s.step;const count=Math.min(361,Math.floor(Math.min(Math.PI*2,s.orbitTravel)*180/Math.PI)+1),positions=this.traveled.geometry.attributes.position,start=s.orbitStart??phi;for(let i=0;i<count;i++){const a=start+i/180*Math.PI;positions.setXYZ(i,Math.sin(a)*(R+target),Math.cos(a)*(R+target)-R,0);}positions.needsUpdate=true;this.traveled.geometry.setDrawRange(0,count);this.traveled.geometry.computeBoundingSphere();}
 }
 hide(){this.group.visible=false;this.stars.visible=false;}
}
