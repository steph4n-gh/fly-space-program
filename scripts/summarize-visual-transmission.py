"""Verify every phase count and report a frozen visual-transmission assay."""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--folder', type=Path, default=ROOT/'artifacts/odor-interface/visual-transmission')
folder = parser.parse_args().folder.resolve()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
plan_path, raw_path = folder/'plan.json', folder/'results.json'
plan, raw = [json.loads(p.read_text()) for p in [plan_path, raw_path]]
assert raw['complete'] and len(raw['trials']) == plan['expectedTrials'] == len(plan['conditions'])
assert raw.get('background') == plan.get('background')
assert raw['planSHA256'] == sha(plan_path)
assert raw['neurons'] == 166700 and raw['edges'] == 25582938 and raw['photoreceptors'] == 6091
sources = [plan_path, raw_path, Path(__file__)]
for path, expected in plan['sourceSHA256'].items():
    source = ROOT/path
    if sha(source) != expected and path.startswith('scripts/'):
        source = folder/'sources'/source.name
    assert sha(source) == expected, path
    sources.append(source)
if plan.get('priorPlan'):
    source = ROOT/plan['priorPlan']['file']
    assert sha(source) == plan['priorPlan']['SHA256']
    sources.append(source)
if (folder/'launch-record.json').exists():
    source = folder/'launch-record.json'
    assert json.loads(source.read_text())['planSHA256'] == sha(plan_path)
    sources.append(source)
if plan.get('background'):
    bg = plan['background']
    atlas = json.loads((ROOT/bg['atlasFile']).read_text())
    indices, rates = [], []
    for unit in atlas['units']:
        for side in ['left', 'right']:
            indices.extend(unit[side])
            rates.extend([(unit['baseline'] if unit['baseline'] is not None else 0)*150]*len(unit[side]))
    assert bg['mode'] == 'clean-air-ORN' and bg['maxRateHz'] == 150
    assert indices == bg['indices'] and rates == bg['sourceHz']
    assert len(set(indices)) == len(indices) == 2141 and not set(indices).intersection(plan['pools']['photoreceptors'])
manifest = json.loads((ROOT/'dist/assets/connectome/manifest.json').read_text())
graph_files = [manifest['nodes'][key] for key in ['rows', 'signs']]
graph_files += [part[key] for part in manifest['parts'] for key in ['pre', 'weight']]
for entry in graph_files:
    path = ROOT/'dist/assets/connectome'/entry['file']
    assert sha(path) == entry['sha256'], entry['file']
    assert len(gzip.decompress(path.read_bytes())) == entry['bytes']
    sources.append(path)
photo = np.array(plan['pools']['photoreceptors'])
table = []
for trial, condition in zip(raw['trials'], plan['conditions']):
    assert trial['condition'] == condition and len(trial['phases']) == 3
    samples = trial['voltageSamples']
    assert len(samples) == 160 and np.allclose([s['time'] for s in samples], np.arange(160)*.005, atol=1e-12, rtol=0)
    assert all(set(sample['meanMv']) == set(plan['pools']) for sample in samples)
    assert all(np.isfinite(list(sample['meanMv'].values())).all() for sample in samples)
    for phase, expected in zip(trial['phases'], plan['phases']):
        assert phase['phase'] == expected['name'] and phase['durationSeconds'] == expected['seconds']
        count_path = ROOT/phase['spikeCounts']['file']
        assert sha(count_path) == phase['spikeCounts']['SHA256']
        counts = np.fromfile(count_path, dtype='<u4')
        assert len(counts) == raw['neurons'] and counts.sum() == phase['spikes']
        assert np.count_nonzero(counts) == phase['activeNeurons']
        assert int(counts.sum()-counts[photo].sum()) == phase['nonPhotoreceptorSpikes']
        for name, indices in plan['pools'].items():
            pool = phase['pools'][name]
            assert pool['neurons'] == len(indices) and pool['spikes'] == int(counts[indices].sum())
            assert pool['meanHz'] == float(counts[indices].mean()/expected['seconds'])
        sources.append(count_path)
        table.append({'condition': condition['name'], 'phase': phase['phase'],
                      'seed': condition['seed'],
                      'photoreceptorSpikes': int(counts[photo].sum()),
                      'otherNeuronSpikes': phase['nonPhotoreceptorSpikes']})
