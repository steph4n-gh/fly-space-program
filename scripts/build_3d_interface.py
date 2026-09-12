"""Expand the engineered sensor/motor interface, preserving all 96 biological cells and edges."""
from pathlib import Path
import json
import numpy as np
root=Path(__file__).resolve().parents[1]
c=json.loads((root/'dist/assets/circuit.json').read_text());old=np.array(c['encoder']);W=np.array(c['matrix']);rng=np.random.default_rng(1904)
E=np.zeros((96,18));E[:,:8]=old;E[:,8:]=rng.normal(0,.21,(96,10))
D=np.linalg.pinv((.65*np.eye(96)+W)@E)
c['encoder']=E.tolist();c['decoder']=D.tolist();c['interface']='falcon-3d-v1';c['sensorCount']=18
(root/'dist/assets/circuit-3d.json').write_text(json.dumps(c,separators=(',',':'))+'\n')
g=json.loads((root/'dist/assets/graduate.json').read_text());weights=np.zeros(202);w=np.array(g['weights'])
mapz=[8,9,2,10,11,5,6,12]
for out,src,mapping in [(0,0,list(range(8))),(1,1,list(range(8))),(2,2,list(range(8))),(3,1,mapz),(4,2,mapz)]:
 for j,k in enumerate(mapping):weights[out*19+k]=w[src*9+j]
 weights[out*19+18]=w[src*9+8]
weights[8*19+18]=-.35
# A simple alternating instrument-check initialization, trainable with the other outputs.
weights[9*19+16]=-1
weights[9*19+17]=1
weights[9*19+18]=.4
weights[190:]=w[27:]
checkpoint={'version':3,'circuit':'malecns-96-falcon-3d-v1','weights':weights.tolist(),'generation':0,'episodes':0,'scenario':1,'history':[],'initialization':'Transferred 2D motor output weights to both lateral axes; expanded interface; no 3D training yet.'}
(root/'dist/assets/falcon-seed.json').write_text(json.dumps(checkpoint,separators=(',',':'))+'\n')
print('18 sensor channels, 10 motor commands, 202 trainable parameters; biological circuit unchanged.')
