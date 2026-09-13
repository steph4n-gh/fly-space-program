import json
from pathlib import Path
import numpy as np
meta=json.loads(Path('/tmp/fly-full/meta.json').read_text())
x=np.fromfile('/tmp/fly-full/features.bin',np.float64).reshape(-1,meta['stride'])
y=np.fromfile('/tmp/fly-full/targets.bin',np.float64).reshape(-1,30)
# Scale each output-cell feature; ridge keeps weak and silent cells well behaved.
scale=np.maximum(np.sqrt((x*x).mean(axis=0)),.0001)
a=x/scale
regularization=.03
w=np.linalg.solve(a.T@a+np.eye(a.shape[1])*regularization,a.T@y)/scale[:,None]
error=np.sqrt(((np.tanh(x@w)-np.tanh(y))**2).mean(axis=0))
for k,name in enumerate(['full-pilot','full-specialist','full-expert']):
    selected=w[:,k*10:(k+1)*10]
    checkpoint=dict(version=4,circuit='malecns-full-rate-v1',weights=selected.T.flatten().tolist(),generation=0,episodes=0,scenario=1 if k==0 else 6 if k==1 else 7,history=[],initialization=dict(method=meta['method'],samples=len(x),seed=meta['seed'],commandRMSE=error[k*10:(k+1)*10].tolist(),teacher='historical 96-cell landing policy; yaw-target demonstrations',sensoryCells=meta['sensory']))
    Path('dist/assets/'+name+'.json').write_text(json.dumps(checkpoint,separators=(',',':')))
print(json.dumps(dict(samples=len(x),parametersPerPolicy=21300,rmse=error.tolist())))
