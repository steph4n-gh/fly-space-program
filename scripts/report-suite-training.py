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
             'engine-transition', 'recovery-grid', 'attitude-adaptive', 'orbital-insertion', 'orbital-progress']:
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
report = {'scope':'Training and model-selection snapshot and one matched calibration probe; not final mission validation',
          'calibrationProbe': [{'seed':f['seed'],'landed':f['landed'],'reason':f['reason'],'touchdown':f['touchdown'],'time':f['time']} for f in flights],
          'training':states, 'selections':selections,
          'sourceSHA256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
(root/'docs/suite-training-progress.json').write_text(json.dumps(report,indent=2))
print(json.dumps({name:{'generation':r['generation'],'episodes':r['episodes']} for name,r in states.items()}))
