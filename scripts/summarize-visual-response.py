#!/usr/bin/env python3
"""Verify and plot the frozen empirical visual-response benchmark; no fitting."""
import hashlib
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'artifacts/odor-interface/visual-response-benchmark'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
plan,fit,result=[json.loads((BASE/name).read_text()) for name in ['plan.json','fit.json','evaluation.json']]
assert fit['planSHA256']==result['planSHA256']==sha(BASE/'plan.json')
assert result['fitSHA256']==sha(BASE/'fit.json') and result['complete']
assert fit['sourceSHA256']==result['sourceSHA256']==plan['sourceSHA256']==sha(BASE/'tested-source.py')
assert sha(BASE/'method-review.md')==plan['methodReviewSHA256']
source_checks={str(BASE/'data'/name):sha(BASE/'data'/name) for name in plan['dataSHA256']}
assert all(source_checks[str(BASE/'data'/name)]==expected for name,expected in plan['dataSHA256'].items())
for cell,models in fit['models'].items():
    for model,r in models.items():
        attempts=json.loads((BASE/(cell+'-'+model+'-fit-attempts.json')).read_text())
        assert attempts['restarts']==r['restarts'] and attempts['planSHA256']==fit['planSHA256']
        assert all(x['success'] for x in r['restarts'])
        selected=min(range(len(r['restarts'])),key=lambda k:(r['restarts'][k]['sse'],k))
        assert selected==r['selectedRestart'] and r['parameters']==r['restarts'][selected]['parameters']
        assert len(r['restarts'])==(9 if model=='two_filter' else 3)
        sse=sum(np.sum((np.asarray(r[contrast]['predicted'])-r[contrast]['measured'])**2) for contrast in ['dark','bright'])
        assert abs(sse-r['restarts'][selected]['sse'])<1e-14
checked_metrics=0

def check_records(obj):
    global checked_metrics
    if isinstance(obj,dict):
        if all(k in obj for k in ['predicted','measured','timeSeconds','metrics']):
            y,p=np.asarray(obj['measured']),np.asarray(obj['predicted'])
            m=obj['metrics'];assert y.shape==p.shape==(m['samples'],)
            assert len(obj['timeSeconds'])==len(y) and np.isfinite(y).all() and np.isfinite(p).all()
            squared=float(np.sum((p-y)**2));ref=float(np.sum(y*y))
            assert abs(m['rmse']-np.sqrt(squared/len(y)))<1e-14
            assert abs(m['meanError']-float(np.mean(p-y)))<1e-14
            assert abs(m['zeroReferenceSkill']-(1-squared/ref))<1e-12
            if m['correlation'] is not None:assert abs(m['correlation']-np.corrcoef(y,p)[0,1])<1e-12
            else:assert np.std(y)==0 or np.std(p)==0
            checked_metrics+=1
        else:
            for v in obj.values():check_records(v)
    elif isinstance(obj,list):
        for v in obj:check_records(v)
check_records(fit);check_records(result)
natural=result['natural'];c=natural['two_filter']
expected=all(r['validPredictedFluorescence'] and r['primary'] is not None for r in natural.values())
expected=bool(expected and c['primary']['metrics']['correlation']>0 and all(c['primary']['metrics']['rmse']<natural[m]['primary']['metrics']['rmse'] for m in ['zero','one_filter']))
assert expected==result['naturalPrimaryConditionalTransferPassed']

