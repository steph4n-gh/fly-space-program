#!/usr/bin/env python3
"""Fit published flash fluorescence; freeze before whole-stimulus transfer tests.

This is an observation-level benchmark, not a connectome or release model.
The two commands deliberately separate training from held-out evaluation.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.io import loadmat
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/odor-interface/visual-response-benchmark'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def write_new(path, obj):
    with Path(path).open('x') as f:
        json.dump(obj, f, indent=2, allow_nan=False)
        f.write('\n')


def verify():
    plan = json.loads((BASE / 'plan.json').read_text())
    assert plan['sourceSHA256'] == sha(__file__)
    for name, expected in plan['dataSHA256'].items():
        assert sha(BASE / 'data' / name) == expected, name
    return plan


def step_integral(t, tau):
    t = np.maximum(np.asarray(t), 0)
    return t + tau * np.expm1(-t / tau)


def flash_kernel(t, tau, duration=.020, width=1/120):
    # Stored flash coordinates are trailing observation-bin END times.
    H = lambda x: step_integral(x, tau)
    return (H(t)-H(t-duration)-H(t-width)+H(t-width-duration))/width


def flash(t, p):
    if len(p) == 3:
        tau, on, off = p
        f = flash_kernel(t, tau)
        return np.stack([-off*f, on*f])
    tau, gap, on, off, slow_on, slow_off = p
    f, s = flash_kernel(t, tau), flash_kernel(t, tau+gap)
    return np.stack([-off*f+slow_off*s, on*f-slow_on*s])


def held_state(u, tau, times, periodic):
    dt = 1/300
    decay = np.exp(-dt/tau)
    b = 0.
    for value in u:
        b = value + (b-value)*decay
    start = b/(-np.expm1(-len(u)*dt/tau)) if periodic else 0.
    starts = [start]
    integral = 0.
    for value in u:
        integral += value*dt+(start-value)*tau*(1-decay)
        start = value+(start-value)*decay
        starts.append(start)
    times = np.asarray(times)
    assert np.all((times >= 0) & (times <= len(u)*dt))
    index = np.minimum(np.floor(times/dt).astype(int), len(u)-1)
    sample = u[index]+(np.asarray(starts)[index]-u[index])*np.exp(-(times-index*dt)/tau)
    return sample, integral/(len(u)*dt), np.asarray(starts)


def natural(times, contrast, p, periodic=True):
    on, off = np.maximum(contrast, 0), np.maximum(-contrast, 0)
    if len(p) == 3:
        tau, a, b = p
        branches = [(on, tau, a), (off, tau, -b)]
    else:
        tau, gap, a, b, c, d = p
        branches = [(on, tau, a), (off, tau, -b),
                    (on, tau+gap, -c), (off, tau+gap, d)]
    y, mean = np.zeros(len(times)), 0.
    boundary = np.zeros(len(contrast)+1)
    for u, tau, amplitude in branches:
        values, average, states = held_state(u, tau, times, periodic)
        y += amplitude*values
        mean += amplitude*average
        boundary += amplitude*states
    return y, float(mean), boundary


def natural_minimum(contrast, p, periodic):
    """Exact extrema of the exponential sum within every display interval."""
    on, off = np.maximum(contrast, 0), np.maximum(-contrast, 0)
    tau = p[0]
    fast_input = p[1]*on-p[2]*off if len(p)==3 else p[2]*on-p[3]*off
    _, _, fast = held_state(fast_input, tau, [], periodic)
    if len(p)==3:
        return float(fast.min())
    slow_tau = tau+p[1]
    slow_input = p[4]*on-p[5]*off
    _, _, slow = held_state(slow_input, slow_tau, [], periodic)
    minimum = float((fast-slow).min())
    A, B = fast[:-1]-fast_input, slow_input-slow[:-1]
    opposed = np.flatnonzero(A*B<0)
    for i in opposed:
        time = np.log(-A[i]*slow_tau/(B[i]*tau))/(1/tau-1/slow_tau)
        if 0<time<1/300:
            value = fast_input[i]-slow_input[i]+A[i]*np.exp(-time/tau)+B[i]*np.exp(-time/slow_tau)
            minimum = min(minimum, float(value))
    return minimum


def metrics(y, prediction):
    y, prediction = np.asarray(y), np.asarray(prediction)
    squared_error = float(np.sum((prediction-y)**2))
    denominator = float(np.sum(y*y))
    correlation = float(np.corrcoef(y, prediction)[0, 1]) if np.std(y)>0 and np.std(prediction)>0 else None
    return dict(rmse=float(np.sqrt(squared_error/y.size)), zeroReferenceSkill=1-squared_error/denominator if denominator>0 else None,
                correlation=correlation, meanError=float(np.mean(prediction-y)), samples=int(y.size))


def traces(t, y, prediction):
    return dict(timeSeconds=t.tolist(), measured=y.tolist(), predicted=prediction.tolist(), metrics=metrics(y, prediction))


def fit(plan):
    assert not (BASE / 'fit.json').exists() and not (BASE / 'evaluation.json').exists()
    results = {}
    for cell in ['L1', 'L2']:
        mat = loadmat(BASE / 'data' / (cell+'_highLum.mat'))
        t, y = mat['t'].ravel(), mat['meanResp']
        assert t.shape == (63,) and y.shape == (2, 63) and np.isfinite(y).all()
        models = {}
        for model in ['one_filter', 'two_filter']:
            cfg = plan['optimization'][model]
            low, high = np.asarray(cfg['lower']), np.asarray(cfg['upper'])
            restarts = []
            for initial in cfg['starts']:
                r = least_squares(lambda p: (flash(t, p)-y).ravel(), initial, bounds=(low, high),
                                  ftol=1e-12, xtol=1e-12, gtol=1e-12, max_nfev=2000)
                restarts.append(dict(initial=initial, parameters=r.x.tolist(), sse=float(np.sum(r.fun**2)),
                                     success=bool(r.success), status=int(r.status), message=r.message,
                                     evaluations=int(r.nfev), optimality=float(r.optimality),
                                     boundHits=[int(i) for i in np.flatnonzero((r.x-low <= 1e-6*(high-low)) | (high-r.x <= 1e-6*(high-low)))]))
            write_new(BASE / (cell+'-'+model+'-fit-attempts.json'), dict(planSHA256=sha(BASE/'plan.json'), restarts=restarts))
            assert all(r['success'] for r in restarts), 'Preserve incomplete fit; do not evaluate holdout.'
            selected = min(range(len(restarts)), key=lambda k: (restarts[k]['sse'], k))
            parameters = restarts[selected]['parameters']
            prediction = flash(t, parameters)
            models[model] = dict(parameters=parameters, selectedRestart=selected, restarts=restarts,
                                 dark=traces(t, y[0], prediction[0]), bright=traces(t, y[1], prediction[1]))
        results[cell] = models
    record = dict(stage='training-only parameter freeze', planSHA256=sha(BASE/'plan.json'),
                  sourceSHA256=sha(__file__), responseFilesRead=['L1_highLum.mat', 'L2_highLum.mat'], models=results)
    write_new(BASE / 'fit.json', record)
    print(json.dumps(dict(fitSHA256=sha(BASE/'fit.json'), parameters={c:{m:r['parameters'] for m,r in v.items()} for c,v in results.items()})))


def evaluate(plan):
    assert not (BASE / 'evaluation.json').exists()
    frozen = json.loads((BASE / 'fit.json').read_text())
    assert frozen['planSHA256'] == sha(BASE/'plan.json') and frozen['sourceSHA256'] == sha(__file__)
    low_results = {}
    for cell in ['L1', 'L2']:
        mat = loadmat(BASE/'data'/(cell+'_lowLum.mat'))
        t, y = mat['t'].ravel(), mat['meanResp']
        assert t.shape == (63,) and y.shape == (2,63) and np.isfinite(y).all()
        low_results[cell] = {}
        for model in ['zero', 'one_filter', 'two_filter']:
            prediction = np.zeros_like(y) if model == 'zero' else flash(t, frozen['models'][cell][model]['parameters'])
            low_results[cell][model] = dict(dark=traces(t,y[0],prediction[0]), bright=traces(t,y[1],prediction[1]))
    stimulus = json.loads((BASE/'data'/'natural-stimulus-audit.json').read_text())
    contrast = np.asarray(stimulus['contrastAboutGrayHalf'])
    assert contrast.shape == (600,) and np.allclose(contrast, 2*np.asarray(stimulus['normalizedLuminance'])-1, atol=0, rtol=0)
    assert np.allclose(stimulus['sampleStartSeconds'], np.arange(600)/300, atol=1e-15, rtol=0)
    mat = loadmat(BASE/'data'/'L2_2s_natstim_corrected_fixedtiming.mat')
    t, y, individual = mat['t_fixed'].ravel(), mat['meanResp_fixed'].ravel(), mat['indivResp_fixed']
    assert t.shape == y.shape == (708,) and individual.shape == (52,708)
    assert np.isfinite(y).all() and np.allclose(y, individual.mean(axis=0), atol=1e-12, rtol=0)
    natural_results = {}
    for model in ['zero', 'one_filter', 'two_filter']:
        if model == 'zero':
            raw, startup, mean, minimum = np.zeros_like(y), np.zeros_like(y), 0., 1.
        else:
            p = frozen['models']['L2'][model]['parameters']
            raw, mean, boundary = natural(t, contrast, p, periodic=True)
            startup, _, startup_boundary = natural(t, contrast, p, periodic=False)
            minimum = 1+min(natural_minimum(contrast,p,True), natural_minimum(contrast,p,False))
        valid = mean > -1 and minimum > 0
        converted = (1+raw)/(1+mean)-1 if mean > -1 else None
        converted_startup = (1+startup)/(1+mean)-1 if mean > -1 else None
        natural_results[model] = dict(periodicCycleMeanGrayReference=mean, minimumPredictedFluorescenceExact=minimum,
             validPredictedFluorescence=valid, primary=traces(t,y,converted) if converted is not None else None,
             zeroStateSecondary=traces(t,y,converted_startup) if converted_startup is not None else None,
             unconvertedPeriodicDiagnostic=traces(t,y,raw), unconvertedZeroStateDiagnostic=traces(t,y,startup))
    candidate = natural_results['two_filter']
    passed = all(r['validPredictedFluorescence'] and r['primary'] is not None for r in natural_results.values())
    passed = bool(passed and candidate['primary']['metrics']['correlation'] is not None and candidate['primary']['metrics']['correlation']>0
                  and all(candidate['primary']['metrics']['rmse'] < natural_results[m]['primary']['metrics']['rmse'] for m in ['zero','one_filter']))
    result = dict(complete=True, planSHA256=sha(BASE/'plan.json'), fitSHA256=sha(BASE/'fit.json'), sourceSHA256=sha(__file__),
                  lowLuminance=low_results, natural=natural_results, naturalPrimaryConditionalTransferPassed=passed,
                  stimulus=dict(timeSeconds=stimulus['sampleStartSeconds'], contrast=contrast.tolist()),
                  interpretation=plan['interpretation'], individualTraces=52, animalCount='unavailable; ROI count is not animal count')
    write_new(BASE/'evaluation.json', result)
    print(json.dumps(dict(naturalPrimaryConditionalTransferPassed=passed,
        natural={m:{'primary':r['primary']['metrics'] if r['primary'] else None,'zeroStateSecondary':r['zeroStateSecondary']['metrics'] if r['zeroStateSecondary'] else None,'valid':r['validPredictedFluorescence']} for m,r in natural_results.items()},
        lowLuminance={c:{m:{s:d['metrics'] for s,d in r.items()} for m,r in models.items()} for c,models in low_results.items()})))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['fit','evaluate'])
    args = parser.parse_args()
    plan = verify()
    fit(plan) if args.stage == 'fit' else evaluate(plan)
