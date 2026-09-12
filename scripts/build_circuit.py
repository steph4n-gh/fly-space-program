"""Extract actual central-complex/descending neurons. No invented biological edges."""
from pathlib import Path
import json
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather

ROOT=Path(__file__).resolve().parents[1]
ann=pd.read_feather(ROOT/'data/body-annotations-male-cns-v1.0-minconf-0.5.feather')
candidate=ann[(ann['class']=='CX') | (ann['superclass']=='descending_neuron')].copy()
ids=pa.array(candidate.bodyId.to_numpy(),type=pa.uint64())
table=feather.read_table(ROOT/'data/connectome-weights-male-cns-v1.0-minconf-0.5.feather',memory_map=True)
parts=[]
for batch in table.to_batches(max_chunksize=1000000):
    mask=pc.and_(pc.is_in(batch['body_pre'],value_set=ids),pc.is_in(batch['body_post'],value_set=ids))
    part=batch.filter(mask)
    if part.num_rows: parts.append(part)
edges=pa.Table.from_batches(parts).to_pandas()
edges=edges.groupby(['body_pre','body_post'],as_index=False).weight.sum()
seeds=candidate[candidate.type.isin(['DNa02','DNg13','DNp09','DNp01'])].bodyId.tolist()
chosen=set(seeds)
for _ in range(96-len(chosen)):
    incoming=edges[edges.body_post.isin(chosen)].groupby('body_pre').weight.sum()
    outgoing=edges[edges.body_pre.isin(chosen)].groupby('body_post').weight.sum()
    scores=incoming.add(outgoing,fill_value=0).drop(list(chosen),errors='ignore')
    chosen.add(int(scores.idxmax()))
selected=candidate[candidate.bodyId.isin(chosen)].sort_values('bodyId').reset_index(drop=True)
lookup={int(n):i for i,n in enumerate(selected.bodyId)}
edges=edges[edges.body_pre.isin(chosen)&edges.body_post.isin(chosen)].copy()
nt=pd.read_feather(ROOT/'data/body-neurotransmitters-male-cns-v1.0.feather')
nt=nt.set_index('body').consensus_nt.to_dict()
n=len(selected); matrix=np.zeros((n,n)); contacts=[]
for row in edges.itertuples():
    src,dst=lookup[int(row.body_pre)],lookup[int(row.body_post)]
    transmitter=nt.get(int(row.body_pre),'unknown')
    sign=-1 if transmitter in ['gaba','glutamate'] else 1
    matrix[dst,src]=sign*np.sqrt(float(row.weight))
    contacts.append([src,dst,int(row.weight),sign])
matrix=matrix/(np.abs(matrix).sum(axis=1,keepdims=True)+1e-9)*0.85
rng=np.random.default_rng(71023)
encoder=rng.normal(0,0.32,(n,8))
# A fixed, task-agnostic linear calibration preserves the eight sensor channels
# through the nonlinear circuit. This is an engineered BCI, not fly sensory anatomy.
linear=(np.eye(n)*0.65+matrix)@encoder
decoder=np.linalg.pinv(linear,rcond=1e-6)
neurons=[]
for row in selected.to_dict('records'):
    pos=row['somaLocation']
    neurons.append({'id':int(row['bodyId']),'type':str(row['type']),'class':'descending' if row['superclass']=='descending_neuron' else 'central complex','nt':str(nt.get(int(row['bodyId']),'unknown')),'position':[float(v) for v in pos] if pos is not None and not isinstance(pos,float) else [0,0,0]})
out={'version':1,'source':'MaleCNS v1.0','sourceURL':'https://male-cns.janelia.org/','license':'CC BY 4.0','neurons':neurons,'edges':contacts,'matrix':matrix.round(8).tolist(),'encoder':encoder.round(8).tolist(),'decoder':decoder.round(8).tolist(),'synapticContacts':int(edges.weight.sum()),'candidateNeurons':len(candidate),'description':'96 recorded descending neurons, selected by weighted connectivity around DNa02/DNg13/DNp09/DNp01. Rate-model BCI with artificial flight telemetry; not a whole-brain emulation.'}
(ROOT/'dist/assets/circuit.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps({'neurons':n,'edges':len(contacts),'synapticContacts':out['synapticContacts'],'types':selected.type.value_counts().to_dict()}))