out=ROOT/'docs/assets';out.mkdir(exist_ok=True)
colors={'measured':'#202936','one_filter':'#b85e13','two_filter':'#1668b2'}
plt.rcParams.update({'font.size':10,'axes.titlesize':12,'axes.labelsize':10})
fig=plt.figure(figsize=(12,10),layout='constrained');grid=fig.add_gridspec(3,2,height_ratios=[1,1,1.45])
for row,cell in enumerate(['L1','L2']):
    for col,contrast in enumerate(['dark','bright']):
        ax=fig.add_subplot(grid[row,col]);r=fit['models'][cell]['two_filter'][contrast]
        ax.plot(np.asarray(r['timeSeconds'])*1000,r['measured'],color=colors['measured'],lw=1.8,label='Measured')
        for model,label in [('one_filter','One filter'),('two_filter','Two filters')]:
            r=fit['models'][cell][model][contrast]
            ax.plot(np.asarray(r['timeSeconds'])*1000,r['predicted'],color=colors[model],lw=1.5,label=label)
        ax.axhline(0,color='#99a4b3',lw=.6);ax.axvspan(0,20,color='#a1adba',alpha=.15)
        ax.set(title=f'{cell} · {contrast} flash · training',xlabel='Time from flash onset (ms)',ylabel='ASAP2f ΔF/F')
        ax.spines[['top','right']].set_visible(False)
        if row==0 and col==0:ax.legend(frameon=False,fontsize=9,ncol=3)
ax=fig.add_subplot(grid[2,:]);r=natural['two_filter']['primary']
ax.plot(r['timeSeconds'],r['measured'],color=colors['measured'],lw=1.6,label='Measured L2')
for model,label in [('one_filter','One filter'),('two_filter','Two filters')]:
    r=natural[model]['primary'];ax.plot(r['timeSeconds'],r['predicted'],color=colors[model],lw=1.5,label=label)
r=natural['two_filter']['zeroStateSecondary'];ax.plot(r['timeSeconds'],r['predicted'],color=colors['two_filter'],alpha=.5,lw=1,ls=':',label='Two filters, zero-state secondary')
ax.axhline(0,color='#99a4b3',lw=.7,ls='--',label='Zero response')
ax.set(title='L2 · entire natural stimulus held out · fixed-scale transfer failed',xlabel='Time within repeated natural stimulus (s)',ylabel='ASAP2f ΔF/F')
ax.spines[['top','right']].set_visible(False);ax.legend(frameon=False,fontsize=9,ncol=3)
fig.suptitle('Flash dynamics fit better; natural response amplitude does not transfer',fontsize=16)
fig.savefig(out/'visual-response-benchmark.png',dpi=180);plt.close(fig)

fig,axes=plt.subplots(2,2,figsize=(12,6.7),layout='constrained')
for row,cell in enumerate(['L1','L2']):
    for col,contrast in enumerate(['dark','bright']):
        ax=axes[row,col];r=result['lowLuminance'][cell]['two_filter'][contrast]
        ax.plot(np.asarray(r['timeSeconds'])*1000,r['measured'],color=colors['measured'],lw=1.8,label='Measured')
        for model,label in [('one_filter','One filter'),('two_filter','Two filters')]:
            r=result['lowLuminance'][cell][model][contrast];ax.plot(np.asarray(r['timeSeconds'])*1000,r['predicted'],color=colors[model],lw=1.5,label=label)
        ax.axhline(0,color='#99a4b3',lw=.6);ax.axvspan(0,20,color='#a1adba',alpha=.15)
        ax.set(title=f'{cell} · {contrast} flash · lowLum held out',xlabel='Time from flash onset (ms)',ylabel='ASAP2f ΔF/F');ax.spines[['top','right']].set_visible(False)
        if row==0 and col==0:ax.legend(frameon=False,fontsize=9,ncol=3)
fig.suptitle('Named dim-condition test · no gain or delay adjusted to these responses',fontsize=15)
fig.savefig(out/'visual-response-low-luminance.png',dpi=180);plt.close(fig)

report=dict(plan=plan,fit=fit,evaluation=result,verification=dict(checkedMetricRecords=checked_metrics,retainedRestarts=24,
    sourceSHA256=source_checks,planSHA256=sha(BASE/'plan.json'),fitSHA256=sha(BASE/'fit.json'),evaluationSHA256=sha(BASE/'evaluation.json'),
    analysisSourceSHA256=sha(__file__),figures={p.name:sha(p) for p in [out/'visual-response-benchmark.png',out/'visual-response-low-luminance.png']}))
(ROOT/'docs/visual-response-benchmark-results.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
print(json.dumps(dict(verifiedDataFiles=len(source_checks),checkedMetricRecords=checked_metrics,retainedRestarts=24,conditionalTransferPassed=expected)))
