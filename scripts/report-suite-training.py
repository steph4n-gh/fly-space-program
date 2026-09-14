"""Export the matched calibration failure/probe and current search progress."""
import hashlib
import json
import math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

root = Path(__file__).resolve().parents[1]
folder = root/'artifacts/suite-training'
out = root/'docs/assets'
out.mkdir(exist_ok=True)
sources = [folder/'vertical/static-probe.json', folder/'dynamic-initial-probe.json']
probes = [json.loads(p.read_text()) for p in sources]
assert probes[0]['parameters'] == probes[1]['parameters']
assert probes[0]['cases'] == probes[1]['cases']
flights = [p['results'][0]['flights'][0] for p in probes]
assert flights[0]['seed'] == flights[1]['seed'] == 714133
assert not flights[0]['landed'] and flights[1]['landed']

fig, axes = plt.subplots(1, 2, figsize=(11, 4.4), layout='constrained')
colors = ['#c15a45', '#16737b']
for flight, label, color in zip(flights, ['Static calibration', 'Changing-body calibration'], colors):
    rows = flight['trajectory']
    time = np.array([r['t'] for r in rows])
    axes[0].plot(time, [r['decoded'][0] for r in rows], color=color, lw=1.3, label=label)
    axes[1].plot(time, [r['vy'] for r in rows], color=color, lw=1.8, label=label)
    axes[1].scatter([flight['time']], [-flight['touchdown']['speed']], color=color, s=32)
axes[0].axhspan(-1, 1, color='#d8e4e4', alpha=.65)
axes[0].set_yscale('symlog', linthresh=1)
axes[0].set_title('Decoded clearance-light value')
axes[0].set_ylabel('Encoded units; shaded band is the display range')
axes[1].axhspan(-3.6, 0, color='#d8e4e4', alpha=.65)
axes[1].set_title('Measured vertical speed')
axes[1].set_ylabel('m/s; dots mark touchdown')
axes[1].text(.97, .04, 'Same parameters and starting state\nOne illustrative matched probe', transform=axes[1].transAxes, ha='right', fontsize=9)
for ax in axes:
    ax.set_xlabel('Simulation time, s')
    ax.spines[['top','right']].set_visible(False)
    ax.grid(axis='y', alpha=.2)
axes[0].legend(frameon=False, fontsize=9)
fig.savefig(out/'suite-calibration-probe.png', dpi=180)
plt.close(fig)

