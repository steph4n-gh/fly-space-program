import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const page=`<!doctype html><html><head><title>Three.js render smoke</title></head><body>
<canvas id="view" width="128" height="96" style="width:128px;height:96px"></canvas>
<output id="result">PENDING</output>
<script type="module">
try {
 const app=await import('/scene3d.js');
 const T=await import('/vendor/three.module.js');
 if(typeof app.FlightScene3D!=='function')throw Error('Application scene module failed to load');
 const canvas=document.querySelector('#view');
 const renderer=new T.WebGLRenderer({canvas,antialias:false});
 renderer.setSize(128,96,false);
 const scene=new T.Scene();scene.background=new T.Color('#1b3048');
 const camera=new T.PerspectiveCamera(60,128/96,.1,10);camera.position.z=3;
 scene.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:'#ed5334'})));
 renderer.render(scene,camera);
 const gl=canvas.getContext('webgl2');
 if(!gl||!gl.getParameter(gl.VERSION).startsWith('WebGL 2')||renderer.info.render.calls<1)
  throw Error('WebGL 2 renderer did not draw');
 const pixel=new Uint8Array(4);
 gl.readPixels(64,48,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
 if(gl.getError()!==gl.NO_ERROR||pixel[3]!==255||!pixel.slice(0,3).some(Boolean))
  throw Error('Rendered pixel was invalid: '+Array.from(pixel));
 document.querySelector('#result').textContent='SMOKE_OK '+Array.from(pixel).join(',');
} catch(error) {document.querySelector('#result').textContent='SMOKE_FAIL '+error.stack;}
</script></body></html>`;

const server=createServer(async (request,response)=>{
 try{
  if(request.url==='/__three-smoke'){
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(page);
   return;
  }
  const file=path.resolve(dist,'.'+new URL(request.url,'http://localhost').pathname);
  if(!file.startsWith(dist+path.sep)||!file.endsWith('.js'))throw Error('Unexpected file');
  response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(await readFile(file));
 }catch{response.writeHead(404).end();}
});
const profile=await mkdtemp(path.join(tmpdir(),'fsp-three-smoke-'));
try{
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});
 });
 const url=`http://127.0.0.1:${server.address().port}/__three-smoke`;
 const chrome=process.env.CHROME_BIN||
  (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
 const args=['--headless=new','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--disable-extensions','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage',
  '--virtual-time-budget=3000','--dump-dom',
  `--user-data-dir=${profile}`,url];
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);
  child.stdout.on('data',data=>stdout=(stdout+data).slice(-100000));
  child.stderr.on('data',data=>stderr=(stderr+data).slice(-4000));
  child.on('error',reject);
  child.on('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});
 });
 const result=output.stdout.match(/<output id="result">SMOKE_OK ([0-9]+,){3}[0-9]+<\/output>/);
 if(output.code!==0||!result)
  throw Error(`Browser render smoke failed (exit ${output.code}): ${output.stdout.slice(-1000)}\n${output.stderr}`);
 console.log(result[0].replace(/<\/?output[^>]*>/g,''));
}finally{
 if(server.listening)server.close();
 await rm(profile,{recursive:true,force:true});
}
