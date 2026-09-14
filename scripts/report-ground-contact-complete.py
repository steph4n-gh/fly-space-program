#!/usr/bin/env python3
"""Export the two completed ground-contact record audits without running a model."""
import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/suite-training/ground-contact-comparison'
PLAN_SHA = '2245f3cef2dbcb94695f409a4c12e6962a7c84f9125b2cf4241787eaebed5315'
ARMS = ('control', 'ranked')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read(path):
    return json.loads(path.read_text())


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--training-sha256', required=True)
    parser.add_argument('--evaluation-sha256', required=True)
    parser.add_argument('--training-terminal-sha256', required=True)
    parser.add_argument('--evaluation-terminal-sha256', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    out = Path(args.output_dir).resolve()
    require(not out.exists() and not out.is_relative_to(ROOT), 'Use a fresh directory outside the repository')
    require(sha(BASE / 'plan.json') == PLAN_SHA, 'Experiment plan changed')
    sources = {str(BASE / 'plan.json'): PLAN_SHA}
    summaries, archives = {}, {}
    for stage, folder, expected, count, calculator in [
        ('training', 'completion-audit/training-audit', args.training_sha256, 4608,
         '5297adb4774a27a47437693bbe56e3665f5a6404e520cedc478b06925e1076c5'),
        ('evaluation', 'evaluation-audit/comparison-audit', args.evaluation_sha256, 96,
         '0b90ada829fe841198d39445b824f9b4a00e0bcc4919fd00870b4f0b38ac3708'),
    ]:
        receipt_file = BASE / (stage + '-audit-terminal-observation.json')
        receipt_sha = getattr(args, stage + '_terminal_sha256')
        require(sha(receipt_file) == receipt_sha, 'Changed original arithmetic terminal receipt')
        receipt = read(receipt_file)
        require(receipt['confirmedBy'] == '/root' and receipt['originalAttempt'] is True
                and type(receipt['exitCode']) is int and receipt['exitCode'] == 0
                and bool(receipt['terminalOutputChunkId']) and receipt['auditSHA256'] == expected,
                'The original arithmetic command must have completed successfully')
        require((type(receipt['sessionId']) is int and receipt['sessionId'] > 0
                 and receipt['completedInInitialToolCall'] is False)
                or (receipt['sessionId'] is None and receipt['completedInInitialToolCall'] is True),
                'Missing actual original arithmetic process observation')
        require(datetime.fromisoformat(receipt['observedAt']).tzinfo is not None, 'Undated terminal observation')
        sources[str(receipt_file)] = receipt_sha
        archive = BASE / folder
        require(not (archive / 'failure.json').exists() and sha(archive / 'summary.json') == expected,
                'Failed or changed audit')
        summary = read(archive / 'summary.json')
        require(summary['status'] == 'PASS' and summary['planSHA256'] == PLAN_SHA
                and summary['totalFullFlights'] == count and summary['calculatorSHA256'] == calculator
                and summary['allOriginalFullOutcomesRetained'] is True
                and summary['newNeuralRuns'] == summary['newPhysicalRuns'] == 0
                and summary['releaseEligible'] is False, 'Incomplete audit contract')
        require(receipt['executionFreezeSHA256'] == summary['executionFreezeSHA256']
                and receipt['calculatorSHA256'] == calculator
                and receipt['artifactsSHA256'] == sha(archive / 'artifacts.json'),
                'Arithmetic terminal receipt does not bind these results')
        for file, digest in summary['inputSHA256'].items():
            require(sha(Path(file)) == digest, 'Changed original input: ' + file)
            sources[file] = digest
        identities = read(archive / 'artifacts.json')['files']
        require(identities['summary.json'] == expected, 'Summary identity mismatch')
        for name, digest in identities.items():
            p = archive / name
            require(not Path(name).is_absolute() and p.resolve().is_relative_to(archive)
                    and p.is_file() and not p.is_symlink() and sha(p) == digest, 'Changed audit export: ' + name)
            sources[str(p)] = digest
        sources[str(archive / 'artifacts.json')] = sha(archive / 'artifacts.json')
        summaries[stage], archives[stage] = summary, (archive, identities)

    training, evaluation = summaries['training'], summaries['evaluation']
    require(training['totalCandidates'] == 96 and evaluation['totalMatchedPairs'] == 48
            and evaluation['trainingAuditSHA256'] == args.training_sha256
            and evaluation['selectionPerformed'] is False, 'Wrong completed experiment')
    for name in ['allProposalsRankingsAndOptimizerStatesExactlyMatch', 'allScoreFitnessAndQualityChecksPassed',
                 'allInitialAndFinalWeightsExactlyMatch']:
        require(training[name] is True, 'Training check failed: ' + name)
    for name in ['allFrozenModelAndWeightIdentitiesExactlyMatch', 'allRawReportsScoresFitnessAndQualityExactlyMatch']:
        require(evaluation[name] is True, 'Comparison check failed: ' + name)
    rows = {}
    for stage, name, count in [('training', 'all-training-flights.jsonl', 4608),
                               ('evaluation', 'all-comparison-outcomes.jsonl', 96)]:
        rows[stage] = [json.loads(line) for line in (archives[stage][0] / name).read_text().splitlines()]
        require(len(rows[stage]) == count and all(r['censored'] is False for r in rows[stage]), 'Missing full endpoint')
        for arm in ARMS:
            arm_rows = [r for r in rows[stage] if r['arm'] == arm]
            stats = training['arms'][arm]['allTraining'] if stage == 'training' else evaluation['arms'][arm]
            require(len(arm_rows) == count // 2 and sum(r['landed'] for r in arm_rows) == stats['landings'],
                    'Published landing count mismatch')
    require(len({(r['arm'], r['generation'], r['candidate'], r['caseIndex']) for r in rows['training']}) == 4608,
            'Repeated or omitted training case')
    pairs = read(archives['evaluation'][0] / 'paired-cases.json')
    require(len(pairs) == 48 and [p['caseIndex'] for p in pairs] == list(range(48)), 'Missing pair')
    for arm in ARMS:
        ordered = sorted((r for r in rows['evaluation'] if r['arm'] == arm), key=lambda r: r['caseIndex'])
        require([r['caseIndex'] for r in ordered] == list(range(48)), 'Missing comparison case')
        for i, row in enumerate(ordered):
            endpoint = {k: v for k, v in row.items() if k not in ('arm', 'caseIndex', 'mode')}
            require(endpoint == pairs[i][arm], 'Pair changed an endpoint')

    out.mkdir()
    files = {}
    for stage, (archive, identities) in archives.items():
        dest = out / stage
        dest.mkdir()
        for name in [*identities, 'artifacts.json']:
            target = dest / name
            shutil.copyfile(archive / name, target)
            require(sha(target) == sha(archive / name), 'Copy changed bytes')
            files[str(target.relative_to(out))] = sha(target)
    publication = {
        'schema': 'ground-contact-complete-publication-v1', 'status': 'COMPLETE',
        'budget': {'trainingFlights': 4608, 'comparisonFlights': 96, 'totalFlights': 4704, 'pendingFlights': 0},
        'training': {k: v for k, v in training.items() if k not in ('inputSHA256', 'jsonNormalization')},
        'evaluation': {k: v for k, v in evaluation.items() if k not in ('inputSHA256', 'jsonNormalization')},
        'files': files, 'sources': sources, 'reporterSHA256': sha(Path(__file__)),
        'releaseEligible': False, 'modelPromoted': False, 'newNeuralRuns': 0, 'newPhysicalRuns': 0,
        'scope': 'Completed adaptive training and 48 paired development starts. No reliability qualification, release selection or physical replay.',
        'fullRecords': 'All original endpoints, failures, rankings, optimizer states, case pairs and source identities are retained in the two export directories.',
    }
    for file, digest in sources.items():
        require(sha(Path(file)) == digest, 'Input changed during publication: ' + file)
    result = out / 'summary.json'
    result.write_text(json.dumps(publication, indent=2, allow_nan=False) + '\n')
    require(read(result) == publication, 'JSON changed a value')
    print(json.dumps({'status': 'PASS', 'summarySHA256': sha(result), 'exportedFiles': len(files),
                      'trainingFlights': 4608, 'comparisonFlights': 96, 'newNeuralRuns': 0, 'newPhysicalRuns': 0}))


if __name__ == '__main__':
    main()
