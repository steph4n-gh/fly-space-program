import json,sys
from pathlib import Path
import numpy as np
family=sys.argv[1] if len(sys.argv)>1 else 'landing'
d=Path('/tmp/fly-v8')/family
m=json.loads((d/'meta.json').read_text())
x=np.fromfile(d/'features.bin',np.float64).reshape(-1,m['stride'])
y=np.fromfile(d/'targets.bin',np.float64).reshape(-1,m['outputs'])
importance=np.ones(len(x))
for path in sorted(d.glob('trajectory-*-features.bin')):
 prefix=str(path).removesuffix('-features.bin')
 x=np.vstack([x,np.fromfile(path,np.float64).reshape(-1,m['stride'])])
 y=np.vstack([y,np.fromfile(prefix+'-targets.bin',np.float64).reshape(-1,m['outputs'])])
 importance=np.concatenate([importance,np.fromfile(prefix+'-importance.bin',np.float64)])
scale=np.maximum(np.sqrt((x*x).mean(axis=0)),.0001)
a=x/scale*np.sqrt(importance)[:,None]
b=y*np.sqrt(importance)[:,None]
w=np.linalg.solve(a.T@a+np.eye(a.shape[1])*.018,a.T@b)/scale[:,None]
rmse=np.sqrt(((np.tanh(x@w)-np.tanh(y))**2).mean(axis=0))
for i,name in enumerate(m['names']):
 c=dict(version=5,circuit='malecns-full-rate-v2',sensorSchema=m['sensorSchema'],inputs=m['inputs'],weights=w[:,i*10:(i+1)*10].T.flatten().tolist(),generation=0,episodes=0,scenario={'full-pilot':1,'full-specialist':6,'full-expert':7,'full-orbital':24}[name],history=[],initialization=dict(method=m['method'],samples=len(x),seed=m['seed'],baseline=m['baseline'],commandRMSE=rmse[i*10:(i+1)*10].tolist(),teacher='Previous complete-graph checkpoint, with explicit guidance retained',sensoryCells=m['sensory']))
 Path('dist/assets/'+name+'.json').write_text(json.dumps(c,separators=(',',':')))
print(json.dumps(dict(family=family,samples=len(x),inputs=m['inputs'],rmse=rmse.tolist())))