paired = []
for seed in dict.fromkeys(c['seed'] for c in plan['conditions']):
    dark, = [t for t in raw['trials'] if t['condition']['seed'] == seed and t['condition']['sourceHz'] == 0]
    flash, = [t for t in raw['trials'] if t['condition']['seed'] == seed and t['condition']['sourceHz'] == 50]
    assert dark['phases'][0]['spikeCounts']['SHA256'] == flash['phases'][0]['spikeCounts']['SHA256']
    assert dark['voltageSamples'][:40] == flash['voltageSamples'][:40]
    phase_effects = []
    for phase in [1, 2]:
        d, f = dark['phases'][phase], flash['phases'][phase]
        dc = np.fromfile(ROOT/d['spikeCounts']['file'], dtype='<u4').astype(np.int64)
        fc = np.fromfile(ROOT/f['spikeCounts']['file'], dtype='<u4').astype(np.int64)
        changed = fc != dc; changed[photo] = False
        samples = slice(40, 100) if phase == 1 else slice(100, 160)
        phase_effects.append({'phase': d['phase'], 'nonPhotoreceptorCellsWithDifferentCounts': int(changed.sum()),
                             'nonPhotoreceptorSpikeDifference': f['nonPhotoreceptorSpikes']-d['nonPhotoreceptorSpikes'],
                             'poolMeanHzDifference': {name: f['pools'][name]['meanHz']-d['pools'][name]['meanHz'] for name in plan['pools']},
                             'poolMeanPotentialDifferenceMv': {name: float(np.mean([fs['meanMv'][name]-ds['meanMv'][name]
                                  for fs, ds in zip(flash['voltageSamples'][samples], dark['voltageSamples'][samples])])) for name in plan['pools']}})
    paired.append({'seed': seed, 'prePhaseExactlyMatched': True, 'phases': phase_effects})
flash = next(t for t in raw['trials'] if t['condition']['sourceHz'] == 50)
minimum_voltage = {name: min(s['meanMv'][name] for s in flash['voltageSamples']) for name in plan['pools']}
summary = {'scope': (plan['comparison'] if plan.get('background') else 'Two isolated model-input diagnostics. One matched Poisson seed, no odor drive, no fit or selection. These trials do not estimate biological reliability.'),
           'complete': True, 'neurons': raw['neurons'], 'edges': raw['edges'], 'photoreceptors': raw['photoreceptors'],
           'phaseCounts': table, 'firstFlashMinimumMeanPotentialMv': minimum_voltage, 'pairedEffects': paired,
           'background': plan.get('background'),
           'trials': raw['trials'], 'limitations': raw['limitations'],
           'sourceSHA256': {str(p.relative_to(ROOT)): sha(p) for p in sources}}
(ROOT/'docs'/f'{folder.name}-results.json').write_text(json.dumps(summary, indent=2)+'\n')

plt.rcParams.update({'font.size': 11})
fig, axes = plt.subplots(1, 2, figsize=(11.8, 4.5), layout='constrained')
time = np.array([sample['time'] for sample in flash['voltageSamples']])
for name, color in [('L1', '#c15a45'), ('L2', '#16737b'), ('Mi1', '#8063ac')]:
    for rate, style in ([(50, '-'), (0, '--')] if plan.get('background') else [(50, '-')]):
        traces = [[sample['meanMv'][name] for sample in trial['voltageSamples']] for trial in raw['trials'] if trial['condition']['sourceHz'] == rate]
        axes[0].plot(time, np.mean(traces, axis=0), label=name if rate else None, color=color, lw=2, ls=style)
if not plan.get('background'):
    axes[0].axhline(-52, color='#555555', ls='--', lw=1, label='Dark control')
axes[0].axvspan(.2, .5, color='#16737b', alpha=.1)
axes[0].set(xlabel='Time, s', ylabel='Mean membrane potential, model mV', title='Mean potential · dashed = dark' if plan.get('background') else 'Direct targets change voltage')
axes[0].legend(frameon=False, fontsize=10, loc='lower right')
axes[0].text(.35, -54.2, 'Source drive on', ha='center', fontsize=10)
names = ['photoreceptors', 'L1', 'L2', 'Mi1', 'T4', 'T5']
rates = [np.mean([t['phases'][1]['pools'][name]['meanHz'] for t in raw['trials'] if t['condition']['sourceHz'] == 50]) for name in names]
axes[1].bar(range(len(names)), rates, color=['#16737b']+['#c2cccc']*5, width=.65)
for i, rate in enumerate(rates):
    axes[1].text(i, rate+1, f'{rate:.2f}' if rate else '0', ha='center', fontsize=11)
axes[1].set(xticks=range(len(names)), xticklabels=['Photo-\nreceptors']+names[1:], ylim=(0, 58),
            ylabel='Mean spikes per cell per second, on phase', title='Flash condition · mean of four seeds' if plan.get('background') else 'Only driven cells emit spikes')
for axis in axes:
    axis.spines[['top', 'right']].set_visible(False)
    axis.grid(axis='y', alpha=.15)
fig.suptitle('Photoreceptor drive + clean-air ORN background' if plan.get('background') else 'Isolated photoreceptor drive · existing spiking-model diagnostic', fontsize=14)
fig.savefig(ROOT/'docs/assets'/f'{folder.name}.png', dpi=180)
plt.close(fig)
print(json.dumps({'phaseCounts': table, 'minimumMeanMv': minimum_voltage, 'pairedEffects': paired, 'verifiedSourceFiles': len(summary['sourceSHA256'])}))
