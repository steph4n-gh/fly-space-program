#!/usr/bin/env python3
"""Bound frame-start relabeling effects on the frozen visual predictions."""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/visual-frame-timing'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def critical_times(model, contrast, parameters, periodic):
    """Continuous extrema inside constant-input intervals; endpoints separate."""
    if len(parameters) == 3:
        return np.empty(0)
    tau, gap, on, off, slow_on, slow_off = parameters
    slow_tau = tau+gap
    positive, negative = np.maximum(contrast, 0), np.maximum(-contrast, 0)
    fast_input, slow_input = on*positive-off*negative, slow_on*positive-slow_off*negative
    _, _, fast = model.held_state(fast_input, tau, [], periodic)
    _, _, slow = model.held_state(slow_input, slow_tau, [], periodic)
    a, b = fast[:-1]-fast_input, slow_input-slow[:-1]
    roots = []
    for i in np.flatnonzero(a*b < 0):
        t = np.log(-a[i]*slow_tau/(b[i]*tau))/(1/tau-1/slow_tau)
        if 0 < t < 1/300:
            roots.append(i/300+t)
    return np.asarray(roots)


def envelope(model, contrast, parameters, periodic, times, duration, mean, padding):
    boundaries = np.arange(len(contrast)+1)/300
    critical = critical_times(model, contrast, parameters, periodic)
    candidates = np.sort(np.concatenate([boundaries, critical]))
    groups = [np.concatenate([[t, t+duration], candidates[(candidates>t)&(candidates<t+duration)]]) for t in times]
    raw, _, _ = model.natural(np.concatenate(groups), contrast, parameters, periodic)
    values = (1+raw)/(1+mean)-1
    chunks = np.split(values, np.cumsum([len(group) for group in groups])[:-1])
    return np.asarray([chunk.min()-padding for chunk in chunks]), np.asarray([chunk.max()+padding for chunk in chunks])


def main():
    plan = json.loads((BASE/'plan.json').read_text())
    assert sha(__file__) == plan['sourceSHA256']
    assert not (BASE/'result.json').exists(), 'Preserve completed diagnostic'
    for file, expected in plan['inputSHA256'].items():
        assert sha(ROOT/file) == expected, file
    spec = importlib.util.spec_from_file_location('frozen_visual', ROOT/plan['modelSource'])
    model = importlib.util.module_from_spec(spec); spec.loader.exec_module(model)
    fit = json.loads((ROOT/plan['fitFile']).read_text())
    evaluation = json.loads((ROOT/plan['evaluationFile']).read_text())
    assert not evaluation['naturalPrimaryConditionalTransferPassed']
    contrast = np.asarray(evaluation['stimulus']['contrast'])
    first = evaluation['natural']['zero']['primary']
    times, measured = np.asarray(first['timeSeconds']), np.asarray(first['measured'])
    duration = 1/plan['naturalAcquisitionHz']
    assert times.shape == measured.shape == (708,) and contrast.shape == (600,)
    assert times.min() >= 0 and times.max()+duration < 2
    zero_mse = float(np.mean(measured**2))
    records, envelopes = [], []
    for name in ['zero', 'one_filter', 'two_filter']:
        parameters = None if name == 'zero' else fit['models']['L2'][name]['parameters']
        mean = evaluation['natural'][name]['periodicCycleMeanGrayReference']
        assert 1+mean > 0 and evaluation['natural'][name]['validPredictedFluorescence']
        for initialization, key in [('periodic','primary'),('startup','zeroStateSecondary')]:
            periodic = initialization == 'periodic'
            low, high = (np.zeros_like(times), np.zeros_like(times)) if parameters is None else envelope(
                model, contrast, parameters, periodic, times, duration, mean, plan['envelopeNumericalPadding'])
            for offset in plan['offsetsSeconds']:
                raw = np.zeros_like(times) if parameters is None else model.natural(times+offset, contrast, parameters, periodic)[0]
                prediction = (1+raw)/(1+mean)-1
                assert np.all((prediction >= low)&(prediction <= high))
                if offset == 0:
                    assert np.allclose(prediction, evaluation['natural'][name][key]['predicted'], atol=1e-15, rtol=0)
                records.append({'model':name,'initialization':initialization,'offsetSeconds':offset,
                                'predicted':prediction.tolist(),'metrics':model.metrics(measured,prediction)})
            distance = np.maximum(np.maximum(low-measured, measured-high), 0)
            lower_bound = float(np.mean(distance**2))
            envelopes.append({'model':name,'initialization':initialization,'lower':low.tolist(),'upper':high.tolist(),
                              'pointwiseDistanceToEnvelope':distance.tolist(),'optimisticMSELowerBound':lower_bound,
                              'optimisticRMSELowerBound':float(np.sqrt(lower_bound)),
                              'optimisticZeroReferenceSkillUpperBound':1-lower_bound/zero_mse,
                              'frameStartRelabelingAloneCannotBeatZeroUnderTheseAssumptions':lower_bound>zero_mse})
    assert len(records) == 54 and len(envelopes) == 6
    result = {'scope':plan['scope'],'plan':plan,'planSHA256':sha(BASE/'plan.json'),'sourceSHA256':sha(__file__),
              'timeSeconds':times.tolist(),'measured':measured.tolist(),'zeroReferenceMSE':zero_mse,
              'records':records,'envelopes':envelopes,'originalTransferPassed':False,
              'interpretationLimits':plan['interpretationLimits']}
    with (BASE/'result.json').open('x') as file:
        json.dump(result,file,indent=2,allow_nan=False);file.write('\n')
    (ROOT/'docs/visual-frame-timing-results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'records':len(records),'envelopes':[{k:v for k,v in e.items() if k not in ['lower','upper','pointwiseDistanceToEnvelope']} for e in envelopes],
                      'resultSHA256':sha(BASE/'result.json')},indent=2))


if __name__ == '__main__':
    main()
