#!/usr/bin/env python3
"""Launch one frozen stage of the 156-flight orbital proposal-locality comparison."""
import argparse
import hashlib
import json
import math
import os
import struct
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/suite-training/orbital-local-proposal-comparison'
NODE = '/opt/homebrew/Cellar/node/24.3.0/bin/node'
NODE_SHA = 'ecb006586e2f719d97c49d495e4534a2a5a9d12aa9394bd88bbcf3a9f00c5574'
PROPOSAL_SHA = 'f25f2405b54f20c39f540d7e6deef8d31bc016039394fff817f054d48582a38a'
BASE_ENV = dict(PATH='/opt/homebrew/Cellar/node/24.3.0/bin:/usr/bin:/bin',
                HOME='/Users/sarrington', TMPDIR='/tmp', LANG='C', LC_ALL='C', TZ='UTC')
ARMS = ('standard', 'quarter')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def checked(path, expected):
    require(Path(path).is_file() and not Path(path).is_symlink() and sha(path) == expected,
            'Frozen file changed: ' + str(path))


def vector_hash(values, count):
    require(isinstance(values, list) and len(values) == count
            and all(type(v) in (int, float) and math.isfinite(v) for v in values), 'Invalid vector')
    return hashlib.sha256(struct.pack('<' + str(count) + 'd', *values)).hexdigest()


def observation_time(receipt):
    require(isinstance(receipt['terminalOutputChunkId'], str) and bool(receipt['terminalOutputChunkId']),
            'Missing original terminal output chunk')
    observed = datetime.fromisoformat(receipt['observedAt'])
    require(observed.tzinfo is not None and observed <= datetime.now(timezone.utc),
            'Invalid terminal observation time')
    return observed


def verified_plan(digest):
    checked(BASE / 'execution-plan.json', digest)
    plan = read(BASE / 'execution-plan.json')
    require(plan['schema'] == 'orbital-local-proposal-execution-v1' and plan['root'] == str(ROOT)
            and plan['totalFullFlights'] == 156 and plan['releaseEligible'] is False, 'Wrong experiment')
    checked(__file__, plan['launcherSHA256'])
    checked(BASE / 'tested-launcher.py', plan['launcherSHA256'])
    checked(BASE / 'proposal/plan.json', PROPOSAL_SHA)
    proposal = read(BASE / 'proposal/plan.json')
    for relative, expected in plan['preparedFilesSHA256'].items():
        path = BASE / relative
        require(path.resolve().is_relative_to(BASE.resolve()), 'Prepared path escapes archive')
        checked(path, expected)
    runtime = ROOT / proposal['runtime']['reuseDirectory']
    require(runtime == ROOT / 'artifacts/suite-training/orbital-progress-comparison/tested-runtime',
            'Unexpected runtime')
    require(len(proposal['runtime']['runtimeSHA256']) == 72, 'Incomplete runtime manifest')
    checked(ROOT / proposal['runtime']['referencePlanFile'], proposal['runtime']['referencePlanSHA256'])
    for relative, expected in proposal['runtime']['runtimeSHA256'].items():
        checked(runtime / relative, expected)
    initial_path = ROOT / proposal['initial']['file']
    checked(initial_path, proposal['initial']['fileSHA256'])
    initial = read(initial_path)
    require('best' not in initial, 'Unexpected initial optimizer precedence')
    require(vector_hash(initial['parameters'], 28) == proposal['initial']['parametersFloat64LESHA256']
            and vector_hash(initial['weights'], 21300) == proposal['initial']['weightsFloat64LESHA256'],
            'Initial controller changed')
    require(plan['baseEnvironment'] == BASE_ENV and plan['node'] ==
            dict(executable=NODE, sha256=NODE_SHA, version='v24.3.0'), 'Execution environment changed')
    checked(NODE, NODE_SHA)
    require(subprocess.check_output([NODE, '--version'], env=BASE_ENV, text=True).strip() == 'v24.3.0',
            'Node version changed')
    for arm in ARMS:
        state_path = BASE / ('initial-state-' + arm + '.json')
        checked(state_path, plan['initialStateSHA256'][arm])
        state = read(state_path)
        expected = dict(generation=0, episodes=0, mean=initial['parameters'],
                        sigma=proposal['arms'][arm]['initialSigma'], best=None, history=[])
        require(state == expected and set(state) == set(expected), 'Initial optimizer changed')
        vector_hash(state['mean'], 28)
        vector_hash(state['sigma'], 28)
        require(all(v > 0 for v in state['sigma']), 'Invalid sigma')
    return plan, proposal, runtime


