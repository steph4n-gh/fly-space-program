import {readFile, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.length===3&&process.argv[2]==='--check';
if(!check&&process.argv.length!==2)throw Error('Usage: node scripts/refresh-three-vendor.mjs [--check]');

const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const installed=JSON.parse(await readFile(path.join(root,'node_modules/three/package.json'),'utf8'));
const locked=lock.packages?.['node_modules/three'];
if(lock.lockfileVersion!==3||!locked?.integrity||locked.version!==installed.version||
   lock.packages?.['']?.dependencies?.three!==manifest.dependencies?.three){
 throw Error('Installed Three.js and the npm v3 lock must agree; run npm ci first');
}

for(const [source,destination] of [
 ['build/three.module.js','three.module.js'],
 ['build/three.core.js','three.core.js'],
 ['LICENSE','THREE-LICENSE.txt'],
]){
 const from=path.join(root,'node_modules/three',source);
 const to=path.join(root,'dist/vendor',destination);
 if(check){
  const [expected,actual]=await Promise.all([readFile(from),readFile(to)]);
  if(!expected.equals(actual))throw Error(`${destination} differs from locked Three.js ${locked.version}; run npm run vendor:refresh`);
 }else await copyFile(from,to);
}
console.log(`${check?'Verified':'Refreshed'} vendored Three.js ${locked.version} module, core, and license`);