states = {}
for name in ['vertical', 'vertical-robust', 'attitude', 'ground-general', 'attitude-correlated',
             'engine-transition', 'recovery-grid', 'attitude-adaptive', 'gimbal-steering',
             'orbital-insertion', 'orbital-progress', 'orbital-calibrated', 'vertical-all-ground', 'orbital-hold']:
    path = folder/name/'state.json'
    if path.exists():
        sources.append(path)
        d = json.loads(path.read_text())
        states[name] = {'generation': d['generation'], 'episodes': d['episodes'],
                        'history': [{k:r.get(k) for k in ['generation','episodes','landings','batch','score','fitness']} for r in d['history']]}
        trials_file = folder/name/'trials.jsonl'
        if trials_file.exists():
            sources.append(trials_file)
            generations = [json.loads(line) for line in trials_file.read_text().splitlines() if line.strip()]
            all_flights = [f for g in generations for r in g['results'] for f in r['flights']]
            assert len(generations) == d['generation'] and len(all_flights) == d['episodes'], name
            assert all(not f.get('censored', False) for f in all_flights)
            states[name]['allCandidateFlights'] = len(all_flights)
            states[name]['allCandidateLandings'] = sum(f['landed'] for f in all_flights)
            if name == 'vertical-all-ground':
                plan_path = folder/name/'plan.json'
                plan = json.loads(plan_path.read_text())
                initial_path = folder/name/'frozen-initial.json'
                initial = json.loads(initial_path.read_text())
                source_path = folder/name/('source-' + plan['sourceSHA256'] + '.mjs')
                for source, expected in [(initial_path, plan['initialSHA256']),
                                         (root/plan['basisPath'], plan['basisSHA256']),
                                         (source_path, plan['sourceSHA256']),
                                         (root/plan['probeFile'], plan['probeSHA256'])]:
                    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
                    sources.append(source)
                sources.extend([plan_path, folder/name/'candidate.json'])
                assert d['generation'] == plan['generations'] == 4
                assert len(all_flights) == plan['expectedFlights'] == 768
                assert sorted(plan['profiles']) == list(range(24)) and plan['activeDirections'] == list(range(5))
                assert d['calibrationHash'] == plan['basisSHA256'] and d['sourceSHA256'] == plan['sourceSHA256']
                frozen_tail = initial['parameters'][5:] + [0]*(28-len(initial['parameters']))
                for generation, history in zip(generations, d['history']):
                    g = generation['generation']
                    cases = [{'scenario': plan['profiles'][(g+i-1)%24],
                              'seed': 714133 if i == 0 else 527801+g*15427+i*10391,
                              'variability': .4 if i%2 else 0} for i in range(24)]
                    assert generation['cases'] == cases and len(generation['results']) == plan['population'] == 8
                    assert generation['sourceSHA256'] == plan['sourceSHA256'] and generation['calibrationHash'] == plan['basisSHA256']
                    assert generation['touchdownMargin'] == 3 and generation['searchSeed'] == plan['searchSeed']
                    assert generation['backend'] == 'native-exact-rate' and generation['nativeBuild'] == d['nativeBuild']
                    for result in generation['results']:
                        assert len(result['parameters']) == 28 and result['parameters'][5:] == frozen_tail
                        assert len(result['flights']) == 24
                        for f, c in zip(result['flights'], cases):
                            assert (f['scenario'], f['seed'], f['variation']['level']) == (c['scenario'], c['seed'], c['variability'])
                            assert not f['censored'] and f['styleBonus'] == 0 and f['activationGain'] == 1 and 'milestones' not in f
                        score = sum(f['score'] for f in result['flights'])/24
                        fitness = sum(f['score']-3*(f['touchdown']['speed']**2+f['touchdown']['lateral']**2 if f['landed'] else 0) for f in result['flights'])/24
                        assert math.isclose(score, result['score'], abs_tol=1e-12, rel_tol=1e-12)
                        assert math.isclose(fitness, result['fitness'], abs_tol=1e-12, rel_tol=1e-12)
                        assert result['landings'] == sum(f['landed'] for f in result['flights'])
                    best = max(generation['results'], key=lambda r: (r['landings'], r['fitness']))
                    assert all(history[key] == best[key] for key in ['parameters', 'score', 'fitness', 'landings', 'flights'])
                    assert history['generation'] == g and history['episodes'] == 192*g
                assert [g['generation'] for g in generations] == [1, 2, 3, 4] and d['best'] == best
                states[name]['coverageAndRewardVerified'] = True
                states[name]['allCandidateLandingsByMission'] = {str(i): sum(f['landed'] for f in all_flights if f['scenario'] == i) for i in range(24)}
                states[name]['lastGenerationOutcomes'] = best['flights']
            if name == 'orbital-hold':
                plan_path = folder/name/'plan.json'
                plan = json.loads(plan_path.read_text())
                initial_path = root/plan['initialFile']
                initial = json.loads(initial_path.read_text())
                launch_path = folder/name/'launch-parameters.json'
                launch = json.loads(launch_path.read_text())
                assert launch['planSHA256'] == hashlib.sha256(plan_path.read_bytes()).hexdigest()
                assert launch['touchdownMargin'] == 3
                for path, expected in [(initial_path, plan['initialSHA256']),
                                       (root/plan['basisFile'], plan['basisSHA256']),
                                       (folder/name/('source-'+plan['sourceSHA256']+'.mjs'), plan['sourceSHA256']),
                                       (folder/name/('insertion-hold-'+plan['insertionRewardSourceSHA256']+'.mjs'), plan['insertionRewardSourceSHA256'])]:
                    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
                    sources.append(path)
                assert d['generation'] == plan['generations'] == 6 and d['episodes'] == plan['expectedFlights'] == 432
                assert plan['profiles'] == d['profiles'] == [24,25,26]
                assert plan['activeDirections'] == list(range(12))+list(range(16,28))
                assert d['nativeBuild'] == initial['nativeBuild']
                assert d['calibrationHash'] == plan['basisSHA256'] and d['sourceSHA256'] == plan['sourceSHA256']
                assert d['insertionRewardSourceSHA256'] == plan['insertionRewardSourceSHA256']
                milestone_order = ['Final approach','Atmospheric entry','Deorbit','One full orbit','Stable orbit','Space','Launch']
                def rank(r):
                    return (r['landings'], *(sum(any(m['name']==name for m in f['milestones']) for f in r['flights']) for name in milestone_order), r['fitness'])
                assert [g['generation'] for g in generations] == list(range(1,7))
                for generation, history in zip(generations,d['history']):
                    g = generation['generation']
                    cases = [{'scenario':plan['profiles'][(g+i-1)%3], 'seed':714133 if i==0 else 527801+g*15427+i*10391,
                              'variability':.4 if i%2 else 0} for i in range(6)]
                    assert generation['cases'] == cases and len(generation['results']) == plan['population'] == 12
                    assert all(sorted(c['variability'] for c in cases if c['scenario']==i)==[0,.4] for i in [24,25,26])
                    assert generation['backend'] == 'native-exact-rate' and generation['nativeBuild'] == d['nativeBuild']
                    assert generation['searchSeed'] == plan['searchSeed'] and generation['correlated']
                    for key in ['sourceSHA256','insertionRewardSourceSHA256','selectionOrder','fitnessVersion']:
                        assert generation[key] == plan[key] == d[key]
                    assert generation['calibrationHash'] == plan['basisSHA256'] and generation['touchdownMargin'] == 3
                    for r in generation['results']:
                        assert len(r['parameters']) == 28 and r['parameters'][12:16] == initial['parameters'][12:16]
                        assert len(r['flights']) == 6
                        for f,c in zip(r['flights'],cases):
                            assert (f['scenario'],f['seed'],f['variation']['level']) == (c['scenario'],c['seed'],c['variability'])
                            assert not f['censored'] and f['styleBonus'] == 0 and f['activationGain'] == 1
                            assert 0 <= f['insertionHoldQuality'] <= 1 and 0 <= f['insertionQuality'] <= 1
                            destination = 1400 if f['scenario']==26 else 1000
                            altitude_reward = 200*min(1,f['maxAltitude']/destination)
                            assert math.isclose(f['insertionHoldReward'],1200*f['insertionHoldQuality']+altitude_reward,abs_tol=1e-12)
                            assert math.isclose(f['insertionReward'],1200*f['insertionQuality']+altitude_reward,abs_tol=1e-12)
                        score = sum(f['score'] for f in r['flights'])/6
                        fitness = sum(f['score']*.1+f['insertionHoldReward']-3*(f['touchdown']['speed']**2+f['touchdown']['lateral']**2 if f['landed'] else 0) for f in r['flights'])/6
                        assert math.isclose(score,r['score'],abs_tol=1e-12,rel_tol=1e-12)
                        assert math.isclose(fitness,r['fitness'],abs_tol=1e-12,rel_tol=1e-12)
                        assert r['landings'] == sum(f['landed'] for f in r['flights'])
                    best = max(generation['results'],key=rank)
                    assert all(history[key] == best[key] for key in ['parameters','score','fitness','landings','flights'])
                    assert history['generation'] == g and history['episodes'] == 72*g
                candidate_path = folder/name/'candidate.json'
                candidate = json.loads(candidate_path.read_text())
                assert d['best'] == best and candidate['parameters'] == best['parameters'] and candidate['history'] == d['history']
                assert candidate['generation'] == 6 and candidate['episodes'] == 432
                sources.extend([plan_path,launch_path,candidate_path])
                states[name]['coverageAndRewardVerified'] = True
                states[name]['allCandidateFlightsByMission'] = {str(i):sum(f['scenario']==i for f in all_flights) for i in [24,25,26]}
                states[name]['maximumRecordedHoldQuality'] = max(f['insertionHoldQuality'] for f in all_flights)
                states[name]['allCandidateTerminalReasons'] = {reason:sum(f['reason']==reason for f in all_flights) for reason in sorted({f['reason'] for f in all_flights})}
                states[name]['lastGenerationOutcomes'] = best['flights']
                states[name]['interpretation'] = 'Complete training only; hold qualities are recorded endpoint summaries, not independently reconstructed for every flight. No full mission or stable insertion was achieved.'
            if any('milestones' in f for f in all_flights):
                states[name]['milestoneCounts'] = {milestone: sum(any(m['name'] == milestone for m in f.get('milestones', [])) for f in all_flights)
                    for milestone in ['Launch','Space','Stable orbit','One full orbit','Deorbit','Atmospheric entry','Final approach']}
