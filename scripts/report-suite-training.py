"""Export the matched calibration failure/probe and current search progress."""
import hashlib
import json
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
             'orbital-insertion', 'orbital-progress', 'orbital-calibrated']:
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
report = {'scope':'Training and model-selection snapshot and one matched calibration probe; not final mission validation',
          'calibrationProbe': [{'seed':f['seed'],'landed':f['landed'],'reason':f['reason'],'touchdown':f['touchdown'],'time':f['time']} for f in flights],
          'training':states, 'selections':selections, 'development':development,
          'sourceSHA256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
(root/'docs/suite-training-progress.json').write_text(json.dumps(report,indent=2))
print(json.dumps({name:{'generation':r['generation'],'episodes':r['episodes']} for name,r in states.items()}))