def evaluation_gate(plan, proposal, digest, freeze_digest):
    require(freeze_digest is not None, 'Evaluation requires the completed paired training freeze')
    freeze_path = BASE / 'training-completion-freeze.json'
    checked(freeze_path, freeze_digest)
    freeze = read(freeze_path)
    require(freeze['schema'] == 'orbital-local-proposal-training-completion-v1'
            and freeze['planSHA256'] == digest and freeze['confirmedBy'] == '/root'
            and freeze['bothOriginalTerminalsObservedComplete'] is True and freeze['noRestarts'] is True
            and set(freeze['arms']) == set(ARMS), 'Both original training terminals are required')
    checked(BASE / freeze['auditFile'], freeze['auditSHA256'])
    checked(BASE / freeze['auditTerminalFile'], freeze['auditTerminalSHA256'])
    audit, terminal = read(BASE / freeze['auditFile']), read(BASE / freeze['auditTerminalFile'])
    require(audit['status'] == 'PASS' and audit['planSHA256'] == digest
            and audit['totalFullFlights'] == 144 and audit['totalCandidates'] == 24
            and audit['allProposalsRankingsAndOptimizerStatesExactlyMatch'] is True
            and audit['allOriginalFullOutcomesRetained'] is True
            and audit['allScoreFitnessAndProgressChecksPassed'] is True
            and audit['allInitialAndFinalWeightsExactlyMatch'] is True
            and set(audit['arms']) == set(ARMS), 'Paired training audit incomplete')
    require(terminal['confirmedBy'] == '/root' and type(terminal['exitCode']) is int and terminal['exitCode'] == 0
            and terminal['auditSHA256'] == freeze['auditSHA256']
            and terminal['originalAttempt'] is True, 'Original arithmetic audit exit required')
    audit_observed = observation_time(terminal)
    sessions = []
    for arm in ARMS:
        item = freeze['arms'][arm]
        require(type(item['originalSessionId']) is int and item['originalSessionId'] > 0
                and type(item['exitCode']) is int and item['exitCode'] == 0
                and item['originalAttempt'] is True and bool(item['terminalOutputChunkId']),
                'Original training exit required: ' + arm)
        sessions.append(item['originalSessionId'])
        observed = observation_time(item)
        launch_path = BASE / ('launch-train-' + arm + '.json')
        checked(launch_path, item['launchSHA256'])
        launch = read(launch_path)
        require(launch['arm'] == arm and launch['stage'] == 'train' and launch['planSHA256'] == digest
                and launch['launcherSHA256'] == plan['launcherSHA256']
                and launch['completeEnvironment'] == dict(BASE_ENV, **proposal['arms'][arm]['trainingEnvironment'])
                and launch['command'] == [NODE, 'scripts/train-suite.mjs']
                and launch['workingDirectory'] == str(ROOT / proposal['runtime']['reuseDirectory'])
                and launch['outputDirectory'] == str(ROOT / proposal['arms'][arm]['prospectiveOutputDirectory'])
                and launch['originalAttempt'] is True and launch['verifiedRuntimeFiles'] == 72
                and launch['initialStateSHA256'] == plan['initialStateSHA256'][arm],
                'Training launch changed')
        started = datetime.fromisoformat(launch['createdAt'])
        require(started.tzinfo is not None and started <= observed <= audit_observed,
                'Original training and audit observations are out of order')
        output = ROOT / proposal['arms'][arm]['prospectiveOutputDirectory']
        require(set(item['outputSHA256']) >= {'state.json', 'candidate.json', 'trials.jsonl'},
                'Training outputs not frozen')
        for relative, expected in item['outputSHA256'].items():
            path = output / relative
            require(path.resolve().is_relative_to(output.resolve()), 'Output path escapes arm')
            checked(path, expected)
        audited = audit['arms'][arm]
        require(audited['outputSHA256'] == item['outputSHA256']
                and audited['originalSessionId'] == item['originalSessionId']
                and audited['launchSHA256'] == item['launchSHA256']
                and audited['selectedParameters'] == item['parameters']
                and audited['selectedParameterSHA256'] == item['parameterSHA256']
                and audited['selectedWeightSHA256'] == item['weightSHA256'],
                'Selected controller or outputs differ from the completed audit')
        state, candidate = read(output / 'state.json'), read(output / 'candidate.json')
        require(state['generation'] == candidate['generation'] == 1
                and state['episodes'] == candidate['episodes'] == 72
                and state['best']['parameters'] == candidate['parameters'] == item['parameters'],
                'Comparison must use the fixed generation-one winner')
        require(vector_hash(candidate['parameters'], 28) == item['parameterSHA256']
                and vector_hash(candidate['weights'], 21300) == item['weightSHA256'],
                'Selected controller changed')
    require(len(set(sessions)) == 2, 'Distinct original training sessions required')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('arm', choices=ARMS)
    parser.add_argument('stage', choices=('train', 'evaluate'))
    parser.add_argument('--plan-sha256', required=True)
    parser.add_argument('--completion-sha256')
    parser.add_argument('--preflight', action='store_true')
    args = parser.parse_args()
    plan, proposal, runtime = verified_plan(args.plan_sha256)
    arm = proposal['arms'][args.arm]
    output = ROOT / arm['prospectiveOutputDirectory']
    require(output == runtime / 'artifacts/suite-training' / ('orbital-joint-local-' + args.arm),
            'Unexpected arm output directory')
    receipt = BASE / ('launch-' + args.stage + '-' + args.arm + '.json')
    require(not receipt.exists(), 'Preserve the original attempt; no restart')
    if args.stage == 'train':
        require(output.is_dir() and {p.name for p in output.iterdir()} == {'state.json'},
                'Training requires only the prescribed initial state')
        checked(output / 'state.json', plan['initialStateSHA256'][args.arm])
        settings = arm['trainingEnvironment']
        command = [NODE, 'scripts/train-suite.mjs']
    else:
        evaluation_gate(plan, proposal, args.plan_sha256, args.completion_sha256)
        require(all(not (output / name).exists() for name in
                    ('local-comparison.json', 'local-comparison.json.tmp', 'local-comparison-weights.json')),
                'Preserve the original comparison')
        settings = arm['comparisonEnvironment']
        command = [NODE, 'scripts/train-suite.mjs', '--evaluate']
    environment = dict(BASE_ENV, **settings)
    record = dict(createdAt=datetime.now(timezone.utc).isoformat(), arm=args.arm, stage=args.stage,
                  planSHA256=args.plan_sha256, launcherSHA256=sha(__file__), command=command,
                  workingDirectory=str(runtime), outputDirectory=str(output),
                  completeEnvironment=environment, verifiedRuntimeFiles=72, originalAttempt=True,
                  initialStateSHA256=plan['initialStateSHA256'][args.arm],
                  trainingCompletionFreezeSHA256=args.completion_sha256,
                  status='Preflight passed; this record alone does not establish a live or completed process')
    if args.preflight:
        print(json.dumps(dict(record, status='PREFLIGHT PASS; no writes or workers')))
        return
    with receipt.open('x') as stream:
        json.dump(record, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps(record), flush=True)
    os.chdir(runtime)
    os.execve(NODE, command, environment)


if __name__ == '__main__':
    main()
