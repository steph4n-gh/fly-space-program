#!/usr/bin/env python3
"""Publish the completed, immutable orbital-progress training comparison only."""
import argparse
import csv
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path

PLAN_SHA = 'ecd27042dae78467a42111660e44e5da4d1fa8717852118626d920a7a6fdb8a7'
AUDIT_IDS_SHA = 'de572dc66e2d8a5dc80218eb839294395f81fb70f3c47e4382d2f604433b7295'
ARMS = ('control', 'conditional_periapsis')
MILESTONES = ('Final approach', 'Atmospheric entry', 'Deorbit', 'One full orbit', 'Stable orbit', 'Space', 'Launch')
IDENTITY_FIELDS = ('arm', 'generation', 'candidateIndex', 'caseIndex')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def checked(path, digest):
    require(sha(path) == digest, 'Changed retained input: ' + str(path))


def mean(values):
    total = 0
    for value in values:
        total += value
    return total / len(values)


def numeric_hash(values):
    return hashlib.sha256(struct.pack('<' + str(len(values)) + 'd', *values)).hexdigest()


def milestones(flights):
    return {name: sum(any(item['name'] == name for item in f['milestones']) for f in flights)
            for name in MILESTONES}


def rank_key(result, arm):
    counts = milestones(result['flights'])
    return (result['landings'], *(counts[name] for name in MILESTONES),
            *((mean([f['strictInsertionHoldProgress'] for f in result['flights']]),
               mean([f['conditionalPeriapsisProgress'] for f in result['flights']]))
              if arm == 'conditional_periapsis' else ()), result['fitness'])


