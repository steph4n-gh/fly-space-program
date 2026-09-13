"""Preserve compact experimental evidence and plot every held-out trajectory."""
from pathlib import Path
from collections import defaultdict
import argparse
import hashlib
import json
import statistics
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'artifacts/odor-interface'
parser = argparse.ArgumentParser()
parser.add_argument('--steering', default='odor-steering.json')
parser.add_argument('--output', default=str(ROOT / 'docs/odor-experiment-results.json'))
parser.add_argument('--figure', default=str(ROOT / 'docs/assets/odor-steering.png'))
args = parser.parse_args()
OUTPUT, FIGURE = Path(args.output), Path(args.figure)
source_names = ['odor-atlas.json', 'odor-screen.json', 'lif-acid-replication.json',
                'lif-expanded-panel.json', args.steering]
sources = {}
data = {}
for name in source_names:
    raw = (FOLDER / name).read_bytes()
    sources[name] = hashlib.sha256(raw).hexdigest()
    data[name] = json.loads(raw)
    if 'complete' in data[name]:
        assert data[name]['complete'], f'{name} must finish before producing a final report'

atlas, steering = data['odor-atlas.json'], data[args.steering]
assert sources['odor-atlas.json'] == steering['atlasSHA256']
assert steering['neurons'] == 166700 and steering['edges'] == 25582938
assert len(steering['trials']) == len(steering['encoderCandidates'])*2 + 12
train = [t for t in steering['trials'] if t['split'] == 'train']
test = [t for t in steering['trials'] if t['split'] == 'test']
assert {t['seed'] for t in train}.isdisjoint(t['seed'] for t in test)
assert {t['seed'] for t in steering['decoder']['calibrations']}.isdisjoint(t['seed'] for t in steering['trials'])
for candidate in steering['selection']['candidates']:
    selected_trials = [t for t in train if t['gain'] == candidate['gain']]
    assert len(selected_trials) == 2
    assert abs(np.mean([t['score'] for t in selected_trials])-candidate['meanScore']) < 1e-8
assert steering['selection']['gain'] == min(steering['selection']['candidates'], key=lambda c: c['meanScore'])['gain']
for trial in steering['trials']:
    assert len(trial['trace']) == round(steering['durationSeconds']/steering['decisionSeconds'])
    for step in trial['trace']:
        assert abs(step['deliveredLeft']+step['deliveredRight']-1) < 1e-12
        assert -1 <= step['command'] <= 1
    assert trial['centered'] == all(abs(s['errorDegrees']) <= 5 for s in trial['trace'][-5:])
    errors = np.array([s['errorDegrees'] for s in trial['trace']])
    assert abs(np.abs(errors).mean()-trial['meanAbsoluteErrorDegrees']) < 1e-8
    assert abs(np.sqrt(np.mean(errors**2))-trial['rmsErrorDegrees']) < 1e-8
    assert abs(np.mean(errors**2)+errors[-1]**2-trial['score']) < 1e-8
    assert errors[-1] == trial['finalErrorDegrees']
matched_starts = {(t['seed'], t['initialDegrees']) for t in test if t['mode'] == 'contingent'}
for mode in ['contingent', 'balanced', 'reversed']:
    trials = [t for t in test if t['mode'] == mode]
    assert len(trials) == 4 and {(t['seed'], t['initialDegrees']) for t in trials} == matched_starts
    assert sum(t['centered'] for t in trials) == steering['testSummary'][mode]['centered']
    assert abs(np.mean([t['meanAbsoluteErrorDegrees'] for t in trials])-steering['testSummary'][mode]['meanAbsoluteErrorDegrees']) < 1e-8
if steering['selection']['gain'] == 0:
    for seed, _ in matched_starts:
        traces = [t['trace'] for t in test if t['seed'] == seed]
        assert traces[0] == traces[1] == traces[2], 'Zero-gain conditions must have identical trajectories'

panel = []
for file in ['lif-acid-replication.json', 'lif-expanded-panel.json']:
    report = data[file]
    assert report['atlasSHA256'] == sources['odor-atlas.json']
    groups = defaultdict(lambda: defaultdict(dict))
    for trial in report['trials']:
        rate = trial['motorPoolHz']['wm']
        groups[trial['name']][trial['side']][trial['seed']] = rate['L']-rate['R']
    for name, conditions in groups.items():
        if 'left' not in conditions or 'right' not in conditions:
            continue
        paired = [value-conditions['right'][seed] for seed, value in conditions['left'].items()]
        panel.append({'odor': name, 'pairedSeeds': list(conditions['left']),
                      'leftMinusRightEffectHz': paired, 'meanHz': statistics.mean(paired),
                      'sampleStandardDeviationHz': statistics.stdev(paired),
                      'sourceFile': file})

