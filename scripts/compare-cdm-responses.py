#!/usr/bin/env python3
"""Describe every archived CDM/control flash pair without fitting a model."""
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from scipy.io import loadmat

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/cdm-response-comparison'
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()


def window_mean(t, values, bounds):
    # Each stored point is the mean of the trailing 1/120-second bin.
    start, end = bounds
    overlap = np.maximum(0, np.minimum(t, end)-np.maximum(t-1/120, start))
    assert abs(overlap.sum()-(end-start)) < 1e-12
    return float(np.sum(values*overlap)/(end-start))


def main():
    plan = json.loads((BASE/'plan.json').read_text())
    assert plan['sourceSHA256'] == sha(__file__)
    assert not (BASE/'comparison.json').exists(), 'Preserve the completed comparison'
    assert sha(BASE/'source-manifest.json') == plan['manifestSHA256']
    manifest = json.loads((BASE/'source-manifest.json').read_text())
    assert sha(ROOT/manifest['archiveFile']) == manifest['archiveSHA256']
    data = {}
    for row in manifest['data']:
        file = BASE/'data'/row['file']
        assert sha(file) == row['sha256']
        mat = loadmat(file)
        t, mean = mat['t'].ravel(), mat['meanResp']
        assert t.shape == (63,) and mean.shape == (2,63)
        assert np.allclose(t,np.arange(63)/120,atol=1e-12,rtol=0)
        assert np.isfinite(mean).all()
        individuals, individual_check = [], []
        if 'indivResp' in mat:
            cells = mat['indivResp'].ravel()
            assert len(cells) == 2
            for polarity, array in enumerate(cells):
                assert array.ndim == 2 and 63 in array.shape
                values = array if array.shape[1] == 63 else array.T
                assert values.shape[1] == 63 and np.isfinite(values).all()
                error = float(np.max(np.abs(values.mean(axis=0)-mean[polarity])))
                assert error < 1e-12, 'Stored individual responses do not reproduce the mean'
                individuals.append(values.tolist())
                individual_check.append({'recordedTraces':len(values),'maximumMeanReconstructionError':error})
        data[row['file']] = {'timeSeconds':t.tolist(),'meanResponses':mean.tolist(),
                             'individualResponses':individuals,'individualMeanVerification':individual_check}
    records = []
    for pair in plan['pairs']:
        control, treated = data[pair['controlFile']], data[pair['cdmFile']]
        assert control['timeSeconds'] == treated['timeSeconds']
        t = np.asarray(control['timeSeconds'])
        for index, polarity in enumerate(['dark','bright']):
            initial_sign = -1 if polarity=='dark' else 1
            c, d = np.asarray(control['meanResponses'][index]), np.asarray(treated['meanResponses'][index])
            windows = {}
            for name,bounds in plan['windowsSeconds'].items():
                cm,dm = [window_mean(t,v,bounds) for v in [c,d]]
                windows[name] = {'controlMeanDFF':cm,'cdmMeanDFF':dm,'differenceDFF':dm-cm,
                                 'controlAreaDFFSeconds':cm*(bounds[1]-bounds[0]),
                                 'cdmAreaDFFSeconds':dm*(bounds[1]-bounds[0])}
            early,late = windows['early'],windows['late']
            records.append({**pair,'polarity':polarity,'timeSeconds':t.tolist(),
                'control':c.tolist(),'cdm':d.tolist(),'difference':(d-c).tolist(),'windows':windows,
                'signedInitialResponse':{'control':initial_sign*early['controlMeanDFF'],
                                         'cdm':initial_sign*early['cdmMeanDFF']},
                'signedLateRebound':{'control':-initial_sign*late['controlMeanDFF'],
                                     'cdm':-initial_sign*late['cdmMeanDFF']},
                'wholeRecordedTraceDifferenceRMS':float(np.sqrt(np.mean((d-c)**2))),
                'wholeRecordedTraceMaximumAbsoluteDifference':float(np.max(np.abs(d-c))),
                'cdmTraceCount':treated['individualMeanVerification'][index]['recordedTraces']
                                if treated['individualMeanVerification'] else None})
    assert len(records) == 8
    result = {'scope':plan['scope'],'plan':plan,'planSHA256':sha(BASE/'plan.json'),
              'sourceSHA256':sha(__file__),'sourceManifest':manifest,'records':records,
              'archiveData':data,'interpretationLimits':plan['interpretationLimits']}
    with (BASE/'comparison.json').open('x') as file:
        json.dump(result,file,indent=2,allow_nan=False);file.write('\n')
    (ROOT/'docs/cdm-response-results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    fig,axes = plt.subplots(4,2,figsize=(11,11),sharex=True,sharey=True,layout='constrained')
    for ax,row in zip(axes.ravel(),records):
        t = np.asarray(row['timeSeconds'])*1000
        ax.axvspan(0,20,color='#dbe0e8',alpha=.65)
        ax.axvline(50,color='#737c89',ls=':',lw=.8)
        ax.axvline(250,color='#737c89',ls=':',lw=.8)
        ax.axhline(0,color='#9da5b2',lw=.7)
        ax.plot(t,np.asarray(row['control'])*100,color='#16737b',lw=1.6,label='Control')
        ax.plot(t,np.asarray(row['cdm'])*100,color='#9b3e79',lw=1.6,ls='--',label='CDM')
        ax.set_title(f"{row['cell']} · {row['condition']} · {row['polarity']} flash",fontsize=11)
        ax.set_xlim(0,520);ax.grid(axis='y',alpha=.15)
        ax.spines[['top','right']].set_visible(False)
    for ax in axes[:,0]:ax.set_ylabel('ASAP2f ΔF/F (%)')
    for ax in axes[-1,:]:ax.set_xlabel('Time from flash onset (ms)')
    axes[0,0].legend(frameon=False,ncol=2,fontsize=10)
    fig.suptitle('Archived chemical-treatment and control responses\nAll named conditions; no fitted rescaling or paired-animal inference',fontsize=14)
    output=ROOT/'docs/assets/cdm-response-comparison.png';fig.savefig(output,dpi=180);plt.close(fig)
    print(json.dumps({'pairs':8,'comparisonSHA256':sha(BASE/'comparison.json'),
                      'rows':[{'cell':r['cell'],'condition':r['condition'],'polarity':r['polarity'],
                               'signedInitialResponse':r['signedInitialResponse'],'signedLateRebound':r['signedLateRebound'],
                               'cdmTraceCount':r['cdmTraceCount']} for r in records]},indent=2))


if __name__=='__main__':
    main()
