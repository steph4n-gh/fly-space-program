import json
from pathlib import Path
import numpy as np
x=np.fromfile('/tmp/fly-orbit/features.bin',np.float64).reshape(-1,2130)
y=np.fromfile('/tmp/fly-orbit/targets.bin',np.float64).reshape(-1,10)
if Path('/tmp/fly-orbit/trajectory-features.bin').exists():
    x=np.vstack([x,np.fromfile('/tmp/fly-orbit/trajectory-features.bin',np.float64).reshape(-1,2130)])
    y=np.vstack([y,np.fromfile('/tmp/fly-orbit/trajectory-targets.bin',np.float64).reshape(-1,10)])
scale=np.maximum(np.sqrt((x*x).mean(axis=0)),.0001)
a=x/scale
w=np.linalg.solve(a.T@a+np.eye(a.shape[1])*.03,a.T@y)/scale[:,None]
error=np.sqrt(((np.tanh(x@w)-np.tanh(y))**2).mean(axis=0))
c=dict(version=4,circuit='malecns-full-rate-v1',weights=w.T.flatten().tolist(),generation=0,episodes=0,scenario=24,history=[],initialization=dict(method='Full-graph synthetic sensory/history calibration plus on-policy trajectory guidance tracking demonstrations',samples=len(x),seed=850194,commandRMSE=error.tolist(),teacher='Attitude-error stabilization and engineered acceleration cue; orbital mission guidance remains explicit',sensoryCells=17937))
Path('dist/assets/full-orbital.json').write_text(json.dumps(c,separators=(',',':')))
print(json.dumps(dict(samples=len(x),rmse=error.tolist())))
