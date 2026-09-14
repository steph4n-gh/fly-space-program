#!/usr/bin/env python3
"""Freeze and launch the single prospective paired ground-contact experiment."""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import struct
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ARMS = {'control': 'record', 'ranked': 'rank'}
NODE = '/opt/homebrew/Cellar/node/24.3.0/bin/node'
NODE_SHA = 'ecb006586e2f719d97c49d495e4534a2a5a9d12aa9394bd88bbcf3a9f00c5574'
BASE_ENV = dict(PATH='/opt/homebrew/Cellar/node/24.3.0/bin:/usr/bin:/bin', HOME='/Users/sarrington',
                TMPDIR='/tmp', LANG='C', LC_ALL='C', TZ='UTC')
HELPER_SHA = 'c831febc7e15b0164d79e94cf20d91f1969434bfad839b19388d93370537d0aa'
TRAINER_SHA = 'a8cc77643f646290c97b298a67830700ff17c78e53ef4ebe24b0655fba80946f'
BASE_REL = 'artifacts/suite-training/ground-contact-comparison'
READOUT_FILES = ('state.json', 'candidate.json', 'trials.jsonl')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write_new(path, value):
    with Path(path).open('x') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def now():
    return datetime.now(timezone.utc).isoformat()


def child(parent, relative):
    relative = Path(relative)
    require(not relative.is_absolute() and '..' not in relative.parts, 'Invalid relative artifact path')
    path = parent / relative
    require(path.resolve().is_relative_to(parent.resolve()), 'Artifact escapes its frozen directory')
    return path


def checked(path, expected):
    require(isinstance(expected, str) and re.fullmatch('[0-9a-f]{64}', expected), 'Invalid SHA256')
    require(Path(path).is_file() and not Path(path).is_symlink() and sha(path) == expected,
            'File identity changed: ' + str(path))


def tree_hashes(directory):
    require(directory.is_dir(), 'Missing archive: ' + str(directory))
    files = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), 'Archive contains a symlink: ' + str(path))
        if path.is_file():
            files[str(path.relative_to(directory))] = sha(path)
    return files


def environment(settings=None):
    forbidden = [key for key in os.environ if key.startswith(('SUITE_', 'FLY_', 'DYLD_', 'LD_'))
                 or key in ('NODE_OPTIONS', 'NODE_PATH')]
    require(not forbidden, 'Unset ambient execution overrides: ' + ', '.join(sorted(forbidden)))
    result = dict(BASE_ENV)
    result.update(settings or {})
    return result


def node_check(node):
    require(node == dict(executable=NODE, sha256=NODE_SHA, version='v24.3.0'), 'Unexpected Node pin')
    checked(NODE, NODE_SHA)
    version = subprocess.check_output([NODE, '--version'], text=True, env=environment()).strip()
    require(version == node['version'], 'Node version changed')


def vector_hash(values, length):
    require(isinstance(values, list) and len(values) == length
            and all(type(value) in (int, float) and math.isfinite(value) for value in values),
            'Invalid checkpoint vector')
    return hashlib.sha256(struct.pack('<' + str(length) + 'd', *values)).hexdigest()


def model_identity(path, generation, episodes, basis_sha):
    model = read(path)
    require(model.get('generation') == generation and model.get('episodes') == episodes,
            'Unexpected checkpoint generation or episode count')
    require(model.get('calibrationHash') == basis_sha, 'Checkpoint basis changed')
    return model, dict(sha256=sha(path), parameterSHA256=vector_hash(model.get('parameters'), 28),
                      weightSHA256=vector_hash(model.get('weights'), 21300),
                      generation=generation, episodes=episodes)


