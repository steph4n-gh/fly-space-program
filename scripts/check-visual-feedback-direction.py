#!/usr/bin/env python3
"""Fixed local feedback-strength sensitivity against already inspected CDM data."""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from visual_recurrent import Parameters, flash_predictions

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/visual-recurrent-development/feedback-direction'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    plan = json.loads((BASE/'plan.json').read_text())
    assert sha(__file__)==plan['sourceSHA256']
    for name, expected in plan['inputSHA256'].items():
        assert sha(ROOT/name)==expected, name
    spec = importlib.util.spec_from_file_location('cdm_comparison',ROOT/plan['comparisonSource'])
    comparison_source = importlib.util.module_from_spec(spec);spec.loader.exec_module(comparison_source)
    comparison = json.loads((ROOT/plan['comparisonFile']).read_text())
    predictions = {}
    for cell, file in plan['fitFiles'].items():
        fit = json.loads((ROOT/file).read_text())
        assert fit['complete'] and not fit['independentResponseTestPerformed']
        p = np.asarray(fit['models']['recurrent']['selected']['parameters'])
        assert 0<p[2]<40
        for polarity, sign in [('dark',-1),('bright',1)]:
            t = np.asarray(next(r for r in fit['models']['recurrent']['traces'] if r['polarity']==polarity)['timeSeconds'])
            initial, path = flash_predictions(Parameters(*p),t,sign)
            steps = []
            for fraction in plan['relativeSteps']:
                delta = p[2]*fraction
                plus, minus = p.copy(), p.copy()
                plus[2] += delta;minus[2] -= delta
                assert 0<minus[2]<plus[2]<40
                yp, pp = flash_predictions(Parameters(*plus),t,sign)
                ym, pm = flash_predictions(Parameters(*minus),t,sign)
                central, forward = (yp-ym)/(2*delta), (yp-initial)/delta
                steps.append({'relativeStep':fraction,'absoluteStep':delta,
                              'plusPrediction':yp.tolist(),'minusPrediction':ym.tolist(),
                              'centralDerivative':central.tolist(),'forwardDerivative':forward.tolist(),
                              'minimumFluorescence':1+min(pp.min_r,pm.min_r)})
            primary = steps[-1]
            previous = steps[-2]
            error = float(np.max(np.abs(np.asarray(primary['centralDerivative'])-previous['centralDerivative'])))
            scale = float(np.max(np.abs(primary['centralDerivative'])))
            predictions[cell,polarity] = {'cell':cell,'polarity':polarity,'parameters':p.tolist(),
                'timeSeconds':t.tolist(),'basePrediction':initial.tolist(),'steps':steps,
                'minimumBaseFluorescence':1+path.min_r,'centralStepMaximumDifference':error,
                'centralStepConverged':error<=plan['derivativeAtol']+plan['derivativeRtol']*scale}
    records = []
    for measured in comparison['records']:
        model = predictions[measured['cell'],measured['polarity']]
        t = np.asarray(model['timeSeconds'])
        assert np.array_equal(t,measured['timeSeconds'])
        derivative = np.asarray(model['steps'][-1]['forwardDerivative'])
        central = np.asarray(model['steps'][-1]['centralDerivative'])
        observed = np.asarray(measured['difference'])
        windows = {}
        for name,bounds in comparison['plan']['windowsSeconds'].items():
            expected = comparison_source.window_mean(t,derivative,bounds)
            central_mean = comparison_source.window_mean(t,central,bounds)
            measured_change = measured['windows'][name]['differenceDFF']
            tolerance = plan['directionTolerance']
            stable = abs(expected)>tolerance and abs(central_mean)>tolerance and np.sign(expected)==np.sign(central_mean)
            evaluable = model['centralStepConverged'] and stable and abs(measured_change)>tolerance
            windows[name] = {'observedRawChangeDFF':measured_change,'predictedRawDerivativePerW':expected,
                             'centralRawDerivativePerW':central_mean,'directionEvaluable':bool(evaluable),
                             'sameDirection':bool(expected*measured_change>0) if evaluable else None}
        denominator = np.linalg.norm(derivative)*np.linalg.norm(observed)
        initial_sign = -1 if measured['polarity']=='dark' else 1
        records.append({k:measured[k] for k in ['cell','condition','polarity']}|
            {'windows':windows,'observedTraceDifference':observed.tolist(),
             'directionCosine':float(derivative@observed/denominator) if denominator>0 else None,
             'signedEarlyDerivative':initial_sign*windows['early']['predictedRawDerivativePerW'],
             'signedLateDerivative':-initial_sign*windows['late']['predictedRawDerivativePerW']})
    primary = [r['windows'][name] for r in records for name in ['early','late']]
    result = {'scope':plan['scope'],'plan':plan,'planSHA256':sha(BASE/'plan.json'),
              'sourceSHA256':sha(__file__),'modelPredictions':list(predictions.values()),'records':records,
              'primaryWindowCount':len(primary),'evaluablePrimaryWindows':sum(r['directionEvaluable'] for r in primary),
              'sameDirectionPrimaryWindows':sum(r['sameDirection'] is True for r in primary),
              'allPrimaryDirectionsConsistent':all(r['sameDirection'] is True for r in primary),
              'chemicalEfficacyEstablished':False,'connectomeParametersInstalled':False}
    with (BASE/'comparison.json').open('x') as file:
        json.dump(result,file,indent=2,allow_nan=False);file.write('\n')
    (ROOT/'docs/visual-feedback-direction-results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['plan','modelPredictions','records']}))


if __name__=='__main__':
    main()
