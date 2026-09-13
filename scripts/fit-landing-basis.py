"""Calibrate a linear sensory basis from complete-graph motor activity.

Perception labels pair full-network activity with presented indicator brightness
and body feedback. The controller receives only the rendered light and body inputs.
The basis is folded into the ordinary readout before every reward evaluation.
"""
import json
from pathlib import Path
import numpy as np
folder = Path('artifacts/landing-training')
data = json.loads((folder / 'perception-features.json').read_text())
rows = data['records']
if (folder / 'independent-light-features.json').exists():
    rows = rows + json.loads((folder / 'independent-light-features.json').read_text())['records']
X = np.array([r['features'] for r in rows])
columns = ['lights[0]', 'lights[1]', 'target[5]', 'target[18]']
names = ['altitude_light', 'vertical_speed_light', 'throttle_position', 'vertical_load']
Y = np.array([[(r['lights'][0]*255-16)/224, 2*((r['lights'][1]*255-16)/224-.5), r['target'][5], r['target'][18]-1] for r in rows])
train = np.array([r['episode'] % 5 != 4 if r.get('kind') == 'independent-light' else r['episode'] not in [4, 9, 14, 17] for r in rows])
xmean = X[train].mean(0)
xscale = np.maximum(X[train].std(0), 1e-8)
ymean = Y[train].mean(0)
yscale = Y[train].std(0)
A = (X - xmean) / xscale
B = (Y - ymean) / yscale
u, s, vh = np.linalg.svd(A[train], full_matrices=False)
fits = []
for ridge in [0.1, 1, 10, 100, 1000]:
    coef = vh.T @ ((s / (s*s + ridge))[:, None] * (u.T @ B[train]))
    error = np.mean((A[~train] @ coef - B[~train])**2, axis=0)
    fits.append((ridge, coef, error))
    print('ridge', ridge, 'heldout normalized MSE', dict(zip(names, np.round(error, 3).tolist())), flush=True)
coef = np.stack([min(fits, key=lambda t: t[2][j])[1][:, j] for j in range(len(columns))], axis=1)
raw = coef / xscale[:, None] * yscale
bias = ymean - xmean @ raw
basis = np.column_stack([raw.T, bias])
(folder / 'sensory-basis.json').write_text(json.dumps({'names': names, 'columns': columns, 'basis': basis.tolist(), 'coordinates': 'Presented altitude-light fraction 0–1, signed vertical-speed light −1–1, physical throttle position −1–1, vertical load minus 1 g', 'labelMean': ymean.tolist(), 'labelScale': yscale.tolist(), 'trainingSamples': int(train.sum()), 'validationSamples': int((~train).sum()), 'trainingEpisodes': sorted({r['episode'] for r,t in zip(rows,train) if t}), 'validationEpisodes': sorted({r['episode'] for r,t in zip(rows,train) if not t}), 'normalizedMSE': [min(f[2][j] for f in fits) for j in range(len(columns))]}))
print('saved', basis.shape, 'max coefficient', float(np.abs(basis).max()), flush=True)