def specifications(root, base):
    runtime = base / 'tested-runtime'
    common = dict(FLY_NATIVE_RATE='1', SUITE_SENSORY_BASIS=str(runtime / 'artifacts/suite-training/sensory-basis-flights.json'),
                  SUITE_PROFILES=','.join(map(str, range(24))), SUITE_BATCH='48', SUITE_WORKERS='2',
                  SUITE_TOUCHDOWN_MARGIN='3', SUITE_INSERTION_HOLD='0', SUITE_INSERTION_PROGRESS='off',
                  SUITE_COVARIANCE='1', SUITE_VARY_SEEDS='1', SUITE_SEARCH_SEED='323700139')
    result = {'train': {}, 'evaluate': {}}
    for arm, mode in ARMS.items():
        for phase in result:
            block = 'ground-joint-all-contact-' + arm + ('-evaluation' if phase == 'evaluate' else '')
            settings = dict(common, SUITE_BLOCK=block, SUITE_GROUND_CONTACT=mode)
            if phase == 'train':
                settings.update(SUITE_INITIAL=str(base / 'initial-candidate.json'),
                                SUITE_GENERATIONS='4', SUITE_POPULATION='12')
            else:
                settings.update(SUITE_INITIAL=str(base / 'evaluation-models' / (arm + '.json')),
                                SUITE_TESTS='48', SUITE_TEST_SEED='98753027',
                                SUITE_TEST_MODES='normal', SUITE_TEST_OUTPUT='comparison.json')
            result[phase][arm] = dict(environment=settings,
                command=[NODE, 'scripts/train-suite.mjs'] + (['--evaluate'] if phase == 'evaluate' else []),
                outputDirectory=str((runtime / 'artifacts/suite-training' / block).relative_to(root)))
    return result


def proposal_inputs(base, expected_sha):
    directory = base / 'proposal'
    checked(directory / 'proposal.json', expected_sha)
    proposal = read(directory / 'proposal.json')
    require(proposal['schema'] == 'ground-contact-objective-proposal-v1', 'Unexpected proposal schema')
    training = proposal['training']
    require([training[key] for key in ('generationsPerArm', 'populationPerGeneration', 'casesPerCandidate',
                                     'workersPerArm', 'flightsPerArm', 'totalTrainingFlights', 'searchSeed')]
            == [4, 12, 48, 2, 2304, 4608, 323700139], 'Prospective training budget changed')
    require(training['profiles'] == list(range(24)) and training['correlated'] is True, 'Ground scope changed')
    require(training['activeDirections'] == list(range(12)) + list(range(23, 28)), 'Active directions changed')
    require(training['conditions']['insertionHold'] is False and training['conditions']['insertionProgress'] is False
            and training['conditions']['touchdownMargin'] == 3, 'Ground reward conditions changed')
    expected_cases = [dict(generation=g, cases=[dict(scenario=(g+i-1) % 24,
        seed=714133 if i == 0 else 527801+g*15427+i*10391, variability=0 if i < 24 else .4)
        for i in range(48)]) for g in range(1, 5)]
    items = dict(optimizer=training['initialOptimizer'], trainingCases=training['caseSchedule'],
                 comparisonCases=proposal['developmentComparison']['cases'], runtime=proposal['baseRuntime'],
                 collision=proposal['caseCollisionCheck'])
    values = {}
    for name, item in items.items():
        path = directory / Path(item['file']).name
        checked(path, item['sha256'])
        values[name] = read(path)
    require(values['trainingCases'] == expected_cases, 'Training case schedule changed')
    require(values['comparisonCases'] == [dict(scenario=i % 24, seed=98753027+i*104729,
            variability=0 if i < 24 else .4) for i in range(48)], 'Comparison case schedule changed')
    require(proposal['developmentComparison']['rootSeed'] == 98753027
            and proposal['developmentComparison']['casesPerArm'] == 48
            and proposal['totalPlannedFullFlights'] == 4704, 'Comparison budget changed')
    return proposal, values


