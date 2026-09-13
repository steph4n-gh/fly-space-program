import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {FullNetwork} from '../dist/full-network.js';
export function loadFullNetwork(){
 const base=new URL('../dist/assets/connectome/',import.meta.url),json=file=>JSON.parse(fs.readFileSync(new URL(file,base)));
 const manifest=json('manifest.json'),arr=(file,Type)=>{const b=gunzipSync(fs.readFileSync(new URL(file,base)));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
 const pre=new Uint32Array(manifest.edges),weight=new Uint16Array(manifest.edges);
 for(const part of manifest.parts){pre.set(arr(part.pre.file,Uint32Array),part.start);weight.set(arr(part.weight.file,Uint16Array),part.start);}
 const data={manifest,pre,weight,labels:json('labels.json')};
 for(const [key,Type] of Object.entries({rows:Uint32Array,incoming:Float32Array,signs:Int8Array,channels:Uint8Array,groups:Uint8Array,classes:Uint8Array}))data[key]=arr(manifest.nodes[key].file,Type);
 data.receptorChannels=arr('receptor-channels.bin.gz',Int16Array);data.receptorPolarity=arr('receptor-polarity.bin.gz',Int8Array);
 return new FullNetwork(data);
}