selections = {}
for name in ['vertical-selection', 'vertical-robust', 'ground-general', 'attitude-g2-selection', 'attitude-adaptive-g6-selection']:
    path = folder/name/'selection.json'
    if path.exists():
        d = json.loads(path.read_text())
        if not d.get('complete'):
            continue
        sources.append(path)
        selections[name] = {'purpose':'Model selection; not final unseen checkpoint validation',
                            'parameters':d['parameters'], 'weightSHA256':d['weightSHA256'],
                            'cases':d['cases'],
                            'conditions':{mode:{'landings':sum(f['landed'] for f in d['flights'] if f['mode']==mode),
                                                'episodes':sum(f['mode']==mode for f in d['flights'])}
                                          for mode in d['modes']}}

development = {}
joint_plan_path = folder/'ground-g4-joint-selection/plan.json'
if joint_plan_path.exists():
    plan = json.loads(joint_plan_path.read_text())
    verified_weights_path = joint_plan_path.with_name('weight-verification.json')
    weight_check = json.loads(verified_weights_path.read_text())
    assert weight_check['planSHA256'] == hashlib.sha256(joint_plan_path.read_bytes()).hexdigest()
    assert plan['expectedFlights'] == 384 and len(plan['cases']) == 96
    for file_key, hash_key in [('basisFile', 'basisSHA256'), ('trainingStateFile', 'trainingStateSHA256'),
                              ('trainingTrialsFile', 'trainingTrialsSHA256'), ('trainingPlanFile', 'trainingPlanSHA256'),
                              ('trainingAuditFile', 'trainingAuditSHA256')]:
        path = root/plan[file_key]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == plan[hash_key]
        sources.append(path)
    for path, expected in plan['testedSourceHashes'].items():
        archive = joint_plan_path.parent/'tested-runtime'/path
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
        sources.append(archive)
    frozen, weights = {}, {}
    for name, item in plan['models'].items():
        path = root/item['frozenFile']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item['frozenSHA256']
        frozen[name] = json.loads(path.read_text()); sources.append(path)
        row = weight_check['weights'][name]; path = root/row['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row['fileSHA256']
        weights[name] = np.asarray(json.loads(path.read_text()), dtype='<f8')
        assert weights[name].shape == (21300,) and np.isfinite(weights[name]).all()
        assert hashlib.sha256(weights[name].tobytes()).hexdigest() == row['weightSHA256']
        sources.append(path)
    assert frozen['joint']['parameters'] == frozen['trained']['parameters'][:5]+frozen['release']['parameters'][5:]
    assert np.array_equal(weights['joint'][2130:], weights['release'][2130:])
    assert not np.array_equal(weights['joint'][:2130], weights['release'][:2130])
    assert all(np.count_nonzero(weights['joint'][i*2130:(i+1)*2130]) for i in [1, 3])
    assert all(np.array_equal(weights[name], frozen[name]['weights']) for name in ['trained', 'release'])
    sources.extend([joint_plan_path, verified_weights_path])
    development['groundThrottleJointSelectionPlan'] = {'scope': 'Frozen selection plan and decoded-weight verification; full-flight comparisons are still pending.',
                                                      'plan': plan, 'weightVerification': weight_check}
    comparison_paths = {name: root/item['folder']/'selection.json' for name, item in plan['models'].items()}
    if all(path.exists() for path in comparison_paths.values()):
        comparisons = {name: json.loads(path.read_text()) for name, path in comparison_paths.items()}
        if all(d['complete'] for d in comparisons.values()):
            for name, d in comparisons.items():
                item = plan['models'][name]
                assert d['parameters'] == frozen[name]['parameters'] and d['cases'] == plan['cases']
                assert d['modes'] == item['modes'] and d['backend'] == 'native-exact-rate'
                assert d['sourceSHA256'] == plan['sourceSHA256'] and d['calibrationHash'] == plan['basisSHA256']
                assert d['nativeBuild'] == plan['nativeBuild']
                assert d['weightSHA256'] == weight_check['weights'][name]['weightSHA256']
                expected = {(mode, c['scenario'], c['seed'], c['variability']) for mode in item['modes'] for c in plan['cases']}
                actual = {(f['mode'], f['scenario'], f['seed'], f['variation']['level']) for f in d['flights']}
                assert actual == expected and len(d['flights']) == len(expected) == item['expectedFlights']
                assert all(not f['censored'] and f['activationGain'] == 1 and f['styleBonus'] == 0 for f in d['flights'])
                source = root/item['folder']/('source-' + plan['sourceSHA256'] + '.mjs')
                assert hashlib.sha256(source.read_bytes()).hexdigest() == plan['sourceSHA256']
                sources.extend([comparison_paths[name], source])
            variants = {(f['scenario'], f['seed']): f['variation'] for f in comparisons['release']['flights']}
            assert all(f['variation'] == variants[(f['scenario'], f['seed'])] for d in comparisons.values() for f in d['flights'])
            def landed(name, mode='normal', profiles=range(24)):
                return sum(f['landed'] for f in comparisons[name]['flights'] if f['mode'] == mode and f['scenario'] in profiles)
            assert len(plan['cases']) == 96 and all(sum(c['scenario'] == i for c in plan['cases']) == 4 for i in range(24))
            rows = [{'scenario': i, 'normalCases': 4, 'joint': landed('joint', profiles=[i]),
                     'trainedReference': landed('trained', profiles=[i]), 'release': landed('release', profiles=[i]),
                     'coveredJoint': landed('joint', 'covered', [i])} for i in range(24)]
            conditions = {'jointNormal': landed('joint'), 'jointCovered': landed('joint', 'covered'),
                          'trainedNormal': landed('trained'), 'releaseNormal': landed('release')}
            original_four = {name: landed(name, profiles=plan['originalFour']) for name in comparisons}
            released_ten = {name: landed(name, profiles=plan['releasedTen']) for name in comparisons}
            gates = {'improvesAllGroundLandings': conditions['jointNormal'] > conditions['releaseNormal'],
                     'preservesOriginalFourCount': original_four['joint'] >= original_four['release'],
                     'preservesReleasedTenCount': released_ten['joint'] >= released_ten['release'],
                     'beatsCoveredControl': conditions['jointNormal'] > conditions['jointCovered']}
            by_case = {name: {(f['scenario'], f['seed']): f for f in d['flights'] if f['mode'] == 'normal'} for name, d in comparisons.items()}
            pairs = [{'scenario': c['scenario'], 'seed': c['seed'], 'variability': c['variability'],
                      'jointLanded': by_case['joint'][(c['scenario'], c['seed'])]['landed'],
                      'releasedLanded': by_case['release'][(c['scenario'], c['seed'])]['landed']} for c in plan['cases']]
            development['groundThrottleJointSelectionPlan']['scope'] = 'Frozen selection plan and decoded-weight verification; the completed comparison is reported separately.'
            development['groundThrottleJointSelection'] = {
                'scope': 'Complete matched development selection; not final unseen validation. The isolated throttle branch is a diagnostic reference only.',
                'verifiedFlights': sum(len(d['flights']) for d in comparisons.values()), 'conditions': conditions,
                'originalFourNormalLandings': original_four, 'releasedTenNormalLandings': released_ten,
                'byMission': rows, 'pairedCases': pairs,
                'rescuedReleaseFailures': sum(p['jointLanded'] and not p['releasedLanded'] for p in pairs),
                'lostReleaseSuccesses': sum(not p['jointLanded'] and p['releasedLanded'] for p in pairs),
                'gates': gates, 'eligibleForSeparateFinalTesting': all(gates.values()),
                'flights': {name: d['flights'] for name, d in comparisons.items()}}
focus_plan_path = folder/'ground-joint-focus/plan.json'
if focus_plan_path.exists():
    focus = json.loads(focus_plan_path.read_text())
    for path, expected in [(root/focus['initialFile'], focus['initialSHA256']),
                           (root/focus['basisPath'], focus['basisSHA256']),
                           (focus_plan_path.parent/'prior-selection-audit.json', focus['priorSelectionAuditSHA256']),
                           (focus_plan_path.parent/'diagnosis.json', focus['diagnosisSHA256'])]:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
        sources.append(path)
    for name, expected in focus['testedSourceHashes'].items():
        path = focus_plan_path.parent/'tested-runtime'/name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
        sources.append(path)
    assert focus['activeDirections'] == list(range(12))+list(range(23,28))
    assert [focus[k] for k in ['generations','population','batch']] == [6,12,18]
    assert [g['generation'] for g in focus['generationCases']] == list(range(1,7))
    assert focus['generations']*focus['population']*focus['batch'] == focus['expectedFlights'] == 1296
    assert focus['sourceSHA256'] == focus['testedSourceHashes']['scripts/train-suite.mjs']
    for entry in focus['generationCases']:
        g = entry['generation']
        expected = [{'scenario':focus['profiles'][(g+i-1)%9],
                     'seed':714133 if i==0 else 527801+g*15427+i*10391,
                     'variability':.4 if i%2 else 0} for i in range(18)]
        assert entry['cases'] == expected
        for scenario in focus['profiles']:
            assert sorted(c['variability'] for c in expected if c['scenario']==scenario) == [0,.4]
    sources.append(focus_plan_path)
    development['groundJointFocusedTrainingPlan'] = {
        'scope':'Verified frozen training plan; plan existence does not establish live job status, and partial outcomes are not qualification evidence.',
        'plan':focus}
gimbal_paths = {name: folder/directory/'selection.json' for name, directory in [
    ('candidate', 'gimbal-g2-selection'), ('released', 'gimbal-release-selection'), ('gimbalsZero', 'gimbal-g2-ablation')]}
if all(p.exists() for p in gimbal_paths.values()):
    gimbal_reports = {name: json.loads(p.read_text()) for name, p in gimbal_paths.items()}
    if all(d['complete'] for d in gimbal_reports.values()):
        plan_path = folder/'gimbal-g2-selection/plan.json'
        frozen_path = folder/'gimbal-g2-selection/frozen-parameters.json'
        plan, frozen = [json.loads(p.read_text()) for p in [plan_path, frozen_path]]
        assert hashlib.sha256(frozen_path.read_bytes()).hexdigest() == plan['frozenSHA256']
        assert gimbal_reports['candidate']['parameters'] == frozen['parameters']
        assert gimbal_reports['gimbalsZero']['parameters'] == frozen['parameters'][:23] + [0]*5
        assert len(frozen['parameters']) == 28 and any(frozen['parameters'][23:])
        total = 0
        for name, d in gimbal_reports.items():
            assert d['cases'] == plan['cases'] and d['calibrationHash'] == plan['basisSHA256']
            assert d['sourceSHA256'] == plan['sourceSHA256'] and d['backend'] == 'native-exact-rate'
            modes = ['normal', 'covered'] if name == 'candidate' else ['normal']
            assert d['modes'] == modes
            expected = {(mode, c['scenario'], c['seed'], c['variability']) for mode in modes for c in plan['cases']}
            actual = {(f['mode'], f['scenario'], f['seed'], f['variation']['level']) for f in d['flights']}
            assert actual == expected and len(d['flights']) == len(expected)
            assert all(not f['censored'] and f['activationGain'] == 1 and f['styleBonus'] == 0 for f in d['flights'])
            weights_path = gimbal_paths[name].with_name('selection-weights.json')
            weights = np.array(json.loads(weights_path.read_text()), dtype='<f8')
            assert weights.shape == (21300,) and np.isfinite(weights).all()
            assert hashlib.sha256(weights.tobytes()).hexdigest() == d['weightSHA256']
            source_path = gimbal_paths[name].parent/('source-' + d['sourceSHA256'] + '.mjs')
            assert hashlib.sha256(source_path.read_bytes()).hexdigest() == d['sourceSHA256']
            sources.extend([gimbal_paths[name], weights_path, source_path])
            total += len(d['flights'])
        assert total == plan['expectedFlights'] == 160
        released_path = folder/'gimbal-steering/frozen-initial.json'
        released = json.loads(released_path.read_text())
        assert gimbal_reports['released']['parameters'] == released['parameters'] + [0]*5
        assert hashlib.sha256(np.array(released['weights'], dtype='<f8').tobytes()).hexdigest() == gimbal_reports['released']['weightSHA256']
        sources.extend([plan_path, frozen_path, released_path])
        original_four = [0, 1, 9, 17]
        normal = {name: [f for f in d['flights'] if f['mode'] == 'normal'] for name, d in gimbal_reports.items()}
        totals = {name: sum(f['landed'] for f in flights) for name, flights in normal.items()}
        original_totals = {name: sum(f['landed'] for f in flights if f['scenario'] in original_four) for name, flights in normal.items()}
        eligible = totals['candidate'] >= totals['released'] and original_totals['candidate'] >= original_totals['released']
        development['gimbalGenerationTwoSelection'] = {
            'scope': plan['purpose'], 'totalCompleteFlights': total,
            'normalLandingsOutOf40': totals, 'originalFourLandingsOutOf16': original_totals,
            'coveredCandidateLandingsOutOf40': sum(f['landed'] for f in gimbal_reports['candidate']['flights'] if f['mode'] == 'covered'),
            'promotionRule': plan['promotionRule'], 'passesLandingPromotionCriterion': eligible,
            'flights': {name: d['flights'] for name, d in gimbal_reports.items()}}
scout_path = folder/'adaptive-ground-scout/scout.json'
if scout_path.exists():
    plan_path = scout_path.parent/'plan.json'
    checkpoint_path = scout_path.parent/'frozen-checkpoint.json'
    scout, plan, checkpoint = [json.loads(p.read_text()) for p in [scout_path, plan_path, checkpoint_path]]
    assert scout['complete'] and scout['cases'] == plan['cases'] and scout['modes'] == plan['modes'] == ['normal']
    assert scout['parameters'] == checkpoint['parameters'] and scout['weightSHA256'] == plan['weightSHA256']
    assert hashlib.sha256(checkpoint_path.read_bytes()).hexdigest() == plan['checkpointSHA256']
    assert len(scout['flights']) == plan['expectedFlights'] == 28
    expected = {(c['scenario'], c['seed'], c['variability']) for c in plan['cases']}
    actual = {(f['scenario'], f['seed'], f['variation']['level']) for f in scout['flights']}
    assert actual == expected and len(actual) == 28
    assert all(f['mode'] == 'normal' and not f['censored'] for f in scout['flights'])
    sources.extend([scout_path, plan_path, checkpoint_path])
    development['additionalGroundScout'] = {
        'scope': plan['purpose'], 'weightSHA256': scout['weightSHA256'],
        'flights': scout['flights'], 'landings': sum(f['landed'] for f in scout['flights']),
        'byScenario': {str(s): {'landings': sum(f['landed'] for f in scout['flights'] if f['scenario'] == s),
                              'flights': sum(f['scenario'] == s for f in scout['flights'])} for s in plan['profiles']}}

comparison_path = folder/'orbital-calibration-comparison.json'
if comparison_path.exists():
    comparison = json.loads(comparison_path.read_text())
    for path, expected in comparison['sourceSHA256'].items():
        assert hashlib.sha256((root/path).read_bytes()).hexdigest() == expected, path
    old_path = folder/'orbital-progress-trained-probe/probe.json'
    new_path = folder/'orbital-calibrated-probe/probe.json'
    old, new = [json.loads(p.read_text()) for p in [old_path, new_path]]
    assert new['parameters'] == old['parameters'] + [0]*5
    assert old['cases'][0] == new['cases'][0]
    assert len(new['cases']) == len(new['results']) == 3
    probe_summaries = []
    for case, result in zip(new['cases'], new['results']):
        assert result['parameters'] == new['parameters'] and len(result['flights']) == 1
        flight = result['flights'][0]
        assert (flight['scenario'], flight['seed'], flight['variation']['level']) == (case['scenario'], case['seed'], case['variability'])
        assert not flight['censored'] and len(flight['trajectory']) > 8
        trajectory = flight['trajectory'][8:]
        error = np.array([r['decoded'] for r in trajectory]) - np.array([r['presented'] for r in trajectory])
        probe_summaries.append({**{k: v for k, v in flight.items() if k != 'trajectory'},
                                'decisions': len(flight['trajectory']),
                                'decodingRMSEAfterEightDecisions': dict(zip(comparison['names'], np.sqrt((error*error).mean(axis=0)).tolist()))})
    sources.extend([comparison_path, old_path, new_path])
    development['orbitalCalibration'] = {
        'scope': 'Held-out calibration contexts selected regularization; trajectory probes are development checks, not final mission validation.',
        'names': comparison['names'], 'collections': comparison['collections'],
        'newProbeFlights': probe_summaries,
        'matchedOldProbeFlight': {k: v for k, v in old['results'][0]['flights'][0].items() if k != 'trajectory'}}
sources.append(Path(__file__))
gimbal_audit_path = folder/'gimbal-g5-selection/selection-audit.json'
if gimbal_audit_path.exists():
    audit = json.loads(gimbal_audit_path.read_text())
    for path, expected in audit['sourceSHA256'].items():
        assert hashlib.sha256((root/path).read_bytes()).hexdigest() == expected, path
        sources.append(root/path)
    sources.append(gimbal_audit_path)
    development['gimbalGenerationFiveSelection'] = audit
high_return_path = folder/'high-return-probe/summary.json'
if high_return_path.exists():
    high_return = json.loads(high_return_path.read_text())
    probe_path = root/high_return['sourceFile']
    assert hashlib.sha256(probe_path.read_bytes()).hexdigest() == high_return['sourceSHA256']
    probe = json.loads(probe_path.read_text())
    assert high_return['flight'] == {k: v for k, v in probe['results'][0]['flights'][0].items() if k != 'trajectory'}
    assert high_return['decisions'] == len(probe['results'][0]['flights'][0]['trajectory'])
    sources.extend([high_return_path, probe_path])
    development['highReturnProbe'] = high_return
for name, directory in [('gimbalGenerationFiveProbe', 'gimbal-g5-probe'),
                        ('orbitalCalibratedInitialReplay', 'orbital-calibrated-probe'),
                        ('orbitalCalibratedGenerationSixReplay', 'orbital-calibrated-g6-probe')]:
    summary_path = folder/directory/'trajectory-summary.json'
    if not summary_path.exists():
        continue
    summary = json.loads(summary_path.read_text())
    for path, expected in summary['sourceSHA256'].items():
        assert hashlib.sha256((root/path).read_bytes()).hexdigest() == expected, path
        sources.append(root/path)
    probe = json.loads((folder/directory/'probe.json').read_text())
    assert summary['parameters'] == probe['parameters'] and len(summary['flights']) == len(probe['results'])
    for row, result in zip(summary['flights'], probe['results']):
        assert row['exactPhysicalReplay'] and row['decisions'] == len(result['flights'][0]['trajectory'])
        assert all(result['flights'][0][key] == value for key, value in row['flight'].items())
    sources.append(summary_path)
    development[name] = summary
hold_probe_folder = folder/'orbital-hold-g6-probe'
if (hold_probe_folder/'hold-summary.json').exists():
    plan_path = hold_probe_folder/'plan.json'
    probe_path = hold_probe_folder/'probe.json'
    summary_path = hold_probe_folder/'hold-summary.json'
    plan, probe, summary = [json.loads(p.read_text()) for p in [plan_path,probe_path,summary_path]]
    initial_path = root/plan['initialFile']
    initial = json.loads(initial_path.read_text())
    assert hashlib.sha256(initial_path.read_bytes()).hexdigest() == plan['initialSHA256']
    assert hashlib.sha256((root/plan['basisFile']).read_bytes()).hexdigest() == plan['basisSHA256']
    assert hashlib.sha256((folder/'orbital-hold/plan.json').read_bytes()).hexdigest() == plan['trainingPlanSHA256']
    assert hashlib.sha256((folder/'orbital-hold/state.json').read_bytes()).hexdigest() == plan['trainingStateSHA256']
    assert probe['cases'] == plan['cases'] and probe['parameters'] == initial['parameters'] == summary['parameters']
    assert len(probe['results']) == len(summary['flights']) == plan['expectedFullFlights'] == 6
    assert probe['sourceSHA256'] == plan['sourceSHA256'] and probe['calibrationHash'] == plan['basisSHA256']
    for source, expected in plan['testedSourceHashes'].items():
        path = hold_probe_folder/'tested-runtime'/source
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
        sources.append(path)
    for source, expected in summary['sourceSHA256'].items():
        assert hashlib.sha256((root/source).read_bytes()).hexdigest() == expected
        sources.append(root/source)
    for row, result in zip(summary['flights'],probe['results']):
        flight = result['flights'][0]
        assert row['exactPhysicalReplay'] and row['decisions'] == len(flight['trajectory'])
        assert all(flight[key] == value for key,value in row['flight'].items())
        assert row['insertionHoldQuality'] == flight['insertionHoldQuality']
    sources.extend([plan_path,probe_path,summary_path,initial_path])
    development['orbitalHoldGenerationSixReplay'] = {
        'scope':'Six complete diagnostic probes of the final sustained-insertion candidate, with exact action replay; not independent qualification or reliability testing.',
        'plan':plan,'replay':summary}
hold_plan_path = folder/'orbital-hold/plan.json'
if hold_plan_path.exists():
    hold_plan = json.loads(hold_plan_path.read_text())
    parity_path = root/hold_plan['parityFile']
    assert hashlib.sha256(parity_path.read_bytes()).hexdigest() == hold_plan['paritySHA256']
    parity = json.loads(parity_path.read_text())
    for path, expected in parity['sourceSHA256'].items():
        assert hashlib.sha256((root/path).read_bytes()).hexdigest() == expected, path
        sources.append(root/path)
    comparisons = {}
    for name in ['orbital-calibrated-probe', 'orbital-calibrated-g6-probe']:
        path = folder/name/'hold-summary.json'
        record = json.loads(path.read_text())
        for source, expected in record['sourceSHA256'].items():
            assert hashlib.sha256((root/source).read_bytes()).hexdigest() == expected, source
            sources.append(root/source)
        sources.append(path)
        comparisons[name] = [{key: row[key] for key in ['flight', 'decisions', 'exactPhysicalReplay',
                                                       'insertionQuality', 'insertionHoldQuality',
                                                       'longestPhysicalInsertionHoldSeconds']} for row in record['flights']]
    launch_path = folder/'orbital-hold/launch-parameters.json'
    launch = json.loads(launch_path.read_text())
    assert launch['planSHA256'] == hashlib.sha256(hold_plan_path.read_bytes()).hexdigest()
    for prefix, key in [('source-', 'sourceSHA256'), ('insertion-hold-', 'insertionRewardSourceSHA256')]:
        path = folder/'orbital-hold'/(prefix + hold_plan[key] + '.mjs')
        assert hashlib.sha256(path.read_bytes()).hexdigest() == hold_plan[key]
        sources.append(path)
    sources.extend([hold_plan_path, parity_path, launch_path])
    development['insertionHoldReward'] = {'scope': 'Outcome-only reward qualification and the frozen plan for completed training; no new orbital capability or final reliability claim.',
                                          'comparisons': comparisons, 'completeFlightParity': parity,
                                          'plan': hold_plan, 'launchParameters': launch}
report = {'scope':'Training and model-selection snapshot and one matched calibration probe; not final mission validation',
          'calibrationProbe': [{'seed':f['seed'],'landed':f['landed'],'reason':f['reason'],'touchdown':f['touchdown'],'time':f['time']} for f in flights],
          'training':states, 'selections':selections, 'development':development,
          'sourceSHA256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
(root/'docs/suite-training-progress.json').write_text(json.dumps(report,indent=2))
print(json.dumps({name:{'generation':r['generation'],'episodes':r['episodes']} for name,r in states.items()}))
