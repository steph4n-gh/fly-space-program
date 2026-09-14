"""Check a frozen observation-only LIF assay and retain paired model outcomes."""
from pathlib import Path
from itertools import product
import argparse
import ast
import hashlib
import json
import math
import statistics
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/odor-interface'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
parser = argparse.ArgumentParser()
parser.add_argument('--visual-inputs', action='store_true', help='Verify the expanded upstream-candidate assay and its archived whole-brain counts')
args = parser.parse_args()
report_file = OUT / ('lif-visual-input-recruitment.json' if args.visual_inputs else 'lif-neuromodulator-recruitment.json')
report = read(report_file)
assert report['complete'], 'Wait for every planned trial'
definition_file = ROOT / report['extraPools']['sourceFile']
definition = read(definition_file)
assert sha(definition_file) == report['extraPools']['SHA256']
assert definition == report['extraPools']['definition']
inventory_file = ROOT / definition['anatomy' if args.visual_inputs else 'inventory']
inventory = read(inventory_file)
assert sha(inventory_file) == definition['anatomySHA256' if args.visual_inputs else 'inventorySHA256']
assert sha(OUT / 'odor-atlas.json') == report['atlasSHA256']
assert (report['neurons'], report['edges']) == (166700, 25582938)
plan_file = OUT / 'visual-input-recruitment-plan.json'
if args.visual_inputs:
    plan = read(plan_file)
    assert sha(definition_file) == plan['poolsSHA256']
    assert report['atlasSHA256'] == plan['atlasSHA256']
    protocol = {'synapticWeightMv': plan['synapticWeightMv'], 'maxSourceHz': plan['maxSourceHz'],
                'preExposureSeconds': plan['preExposureSeconds'], 'observationSeconds': plan['durationSeconds'],
                'odors': ['ethyl acetate', 'geosmin'], 'sides': ['left', 'right', 'bilateral'],
                'seeds': plan['seeds'], 'plannedTrials': plan['expectedTrials']}
else:
    protocol = definition['protocol']
assert report['parameters']['synapticWeightMv'] == protocol['synapticWeightMv'] == .275
assert report['parameters']['maxSourceHz'] == protocol['maxSourceHz'] == 150
assert report['trialDurationSeconds'] == protocol['observationSeconds'] == .6
prior_source = OUT / 'lif-neuromodulator-source-7a2f4cb07f333aa3d488328b998f5f106c75efac4731aead992cad845aa0c3b2.py'
source_file = OUT / ('lif-visual-input-source-' + plan['scriptSHA256'] + '.py') if args.visual_inputs else prior_source
assert sha(source_file) == (plan['scriptSHA256'] if args.visual_inputs else source_file.stem.removeprefix('lif-neuromodulator-source-'))
old_source = prior_source if args.visual_inputs else OUT / 'additional-panel-lif-source.py'
functions = lambda p: {n.name: ast.dump(n) for n in ast.parse(p.read_text()).body if isinstance(n, ast.FunctionDef)}
for name in ['load_graph', 'build_model']:
    assert functions(source_file)[name] == functions(old_source)[name], name
old_file = OUT / ('lif-neuromodulator-recruitment.json' if args.visual_inputs else 'additional-panel.json')
if args.visual_inputs:
    assert sha(old_file) == plan['originalTrialReportSHA256']
old = read(old_file)
assert old['complete']
for key in ['parameters', 'atlasSHA256', 'trialDurationSeconds', 'projectionNeuronIndices']:
    assert report[key] == old[key], key

pools = definition['pools']
assert len(pools['all_octopamine_labelled']) == inventory['transmitterCounts']['octopamine'] == 101
for name in ['T4', 'T5']:
    assert len(pools[name]) == inventory['targets'][name]['cells']
targets = {c['targetPool']: c for c in inventory['connections'] if c['sourceTransmitterLabel'] == 'octopamine'}
selected_cells = targets['Mi4']['sources'] if args.visual_inputs else definition['selectedCells']
if args.visual_inputs:
    for name in ['Mi1', 'Tm3', 'Mi4', 'Mi9', 'L5']:
        assert len(pools[name]) == inventory['targets'][name]['cells']
else:
    assert selected_cells == targets['T4']['sources']
    assert {c['bodyId'] for c in targets['T4']['sources']} == {c['bodyId'] for c in targets['T5']['sources']}
for cell in selected_cells:
    assert pools[('octopamine body ' if args.visual_inputs else 'OA_AL2i2_body_') + str(cell['bodyId'])] == [cell['index']]
