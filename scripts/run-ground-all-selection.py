#!/usr/bin/env python3
"""Verify the completed all-ground lesson and frozen comparison before evaluation."""
import argparse
import hashlib
import json
import math
import os
import struct
import subprocess
from datetime import datetime, timezone
from pathlib import Path

if not __debug__:
    raise SystemExit('Run without Python optimization: verification assertions are required')

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/suite-training/ground-all-g6-selection'
TRAINING = ROOT / 'artifacts/suite-training/ground-joint-all'
TRAINING_PLAN_SHA256 = 'a2bbcdb88c05548a4cb2fcf02c493d896ed4ded98839431f79d9f826db5666d2'
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
read = lambda path: json.loads(Path(path).read_text())

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('model', choices=['candidate', 'released'])
parser.add_argument('--plan-sha256', required=True)
parser.add_argument('--preflight', action='store_true', help='Verify without writing or running flights')
args = parser.parse_args()
assert len(args.plan_sha256) == 64 and all(c in '0123456789abcdef' for c in args.plan_sha256)
assert sha(BASE / 'plan.json') == args.plan_sha256
plan = read(BASE / 'plan.json')
assert plan['status'] == 'FROZEN_BEFORE_SELECTION'
assert plan['schema'] == 'ground-all-g6-selection-v1'
assert plan['expectedFlights'] == 384
assert plan['launcherSHA256'] == sha(__file__)
protocol_file = BASE / 'proposed-protocol/proposed-protocol.json'
assert sha(protocol_file) == '164ce183b9ddaef69903e49e1c0b82b4071550a500d57ba525c71455ed0dbde6'
assert plan['acceptance'] == read(protocol_file)['acceptance']
prepared_file = BASE / 'prepared-runtime.json'
assert sha(prepared_file) == 'fe7fd9cb3932907e2d0570bb149cab903ab0e27655a27a96562a6e68b5ecd77a'
assert plan['runtimeSHA256'] == read(prepared_file)['runtimeSHA256']
assert plan['cases'] == [dict(scenario=i % 24, seed=95638071 + i * 104729,
                             variability=0.4 if i // 24 % 2 else 0) for i in range(96)]
assert sha(TRAINING / 'plan.json') == TRAINING_PLAN_SHA256
for required in [plan['trainingCompletionFile'], plan['trainingAuditFile']]:
    assert required in plan['evidenceSHA256'], 'Required completion evidence must be hash-pinned'
for relative, expected in plan['evidenceSHA256'].items():
    assert sha(ROOT / relative) == expected, relative
completion = read(ROOT / plan['trainingCompletionFile'])
assert completion['originalSessionId'] == 80488 and completion['exitCode'] == 0
assert completion['confirmedBy'] == '/root' and completion['planSHA256'] == TRAINING_PLAN_SHA256
audit = read(ROOT / plan['trainingAuditFile'])
assert audit['status'] == 'PASS — complete frozen training audit; no new physical or neural runs'
assert audit['terminalConfirmation'] == completion
assert audit['totalFullFlights'] == 3456 and audit['totalCandidates'] == 72
assert audit['finalSelectedGeneration'] == 6
assert audit['initialAndFinal21300WeightsExactlyMatch'] is True
assert audit['all72ProposalsAndFinalOptimizerStateExactlyMatch'] is True
for name in ['state.json', 'candidate.json', 'trials.jsonl']:
    assert sha(TRAINING / name) == audit['hashes'][name], name
runtime = (ROOT / plan['runtimeDirectory']).resolve()
assert runtime == BASE / 'tested-runtime'
for relative, expected in plan['runtimeSHA256'].items():
    assert (runtime / relative).resolve().is_relative_to(runtime), relative
    assert sha(runtime / relative) == expected, relative
assert len(plan['runtimeSHA256']) == 71
environment = {k: v for k, v in os.environ.items()
               if k in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ']}
node = Path(plan['nodeExecutable'])
assert node.is_absolute() and node.is_file()
assert sha(node) == plan['nodeExecutableSHA256']
assert subprocess.check_output([str(node), '--version'], text=True, env=environment).strip() == plan['nodeVersion']
assert plan['nodeVersion'] == 'v24.3.0'
for name, generation, episodes in [('candidate', 6, 3456), ('released', 5, 600)]:
    item = plan['models'][name]
    assert sha(ROOT / item['file']) == item['sha256']
    checkpoint = read(ROOT / item['file'])
    assert (checkpoint['generation'], checkpoint['episodes']) == (generation, episodes)
    assert checkpoint['calibrationHash'] == plan['basisSHA256']
    assert len(checkpoint['parameters']) == 28 and len(checkpoint['weights']) == 21300
    assert all(math.isfinite(v) for v in checkpoint['parameters'] + checkpoint['weights'])
    weight_sha = hashlib.sha256(struct.pack('<21300d', *checkpoint['weights'])).hexdigest()
    assert weight_sha == item['weightSHA256']
    if name == 'candidate':
        assert item['sha256'] == audit['hashes']['candidate.json']
    else:
        assert item['sha256'] == '19102a97e8692e81e3c3b59dd7e99ff91ca3ce75e77173e4bfb70b823a1a8d5e'
        assert weight_sha == '9953d20ee4e6b8ab7838b035ff0159c2da785ab7137566f19e91815247c0e855'
basis = runtime / 'artifacts/suite-training/sensory-basis-flights.json'
assert sha(basis) == plan['basisSHA256'] == 'cdc7c1069b693979294b9949fc6bfec55774e5e10c1c701c26755fc87048ce20'
block = 'ground-joint-all-selection-' + args.model
output = runtime / 'artifacts/suite-training' / block
assert not output.exists(), 'Preserve the original evaluation attempt and inspect its handle'
launch_file = BASE / ('launch-' + args.model + '.json')
assert not launch_file.exists(), 'Preserve the original launch record and inspect its handle'
settings = dict(FLY_NATIVE_RATE='1', SUITE_BLOCK=block,
                SUITE_INITIAL=str((ROOT / plan['models'][args.model]['file']).resolve()),
                SUITE_SENSORY_BASIS=str(basis), SUITE_PROFILES=','.join(map(str, range(24))),
                SUITE_TESTS='96', SUITE_TEST_SEED='95638071',
                SUITE_TEST_MODES='normal,covered,no-instruments' if args.model == 'candidate' else 'normal',
                SUITE_WORKERS='3' if args.model == 'candidate' else '1',
                SUITE_TOUCHDOWN_MARGIN='3', SUITE_INSERTION_HOLD='0', SUITE_TEST_OUTPUT='selection.json')
command = [str(node), 'scripts/train-suite.mjs', '--evaluate']
assert plan['executionModels'][args.model]['environment'] == settings
assert plan['executionModels'][args.model]['command'] == command
assert ROOT / plan['executionModels'][args.model]['outputDirectory'] == output
environment.update(settings)
record = dict(createdAt=datetime.now(timezone.utc).isoformat(), model=args.model,
              planSHA256=args.plan_sha256, launcherSHA256=sha(__file__),
              workingDirectory=str(runtime), command=command, explicitEnvironment=settings,
              completeEnvironment=environment,
              verifiedRuntimeFiles=71,
              status='Preflight passed; this record alone does not establish live or complete status')
print(json.dumps(record), flush=True)
if args.preflight:
    raise SystemExit(0)
with launch_file.open('x') as file:
    json.dump(record, file, indent=2)
    file.write('\n')
os.chdir(runtime)
os.execvpe(command[0], command, environment)
