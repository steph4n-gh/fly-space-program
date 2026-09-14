"""Verify completed model assays and export compact paired effects and a figure."""
from pathlib import Path
import hashlib
import json
import math
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
files = [ROOT / name for name in sys.argv[1:]] or [ROOT / 'artifacts/odor-interface/visual-context-v1.json']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
records = []
names = ['throttle', 'gimbal X', 'RCS X', 'gimbal Z', 'RCS Z', 'yaw', 'fin X', 'fin Z', 'engine selector', 'gaze']
for file in files:
    r = json.loads(file.read_text())
    assert r['complete'] and r['backend'] == 'javascript-rate'
    assert (r['neurons'], r['edges'], r['passesPerDecision']) == (166700, 25582938, 2)
    assert sha(ROOT / r['checkpoint']) == r['checkpointSHA256']
    for source, digest in r['sourceSHA256'].items():
        p = (file.parent / ('visual-context-source-' + digest + '.mjs')) if source == 'scripts/assay-odor-visual-context.mjs' else ROOT / source
        assert sha(p) == digest, source
    p = r['protocol']; start, end = p['pulseStart'], p['pulseEnd']
    lookup = {}
    for t in r['trials']:
        key = (t['scenario'], t['seed'], t['covered'], t['angle'], t['condition'])
        assert key not in lookup
        lookup[key] = t
        assert [s['decision'] for s in t['samples']] == list(range(p['steps']))
        assert all(len(s['commands']) == 10 and len(s['odorInputActivity']) == 4 for s in t['samples'])
        assert all(math.isfinite(v) and -1 <= v <= 1 for s in t['samples'] for v in s['commands'])
        assert all(math.isfinite(v) for s in t['samples'] for v in s['odorInputActivity'])
    expected = len(r['contexts']) * 2 * len(r['angles']) * len(r['conditions'])
    assert len(lookup) == expected
    mean = lambda t: [sum(s['commands'][j] for s in t['samples'][start:end]) / (end-start) for j in range(10)]
    effect_keys = set()
    for context in r['contexts']:
        for covered in [False, True]:
            get = lambda condition, angle: lookup[(context['scenario'], context['seed'], covered, angle, condition)]
            before = get('clean air', 0)['samples'][:start]
            for condition in r['conditions']:
                for angle in r['angles']:
                    t = get(condition['name'], angle)
                    assert t['samples'][:start] == before
                    if covered:
                        assert t['samples'] == get(condition['name'], 0)['samples']
            for condition in r['conditions'][1:]:
                found = [e for e in r['effects'] if e['scenario'] == context['scenario'] and e['seed'] == context['seed'] and e['covered'] == covered and e['condition'] == condition['name']]
                assert len(found) == 1
                e = found[0]
                effect_keys.add((e['scenario'], e['seed'], covered, e['condition']))
                air, odor = get('clean air', 0), get(condition['name'], 0)
                slope = lambda name: [(a-b)/.24 for a, b in zip(mean(get(name, .12)), mean(get(name, -.12)))]
                a, b = slope('clean air'), slope(condition['name'])
                recalculated = {
                    'odorOnlyCommandDelta': [o-c for o, c in zip(mean(odor), mean(air))],
                    'cleanAirVisualSlope': a,
                    'odorVisualSlope': b,
                    'visualInteraction': [o-c for o, c in zip(b, a)],
                    'lastWashoutCommandDelta': [o-c for o, c in zip(odor['samples'][-1]['commands'], air['samples'][-1]['commands'])],
                }
                for key, values in recalculated.items():
                    assert all(math.isclose(v, old, abs_tol=1e-12, rel_tol=1e-10) for v, old in zip(values, e[key])), key
    assert len(effect_keys) == len(r['effects'])
    records.append({'file': str(file.relative_to(ROOT)), 'SHA256': sha(file), 'checkpointSHA256': r['checkpointSHA256'], 'weightSHA256': r['weightSHA256'], 'sourceSHA256': r['sourceSHA256'], 'protocol': r['protocol'], 'conditions': r['conditions'], 'contexts': r['contexts'], 'trials': expected, 'decisions': expected * p['steps'], 'effects': r['effects']})

assert len({r['weightSHA256'] for r in records}) == 1
result = {'schema': 'odor-visual-context-summary-v1', 'records': records, 'controlOrder': names, 'totalTrajectories': sum(r['trials'] for r in records), 'totalDecisions': sum(r['decisions'] for r in records), 'interpretation': 'Deterministic model contexts, not animal replicates. No inference about physical dose, biological time, innate valence, neuromodulator physiology, learning or flight success.'}
output = ROOT / 'docs/odor-visual-context-results.json'
output.write_text(json.dumps(result, indent=2) + '\n')

plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10})
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), layout='constrained')
colors = {'ethyl acetate': '#147d92', 'geosmin': '#b15025'}
for odor, color in colors.items():
    levels = sorted({float(c['name'].split()[-1]) for r in records for c in r['conditions'][1:] if c['name'].startswith(odor)})
    rows = []
    for level in levels:
        effects = [e for r in records for e in r['effects'] if not e['covered'] and e['condition'] == f'{odor} {level:g}']
        # JavaScript prints small numbers using decimal notation; match numerically.
        if not effects:
            effects = [e for r in records for e in r['effects'] if not e['covered'] and e['condition'].startswith(odor) and float(e['condition'].split()[-1]) == level]
        assert len(effects) == 4
        shifts = [e['odorOnlyCommandDelta'][2] for e in effects]
        ratios = [e['odorVisualSlope'][2] / e['cleanAirVisualSlope'][2] for e in effects]
        rows.append((level, shifts, ratios))
    for ax, index in zip(axes, [1, 2]):
        x = [row[0] for row in rows]
        y = [sum(row[index])/len(row[index]) for row in rows]
        ax.plot(x, y, color=color, marker='o', label=odor)
        for level, *values in rows:
            ax.scatter([level]*4, values[index-1], color=color, s=15, alpha=.4)
        ax.set_xscale('log'); ax.grid(alpha=.2); ax.set_xlabel('Dimensionless model input')
axes[0].axhline(0, color='#555555', linewidth=.8)
axes[0].set_title('Odor-only shift in steering command')
axes[0].set_ylabel('RCS X command difference from clean air')
axes[1].axhline(1, color='#555555', linewidth=.8, linestyle='--')
axes[1].set_title('Visual response retained during odor')
axes[1].set_ylabel('Signed visual-response slope / clean-air slope')
axes[1].legend(frameon=False)
fig.suptitle('Odor inputs and the frozen simulated pilot', fontsize=15, fontweight='bold')
fig.supxlabel('Dots: four deterministic mission contexts. Lines: context means. These are not animal data.', fontsize=9)
figure = ROOT / 'docs/assets/odor-visual-context.png'
fig.savefig(figure, dpi=180)
print(json.dumps({'summary': str(output), 'figure': str(figure), 'verifiedTrajectories': result['totalTrajectories'], 'verifiedDecisions': result['totalDecisions']}))
