#!/usr/bin/env python3
"""Bound common phase-mixture MSE using already frozen intervals and envelopes."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/visual-frame-timing/phase-mixture-bound'
EXPECTED = {
    'docs/visual-frame-timing-results.json':'f30f491ac718d1d55321a3111feef9c07464b0e39b4268265a1a873114e12b47',
    'docs/visual-shared-phase-bound.json':'5aeaff95d3e9e9b3787f00ac1a28f73fd6bb0810b6f755ca50d4ca5352e0a7a2',
}
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    for name, expected in EXPECTED.items():
        assert sha(ROOT/name) == expected, name
    full, shared = [json.loads((ROOT/name).read_text()) for name in EXPECTED]
    assert full['originalTransferPassed'] is shared['originalTransferPassed'] is False
    assert full['zeroReferenceMSE'] == shared['zeroReferenceMSE']
    assert sha(ROOT/shared['fullResultFile']) == shared['fullResultSHA256']
    records = []
    for envelope in full['envelopes']:
        row = next(r for r in shared['results'] if (r['model'],r['initialization'])==
                   (envelope['model'],envelope['initialization']))
        low, high = envelope['lower'], envelope['upper']
        assert len(low) == len(high) == 708 and all(a<=b for a,b in zip(low,high))
        variances = [(b-a)**2/4 for a,b in zip(low,high)]
        maximum_variance = math.fsum(variances)/len(variances)
        common_phase_lower_bound = min(r['optimisticMSELowerBound'] for r in row['partitions'])
        assert common_phase_lower_bound == row['minimumPartitionMSELowerBound']
        mixture_lower_bound = common_phase_lower_bound-maximum_variance
        records.append({'model':row['model'],'initialization':row['initialization'],
                        'commonPhaseMSELowerBound':common_phase_lower_bound,
                        'pointwisePhaseVarianceUpperBounds':variances,'meanPhaseVarianceUpperBound':maximum_variance,
                        'commonMixtureMSELowerBound':mixture_lower_bound,
                        'commonMixtureZeroReferenceSkillUpperBound':1-mixture_lower_bound/full['zeroReferenceMSE'],
                        'everyCommonPhaseMixtureHasMSEStrictlyAboveZero':mixture_lower_bound>full['zeroReferenceMSE']})
    assert len(records) == 6
    result = {'scope':'Post-test arithmetic bound for any one phase distribution applied to all observations, separately for each frozen model and initialization. No new simulation, fit or phase selection.',
              'sourceSHA256':sha(__file__),'inputSHA256':EXPECTED,'zeroReferenceMSE':full['zeroReferenceMSE'],
              'originalTransferPassed':False,'records':records,
              'derivation':'MSE(E_mu[p_delta]) = E_mu[MSE(p_delta)] - mean_i Var_mu[p_delta_i]. The first term is at least the minimum of all shared-phase partition lower bounds. Each variance is at most (upper_i-lower_i)^2/4 by the bounded-range variance inequality. Subtracting the mean of these variance upper bounds gives a lower bound for every common phase distribution.',
              'interpretationLimits':['The distribution may span the whole original phase interval, but its weights must be the same for all708 observations. Independent observation-specific mixtures are not covered.',
                'Each record fixes its original startup or periodic initialization. Arbitrary mixtures of initial states are not assessed.',
                'All original input, parameters, point observation and periodic fluorescence normalization remain fixed. ROI integration, clock drift and unknown compact-export lineage remain outside this frame-start-only argument.',
                'The underlying envelopes and partition bounds use floating-point calculations with fixed padding and independent verification, not formal interval arithmetic.',
                'Already inspected responses are development data. This bound preserves the original failed transfer and does not establish physiological or chemical efficacy.']}
    BASE.mkdir(exist_ok=True)
    with (BASE/'result.json').open('x') as file:
        json.dump(result,file,indent=2,allow_nan=False);file.write('\n')
    (ROOT/'docs/visual-phase-mixture-bound.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='pointwisePhaseVarianceUpperBounds'} for r in records],indent=2))


if __name__=='__main__':
    main()
