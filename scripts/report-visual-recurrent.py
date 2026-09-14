#!/usr/bin/env python3
"""Export the complete, previously inspected visual development fit record."""
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/visual-recurrent-development'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    plan = json.loads((BASE/'plan.json').read_text())
    assert sha(ROOT/'scripts/fit-visual-recurrent-development.py')==plan['sourceSHA256']
    for name, expected in plan['inputSHA256'].items():
        assert sha(ROOT/name)==expected, name
    fits, summary = {}, {}
    for cell in ['L1','L2']:
        fit = json.loads((BASE/cell/'fit.json').read_text())
        assert fit['planSHA256']==sha(BASE/'plan.json') and fit['complete']
        assert fit['originalTransferStillFailed'] and not fit['independentResponseTestPerformed']
        fits[cell] = fit
        summary[cell] = {}
        for name, model in fit['models'].items():
            cfg, attempts = plan['optimization'][name], model['attempts']
            assert len(attempts)==len(cfg['starts'])
            for index, attempt in enumerate(attempts):
                assert attempt['initial']==cfg['starts'][index] and attempt['restart']==index
                assert json.loads((BASE/cell/f'{name}-attempt-{index}.json').read_text())==attempt
                assert attempt['success'] and attempt['validPredictions']
            selected = min(attempts,key=lambda a:(a['meanTraceMSE'],a['restart']))
            assert selected==model['selected'] and model['complete']
            errors = [float(np.mean((np.asarray(r['predicted'])-r['measured'])**2)) for r in model['traces']]
            assert abs(np.mean(errors)-selected['meanTraceMSE'])<1e-15
            values = selected['rangeScaledJacobianSingularValues']
            summary[cell][name] = {'meanTraceMSE':selected['meanTraceMSE'],
                'rootMeanTraceMSE':float(np.sqrt(selected['meanTraceMSE'])),
                'parameters':selected['parameters'],'boundHits':selected['boundHits'],
                'rangeScaledJacobianConditionNumber':max(values)/min(values),
                'tighterPredictionMaximumDifference':model['tightPredictionMaximumDifference']}
        summary[cell]['recurrentRelativeMSEReductionFromTwoFilter'] = 1-summary[cell]['recurrent']['meanTraceMSE']/summary[cell]['two_filter']['meanTraceMSE']
    result = {'scope':'All response targets are development data; original transfer remains failed.',
              'plan':plan,'planSHA256':sha(BASE/'plan.json'),'fits':fits,'summary':summary,
              'sourceSHA256':sha(__file__),'fitSHA256':{cell:sha(BASE/cell/'fit.json') for cell in fits},
              'independentResponseTestPerformed':False,'connectomeParametersInstalled':False}
    (ROOT/'docs/visual-recurrent-development-results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    fig = plt.figure(figsize=(12,11),layout='constrained')
    grid = fig.add_gridspec(3,2,height_ratios=[1,1,1.25])
    axes = [fig.add_subplot(grid[i,j]) for i in range(2) for j in range(2)]
    natural_axis = fig.add_subplot(grid[2,:])
    colors = {'one_filter':'#b56f16','two_filter':'#7454a3','recurrent':'#b83d45'}
    labels = {'one_filter':'One filter','two_filter':'Two filters','recurrent':'Recurrent feedback'}
    styles = {'one_filter':':','two_filter':'--','recurrent':'-'}
    for cell, pair_axes in zip(['L1','L2'],[axes[:2],axes[2:]]):
        for polarity, ax in zip(['dark','bright'],pair_axes):
            ax.axvspan(0,20,color='#dde2e8',alpha=.7)
            for condition, color, marker in [('highLum','#202d3d','o'),('lowLum','#25808b','s')]:
                r = next(r for r in fits[cell]['models']['recurrent']['traces'] if r['condition']==condition and r['polarity']==polarity)
                ax.plot(np.asarray(r['timeSeconds'])*1000,np.asarray(r['measured'])*100,color=color,marker=marker,
                        markersize=2.3,linewidth=.8,alpha=.85,label=f'Measured {condition}')
            for name in colors:
                r = next(r for r in fits[cell]['models'][name]['traces'] if r['polarity']==polarity)
                ax.plot(np.asarray(r['timeSeconds'])*1000,np.asarray(r['predicted'])*100,color=colors[name],
                        linestyle=styles[name],lw=1.8,label=labels[name])
            ax.set(title=f'{cell} · {polarity} flash',xlabel='Time from flash onset (ms)',ylabel='Fluorescence ΔF/F (%)',xlim=(-8,520))
            ax.axhline(0,color='#6e7580',lw=.5)
    for name in colors:
        r = next(r for r in fits['L2']['models'][name]['traces'] if r['condition']=='natural')
        if name=='one_filter':
            natural_axis.plot(r['timeSeconds'],np.asarray(r['measured'])*100,color='#202d3d',lw=1.2,label='Measured')
        natural_axis.plot(r['timeSeconds'],np.asarray(r['predicted'])*100,color=colors[name],
                          linestyle=styles[name],lw=1.3,label=labels[name],alpha=.9)
    natural_axis.set(title='L2 · natural sequence included in development fitting',xlabel='Time (s)',ylabel='Fluorescence ΔF/F (%)',xlim=(0,2))
    natural_axis.set_ylim(top=4)
    for ax in [*axes,natural_axis]:
        ax.spines[['top','right']].set_visible(False)
        ax.grid(axis='y',alpha=.15)
    axes[0].legend(frameon=False,fontsize=8,ncol=2,loc='upper right')
    natural_axis.legend(frameon=False,fontsize=9,ncol=4,loc='upper right')
    fig.suptitle('Visual development fits · all response data previously inspected\nOne shared nominal flash prediction per model across highLum / lowLum labels',fontsize=13)
    fig.savefig(ROOT/'docs/assets/visual-recurrent-development.png',dpi=180)
    plt.close(fig)
    print(json.dumps(summary))


if __name__=='__main__':
    main()
