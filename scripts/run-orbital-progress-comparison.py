#!/usr/bin/env python3
"""Verify the frozen paired ranking experiment, then run one prescribed stage."""
import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/suite-training/orbital-progress-comparison'
PLAN_SHA256 = 'ecd27042dae78467a42111660e44e5da4d1fa8717852118626d920a7a6fdb8a7'
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('arm', choices=['control', 'conditional_periapsis'])
parser.add_argument('stage', choices=['train', 'evaluate'])
args = parser.parse_args()
assert sha(BASE / 'plan.json') == PLAN_SHA256
plan = json.loads((BASE / 'plan.json').read_text())
runtime = ROOT / plan['runtimeDirectory']
for relative, expected in plan['runtimeSHA256'].items():
    assert sha(runtime / relative) == expected, relative
assert sha(ROOT / plan['initial']['file']) == plan['initial']['sha256']
assert sha(ROOT / plan['diagnosticManifestFile']) == plan['diagnosticManifestSHA256']
for relative, expected in plan['designReviewSHA256'].items():
    assert sha(BASE / 'design-review' / relative) == expected, relative
assert subprocess.check_output(['node', '--version'], text=True).strip() == plan['nodeVersion']
arm = plan['executionArms'][args.arm]
output = ROOT / arm['outputDirectory']
if args.stage == 'train':
    assert not output.exists(), 'Preserve the original training attempt and inspect its handle'
    settings = arm['trainingEnvironment']
    command = plan['trainingCommand']
else:
    # Written only after the original training process has returned exit code 0.
    completion = json.loads((BASE / f'training-completion-{args.arm}.json').read_text())
    assert completion['exitCode'] == 0 and completion['planSHA256'] == PLAN_SHA256
    for relative, expected in completion['outputSHA256'].items():
        assert sha(ROOT / relative) == expected, relative
    state = json.loads((output / 'state.json').read_text())
    candidate = json.loads((output / 'candidate.json').read_text())
    assert state['generation'] == candidate['generation'] == plan['training']['generations']
    assert state['episodes'] == candidate['episodes'] == plan['training']['flightsPerArm']
    assert state['best']['parameters'] == candidate['parameters']
    assert not (ROOT / arm['comparisonFile']).exists(), 'Preserve the original comparison'
    assert not (output / 'comparison-weights.json').exists(), 'Preserve the original comparison weights'
    settings = arm['evaluationEnvironment']
    command = plan['evaluationCommand']

environment = {k: v for k, v in os.environ.items()
               if not k.startswith('SUITE_') and k != 'FLY_NATIVE_RATE'}
environment.update(settings)
record = {'createdAt': datetime.now(timezone.utc).isoformat(), 'arm': args.arm,
          'stage': args.stage, 'planSHA256': PLAN_SHA256, 'launcherSHA256': sha(__file__),
          'workingDirectory': str(runtime), 'command': command,
          'explicitEnvironment': settings, 'verifiedRuntimeFiles': len(plan['runtimeSHA256']),
          'status': 'Prepared for process exec; this record alone does not establish live or complete status'}
with (BASE / f'launch-{args.arm}-{args.stage}.json').open('x') as file:
    json.dump(record, file, indent=2)
    file.write('\n')
print(json.dumps(record), flush=True)
os.chdir(runtime)
os.execvpe(command[0], command, environment)