def import_closure(sources):
    # These sources are fixed by the reviewed map. Check every literal module edge,
    # including the native add-on; the unchanged base map pins its graph data files.
    edges = []
    pattern = r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['\"]([^'\"]+)['\"]"
    for relative, source in sources.items():
        if not relative.endswith(('.js', '.mjs')):
            continue
        for specifier in re.findall(pattern, source.read_text()):
            if specifier.startswith('node:'):
                continue
            require(specifier.startswith('.'), 'Unpinned external module: ' + specifier)
            target = os.path.normpath(str(Path(relative).parent / specifier.split('?')[0].split('#')[0]))
            require(target in sources, 'Unclosed module import: ' + relative + ' -> ' + target)
            edges.append([relative, target])
    return edges


def prepare(args, root, base):
    require(base.is_dir() and set(path.name for path in base.iterdir()) <= {'proposal', 'integration-review'},
            'Preparation requires only the preserved proposal and optional integration-review archives')
    proposal, values = proposal_inputs(base, args.proposal_sha256)
    baseline = values['runtime']
    require(len(baseline['files']) == 71, 'Expected the complete 71-file baseline')
    node = dict(executable=baseline['nodeExecutable'], sha256=baseline['nodeExecutableSHA256'], version=baseline['nodeVersion'])
    node_check(node)
    source_root = Path(baseline['runtimeDirectory'])
    sources = {relative: child(source_root, relative) for relative in baseline['files']}
    for relative, path in sources.items():
        checked(path, baseline['files'][relative])
    changes = {'scripts/train-suite.mjs': args.trainer_sha256,
               'scripts/ground-contact-progress.mjs': args.contact_sha256,
               'scripts/insertion-progress.mjs': args.insertion_progress_sha256}
    require(changes['scripts/train-suite.mjs'] == TRAINER_SHA and changes['scripts/ground-contact-progress.mjs'] == HELPER_SHA,
            'Trainer or contact metric differs from the final independent review')
    for relative, expected in changes.items():
        sources[relative] = child(root, relative)
        checked(sources[relative], expected)
    require(len(sources) == 73, 'Expected exactly 73 runtime resources')
    imports = import_closure(sources)
    runtime_hashes = {relative: sha(path) for relative, path in sorted(sources.items())}
    basis_sha = runtime_hashes['artifacts/suite-training/sensory-basis-flights.json']
    initial_path = Path(proposal['model']['file'])
    checked(initial_path, proposal['model']['sha256'])
    initial, identity = model_identity(initial_path, 6, 3456, basis_sha)
    require(identity['weightSHA256'] == proposal['model']['weightSHA256'], 'Initial weights changed')
    optimizer = values['optimizer']
    literal = re.search(r'const scales=\[([^\]]+)\];', sources['scripts/train-suite.mjs'].read_text())
    require(literal is not None, 'Original numeric scale literal is missing')
    tokens = [token.strip() for token in literal.group(1).split(',')]
    require(all(re.fullmatch(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?', token) for token in tokens),
            'Scale literal contains a nonnumeric expression')
    scales = [float(token) for token in tokens]
    require(optimizer == dict(generation=0, episodes=0, mean=initial['parameters'], sigma=scales, best=None, history=[]),
            'Fresh optimizer does not match original G6 parameters and original scales')
    require('best' not in initial, 'Initial checkpoint must not provide optimizer-best precedence')
    prepared = dict(schema='ground-contact-comparison-runtime-v1', proposalSHA256=args.proposal_sha256,
                    baseRuntimeSHA256=proposal['baseRuntime']['sha256'], runtimeSHA256=runtime_hashes,
                    sourceChanges=changes, literalImportEdges=imports, baseEnvironment=BASE_ENV)
    plan = dict(schema='ground-contact-comparison-v1', status='FROZEN_BEFORE_TRAINING', createdAt=now(),
                root=str(root), proposalSHA256=args.proposal_sha256,
                proposalFilesSHA256=tree_hashes(base / 'proposal'),
                integrationReviewSHA256=tree_hashes(base / 'integration-review') if (base / 'integration-review').exists() else {},
                launcherSHA256=sha(__file__), node=node, baseEnvironment=BASE_ENV,
                runtimeDirectory=str((base / 'tested-runtime').relative_to(root)),
                runtimeSHA256=runtime_hashes, initialModel=dict(file=str((base / 'initial-candidate.json').relative_to(root)), **identity),
                execution=specifications(root, base), interpretationRequiresBothOriginalComparisonExit0=True,
                releaseEligible=False, newTrainingFlights=4608, comparisonFlights=96)
    if args.preflight:
        print(json.dumps(dict(status='PREPARE PREFLIGHT PASS; no writes or workers', runtimeFiles=73, sourceChanges=changes)))
        return
    write_new(base / 'preparation-attempt.json', dict(createdAt=now(), launcherSHA256=sha(__file__), proposalSHA256=args.proposal_sha256))
    runtime = base / 'tested-runtime'
    runtime.mkdir()
    for relative, path in sources.items():
        destination = child(runtime, relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
        checked(destination, runtime_hashes[relative])
    shutil.copyfile(initial_path, base / 'initial-candidate.json')
    checked(base / 'initial-candidate.json', identity['sha256'])
    shutil.copyfile(__file__, base / 'tested-launcher.py')
    checked(base / 'tested-launcher.py', plan['launcherSHA256'])
    write_new(base / 'prepared-runtime.json', prepared)
    plan['preparedRuntimeSHA256'] = sha(base / 'prepared-runtime.json')
    write_new(base / 'plan.json', plan)
    print(json.dumps(dict(status='FROZEN; no workers launched', planSHA256=sha(base / 'plan.json'), runtimeFiles=73)))


def verified_plan(args, root, base):
    checked(base / 'plan.json', args.plan_sha256)
    plan = read(base / 'plan.json')
    require(plan['schema'] == 'ground-contact-comparison-v1' and plan['status'] == 'FROZEN_BEFORE_TRAINING'
            and plan['root'] == str(root) and plan['releaseEligible'] is False, 'Invalid frozen plan')
    checked(__file__, plan['launcherSHA256'])
    checked(base / 'tested-launcher.py', plan['launcherSHA256'])
    require(tree_hashes(base / 'proposal') == plan['proposalFilesSHA256'], 'Proposal archive changed')
    if plan['integrationReviewSHA256']:
        require(tree_hashes(base / 'integration-review') == plan['integrationReviewSHA256'], 'Integration review changed')
    proposal_inputs(base, plan['proposalSHA256'])
    checked(base / 'prepared-runtime.json', plan['preparedRuntimeSHA256'])
    prepared = read(base / 'prepared-runtime.json')
    require(prepared['runtimeSHA256'] == plan['runtimeSHA256'] and len(plan['runtimeSHA256']) == 73
            and prepared['baseEnvironment'] == plan['baseEnvironment'] == BASE_ENV, 'Runtime manifest or frozen environment changed')
    runtime = child(root, plan['runtimeDirectory'])
    require(runtime == base / 'tested-runtime', 'Unexpected runtime directory')
    for relative, expected in plan['runtimeSHA256'].items():
        checked(child(runtime, relative), expected)
    require(plan['execution'] == specifications(root, base), 'Execution settings changed')
    initial_path = child(root, plan['initialModel']['file'])
    checked(initial_path, plan['initialModel']['sha256'])
    _, identity = model_identity(initial_path, 6, 3456, plan['runtimeSHA256']['artifacts/suite-training/sensory-basis-flights.json'])
    require(identity == {key: value for key, value in plan['initialModel'].items() if key != 'file'}, 'Initial checkpoint changed')
    node_check(plan['node'])
    return plan, runtime


def fresh_launch(phase, arm, root, base, plan):
    output = child(root, plan['execution'][phase][arm]['outputDirectory'])
    launch = base / ('launch-' + phase + '-' + arm + '.json')
    require(not output.exists() and not launch.exists(), 'Preserve the original ' + phase + ' attempt; no restart permitted')
    return output, launch


def training_gate(root, base, plan, plan_sha, terminal_path, terminal_sha, audit_path, audit_sha):
    # Root-attested tool terminal observations are required before opening training outcomes.
    checked(terminal_path, terminal_sha)
    terminal = read(terminal_path)
    require(terminal['schema'] == 'ground-contact-comparison-terminal-confirmation-v1'
            and terminal['phase'] == 'training' and terminal['confirmedBy'] == '/root'
            and terminal['planSHA256'] == plan_sha and terminal['noRestarts'] is True
            and terminal['bothOriginalTerminalsObservedComplete'] is True
            and set(terminal['arms']) == set(ARMS), 'Both original training terminal receipts are required')
    sessions = []
    for arm in ARMS:
        receipt = terminal['arms'][arm]
        require(type(receipt['originalSessionId']) is int and receipt['originalSessionId'] > 0
                and receipt['originalAttempt'] is True and type(receipt['exitCode']) is int and receipt['exitCode'] == 0
                and isinstance(receipt['terminalOutputChunkId'], str) and bool(receipt['terminalOutputChunkId']),
                'Invalid original terminal observation for ' + arm)
        observed = datetime.fromisoformat(receipt['observedAt'])
        require(observed.tzinfo is not None and observed <= datetime.now(timezone.utc), 'Invalid terminal observation time')
        launch_path = base / ('launch-train-' + arm + '.json')
        checked(launch_path, receipt['launchSHA256'])
        launch = read(launch_path)
        require(launch['planSHA256'] == plan_sha and launch['launcherSHA256'] == plan['launcherSHA256']
                and launch['phase'] == 'train' and launch['arm'] == arm
                and launch['explicitEnvironment'] == plan['execution']['train'][arm]['environment']
                and launch['completeEnvironment'] == dict(plan['baseEnvironment'], **plan['execution']['train'][arm]['environment'])
                and launch['command'] == plan['execution']['train'][arm]['command']
                and launch['workingDirectory'] == str(base / 'tested-runtime')
                and launch['outputDirectory'] == str(child(root, plan['execution']['train'][arm]['outputDirectory']))
                and launch['originalAttempt'] is True and launch['verifiedRuntimeFiles'] == 73
                and observed >= datetime.fromisoformat(launch['createdAt']), 'Launch and terminal receipt mismatch')
        sessions.append(receipt['originalSessionId'])
    require(len(set(sessions)) == 2, 'Both original arms require distinct terminal sessions')
    checked(audit_path, audit_sha)
    audit = read(audit_path)
    require(audit['schema'] == 'ground-contact-comparison-training-audit-v1' and audit['status'] == 'PASS'
            and audit['planSHA256'] == plan_sha and audit['runtimeManifestSHA256'] == plan['preparedRuntimeSHA256']
            and audit['launcherSHA256'] == plan['launcherSHA256'] and audit['terminalConfirmationSHA256'] == terminal_sha
            and audit['totalFullFlights'] == 4608 and audit['totalCandidates'] == 96
            and set(audit['arms']) == set(ARMS), 'Missing completed paired training audit')
    for key in ('allOriginalFullOutcomesRetained', 'allProposalsRankingsAndOptimizerStatesExactlyMatch',
                'allScoreFitnessAndQualityChecksPassed', 'allInitialAndFinalWeightsExactlyMatch'):
        require(audit[key] is True, 'Training audit did not pass ' + key)
    models = {}
    basis_sha = plan['runtimeSHA256']['artifacts/suite-training/sensory-basis-flights.json']
    for arm, mode in ARMS.items():
        entry = audit['arms'][arm]
        require(entry['originalSessionId'] == terminal['arms'][arm]['originalSessionId']
                and entry['launchSHA256'] == terminal['arms'][arm]['launchSHA256']
                and [entry[key] for key in ('generations', 'totalCandidates', 'totalFullFlights')] == [4, 48, 2304],
                'Training audit arm mismatch')
        output = child(root, plan['execution']['train'][arm]['outputDirectory'])
        required = set(READOUT_FILES) | {'raw-training-' + str(g) + '-' + str(c) + '.bin'
                                       for g in range(1, 5) for c in range(12)}
        require(required <= set(entry['hashes']), 'Audit omits original ordered ledger, checkpoint or raw worker returns')
        for relative, expected in entry['hashes'].items():
            checked(child(output, relative), expected)
        candidate_path = output / 'candidate.json'
        candidate, identity = model_identity(candidate_path, 4, 2304, basis_sha)
        require(identity == entry['candidate'] and identity['sha256'] == entry['hashes']['candidate.json'], 'Final candidate identity mismatch')
        require(candidate['sourceSHA256'] == plan['runtimeSHA256']['scripts/train-suite.mjs']
                and candidate['groundContact'] == mode and candidate['groundContactSourceSHA256'] == HELPER_SHA,
                'Candidate did not use the frozen arm and source')
        state = read(output / 'state.json')
        require(state['generation'] == 4 and state['episodes'] == 2304 and len(state['history']) == 4
                and len(candidate['history']) == 4 and candidate['history'][-1]['generation'] == 4
                and candidate['parameters'] == candidate['history'][-1]['parameters']
                == state['history'][-1]['parameters'] == state['best']['parameters'], 'Only the audited final local G4 candidate may be used')
        models[arm] = dict(file=str((base / 'evaluation-models' / (arm + '.json')).relative_to(root)), **identity)
    return models


def freeze_comparison(args, root, base, plan):
    terminal_path, audit_path = Path(args.training_terminal).resolve(), Path(args.training_audit).resolve()
    models = training_gate(root, base, plan, args.plan_sha256, terminal_path, args.training_terminal_sha256,
                           audit_path, args.training_audit_sha256)
    require(not (base / 'evaluation-models').exists() and not (base / 'comparison-freeze.json').exists(),
            'Preserve the original comparison model freeze')
    for arm in ARMS:
        fresh_launch('evaluate', arm, root, base, plan)
    record = dict(schema='ground-contact-comparison-model-freeze-v1', createdAt=now(), planSHA256=args.plan_sha256,
                  launcherSHA256=plan['launcherSHA256'], bothModelsFrozenBeforeEitherEvaluation=True,
                  trainingTerminal=dict(file=str(terminal_path), sha256=args.training_terminal_sha256),
                  trainingAudit=dict(file=str(audit_path), sha256=args.training_audit_sha256), models=models)
    if args.preflight:
        print(json.dumps(dict(status='COMPARISON FREEZE PREFLIGHT PASS; no writes or workers', models=models)))
        return
    (base / 'evaluation-models').mkdir()
    for arm in ARMS:
        source = child(root, plan['execution']['train'][arm]['outputDirectory']) / 'candidate.json'
        destination = child(root, models[arm]['file'])
        shutil.copyfile(source, destination)
        checked(destination, models[arm]['sha256'])
    write_new(base / 'comparison-freeze.json', record)
    print(json.dumps(dict(status='BOTH FINAL G4 MODELS FROZEN; no workers launched', comparisonFreezeSHA256=sha(base / 'comparison-freeze.json'))))


def launch(args, root, base, plan, runtime):
    phase = args.action
    output, launch_path = fresh_launch(phase, args.arm, root, base, plan)
    if phase == 'evaluate':
        checked(base / 'comparison-freeze.json', args.comparison_freeze_sha256)
        frozen = read(base / 'comparison-freeze.json')
        require(frozen['schema'] == 'ground-contact-comparison-model-freeze-v1'
                and frozen['planSHA256'] == args.plan_sha256 and frozen['launcherSHA256'] == plan['launcherSHA256']
                and frozen['bothModelsFrozenBeforeEitherEvaluation'] is True, 'Invalid paired model freeze')
        terminal, audit = frozen['trainingTerminal'], frozen['trainingAudit']
        models = training_gate(root, base, plan, args.plan_sha256, Path(terminal['file']), terminal['sha256'],
                               Path(audit['file']), audit['sha256'])
        require(models == frozen['models'], 'Comparison model identities changed')
        for arm in ARMS:
            checked(child(root, models[arm]['file']), models[arm]['sha256'])
    spec = plan['execution'][phase][args.arm]
    complete_environment = environment(spec['environment'])
    record = dict(createdAt=now(), phase=phase, arm=args.arm, planSHA256=args.plan_sha256,
                  launcherSHA256=plan['launcherSHA256'], workingDirectory=str(runtime),
                  command=spec['command'], explicitEnvironment=spec['environment'], completeEnvironment=complete_environment,
                  verifiedRuntimeFiles=73, outputDirectory=str(output), originalAttempt=True,
                  status='PREFLIGHT PASS; this record does not prove a live or completed process')
    if phase == 'evaluate':
        record['comparisonFreezeSHA256'] = args.comparison_freeze_sha256
    print(json.dumps(record), flush=True)
    if args.preflight:
        return
    write_new(launch_path, record)
    os.chdir(runtime)
    os.execvpe(spec['command'][0], spec['command'], complete_environment)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    for action in ('prepare', 'train', 'freeze-comparison', 'evaluate'):
        command = commands.add_parser(action)
        command.add_argument('--root', required=True)
        command.add_argument('--preflight', action='store_true', help='Verify without writing or starting workers')
        if action == 'prepare':
            for name in ('proposal', 'trainer', 'contact', 'insertion-progress'):
                command.add_argument('--' + name + '-sha256', required=True)
        else:
            command.add_argument('--plan-sha256', required=True)
        if action in ('train', 'evaluate'):
            command.add_argument('arm', choices=ARMS)
        if action == 'freeze-comparison':
            for name in ('training-terminal', 'training-audit'):
                command.add_argument('--' + name, required=True)
                command.add_argument('--' + name + '-sha256', required=True)
        if action == 'evaluate':
            command.add_argument('--comparison-freeze-sha256', required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    require(root.is_dir(), 'Root directory is missing')
    base = root / BASE_REL
    environment()
    if args.action == 'prepare':
        prepare(args, root, base)
    else:
        plan, runtime = verified_plan(args, root, base)
        if args.action == 'freeze-comparison':
            freeze_comparison(args, root, base, plan)
        else:
            launch(args, root, base, plan, runtime)


if __name__ == '__main__':
    main()