conditions = [('clean air', 'bilateral')] + list(product(protocol['odors'], protocol['sides']))
expected = [(name, side, seed) for name, side in conditions for seed in protocol['seeds']]
trials = report['trials']
assert [(t['name'], t['side'], t['seed']) for t in trials] == expected
assert len(trials) == protocol['plannedTrials'] == 28
baseline_checks = []
count_files = []
for trial in trials:
    assert set(trial['extraPoolStats']) == set(pools)
    for pool, stats in trial['extraPoolStats'].items():
        assert stats['neurons'] == len(pools[pool])
        assert isinstance(stats['spikes'], int) and stats['spikes'] >= 0
        assert 0 <= stats['activeNeurons'] <= stats['neurons']
        assert math.isclose(stats['meanHz'], stats['spikes'] / stats['neurons'] / .6, rel_tol=1e-12, abs_tol=1e-12)
    if args.visual_inputs:
        record = trial['spikeCounts']
        path = ROOT / record['file']
        assert record['dtype'] == 'uint32-le' and record['neurons'] == 166700
        assert sha(path) == record['SHA256'] and path.stat().st_size == 166700*4
        spikes = np.fromfile(path, dtype='<u4')
        assert int(spikes.sum()) == trial['spikes'] and int((spikes > 0).sum()) == trial['activeNeurons']
        for pool, indices in pools.items():
            assert int(spikes[indices].sum()) == trial['extraPoolStats'][pool]['spikes']
            assert int((spikes[indices] > 0).sum()) == trial['extraPoolStats'][pool]['activeNeurons']
        count_files.append(path)
    if args.visual_inputs or trial['name'] == 'clean air':
        previous = [t for t in old['trials'] if t['name'] == trial['name'] and t['side'] == trial['side'] and t['seed'] == trial['seed']]
        assert len(previous) == 1
        # Timing is operational metadata; every original biological output must match.
        actual = {k: v for k, v in trial.items() if k not in ['wallSeconds', 'extraPoolStats', 'spikeCounts']}
        wanted = {k: v for k, v in previous[0].items() if k not in ['wallSeconds', 'extraPoolStats']}
        assert actual == wanted, trial['seed']
        if args.visual_inputs:
            for pool, stats in previous[0]['extraPoolStats'].items():
                assert trial['extraPoolStats'][pool] == stats, pool
        baseline_checks.append({**({'odor': trial['name'], 'side': trial['side']} if args.visual_inputs else {}),
                                'seed': trial['seed'], 'allOriginalOutputsExactlyMatch': True})

baselines = {t['seed']: t for t in trials if t['name'] == 'clean air'}
describe = lambda values: {'mean': statistics.mean(values), 'minimum': min(values), 'maximum': max(values), 'values': values}
summaries = []
for name, side in conditions:
    rows = [t for t in trials if t['name'] == name and t['side'] == side]
    summaries.append({'odor': name, 'side': side, 'trials': len(rows), 'pools': {
        pool: {'meanHz': describe([t['extraPoolStats'][pool]['meanHz'] for t in rows]),
               'pairedDeltaHz': describe([t['extraPoolStats'][pool]['meanHz'] - baselines[t['seed']]['extraPoolStats'][pool]['meanHz'] for t in rows]),
               'activeNeurons': describe([t['extraPoolStats'][pool]['activeNeurons'] for t in rows])}
        for pool in pools}})
output = ROOT / ('docs/visual-input-recruitment-results.json' if args.visual_inputs else 'docs/neuromodulator-recruitment-results.json')
summary = {
    'schema': 'neuromodulator-recruitment-summary-v1',
    'purpose': definition['purpose'], 'protocol': protocol,
    'modelSource': report['modelSource'], 'referenceCommit': report['referenceCommit'],
    'sourceSHA256': {str(p.relative_to(ROOT)): sha(p) for p in [report_file, definition_file, inventory_file, source_file, old_file, old_source, Path(__file__)] + ([plan_file] if args.visual_inputs else []) + count_files},
    'atlasSHA256': report['atlasSHA256'], 'parameters': report['parameters'],
    'checkedGraph': inventory['checkedGraph'],
    'poolCounts': {name: len(indices) for name, indices in pools.items()},
    'selectedCells': selected_cells, 'conditions': summaries,
    'checks': {'trialCount': len(trials), 'graphAndModelFunctionsUnchanged': True,
               'originalMatchedTrialOutputs' if args.visual_inputs else 'originalCleanAirOutputs': baseline_checks,
               **({'completeNeuronCountFilesVerified': len(count_files)} if args.visual_inputs else {})},
    'trials': [{k: v for k, v in t.items() if k != 'wallSeconds'} for t in trials],
    'limitations': report['limitations'] + [
        'One connectome and four Poisson seeds per condition; these are not independent animals.',
        'Octopamine-labelled cells follow the same LIF rule and assumed synaptic signs; there is no receptor-dependent modulatory mechanism.',
        'No visual stimulus was delivered. Silent T4/T5 populations do not test odor-dependent visual gain.',
        'Anatomical selection preceded observing these responses; count changes establish neither causality nor intervention efficacy.'
    ]}
output.write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'output': str(output), 'checks': summary['checks'], 'conditions': [
    {'odor': c['odor'], 'side': c['side'], 'pairedDeltaHz': {p: s['pairedDeltaHz']['mean'] for p, s in c['pools'].items()}}
    for c in summaries]}))