summary = {
    'schema': 'odor-experiment-results-v1',
    'status': 'Experimental one-axis proxy; no successful full flight or living-fly validation established.',
    'sourceSHA256': sources,
    'atlas': {'odorants': len(atlas['odors']), 'units': len(atlas['units']),
              'directORN': sum(len(u['left'])+len(u['right']) for u in atlas['units']),
              'inputCounts': {side: sum(len(u[side]) for u in atlas['units']) for side in ['left', 'right', 'unknownSide']},
              'rateScreenOdorants': data['odor-screen.json']['screenedOdors'],
              'license': atlas['license'], 'attribution': atlas['attribution']},
    'spikingPanel': panel,
    'steering': {k: steering[k] for k in ['odor', 'neurons', 'edges', 'selection', 'decoder', 'apparatus', 'testSummary', 'limitations']},
    'trials': [{k: v for k, v in t.items() if k not in ['trace', 'wallSeconds']} for t in steering['trials']]
}
OUTPUT.write_text(json.dumps(summary, indent=2, allow_nan=False)+'\n')

plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False,
                     'axes.spines.right': False, 'axes.labelcolor': '#273246', 'text.color': '#273246'})
fig = plt.figure(figsize=(15, 9), facecolor='#fafbfe', layout='constrained')
grid = fig.add_gridspec(2, 3, height_ratios=[1, 1.15])
ax = fig.add_subplot(grid[0, :2])
panel.sort(key=lambda row: row['meanHz'])
ys = np.arange(len(panel))
ax.errorbar([p['meanHz'] for p in panel], ys, xerr=[p['sampleStandardDeviationHz'] for p in panel],
            fmt='o', color='#385c99', ecolor='#a0b1cb', capsize=3)
for y, p in zip(ys, panel):
    ax.scatter(p['leftMinusRightEffectHz'], [y]*len(p['pairedSeeds']), s=16, color='#7894c4', alpha=.75)
ax.set_yticks(ys, [p['odor'] for p in panel])
ax.axvline(0, color='#a8adb8', linewidth=1)
ax.set_xlabel('Left-versus-right odor effect on wing-pool asymmetry (Hz)')
ax.set_title('Repeated neural assays • dots = paired seeds; bars = sample SD', loc='left', fontsize=12)

ax = fig.add_subplot(grid[0, 2])
candidates = steering['selection']['candidates']
bars = ax.bar([str(c['gain']) for c in candidates], [c['meanScore'] for c in candidates],
              color=['#287d72' if c['gain'] == steering['selection']['gain'] else '#c8d1df' for c in candidates])
ax.set_xlabel('Image-to-odor encoder gain')
ax.set_ylabel('Training score (lower is better)')
ax.set_title('Encoder selection • 2 starts per setting', loc='left', fontsize=12)
ax.grid(axis='y', alpha=.15)

titles = {'contingent': 'Selected odor encoder', 'balanced': 'Balanced odor control', 'reversed': 'Reversed cue control'}
colors = ['#28678c', '#b44e66', '#46a9a1', '#e39548']
angle_limit = max(30, np.ceil((max(abs(s['errorDegrees']) for t in test for s in t['trace'])+5)/10)*10)
for column, mode in enumerate(['contingent', 'balanced', 'reversed']):
    ax = fig.add_subplot(grid[1, column])
    ax.axhspan(-5, 5, color='#d9eee5', zorder=0)
    ax.axhline(0, color='#a8adb8', linewidth=.8)
    trials = [t for t in test if t['mode'] == mode]
    for color, trial in zip(colors, trials):
        ax.plot([0]+[s['seconds'] for s in trial['trace']],
                [trial['initialDegrees']]+[s['errorDegrees'] for s in trial['trace']],
                color=color, linewidth=1.7, label=f"Start {trial['initialDegrees']:+}°")
    ax.set_ylim(-angle_limit, angle_limit)
    ax.set_xlabel('Simulated seconds')
    if column == 0:
        ax.set_ylabel('Target error (degrees)')
    ax.set_title(f"{titles[mode]}\n{steering['testSummary'][mode]['centered']}/4 centered for final second", loc='left', fontsize=12)
    ax.grid(alpha=.15)
    ax.legend(frameon=False, fontsize=8, ncol=2)
method = steering['decoder'].get('calibrationMethod', 'balanced')
fig.suptitle(f"{steering['odor']['name'].capitalize()} steering | {method} calibration\nComplete 166,700-neuron spiking model", fontsize=17, fontweight='bold')
fig.supxlabel('One-axis motor-rate proxy. Assumed dose mapping, neural transfer, delivery timing and yaw mechanics; no demonstrated landing or animal transfer.', fontsize=10)
FIGURE.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(FIGURE, dpi=160)
print(json.dumps({'summary': str(OUTPUT), 'figure': str(FIGURE), 'testSummary': steering['testSummary']}))