def summary(flights, results):
    eligible = [f for f in flights if f['conditionalPeriapsis'] is not None]
    return dict(flights=len(flights), candidates=len(results), landings=sum(f['landed'] for f in flights),
                failedEndpoints=sum(not f['landed'] for f in flights), orbitComplete=sum(f['orbitComplete'] for f in flights),
                milestones=milestones(flights), reasons=dict(sorted(Counter(f['reason'] for f in flights).items())),
                nominal=sum(f['variation']['level'] == 0 for f in flights),
                varied=sum(f['variation']['level'] == .4 for f in flights), eligibleTrips=len(eligible),
                noEligibleTrips=len(flights)-len(eligible),
                maximumRecordedConditionalPeriapsis=max((f['conditionalPeriapsis'] for f in eligible), default=None),
                meanH=mean([f['strictInsertionHoldProgress'] for f in flights]),
                meanP=mean([f['conditionalPeriapsisProgress'] for f in flights]),
                maximumStrictHoldSeconds=max(f['longestStrictInsertionHoldSeconds'] for f in flights),
                meanOriginalFlightScore=mean([f['score'] for f in flights]),
                meanOriginalCandidateFitness=mean([r['fitness'] for r in results]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--audit-dir', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    root, audit_dir, output = Path(args.root).resolve(), Path(args.audit_dir).resolve(), Path(args.output_dir).resolve()
    require(not output.exists(), 'Use a fresh publication directory; retain previous output')
    checked(audit_dir / 'output-identities.json', AUDIT_IDS_SHA)
    audit_ids = read(audit_dir / 'output-identities.json')
    require(not (audit_dir / 'failure.json').exists(), 'Audit failure artifact exists')
    for name, digest in audit_ids.items():
        checked(audit_dir / name, digest)
    audit = read(audit_dir / 'summary.json')
    require(audit['status'] == 'PASS — complete frozen training ledger and arithmetic audit'
            and audit['allChecksPassed'] is True and audit['checks'] == 162426
            and audit['totalCandidates'] == 96 and audit['totalTrainingFlights'] == 576
            and audit['planSHA256'] == PLAN_SHA and audit['finalComparisonAudited'] is False,
            'Completed training audit identity or scope mismatch')
    terminal = audit['rootTerminalConfirmation']
    require(terminal['confirmedBy'] == '/root' and terminal['noRestarts'] is True
            and terminal['bothOriginalTerminalsObservedComplete'] is True, 'Missing original training terminal evidence')
    for arm, session in [('control', 12015), ('conditional_periapsis', 73937)]:
        observed = terminal['arms'][arm]
        require(observed['originalSessionId'] == session and observed['originalAttempt'] is True
                and type(observed['exitCode']) is int and observed['exitCode'] == 0, 'Wrong original training terminal')
    # Verify retained inputs; never enumerate or open evaluation reports or other experiments.
    for filename, digest in audit['inputSHA256'].items():
        checked(filename, digest)
    base = root / 'artifacts/suite-training/orbital-progress-comparison'
    checked(base / 'plan.json', PLAN_SHA)
    plan = read(base / 'plan.json')
    initial_path = root / plan['initial']['file']
    checked(initial_path, plan['initial']['sha256'])
    initial = read(initial_path)
    initial_weight_sha = numeric_hash(initial['weights'])
    require(len(initial['weights']) == 21300 and len(initial['parameters']) == 28, 'Initial controller dimensions changed')
    rows = [json.loads(line) for line in (audit_dir / 'all-576-training-flights.jsonl').read_text().splitlines()]
    failures = [json.loads(line) for line in (audit_dir / 'all-training-failures.jsonl').read_text().splitlines()]
    selections = read(audit_dir / 'generation-selections-and-optimizer.json')
    freeze = read(audit_dir / 'final-controller-freeze.json')
    require(len(rows) == 576 and len(selections) == 8 and failures == [row for row in rows if not row['landed']],
            'Incomplete original endpoints or failure export')
    require(len({tuple(row[key] for key in IDENTITY_FIELDS) for row in rows}) == 576, 'Duplicate original training slot')
    row_index = {tuple(row[key] for key in IDENTITY_FIELDS): row for row in rows}
    selection_index = {(row['arm'], row['generation']): row for row in selections}
    trials, candidates, arm_summaries = {}, {}, {}
    for arm in ARMS:
        entry = audit['arms'][arm]
        candidate_path = Path(entry['candidateFile'])
        candidate = read(candidate_path)
        checked(candidate_path, entry['candidateSHA256'])
        require(candidate['parameters'] == initial['parameters'] and candidate['weights'] == initial['weights']
                and numeric_hash(candidate['weights']) == entry['weightSHA256'] == initial_weight_sha,
                'Final selected controller differs from the original frozen G8 controller')
        require(candidate['generation'] == 4 and candidate['episodes'] == 288, 'Wrong final local generation')
        require(freeze['candidates'][arm]['fileSHA256'] == entry['candidateSHA256']
                and freeze['candidates'][arm]['weightSHA256'] == initial_weight_sha, 'Final controller freeze mismatch')
        path = candidate_path.parent / 'trials.jsonl'
        checked(path, audit['inputSHA256'][str(path)])
        trials[arm] = [json.loads(line) for line in path.read_text().splitlines()]
        require(len(trials[arm]) == 4, 'Missing training generation')
        candidates[arm] = dict(fileSHA256=entry['candidateSHA256'], parameterSHA256=entry['parameterSHA256'],
                               weightSHA256=entry['weightSHA256'], generation=4, episodes=288,
                               selectedCandidateIndex=entry['selectedCandidateIndex'])
        all_results = []
        for generation, ledger in enumerate(trials[arm], 1):
            require(ledger['generation'] == generation and len(ledger['results']) == 12
                    and ledger['cases'] == plan['training']['cases'][generation-1]['cases'], 'Ordered generation mismatch')
            recorded = selection_index[(arm, generation)]
            ranking = sorted(range(12), key=lambda i: rank_key(ledger['results'][i], arm), reverse=True)
            require(ranking == recorded['stableRankedIndices'] and ranking[:3] == recorded['eliteCandidateIndices']
                    and ranking[0] == recorded['selectedCandidateIndex'], 'Original rank order changed')
            require(ledger['results'][ranking[0]]['parameters'] == initial['parameters'], 'Selected controller changed during training')
            for candidate_index, result in enumerate(ledger['results']):
                require(len(result['flights']) == 6, 'Incomplete candidate')
                all_results.append(result)
                for case_index, flight in enumerate(result['flights']):
                    key = (arm, generation, candidate_index, case_index)
                    require({k: v for k, v in row_index[key].items() if k not in IDENTITY_FIELDS} == flight,
                            'Published endpoint differs from its original full result')
        arm_rows = [r for r in rows if r['arm'] == arm]
        arm_summaries[arm] = summary(arm_rows, all_results)
        require(arm_summaries[arm]['landings'] == entry['summary']['landings']
                and arm_summaries[arm]['reasons'] == entry['summary']['reasons']
                and arm_summaries[arm]['noEligibleTrips'] == entry['summary']['noEligibleCases'], 'Arm summary mismatch')
    generations = []
    for generation in range(1, 5):
        left, right = (trials[arm][generation-1]['results'] for arm in ARMS)
        require(left == right, 'Matched result objects differ in generation ' + str(generation))
        left_selection, right_selection = (selection_index[(arm, generation)] for arm in ARMS)
        require(left_selection['stableRankedIndices'] == right_selection['stableRankedIndices'], 'Matched full rankings differ')
        generations.append(dict(generation=generation, allTwelveResultObjectsExactlyEqual=True,
            fullRankingsExactlyEqual=True, arms={arm: {key: selection_index[(arm, generation)][key]
                for key in ('selectedCandidateIndex', 'eliteCandidateIndices', 'stableRankedIndices', 'rankingByOriginalIndex')}
                for arm in ARMS}))
    require(arm_summaries['control'] == arm_summaries['conditional_periapsis'], 'Matched aggregate outcomes differ')
    require(all(not r['landed'] and r['censored'] is False and not r['orbitComplete']
                and r['longestStrictInsertionHoldSeconds'] == 0 and r['strictInsertionHoldProgress'] == 0
                and all(m['name'] not in ('Stable orbit', 'One full orbit') for m in r['milestones']) for r in rows),
            'Frozen report conclusion no longer matches every original outcome')
    columns = list(rows[0])
    require(all(set(r) == set(columns) for r in rows), 'Endpoint field sets differ; preserve all fields explicitly')
    values = [[r[key] for key in columns] for r in rows]
    public = dict(schema='orbital-progress-training-publication-v1', status='TRAINING_COMPLETE_NO_GAIN',
        scope='Completed original training only; the reserved twelve comparison trips remain pending in this publication.',
        sourceSHA256={'plan': PLAN_SHA, 'auditOutputIdentities': AUDIT_IDS_SHA, 'auditSummary': audit_ids['summary.json'],
            'allTrainingFlights': audit_ids['all-576-training-flights.jsonl'],
            'generationSelections': audit_ids['generation-selections-and-optimizer.json'],
            'finalControllerFreeze': audit_ids['final-controller-freeze.json'], 'reporter': sha(__file__)},
        audit=dict(status=audit['status'], checks=audit['checks'], allChecksPassed=True,
                   calculatorSHA256=audit['calculatorSHA256'], originalTrainingTerminals=terminal,
                   rootReportedAuditTerminal={'exitCode': 0, 'outputChunkId': '51374b'}),
        totalCandidates=96, totalTrainingFlights=576, allFourGenerationsResultObjectsExactlyEqual=True,
        allFourFullRankOrdersExactlyEqual=True, selectedControllerUnchangedFromInitialEveryGeneration=True,
        initialController=dict(generation=initial['generation'], parameterSHA256=numeric_hash(initial['parameters']),
                               weightSHA256=initial_weight_sha), finalControllers=candidates,
        arms=arm_summaries, generations=generations,
        comparison=dict(status='PENDING', prescribedTrips=12, reportedTrips=0, outcomesRead=False),
        provenance=dict(historicalExplicitExperimentSettingsRecorded=True, historicalFullSuppliedEnvironmentRecorded=False,
                        historicalNodeBinaryHashRecorded=False, historicalNodeResolution='PATH',
                        prospectiveComparisonWrapper='The separate clean wrapper records its full supplied environment prospectively; this cannot recover missing historical launch evidence.'),
        limitations=audit['limitations'], deploymentEligible=False,
        flightTable=dict(columns=columns, rows=values, count=576,
                         encoding='Each row maps one-to-one to columns; nested variation, touchdown and milestone records remain exact.'),
        csv=dict(file='orbital-progress-training-flights.csv', rows=576,
                 encoding='arm and reason are text; every other cell is a JSON scalar, object or array, preserving full numeric precision and nulls.'))
    output.mkdir(parents=True)
    csv_path = output / public['csv']['file']
    with csv_path.open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([row[key] if key in ('arm', 'reason') else json.dumps(row[key], separators=(',', ':'), allow_nan=False)
                             for key in columns])
    public['csv']['sha256'] = sha(csv_path)
    public_path = output / 'orbital-progress-training-results.json'
    public_path.write_text(json.dumps(public, separators=(',', ':'), allow_nan=False) + '\n')
    require(public_path.stat().st_size <= 512000, 'Public JSON exceeds the compact 512 kB budget')
    reread = read(public_path)
    require([dict(zip(reread['flightTable']['columns'], row)) for row in reread['flightTable']['rows']] == rows,
            'Public JSON round-trip changed original endpoints')
    with csv_path.open(newline='') as stream:
        csv_rows = [{key: value if key in ('arm', 'reason') else json.loads(value)
                     for key, value in row.items()} for row in csv.DictReader(stream)]
    require(csv_rows == rows, 'CSV round-trip changed original endpoints')
    generation_lines = []
    for entry in generations:
        selected = entry['arms']['control']; best = selected['rankingByOriginalIndex'][selected['selectedCandidateIndex']]
        generation_lines.append(f"| {entry['generation']} | {selected['selectedCandidateIndex']} | {', '.join(map(str, selected['eliteCandidateIndices']))} | {best['meanH']:.6f} | {best['meanP']:.6f} | {best['fitness']:.6f} |")
    s = arm_summaries['control']
    report = f"""# Progress ranking produced no training gain in this run

Both training arms completed all **576 prescribed trips**. Their twelve full
candidate result objects and entire rank order were identical in every one of
the four generations. Adding the H/P ranking keys changed neither the selected
elites nor the final controller. Both selected generation-four controllers kept
the original generation-eight controller's exact 21,300 weights.

There were **0 stable orbits, 0 completed orbits and 0 landings out of 576 trips**.
Every trip recorded zero strict insertion-hold time. This result describes this
paired training run; it does not establish that learning or the method is
impossible. The **12 reserved comparison trips remain pending** in this report.

## Every training outcome

| Recorded outcome | Control | H/P ranking |
| --- | ---: | ---: |
| Complete training trips | 288 | 288 |
| Nominal / variability-0.4 trips | 144 / 144 | 144 / 144 |
| Stable orbit / completed orbit / landing | 0 / 0 / 0 | 0 / 0 / 0 |
| No eligible periapsis sample | {s['noEligibleTrips']} | {s['noEligibleTrips']} |
| At least one eligible periapsis sample | {s['eligibleTrips']} | {s['eligibleTrips']} |
| Flight left the recovery corridor | {s['reasons']['Flight left the recovery corridor']} | {s['reasons']['Flight left the recovery corridor']} |
| Returned before completing an orbit | {s['reasons']['Returned before completing an orbit']} | {s['reasons']['Returned before completing an orbit']} |
| Orbital mission timed out | {s['reasons']['Orbital mission timed out']} | {s['reasons']['Orbital mission timed out']} |

Recorded conditional periapsis reached at most {s['maximumRecordedConditionalPeriapsis']:.6f} m
among eligible samples, below the original strict 800 m requirement. A nonzero
P value never changed a success flag. All failures, ineligible cases, original
rewards, rolling quality values and H/P fields remain in the
[576-row CSV](orbital-progress-training-flights.csv) and
[compact JSON](orbital-progress-training-results.json).

## Identical selection in all four generations

Candidate indices below are zero-based. Both arms had the same complete
twelve-candidate ordering, retained in the JSON along with every candidate's
original fitness, H, P and milestone counts.

| Generation | Selected candidate | Top three | Selected mean H | Selected mean P | Original fitness |
| --- | ---: | --- | ---: | ---: | ---: |
{chr(10).join(generation_lines)}

The selected parameter vector remained the initial controller in every
generation. Selected H/P and fitness vary with the scheduled starts; those
changes are not evidence of training gain. Both final controllers have weight
SHA256 `{initial_weight_sha}`.

## What changed and what stayed fixed

The [earlier paired diagnostic](orbital-joint-paired.md) motivated testing the
missing periapsis condition. Both arms used the same frozen controller, fresh
optimizer, original proposal scales and seed, 13 active directions, sensory
basis, full anatomical network, physics and success criteria. Each generation
tested twelve candidates on six full trips: nominal and varied starts for each
of the three orbital missions. The original changing-case schedule can repeat
earlier training cases. Four generations give 288 trips per arm.

Both arms recorded **H**, the longest consecutive sampled hold satisfying
periapsis >800 m, absolute apoapsis error <200 m and absolute radial speed <5 m/s,
capped at three seconds and divided by three. They also recorded **P**, the
greatest finite periapsis while the apoapsis and speed conditions held, clamped
to [−6000, 800] m and mapped to [0, 1]. P is zero when no sample qualifies.

The control ordered candidates by landings, the original milestone counts and
original fitness. The H/P arm kept the same primary ordering, then compared
mean H, mean P and original fitness. Every complete failed trip contributed to
the means. No action command, sensory input, success threshold or old fitness
formula changed. A brief eligible P crossing is not successful insertion.

## Verification and limits

The original training processes both exited zero. The completed JavaScript
audit passed 162,426 checks of frozen inputs, all 96 candidates, proposal and
optimizer arithmetic, ranking, rewards and final weights. Publication separately
matched all 576 exported endpoints to the original ledgers and checked every
generation's full cross-arm result objects and rank order. The JSON and CSV
round-trip every stored endpoint field without numeric rounding. Detailed audit
checks remain in the experiment archive rather than the public data file.

Training trajectories were not recorded, so the audit checks retained endpoint
and summary arithmetic; it does not reconstruct every physics step or H/P
eligibility interval. Before the experiment, instrumentation replay matched all
23,225 retained steps and endpoints from twelve earlier diagnostic trips. Those
checks establish instrumentation consistency, not additional successful flights.

The historical training plan and launcher pinned the 72-file runtime and
explicit experiment settings. They **did not record the full environment
supplied to Node or its historical executable hash**; Node was resolved through
PATH. A separate clean wrapper records the future comparison's full supplied
environment prospectively. It cannot recover that missing historical evidence.

The reserved comparison uses only the frozen final generation-four candidates
on six new cases per arm. This publication includes no comparison outcomes and
does not infer completion from artifact existence. One paired optimizer seed
and this development budget establish no general reliability, optimizer
superiority, ground-retention or release claim. The total planned budget remains
588 flights, including the twelve pending comparison trips.

Implementation and immutable records are under
`scripts/insertion-progress.mjs`, `scripts/train-suite.mjs`, and
`artifacts/suite-training/orbital-progress-comparison`.
"""
    (output / 'orbital-progress-comparison.md').write_text(report)
    identities = {path.name: sha(path) for path in sorted(output.iterdir()) if path.is_file()}
    (output / 'publication-identities.json').write_text(json.dumps(identities, indent=2) + '\n')
    print(json.dumps(dict(status='PASS — publication retains every original training endpoint', flights=576,
        crossArmResultObjectsExactlyEqual=48, matchingFullRankOrders=4, publicJSONBytes=public_path.stat().st_size,
        csvRows=len(csv_rows), publicJSONSHA256=sha(public_path), files=identities), indent=2))


if __name__ == '__main__':
    main()
