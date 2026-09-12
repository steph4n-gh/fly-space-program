import * as T from './vendor/three.module.js';

// Decorative water and sky. These uniforms never enter the flight model or sensors.
export function oceanEnvironment(scene) {
  const uniforms = {
    clock: {value: 0}, night: {value: 0}, storm: {value: 0},
    sunDirection: {value: new T.Vector3(-.55,.24,-.8).normalize()},
  };
  const noise = `
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+13.1;a*=.5;}return v;}
  `;
  const skyMaterial = new T.ShaderMaterial({uniforms, side:T.BackSide, depthWrite:false,
    vertexShader:`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float clock,night,storm;uniform vec3 sunDirection;varying vec3 direction;${noise}
    void main(){vec3 d=normalize(direction);float h=max(0.,d.y),sun=max(0.,dot(d,sunDirection));
      vec3 horizon=mix(vec3(.38,.53,.62),vec3(.21,.30,.39),storm*.65);
      vec3 zenith=mix(vec3(.055,.18,.34),vec3(.13,.20,.28),storm*.7);
      vec3 color=mix(horizon,zenith,pow(h,.45));
      color+=vec3(1.,.63,.27)*pow(sun,24.)*.24;
      color+=vec3(1.5,1.3,.95)*pow(sun,1400.);
      vec2 cloud=d.xz/max(.06,d.y)*1.5+vec2(clock*.002,0.);
      float clouds=smoothstep(.48-storm*.12,.72,fbm(cloud));
      clouds*=smoothstep(.01,.16,d.y);
      color=mix(color,mix(vec3(.95,.94,.86),vec3(.36,.43,.49),storm),clouds*.78);
      color=mix(color,color*vec3(.12,.18,.32)+vec3(.006,.01,.023),night);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const sky=new T.Mesh(new T.SphereGeometry(5000,32,16),skyMaterial);sky.renderOrder=-10;scene.add(sky);
  const waterMaterial=new T.ShaderMaterial({uniforms,side:T.DoubleSide,
    vertexShader:`uniform float clock,storm;varying vec3 world;
    void main(){vec3 p=position;float amp=.18+storm*.38;
      p.z+=amp*(sin(p.x*.024+clock*.8)+sin(p.y*.036+p.x*.012-clock*.65));
      world=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`uniform float clock,night,storm;uniform vec3 sunDirection;varying vec3 world;${noise}
    void main(){vec2 p=world.xz;float t=clock;
      float warp=fbm(p*.018)*9.;float a=p.x*.26+p.y*.13+t*1.1+warp,b=p.x*-.12+p.y*.37-t*1.4+warp*1.8,c=p.x*.7+p.y*.5+t*.8;float aa=exp(-max(fwidth(a),0.)),ab=exp(-max(fwidth(b),0.)),ac=exp(-max(fwidth(c),0.));
      vec2 slope=vec2(.09*.26*cos(a)*aa-.055*.12*cos(b)*ab+.008*.7*cos(c)*ac,.09*.13*cos(a)*aa+.055*.37*cos(b)*ab+.008*.5*cos(c)*ac);
      slope+=(1.+storm)*vec2(.012*cos(p.x*.024+t*.8),.016*cos(p.y*.036+p.x*.012-t*.65));
      vec3 n=normalize(vec3(-slope.x*(2.+storm),1.,-slope.y*(2.+storm)));
      vec3 v=normalize(cameraPosition-world);float fresnel=pow(1.-max(0.,dot(n,v)),4.);
      vec3 deep=vec3(.014,.085,.115),reflection=vec3(.15,.30,.39);
      vec3 color=mix(deep,reflection,fresnel*.87);
      float sparkle=pow(max(0.,dot(reflect(-sunDirection,n),v)),75.);
      color+=vec3(1.,.76,.42)*sparkle*.36;
      float foam=smoothstep(.86,.98,fbm(p*.18+vec2(t*.12,0.)))*(.04+storm*.14);
      color+=foam*vec3(.65,.79,.78);
      float dist=length(cameraPosition-world),haze=smoothstep(450.,4200.,dist);
      color=mix(color,mix(vec3(.38,.53,.62),vec3(.21,.30,.39),storm*.65),haze);
      color=mix(color,color*vec3(.12,.18,.32)+vec3(.006,.01,.023),night);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const water=new T.Mesh(new T.PlaneGeometry(12000,12000,256,256),waterMaterial);
  water.rotation.x=-Math.PI/2;scene.add(water);
  return {sky,water,update(s,camera){uniforms.clock.value=s.t;uniforms.night.value=s.scenario>=4?1:0;uniforms.storm.value=s.scenario>=3?1:0;sky.position.copy(camera.position);}};
}

export function deckTexture() {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1536;
  const g=canvas.getContext('2d');g.fillStyle='#303e43';g.fillRect(0,0,1024,1536);
  g.strokeStyle='#465359';g.lineWidth=2;
  for(let x=20;x<1024;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,1536);g.stroke();}
  for(let y=0;y<1536;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
  g.strokeStyle='#dfd8b7';g.lineWidth=7;g.strokeRect(38,38,948,1460);
  g.strokeStyle='#ffb45e';g.lineWidth=8;
  for(let y=50;y<1500;y+=40){for(const x of [10,984]){g.beginPath();g.moveTo(x,y);g.lineTo(x+30,y+25);g.stroke();}}
  g.strokeStyle='#eae8d5';g.lineWidth=12;g.beginPath();g.arc(512,768,247,0,Math.PI*2);g.stroke();
  g.lineWidth=3;g.beginPath();g.arc(512,768,277,0,Math.PI*2);g.stroke();
  g.fillStyle='#f5b459';g.fillRect(500,665,24,206);g.fillRect(423,756,178,24);
  g.fillStyle='#d7dfda';g.textAlign='center';g.font='bold 40px monospace';g.fillText('FSP  /  RECOVERY 01',512,1210);
  g.font='24px monospace';g.fillText('KEEP CLEAR OF LANDING ZONE',512,1280);
  g.fillStyle='#263337';for(const [x,y] of [[150,225],[875,300],[220,1180],[710,970]]){g.beginPath();g.ellipse(x,y,65,27,.3,0,Math.PI*2);g.fill();}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;
}

export function boosterTexture() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=2048;const g=canvas.getContext('2d');
  g.fillStyle='#e7e7df';g.fillRect(0,0,512,2048);
  const scorch=g.createLinearGradient(0,1500,0,2048);scorch.addColorStop(0,'#77766e00');scorch.addColorStop(1,'#3b3934cc');g.fillStyle=scorch;g.fillRect(0,1400,512,648);
  for(let i=0;i<60;i++){g.fillStyle=`rgba(40,38,31,${.025+(i%7)*.012})`;g.fillRect((i*83)%512,1690+(i*37)%150,3+(i%9),450);}
  g.strokeStyle='#9eaaa9';g.lineWidth=2;for(const y of [95,720,1260,1720]){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();}
  for(const x of [15,200,395]){g.fillStyle='#52646a';g.fillRect(x,530,4,800);}
  g.save();g.translate(300,470);g.rotate(Math.PI/2);g.fillStyle='#1a2f3c';g.font='bold 40px sans-serif';g.fillText('FLY SPACE PROGRAM',0,0);g.restore();
  g.fillStyle='#e59744';g.fillRect(310,260,55,34);g.fillStyle='#314955';g.font='bold 24px monospace';g.fillText('B-001',265,1420);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;
}
