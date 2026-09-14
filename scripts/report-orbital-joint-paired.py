"""Publish all twelve completed paired probes without selecting a controller."""
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/suite-training/orbital-joint-paired-diagnostic/analysis'
OUT = ROOT / 'docs'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest = json.loads((BASE / 'manifest.json').read_text())
summary = json.loads((BASE / 'summary.json').read_text())
constraints = json.loads((BASE / 'constraint-summary.json').read_text())
assert manifest['allInputsUnchanged']
assert manifest['inputHashesBefore'] == manifest['inputHashesAfter']
for relative, expected in manifest['inputHashesAfter'].items():
    assert sha(ROOT / relative) == expected, relative
for relative, expected in manifest['analysisSHA256'].items():
    assert sha(BASE / relative) == expected, relative
assert summary['aggregate'] == manifest['aggregate']
assert len(summary['cases']) == len(constraints['cases']) == 12
assert len(summary['pairs']) == 6
assert summary['aggregate']['exactEndpoints'] == 12
assert summary['aggregate']['maximumCommandError'] <= 1e-10
assert summary['aggregate']['maximumPresentedError'] == 0

rows = []
for case, limits in zip(summary['cases'], constraints['cases']):
    identity = ['model', 'caseIndex', 'scenario', 'seed', 'variability']
    assert all(case[k] == limits[k] for k in identity)
    assert case['exactPhysicalReplay']
    assert case['endpoint']['reason'] == 'Flight left the recovery corridor'
    assert case['longestPhysicalInsertionHoldSeconds'] == 0
    row = {k: case[k] for k in identity + [
        'decisions', 'physicalSteps', 'endpoint', 'fuelRemaining',
        'longestPhysicalInsertionHoldSeconds', 'totalQualifyingSeconds',
        'maximumSimulatorOrbitHoldSeconds', 'insertionHoldQuality',
        'insertionHoldReward', 'archivedInstantaneousQuality', 'fitness']}
    row['events'] = {
        name: {k: value for k, value in event.items()
               if k in ['name', 'reached', 'reason', 'physical',
                        'exactDecisionAtEvent', 'decisionOffsetSeconds']}
        for name, event in case['events'].items()}
    row['intervals'] = [{k: v for k, v in interval.items()
                         if k not in ['heads', 'signals']}
                        for interval in case['intervals']]
    row['constraintSummary'] = limits
    rows.append(row)

published = {
    'purpose': manifest['purpose'],
    'scope': manifest['scope'],
    'aggregate': summary['aggregate'],
    'cases': rows,
    'pairs': summary['pairs'],
    'units': manifest['units'],
    'eventConvention': manifest['eventConvention'],
    'publicEventProjection': 'Physical events and timing are included here. Complete decisions and commands applied before each event remain in the full archived summary.json.',
    'averagingConvention': manifest['averagingConvention'],
    'holdConvention': manifest['holdConvention'],
    'limitations': manifest['limitations'],
    'sourceSHA256': {str(p.relative_to(ROOT)): sha(p) for p in [
        BASE / 'manifest.json', BASE / 'summary.json',
        BASE / 'constraint-summary.json', BASE / 'all-decisions.jsonl',
        BASE / 'all-physical-steps.jsonl', Path(__file__).resolve()]},
    'inputSHA256': manifest['inputHashesAfter'],
    'completeRecords': {
        'decisions': str((BASE / 'all-decisions.jsonl').relative_to(ROOT)),
        'physicalSteps': str((BASE / 'all-physical-steps.jsonl').relative_to(ROOT)),
        'fullHeadAndSignalSummary': str((BASE / 'summary.json').relative_to(ROOT))},
}
(OUT / 'orbital-joint-paired-results.json').write_text(json.dumps(published, indent=2) + '\n')

colors = {'initial': '#a95235', 'final': '#147880'}
labels = {'initial': 'Inherited controller', 'final': 'Final controller'}
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), layout='constrained')
for model, offset in [('initial', -.10), ('final', .10)]:
    cases = sorted((r for r in rows if r['model'] == model), key=lambda r: r['caseIndex'])
    x = np.arange(6) + offset
    perigee = [r['events']['rollingHoldPeak']['physical']['orbital']['periapsis'] for r in cases]
    radial = [r['events']['firstTargetCrossing']['physical']['verticalSpeed'] for r in cases]
    axes[0].scatter(x, perigee, s=48, color=colors[model], label=labels[model], zorder=3)
    axes[1].scatter(x, radial, s=48, color=colors[model], label=labels[model], zorder=3)
axes[0].axhline(800, color='#494c50', ls='--', lw=1)
axes[0].text(.01, 815, 'Required periapsis >800 m', fontsize=10)
axes[0].set_ylim(0, 950)
axes[0].set_title('Periapsis at the best three-second reward')
axes[0].set_ylabel('Periapsis above surface, m')
axes[1].axhspan(-5, 5, color='#d6e9d8')
axes[1].text(.01, 11, 'Required radial speed between −5 and +5 m/s', fontsize=9)
axes[1].set_ylim(-10, 185)
axes[1].set_title('Radial speed on first reaching destination altitude')
axes[1].set_ylabel('Outward radial speed, m/s')
case_labels = ['24\nnominal', '25\nvaried', '26\nnominal', '24\nvaried', '25\nnominal', '26\nvaried']
for ax in axes:
    ax.set_xticks(np.arange(6), case_labels)
    ax.set_xlabel('Mission index and physics condition; same six cases for both controllers')
    ax.spines[['top', 'right']].set_visible(False)
    ax.grid(axis='y', alpha=.2)
axes[0].legend(frameon=False, loc='center left', bbox_to_anchor=(0, .58))
fig.suptitle('All twelve complete trips failed insertion and left the recovery corridor', fontsize=14)
fig.savefig(OUT / 'assets/orbital-joint-paired.png', dpi=180)
plt.close(fig)
print('Published all 12 paired trips, input hashes and verified diagnostic figure.')
