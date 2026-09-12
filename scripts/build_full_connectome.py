"""Retain the full annotated MaleCNS graph; lossless counts and explicit exclusions."""
from pathlib import Path
import gzip,hashlib,json
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/assets/connectome';OUT.mkdir(exist_ok=True)
ann=pd.read_feather(ROOT/'data/body-annotations-male-cns-v1.0-minconf-0.5.feather')
ann=ann[ann.superclass.notna() & (ann.status!='Glia')].sort_values('bodyId').reset_index(drop=True)
ids=ann.bodyId.to_numpy(np.uint64);n=len(ids)
nt=pd.read_feather(ROOT/'data/body-neurotransmitters-male-cns-v1.0.feather').set_index('body').consensus_nt
tx=ann.bodyId.map(nt).fillna('unknown').tolist()
signs=np.array([-1 if t in ['gaba','glutamate'] else 1 for t in tx],np.int8)
classes=sorted(ann.superclass.unique().tolist());types=sorted(ann.type.fillna('untyped').unique().tolist())
class_index={s:i for i,s in enumerate(classes)};type_index={s:i for i,s in enumerate(types)}
positions=np.zeros((n,3),np.float32);valid=np.zeros(n,bool)
for i,p in enumerate(ann.somaLocation):
    if isinstance(p,(list,np.ndarray)) and len(p)==3:positions[i]=p;valid[i]=True
index=lambda a:np.searchsorted(ids,a)
pres=[];posts=[];counts=[];source_rows=0;excluded=0;source_contacts=0
with pa.memory_map(str(ROOT/'data/connectome-weights-male-cns-v1.0-minconf-0.5.feather'),'r') as src:
    reader=ipc.open_file(src)
    for k in range(reader.num_record_batches):
        b=reader.get_batch(k);pre=b['body_pre'].to_numpy();post=b['body_post'].to_numpy();weight=b['weight'].to_numpy()
        i=index(pre);j=index(post);keep=(i<n)&(j<n);keep&=ids[np.minimum(i,n-1)]==pre;keep&=ids[np.minimum(j,n-1)]==post
        pres.append(i[keep].astype(np.uint32));posts.append(j[keep].astype(np.uint32));counts.append(weight[keep].astype(np.uint32))
        source_rows+=len(pre);source_contacts+=int(weight.sum());excluded+=int((~keep).sum())
pre=np.concatenate(pres);post=np.concatenate(posts);count=np.concatenate(counts)
del pres,posts,counts
order=np.argsort(post,kind='stable');pre=pre[order];count=count[order];post=post[order]
assert count.max()<65536
count=count.astype(np.uint16)
row=np.zeros(n+1,np.uint32);row[1:]=np.cumsum(np.bincount(post,minlength=n),dtype=np.uint32)
incoming=np.bincount(post,weights=count,minlength=n).astype(np.float32)
outgoing=np.bincount(pre,weights=count,minlength=n).astype(np.float32)
groups=np.zeros(n,np.uint8)
for i,r in enumerate(ann.to_dict('records')):
    if r['superclass'].startswith('ol_') or r['superclass'] in ['visual_projection','visual_centrifugal']:groups[i]=0 if r['somaSide']=='L' else 1
    elif r['superclass'].startswith('vnc_') or r['superclass'].startswith('sensory_ascending'):groups[i]=4
    elif r['superclass'] in ['descending_neuron','ascending_neuron']:groups[i]=3
    else:groups[i]=2
channels=np.full(n,255,np.uint8)
for i,r in enumerate(ann.to_dict('records')):
    if r['superclass'] in ['ol_sensory','cb_sensory','vnc_sensory','sensory_ascending']:
        channels[i]=i%8
def blob(name,array):
    data=np.ascontiguousarray(array).tobytes();path=OUT/(name+'.bin.gz')
    path.write_bytes(gzip.compress(data,compresslevel=6,mtime=0))
    return {'file':path.name,'bytes':len(data),'compressedBytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
parts=[]
for start in range(0,len(pre),1500000):
    stop=min(start+1500000,len(pre));part={'start':start,'count':stop-start,'pre':blob(f'pre-{len(parts):02}',pre[start:stop]),'weight':blob(f'weight-{len(parts):02}',count[start:stop])};parts.append(part)
nodes={'ids':blob('ids',ids.astype(np.uint32)),'positions':blob('somas',positions),'positionValid':blob('soma-valid',valid.astype(np.uint8)),'groups':blob('groups',groups),'signs':blob('signs',signs),'channels':blob('channels',channels),'incoming':blob('incoming',incoming),'outgoing':blob('outgoing',outgoing),'rows':blob('rows',row),'types':blob('type-indices',np.array([type_index[t] for t in ann.type.fillna('untyped')],np.uint16)),'classes':blob('class-indices',np.array([class_index[t] for t in ann.superclass],np.uint8))}
core=json.loads((ROOT/'dist/assets/circuit.json').read_text())
core_indices=[int(np.searchsorted(ids,v['id'])) for v in core['neurons']]
labels={'types':types,'classes':classes,'transmitters':tx}
(OUT/'labels.json').write_text(json.dumps(labels,separators=(',',':')))
manifest={'version':1,'dataset':'MaleCNS v1.0','source':'https://male-cns.janelia.org/download/','license':'CC BY 4.0','neurons':n,'edges':len(pre),'synapticContacts':int(count.astype(np.uint64).sum()),'sourceEdgeRows':source_rows,'sourceSynapticContacts':source_contacts,'excludedEdgeRows':excluded,'exclusion':'Edges to objects without an assigned neuronal superclass, or explicitly annotated glia. No additional synapse-count threshold.','nodes':nodes,'parts':parts,'coreIndices':core_indices,'groupNames':['Left optic lobe','Right optic lobe','Central brain','Descending / ascending','Ventral nerve cord'],'somaPositions':int(valid.sum()),'labels':'labels.json'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['neurons','edges','synapticContacts','excludedEdgeRows','somaPositions']}),flush=True)
print('Graph download size',sum(p.stat().st_size for p in OUT.iterdir())/1e6,'MB',flush=True)
