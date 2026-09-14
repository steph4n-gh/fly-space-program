"""Publish the completed six-case diagnostic from retained records only."""
import csv
import hashlib
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[1]
base = root/'artifacts/suite-training/ground-all-training-diagnostic'
folder = base/'physical-analysis'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
read = lambda path: json.loads(path.read_text())
receipt = read(base/'physical-terminal-observation.json')
assert receipt['confirmedBy'] == '/root' and receipt['originalAttempt'] and receipt['exitCode'] == 0
assert receipt['allOutputHashesVerified'] and not (folder/'failure.json').exists()
assert sha(folder/'summary.json') == receipt['summarySHA256'] == '463a1dbf33a3e58f2b29e7b65cbc5880c0e208e0fb790e00c87bddd5303d2eed'
assert sha(folder/'output-identities.json') == receipt['outputManifestSHA256']
identities = read(folder/'output-identities.json')
for name, expected in identities.items():
    assert sha(folder/name) == expected, name
summary = read(folder/'summary.json')
assert summary['completedPhysicalReplays'] == 6 and summary['interpretationAllowed']
assert summary['allOriginalEndpointsExact'] and summary['newNeuralRuns'] == 0
for name, expected in summary['inputSHA256'].items():
    assert sha(Path(name)) == expected, name
decisions = [json.loads(line) for line in (folder/'decisions.jsonl').open()]
steps = [json.loads(line) for line in (folder/'physical-steps.jsonl').open()]
assert len(decisions) == summary['decisions'] == 1494
assert len(steps) == summary['physicalSteps'] == 4479
cases, csv_rows = [], []
fig, axes = plt.subplots(2, 3, figsize=(12, 6.6), sharex='col', sharey='row', layout='constrained')
colors = {0: '#176e9b', 0.4: '#cf6740'}
for case in summary['cases']:
    selected = [row for row in decisions if row['caseIndex'] == case['caseIndex']]
    physical = [row for row in steps if row['caseIndex'] == case['caseIndex']]
    assert len(selected) == case['decisions'] and len(physical) == case['physicalSteps']
    tail = physical[-100:]
    assert len(tail) == 100  # The frozen ground physics uses full 50 ms steps.
    changes = [{'stepStart': row['start'], 'stepEnd': row['end'],
                'from': row['physicalBefore']['engineBank'], 'to': row['physicalAfter']['engineBank']}
               for row in physical if row['physicalBefore']['engineBank'] != row['physicalAfter']['engineBank']]
    faults = [row for row in physical if not row['physicalBefore']['engineFailed'] and row['physicalAfter']['engineFailed']]
    stats = {
        'bankChanges': changes,
        'engineFaultStep': {'start': faults[0]['start'], 'end': faults[0]['end']} if faults else None,
        'bank3RequestedAtEveryDecision': all(row['requested']['bankSelector'] == 1 for row in selected),
        'terminalFuel': case['terminal']['fuel'],
        'lastFiveSeconds': {
            'physicalSteps': len(tail),
            'physicsDurationSeconds': len(tail) * .05,
            'startTime': tail[0]['start'], 'endTime': tail[-1]['end'],
            'clockElapsedSeconds': tail[-1]['end'] - tail[0]['start'],
            'appliedThrottleRange': [min(row['physicalAfter']['throttle'] for row in tail), max(row['physicalAfter']['throttle'] for row in tail)],
            'meanVerticalAcceleration': sum(row['acceleration']['observedVerticalAcceleration'] for row in tail)/len(tail),
        },
    }
    cases.append({**case, 'diagnostics': stats})
    for row in selected:
        state, requested = row['physical'], row['requested']
        csv_rows.append({
            'caseIndex': case['caseIndex'], 'scenario': case['scenario'], 'seed': case['seed'],
            'variability': case['variability'], 'time': row['time'],
            'clearance': state['geometricClearance'], 'verticalSpeed': state['vy'],
            'relativeX': state['relativeX'], 'relativeZ': state['relativeZ'],
            'deckDistance': math.hypot(state['relativeX'], state['relativeZ']),
            'relativeVx': state['relativeVx'], 'relativeVz': state['relativeVz'],
            'requestedThrottle': requested['throttle'], 'appliedThrottle': state['throttle'],
            'requestedSelector': requested['bankSelector'], 'appliedSelector': state['selector'],
            'engineBank': state['engineBank'], 'engineHealth': state['engineHealth'], 'fuel': state['fuel'],
            **{'requested'+key[0].upper()+key[1:]: requested[key]
               for key in ['pitchGimbal','rollGimbal','pitchRcs','rollRcs','yawRcs']},
            **{key: state[key] for key in ['pitch','roll','pitchGimbal','rollGimbal','pitchRcs','rollRcs','yawRcs']},
        })
    # Plot each exact step endpoint, including physical contact, with its initial state.
    states = [case['initial']] + [row['physicalAfter'] for row in physical]
    col = [7, 13, 22].index(case['scenario'])
    label = 'Nominal' if case['variability'] == 0 else 'Variability 0.4'
    for axis, values in [(axes[0,col], [abs(s['vy']) for s in states]),
                         (axes[1,col], [math.hypot(s['relativeX'],s['relativeZ']) for s in states])]:
        axis.plot([s['time'] for s in states], values, color=colors[case['variability']], label=label, lw=1.7)
        axis.plot(states[-1]['time'], values[-1], 'o', color=colors[case['variability']], ms=4)
    if case['variability'] == 0:
        axes[0,col].set_title(f"{case['scenario']} · {case['title']}", fontsize=11)
        axes[0,col].axhline(3.6, color='#555555', linestyle='--', lw=1)
        axes[1,col].axhline(case['landingRadius'], color='#555555', linestyle='--', lw=1)
        axes[1,col].set_xlabel('Time (s)')
for axis in axes.flat:
    axis.grid(alpha=.17)
    axis.spines[['top','right']].set_visible(False)
    axis.set_ylim(bottom=0)
axes[0,0].set_ylabel('Vertical speed magnitude (m/s)')
axes[1,0].set_ylabel('Horizontal distance from deck centre (m)')
axes[0,0].legend(frameon=False, fontsize=9)
fig.suptitle('Six selected training failures · exact recorded-action reconstruction', fontsize=14)
fig.supxlabel('Dashed lines show two contact limits (3.6 m/s and 11 m). Dots mark the complete physical endpoint.', fontsize=10)
image = root/'docs/assets/ground-training-diagnostic.png'
fig.savefig(image, dpi=170, facecolor='white')
plt.close(fig)
csv_path = root/'docs/ground-training-diagnostic-decisions.csv'
with csv_path.open('w', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(csv_rows[0]), lineterminator='\n')
    writer.writeheader()
    writer.writerows(csv_rows)
report = {**summary, 'cases': cases, 'physicalTerminalObservation': receipt,
          'physicalOutputManifest': identities,
          'reporterSHA256': sha(Path(__file__)),
          'csvConvention': 'Every original pre-decision record; applied actuators precede the newly requested action. Full physical endpoints remain in cases[].endpoint and cases[].terminal.',
          'decisionCSV': {'file': csv_path.name, 'sha256': sha(csv_path), 'rows': len(csv_rows)},
          'figure': {'file': 'assets/'+image.name, 'sha256': sha(image)}}
(root/'docs/ground-training-diagnostic-results.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'cases': len(cases), 'decisions': len(decisions), 'physicalSteps': len(steps),
                  'image': str(image), 'newFlights': 0, 'newNeuralRuns': 0}))
