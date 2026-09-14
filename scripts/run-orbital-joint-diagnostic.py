#!/usr/bin/env python3
"""Verify a frozen paired diagnostic snapshot, then run one complete controller probe."""
import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/suite-training/orbital-joint-paired-diagnostic'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('model',choices=['initial','final'])
args = parser.parse_args()
assert sha(BASE/'plan.json')=='b0a1cea3c16dd6e704e7a82c0d3435a377212ec53ce2fec6e4e0d7a8a28bc449'
plan = json.loads((BASE/'plan.json').read_text())
runtime = ROOT/plan['runtimeDirectory']
for name, expected in plan['runtimeSHA256'].items():
    assert sha(runtime/name)==expected, name
for model in plan['models'].values():
    assert sha(ROOT/model['file'])==model['sha256']
assert sha(ROOT/plan['trainingPlanFile'])==plan['trainingPlanSHA256']
assert subprocess.check_output(['node','--version'],text=True).strip()==plan['nodeVersion']
model = plan['models'][args.model]
output = ROOT/model['outputFile']
assert not output.parent.exists(), 'Preserve any previously started diagnostic; inspect its original handle'
environment = {k:v for k,v in os.environ.items() if not k.startswith('SUITE_') and k!='FLY_NATIVE_RATE'}
environment.update(model['environment'])
record = {'createdAt':datetime.now(timezone.utc).isoformat(),'model':args.model,
          'planSHA256':sha(BASE/'plan.json'),'launcherSHA256':sha(__file__),
          'workingDirectory':str(runtime),'command':plan['command'],
          'explicitEnvironment':model['environment'],'verifiedRuntimeFiles':len(plan['runtimeSHA256']),
          'status':'Prepared for process exec; this record alone does not establish live or complete status'}
with (BASE/f'launch-{args.model}.json').open('x') as file:
    json.dump(record,file,indent=2);file.write('\n')
print(json.dumps(record),flush=True)
os.chdir(runtime)
os.execvpe(plan['command'][0],plan['command'],environment)
