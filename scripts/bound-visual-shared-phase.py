#!/usr/bin/env python3
"""Refine the frozen frame-start bound across every fixed shared-phase interval."""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/visual-frame-timing/shared-phase-bound'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


def main():
    plan = json.loads((BASE/'plan.json').read_text())
    assert sha(__file__) == plan['sourceSHA256']
    assert not (BASE/'result.json').exists(), 'Preserve completed bounds'
    for path, expected in plan['inputSHA256'].items():
        assert sha(ROOT/path) == expected, path
    timing = module('frozen_timing', ROOT/plan['timingSource'])
    model = module('frozen_model', ROOT/plan['modelSource'])
    original = json.loads((ROOT/plan['timingResult']).read_text())
    fit = json.loads((ROOT/plan['fitFile']).read_text())
    evaluation = json.loads((ROOT/plan['evaluationFile']).read_text())
    independent = json.loads((ROOT/plan['independentResult']).read_text())
    t, measured = np.asarray(original['timeSeconds']), np.asarray(original['measured'])
    contrast = np.asarray(evaluation['stimulus']['contrast'])
    duration = 1/original['plan']['naturalAcquisitionHz']
    zero_mse = float(np.mean(measured**2))
    results, largest_difference = [], 0.
    for name in ['zero','one_filter','two_filter']:
        p = None if name == 'zero' else fit['models']['L2'][name]['parameters']
        mean = evaluation['natural'][name]['periodicCycleMeanGrayReference']
        assert 1+mean > 0
        for initialization in ['periodic','startup']:
            intervals = []
            expected = next(r for r in independent['results'] if r['model']==name and r['initialization']==initialization)
            for index in range(plan['partitions']):
                start, end = duration*index/plan['partitions'], duration*(index+1)/plan['partitions']
                low, high = (np.zeros_like(t),np.zeros_like(t)) if p is None else timing.envelope(
                    model,contrast,p,initialization=='periodic',t+start,end-start,mean,plan['numericalPadding'])
                distance = np.maximum(np.maximum(low-measured,measured-high),0)
                mse = float(np.mean(distance**2))
                reference = expected['partitions'][index]
                for key, actual in [('lower',low),('upper',high),('pointwiseDistanceToEnvelope',distance)]:
                    error = float(np.max(np.abs(actual-reference[key])))
                    largest_difference = max(largest_difference,error)
                    assert error < 1e-14
                assert abs(mse-reference['optimisticMSELowerBound']) < 1e-16
                intervals.append({'index':index,'offsetStartSeconds':start,'offsetEndSeconds':end,
                                  'lower':low.tolist(),'upper':high.tolist(),'pointwiseDistanceToEnvelope':distance.tolist(),
                                  'optimisticMSELowerBound':mse,'optimisticZeroReferenceSkillUpperBound':1-mse/zero_mse})
            assert intervals[0]['offsetStartSeconds']==0 and intervals[-1]['offsetEndSeconds']==duration
            assert all(a['offsetEndSeconds']==b['offsetStartSeconds'] for a,b in zip(intervals[:-1],intervals[1:]))
            result = {'model':name,'initialization':initialization,'partitions':intervals,
                      'minimumPartitionMSELowerBound':min(r['optimisticMSELowerBound'] for r in intervals),
                      'maximumPartitionMSELowerBound':max(r['optimisticMSELowerBound'] for r in intervals),
                      'everySharedPhaseHasMSEStrictlyAboveZero':all(r['optimisticMSELowerBound']>zero_mse for r in intervals)}
            assert result['everySharedPhaseHasMSEStrictlyAboveZero']==expected['everySharedPhaseHasMSEStrictlyAboveZero']
            results.append(result)
    record = {'scope':plan['scope'],'plan':plan,'planSHA256':sha(BASE/'plan.json'),'zeroReferenceMSE':zero_mse,
              'originalTransferPassed':False,'maximumIndependentVectorDifference':largest_difference,'results':results}
    with (BASE/'result.json').open('x') as file:
        json.dump(record,file,indent=2,allow_nan=False);file.write('\n')
    record['fullResultSHA256'] = sha(BASE/'result.json')
    record['fullResultFile'] = str((BASE/'result.json').relative_to(ROOT))
    for result in results:
        result['partitions'] = [{k:v for k,v in row.items() if k not in ['lower','upper','pointwiseDistanceToEnvelope']} for row in result['partitions']]
    (ROOT/'docs/visual-shared-phase-bound.json').write_text(json.dumps(record,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'maximumIndependentVectorDifference':largest_difference,'results':[{k:v for k,v in r.items() if k!='partitions'} for r in results]},indent=2))


if __name__ == '__main__':
    main()
