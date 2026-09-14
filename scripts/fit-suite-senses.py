"""Fit presented-signal coordinates from complete-network output activity."""
import json
import argparse
import hashlib
from pathlib import Path
import numpy as np

p = Path('artifacts/suite-training')
parser = argparse.ArgumentParser()
parser.add_argument('--dynamic', action='store_true')
parser.add_argument('--flights', action='store_true')
parser.add_argument('--extra-calibration', type=Path, action='append', default=[], help='Additional complete calibration collections with distinct context IDs')
parser.add_argument('--output', type=Path, default=p/'sensory-basis.json')
args = parser.parse_args()
m = json.loads((p/'calibration-manifest.json').read_text())
X, Y, contexts, provenance, source_ranges = [], [], [], {}, {}
seen_contexts = set()
folders = [p] + ([p/'dynamic'] if args.dynamic else []) + ([p/'flight-calibration'] if args.flights else []) + args.extra_calibration
assert len(set(source.resolve() for source in folders)) == len(folders), 'Duplicate calibration collection'
for source in folders:
    manifest = json.loads((source/'calibration-manifest.json').read_text())
    assert manifest['features'] == m['features'] and manifest['targets'] == m['targets'] and manifest['names'] == m['names']
    provenance[str(source/'calibration-manifest.json')] = hashlib.sha256((source/'calibration-manifest.json').read_bytes()).hexdigest()
    begin = len(contexts)
    for part in range(manifest['parts']):
        meta = json.loads((source/f'calibration-{part}.json').read_text())
        X.append(np.fromfile(source/f'calibration-{part}-features.bin', dtype='<f4').reshape(-1,m['features']))
        Y.append(np.fromfile(source/f'calibration-{part}-targets.bin', dtype='<f4').reshape(-1,m['targets']))
        assert len(X[-1]) == len(Y[-1]) == len(meta['contexts']) == meta['samples']
        assert np.isfinite(X[-1]).all() and np.isfinite(Y[-1]).all()
        contexts.extend(meta['contexts'])
        for suffix in ['.json','-features.bin','-targets.bin']:
            file = source/f'calibration-{part}{suffix}'
            provenance[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
    source_ranges[str(source)] = (begin, len(contexts))
    assert len(contexts)-begin == manifest['samples']
    group_ids = set(contexts[begin:])
    assert not (group_ids & seen_contexts), 'Context IDs overlap between calibration collections'
    seen_contexts.update(group_ids)
X, Y = np.concatenate(X).astype(float), np.concatenate(Y).astype(float)
train = np.array(contexts)%5 != 4
xmean, ymean = X[train].mean(0), Y[train].mean(0)
xscale, yscale = X[train].std(0), Y[train].std(0)
# Activity units can be arbitrarily small in a normalized anatomical graph.
# Standardize every varying feature; constant columns contribute no information.
xscale[xscale==0] = 1
yscale[yscale==0] = 1
A, B = (X-xmean)/xscale, (Y-ymean)/yscale
u, singular, vh = np.linalg.svd(A[train], full_matrices=False)
fits = []
for ridge in [.00001,.001,.1,1,10,100]:
    coef = vh.T@((singular/(singular**2+ridge))[:,None]*(u.T@B[train]))
    error = np.mean((A[~train]@coef-B[~train])**2,axis=0)
    fits.append((ridge,coef,error))
    print('ridge',ridge,'held-out lamp MSE',np.round(error[:12],5).tolist(),flush=True)
choices = [min(fits,key=lambda t:t[2][j]) for j in range(m['targets'])]
coef = np.stack([choice[1][:,j] for j,choice in enumerate(choices)],axis=1)
raw = coef/xscale[:,None]*yscale
bias = ymean-xmean@raw
prediction = X@raw+bias
residual = prediction[~train]-Y[~train]
result = {'sensoryPresentation':m['sensoryPresentation'],'names':m['names'],'bodyChannels':m['bodyChannels'],'basis':np.column_stack([raw.T,bias]).tolist(),'trainingSamples':int(train.sum()),'validationSamples':int((~train).sum()),'ridge':[x[0] for x in choices],'normalizedMSE':[float(x[2][j]) for j,x in enumerate(choices)],'RMSE':np.sqrt(np.mean(residual**2,axis=0)).tolist(),'errorCovariance':np.cov(residual.T).tolist(),'featureMean':xmean.tolist(),'featureScale':xscale.tolist(),'dynamic':args.dynamic,'flightCalibration':args.flights,'inputSHA256':provenance}
result['extraCalibration'] = [str(source) for source in args.extra_calibration]
result['fitSourceSHA256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
result['partition'] = 'Whole contexts: context ID modulo 5 equals 4 is validation; all others are training.'
result['validationByCollection'] = {}
for source, (begin, end) in source_ranges.items():
    selected = ~train[begin:end]
    assert selected.any(), 'Each collection needs held-out contexts'
    error = prediction[begin:end][selected]-Y[begin:end][selected]
    result['validationByCollection'][source] = {'samples': int(selected.sum()), 'contexts': len(set(np.asarray(contexts[begin:end])[selected])),
                                              'RMSE': np.sqrt(np.mean(error**2, axis=0)).tolist()}
args.output.write_text(json.dumps(result))
print(json.dumps({'lampRMSE':result['RMSE'][:12],'bodyRMSE':result['RMSE'][12:],'maxCoefficient':float(np.abs(raw).max()),'smallestVaryingScale':float(xscale.min())}),flush=True)
