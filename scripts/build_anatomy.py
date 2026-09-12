"""Sample measured synaptic coordinates for display, keeping each located neuron.

This reduces drawing density only. The complete neural graph is retained separately.
"""
from pathlib import Path
import gzip,hashlib,json
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/assets/connectome'
ann=pd.read_feather(ROOT/'data/body-annotations-male-cns-v1.0-minconf-0.5.feather')
ann=ann[ann.superclass.notna() & (ann.status!='Glia')].sort_values('bodyId').reset_index(drop=True)
ids=ann.bodyId.to_numpy(np.uint64);n=len(ids);seen=np.zeros(n,bool);centroids=np.zeros((n,3),np.float64);counts=np.zeros(n,np.uint32);points=[]
path=ROOT/'data/syn-partners-male-cns-v1.0-minconf-0.5.feather'
with pa.memory_map(str(path),'r') as source:
    reader=ipc.open_file(source);print(reader.schema,reader.num_record_batches,'batches',flush=True)
    for k in range(reader.num_record_batches):
        batch=reader.get_batch(k)
        for part in ['pre','post']:
            body=batch['body_'+part].to_numpy();ind=np.searchsorted(ids,body);keep=(ind<n);keep&=ids[np.minimum(ind,n-1)]==body
            good=np.flatnonzero(keep);ind=ind[good]
            if not len(ind):continue
            x=batch['x_'+part].to_numpy()[good].astype(np.uint32);y=batch['y_'+part].to_numpy()[good].astype(np.uint32);z=batch['z_'+part].to_numpy()[good].astype(np.uint32)
            # Stable spatial hash: about one in 128 endpoints; no fabricated points.
            selected=((x*73856093 ^ y*19349663 ^ z*83492791)&127)==0
            unique,first=np.unique(ind,return_index=True);first=first[~seen[unique]];selected[first]=True;seen[ind[first]]=True
            chosen=np.flatnonzero(selected)
            if len(chosen):
                ni=ind[chosen];p=np.column_stack([x[chosen],y[chosen],z[chosen],ni]).astype(np.float32);points.append(p)
                np.add.at(counts,ni,1)
                for axis in range(3):np.add.at(centroids[:,axis],ni,p[:,axis])
        if k%500==0:print('Anatomy batches',k,'/',reader.num_record_batches,'located neurons',int(seen.sum()),flush=True)
geometry=np.concatenate(points);del points
# Use real soma positions only for the few cells without sampled synaptic endpoints.
extra=[]
for i,p in enumerate(ann.somaLocation):
    if not seen[i] and isinstance(p,(list,np.ndarray)) and len(p)==3:
        extra.append([*p,i]);centroids[i]=p;counts[i]=1;seen[i]=True
if extra:geometry=np.concatenate([geometry,np.array(extra,np.float32)])
centroids/=np.maximum(counts,1)[:,None]
chunks=[]
for start in range(0,len(geometry),400000):
    part=geometry[start:start+400000];f=OUT/f'anatomy-{len(chunks):02}.bin.gz';f.write_bytes(gzip.compress(part.tobytes(),compresslevel=6,mtime=0));chunks.append({'file':f.name,'points':len(part),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
f=OUT/'centroids.bin.gz';f.write_bytes(gzip.compress(centroids.astype(np.float32).tobytes(),compresslevel=6,mtime=0))
unique_pos=centroids[seen]
brain=geometry[geometry[:,2]<65000,:3]
meta={'points':len(geometry),'locatedNeurons':int(seen.sum()),'missingNeurons':int((~seen).sum()),'sampling':'One in 128 measured synaptic endpoints by deterministic coordinate hash, plus a first measured endpoint per neuron and actual soma fallbacks. No synthetic geometry.','chunks':chunks,'centroids':'centroids.bin.gz','brainClipZ':65000,'bounds':{'min':np.percentile(unique_pos,.1,axis=0).tolist(),'max':np.percentile(unique_pos,99.9,axis=0).tolist()},'brainBounds':{'min':np.percentile(brain,.1,axis=0).tolist(),'max':np.percentile(brain,99.9,axis=0).tolist()},'source':json.loads((ROOT/'scripts/source-lock.json').read_text())[path.name]}
(OUT/'anatomy.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps({k:meta[k] for k in ['points','locatedNeurons','missingNeurons','bounds','brainBounds']}),flush=True)
