#!/usr/bin/env python3
"""Publish the completed 156-flight proposal comparison; no simulation or fitting."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

BASE = 'artifacts/suite-training/orbital-local-proposal-comparison'
TRAINING = 'completion-audit/training-audit'
EVALUATION = 'evaluation-audit/evaluation-audit'
ARMS = ('standard', 'quarter')
PINS = {
    'execution-plan.json': 'c8265282a8c6384e2716e2b090fcd0c8682e35053c2ea4f2e0f3eb5b451a46a0',
    'proposal/plan.json': 'f25f2405b54f20c39f540d7e6deef8d31bc016039394fff817f054d48582a38a',
    'completion-audit-terminal-observation.json': 'ff404807902722537bb885cb832235982da9bac9f4e50e4b16ca8eeef067c433',
    'original-training-audit-launch.json': 'b5ecfd27d5ad11d8663b2bc93e6b73bea0b5ad5b1218954dc7c2609039556ce9',
    'original-training-terminal-confirmation.json': '9aaee632519e01f222d12645d9d71fcce62bc353d626e150c13b4b462c6c2ece',
    'training-audit-root-execution-freeze.json': '3fb352e92c517cf697ef8713bcf1b53ad9b060d1732c1463bb1aa3dd58c8a6cc',
    'training-completion-freeze.json': '99f5bbb64923fcadc58b033753e38f8bd7660a9fbca3cda851b8680be1644c16',
    TRAINING+'/summary.json': 'c907987f76d7a98d641a965f1b31f6ba6aeb3215c7763f024dc9cb40de1e4901',
    TRAINING+'/output-identities.json': '3246764acaa19ec9b4bac16a1064e634d3e22146b852685492d3958eb4b856d4',
    'completion-audit/audit.mjs': '769c2baa3e326b4bd6f741a38da98a46fcd3b26467dce4cce9b1160acd0ff490',
    'completion-audit/method.md': 'f73210837281ce0f7db9262f0c8e4ae1b87cc4426aa92217d3a0994892678050',
    'original-evaluation-launch-observation.json': '068b777962d3f1051e5f946cf6e23b456f6ae79ec4ed80f09b6b5d016aa9f2c9',
    'original-evaluation-terminal-confirmation.json': 'f2da9d31c918b4acffd8caee8a1d737648d7bd3218e427b16b608cd86216001a',
    'evaluation-audit-root-execution-freeze.json': '1d042c548b2a2551ca74602f076504c0758060e663ef010677d2384c5a1bd17d',
    'original-evaluation-audit-launch.json': '6c6cee8ffbcd2120c0645eaefc6ebf48991f1438f402ac682445fd840b84bf06',
    'evaluation-audit-terminal-observation.json': 'e5586eecc0f9571aa3b0477981bac12814a1054ec32900ecbe2deff1365473ad',
    EVALUATION+'/summary.json': '56ca778d93668c98ccee933b1e4f0b326698d3f17ff936328bab178f6271ba8d',
    EVALUATION+'/output-identities.json': '41a10bc9bb4f0212f56ab5a48a7770c28f882bd0a0253f59ef5d3e0e607ed74c',
    'evaluation-audit/audit.mjs': '2481f2ce48386c86c59164c8b0b0178db7a082d0d3ff7bd8af0c1a01153dca4c',
    'evaluation-audit/method.md': 'bdd47ccf301dff305b0ca9efcfb5de3c2a824f912acdd1c2193a771360d2ea74',
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def mean(values):
    total = 0
    for value in values:
        total += value
    return total / len(values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    root, output = Path(args.root).resolve(), Path(args.output_dir).resolve()
    base = root / BASE
    require(not output.exists() and not output.is_relative_to(root), 'Use a fresh directory outside the repository')
    sources = {}

    def checked(path, expected):
        require(path.is_file() and not path.is_symlink(), 'Missing or symlinked input: '+str(path))
        actual = sha(path)
        require(actual == expected, 'Changed input: '+str(path))
        sources[str(path.relative_to(root))] = actual

    # Original successful arithmetic receipts precede every outcome projection.
    for stage, directory, chunk in [('completion', TRAINING, '7e9ef7'), ('evaluation', EVALUATION, 'a70168')]:
        name = stage+'-audit-terminal-observation.json'
        checked(base/name, PINS[name])
        terminal = read(base/name)
        require(terminal['confirmedBy'] == '/root' and terminal['originalAttempt'] is True
                and terminal['originalSessionId'] is None and terminal['completedInInitialToolCall'] is True
                and type(terminal['exitCode']) is int and terminal['exitCode'] == 0
                and terminal['terminalOutputChunkId'] == chunk
                and terminal['auditSHA256'] == PINS[directory+'/summary.json']
                and terminal['outputIdentitiesSHA256'] == PINS[directory+'/output-identities.json'],
                'Original completed arithmetic receipt mismatch')
    for name, digest in PINS.items():
        checked(base/name, digest)
    for directory in (TRAINING, EVALUATION):
        archive = base/directory
        require(not (archive/'failure.json').exists(), 'Failed audit is not publishable')
        for name, digest in read(archive/'output-identities.json').items():
            target = archive/name
            require(not Path(name).is_absolute() and target.resolve().is_relative_to(archive), 'Archive path escape')
            checked(target, digest)

    plan, proposal = read(base/'execution-plan.json'), read(base/'proposal/plan.json')
    for relative, digest in plan['preparedFilesSHA256'].items():
        checked(base/relative, digest)
    for relative, digest in proposal['runtime']['runtimeSHA256'].items():
        checked(root/proposal['runtime']['reuseDirectory']/relative, digest)
    checked(root/proposal['initial']['file'], proposal['initial']['fileSHA256'])
    training, evaluation = read(base/TRAINING/'summary.json'), read(base/EVALUATION/'summary.json')
    require(training['status'] == evaluation['status'] == 'PASS'
            and training['totalFullFlights'] == 144 and training['totalCandidates'] == 24
            and training['checks'] == 137011 and evaluation['totalFullFlights'] == 12
            and evaluation['totalComparisonPairs'] == 6 and evaluation['checks'] == 92559
            and evaluation['totalRetainedTraceSamples'] == 8988, 'Completed audit counts changed')
    for key in ('allProposalsRankingsAndOptimizerStatesExactlyMatch', 'allOriginalFullOutcomesRetained',
                'allScoreFitnessAndProgressChecksPassed', 'allInitialAndFinalWeightsExactlyMatch'):
        require(training[key] is True, 'Training audit failed '+key)
    for key in ('allOriginalFullOutcomesAndTracesRetained', 'allFrozenSelectedParametersAndWeightsMatch',
                'allStoredEndpointAndProgressArithmeticChecksPassed', 'allOriginalTrainingOutputHashesUnchanged',
                'allTwelveCaseIdentitiesAndTraceSchemasChecked', 'allInputsUnchangedAfterAudit'):
        require(evaluation[key] is True, 'Comparison audit failed '+key)
    for record in (training, evaluation):
        require(record['newNeuralRuns'] == record['newPhysicalRuns'] == record['parameterFits'] == 0
                and record['releaseEligible'] is False, 'Audit budget or release claim changed')

    ledgers = read(base/TRAINING/'all-original-ledgers.json')
    training_rows = [json.loads(line) for line in (base/TRAINING/'all-144-training-flights.jsonl').read_text().splitlines()]
    expected_rows = [dict(arm=arm, generation=1, candidateIndex=ci, caseIndex=fi, **flight)
                     for arm in ARMS for ci, result in enumerate(ledgers[arm][0]['results'])
                     for fi, flight in enumerate(result['flights'])]
    require(training_rows == expected_rows and len(training_rows) == 144, 'Every original training endpoint must be retained')
    generations = read(base/TRAINING/'generation-selections-and-optimizer.json')
    require([g['arm'] for g in generations] == list(ARMS) and all(len(g['candidates']) == 12 for g in generations), 'All 24 candidates required')
    generation = {g['arm']: g for g in generations}
    initial = read(root/proposal['initial']['file'])
    initial_parameter_sha = proposal['initial']['parametersFloat64LESHA256']
    initial_weight_sha = proposal['initial']['weightsFloat64LESHA256']
    training_terminals = read(base/'original-training-terminal-confirmation.json')
    evaluation_terminals = read(base/'original-evaluation-terminal-confirmation.json')
    for arm, train_session, eval_session in zip(ARMS, (77464, 60295), (58968, 46656)):
        a, g = training['arms'][arm], generation[arm]
        require(a['selectedCandidateIndex'] == g['selectedCandidateIndex'] == 0
                and a['selectedParameters'] == initial['parameters']
                and a['selectedParameterSHA256'] == initial_parameter_sha
                and a['selectedWeightSHA256'] == initial_weight_sha, 'Selection changed from the frozen initial controller')
        for receipt, session in [(training_terminals['arms'][arm], train_session), (evaluation_terminals['arms'][arm], eval_session)]:
            require(receipt['originalSessionId'] == session and receipt['originalAttempt'] is True
                    and type(receipt['exitCode']) is int and receipt['exitCode'] == 0, 'Original flight-process terminal changed')
        for name, digest in evaluation_terminals['arms'][arm]['outputSHA256'].items():
            checked(root/proposal['arms'][arm]['prospectiveOutputDirectory']/name, digest)
        candidates = g['candidates']
        require([c['candidateIndex'] for c in candidates] == list(range(12)), 'Candidate order changed')
        for candidate, result in zip(candidates, ledgers[arm][0]['results']):
            require(candidate['parameters'] == result['parameters'] and candidate['fitness'] == result['fitness']
                    and candidate['meanPhysicalScore'] == result['score'] and candidate['landings'] == result['landings'],
                    'Candidate summary differs from original result')
        stochastic = candidates[1:]
        counts = dict(stochasticProposals=11, positiveMeanP=sum(c['meanP'] > 0 for c in stochastic),
                      primaryAtLeastInitial=sum(c['primaryAtLeastInitial'] for c in stochastic),
                      both=sum(c['bothLocalityIndicators'] for c in stochastic))
        require(counts == a['localityCounts'], 'Prespecified locality counts changed')
    require([training['arms'][a]['localityCounts'] for a in ARMS] == [
        dict(stochasticProposals=11, positiveMeanP=1, primaryAtLeastInitial=2, both=0),
        dict(stochasticProposals=11, positiveMeanP=2, primaryAtLeastInitial=4, both=1)], 'Locality result changed')

    cases = read(base/EVALUATION/'all-twelve-comparison-cases.json')
    pairs = read(base/EVALUATION/'all-six-comparison-pairs.json')
    require(len(cases) == 12 and len(pairs) == 6
            and [(c['arm'], c['caseIndex']) for c in cases] == [(a, i) for a in ARMS for i in range(6)], 'Every reserved comparison case required')
    reports = {a: read(base/EVALUATION/('original-'+a+'-local-comparison.json')) for a in ARMS}
    for arm in ARMS:
        rows = [c for c in cases if c['arm'] == arm]
        for i, row in enumerate(rows):
            require(row['case'] == proposal['comparison']['cases'][i], 'Reserved case identity changed')
            original = reports[arm]['flights'][row['arrivalIndex']]
            require(row['endpoint'] == {k: v for k, v in original.items() if k != 'trajectory'}
                    and row['trace']['samples'] == len(original['trajectory']), 'Comparison endpoint or retained trace count changed')
        require(mean([c['derived']['adjustedReward'] for c in rows]) == evaluation['arms'][arm]['derivedAdjustedRewardMean'], 'Descriptive comparison mean changed')
    compact_pairs = []
    for i, pair in enumerate(pairs):
        require(pair['caseIndex'] == i and pair['standard'] == cases[i] and pair['quarter'] == cases[6+i], 'Pair projection mismatch')
        s, q = [reports[a]['flights'][pair[a]['arrivalIndex']] for a in ARMS]
        require(s == q and all(pair['descriptiveEquality'][key] is True for key in
                ('sameFrozenController', 'endpointsExactlyEqual', 'recordedTrajectoriesExactlyEqual', 'fullFlightRecordsExactlyEqual')),
                'Original paired records are not identical')
        compact_pairs.append({k: v for k, v in pair.items() if k not in ARMS} | {'caseReferences': {'standard': i, 'quarter': 6+i}})
    require(all(not f['landed'] and not f['orbitComplete'] and f['strictInsertionHoldProgress'] == 0
                and not any(m['name'] == 'Stable orbit' for m in f['milestones'])
                for f in training_rows+[c['endpoint'] for c in cases]), 'Physical capability conclusion changed')

    proposal_pairs = read(base/TRAINING/'eleven-paired-proposals.json')
    require([p['candidateIndex'] for p in proposal_pairs] == list(range(1, 12)), 'All eleven stochastic pairs required')
    for pair in proposal_pairs:
        require(all(pair[a] == generation[a]['candidates'][pair['candidateIndex']] for a in ARMS), 'Proposal pair differs from candidate records')
    proposal_pairs = [{k: v for k, v in p.items() if k not in ARMS} for p in proposal_pairs]
    evaluation_rows = [dict(arm=c['arm'], caseIndex=c['caseIndex'], arrivalIndex=c['arrivalIndex'],
                            variability=c['case']['variability'], **c['endpoint'], derived=c['derived'], trace=c['trace']) for c in cases]
    output.mkdir(parents=True)
    csv_files = {}
    for label, rows in [('training', training_rows), ('evaluation', evaluation_rows)]:
        filename = 'orbital-local-'+label+'-flights.csv'
        columns = list(rows[0])
        require(all(set(row) == set(columns) for row in rows), 'CSV row schema differs')
        with (output/filename).open('w', newline='') as stream:
            writer = csv.writer(stream); writer.writerow(columns)
            writer.writerows([[json.dumps(row[k], separators=(',', ':'), allow_nan=False) for k in columns] for row in rows])
        with (output/filename).open(newline='') as stream:
            reader = csv.DictReader(stream)
            restored = [{k: json.loads(v) for k, v in row.items()} for row in reader]
        require(restored == rows, 'CSV round trip changed an original value')
        csv_files[label] = dict(file=filename, sha256=sha(output/filename), rows=len(rows), encoding='Every cell is JSON; null remains null and values retain full precision')

    training_arms = {a: {k: v for k, v in training['arms'][a].items() if k != 'candidateFile'} for a in ARMS}
    evaluation_arms = {a: {k: v for k, v in evaluation['arms'][a].items() if k != 'originalReportFile'} for a in ARMS}
    publication = dict(schema='orbital-local-complete-publication-v1', status='COMPLETE_NO_SELECTED_CONTROLLER_OR_CAPABILITY_GAIN',
        budget=dict(trainingNeuralFlights=144, comparisonNeuralFlights=12, totalNeuralFlights=156,
                    plannedNeuralFlights=156, pendingNeuralFlights=0, physicalReplays=0, newNeuralFlightsDuringPublication=0),
        initialController=proposal['initial'], training=dict(totalCandidates=24, totalFlights=144, arms=training_arms,
            generations=generations, stochasticProposalPairs=proposal_pairs, originalTrainingCases=proposal['training']['cases'],
            flightTable=dict(columns=list(training_rows[0]), rows=[list(r.values()) for r in training_rows])),
        evaluation=dict(totalFlights=12, totalPairs=6, totalRetainedTraceSamples=8988, arms=evaluation_arms,
            cases=cases, pairs=compact_pairs, allSixOriginalRecordedPairsExactlyEqual=True,
            originalWorkerAggregatesAvailable=False, physicalTrajectoriesIndependentlyReconstructed=False),
        verification=dict(trainingChecks=137011, comparisonChecks=92559, all156OriginalEndpointsRetained=True,
            all24CandidatesRetained=True, allSixComparisonPairsRetained=True, allOriginalInputsVerified=True,
            jsonRoundTripExact=True, csvRoundTripExact=True),
        provenance=dict(planSHA256=PINS['execution-plan.json'], reporterSHA256=sha(__file__),
            fullTrainingAndComparisonEnvironmentsRecorded=True, pinnedNodeExecutable=True,
            originalTrainingSessions={a: training['arms'][a]['originalSessionId'] for a in ARMS},
            originalComparisonSessions={a: evaluation['arms'][a]['originalSessionId'] for a in ARMS},
            trainingAuditTerminal=read(base/'completion-audit-terminal-observation.json'),
            comparisonAuditTerminal=read(base/'evaluation-audit-terminal-observation.json'),
            completeTrainingArchive=BASE+'/'+TRAINING, completeComparisonArchive=BASE+'/'+EVALUATION,
            trainingAuditSource=BASE+'/completion-audit/audit.mjs', comparisonAuditSource=BASE+'/evaluation-audit/audit.mjs'),
        definitions=dict(primary='Landings, then original milestone counts from final approach back through launch',
            comparator='Original primary keys, then unchanged original fitness; H/P are recorded, not ranking keys',
            H='min(3,longest consecutive strict insertion hold seconds)/3',
            P='(max(-6000,min(800,best eligible periapsis ?? -6000))+6000)/6800',
            eligibility='Finite periapsis, absolute apoapsis error <200 m, and absolute radial speed <5 m/s',
            strictInsertion='Eligibility plus periapsis >800 m held consecutively for three seconds',
            comparisonAdjustedReward='Descriptive source formula: score*0.1 + insertionHoldReward - 3*landed*(touchdown.speed^2 + touchdown.lateral^2)',
            null='No eligible observation or no touchdown; never substitute a zero measurement'),
        csv=csv_files, sources=sources, capabilityEstablished=False, releaseEligible=False,
        limits=[
            'One paired population of eleven stochastic directions per arm is development evidence, not a reliability estimate or optimizer-superiority result.',
            'Quarter-size proposals improved the prespecified locality counts, but all 156 flights failed and neither selected controller changed.',
            'Aggregate physical training score was lower in the quarter arm; locality counts do not establish an overall reward improvement.',
            'H/P progress is not a stable orbit, completed orbit, or safe landing. All flights had H=0.',
            'The final controllers are identical to the frozen initial controller. Equality describes these six original record pairs, not a separate determinism qualification.',
            'Training has no full traces. Comparison traces were structurally audited; physical scores, hold integrals, eligibility intervals, sensory values, and neural actions were not independently reconstructed.',
            'Comparison worker aggregates were not retained; adjusted reward means are descriptive calculations in declared case order.',
            'Ground retention and independent JavaScript release tests were not performed. No model was promoted.',
        ])
    public_path = output/'orbital-local-comparison-results.json'
    public_path.write_text(json.dumps(publication, indent=2, allow_nan=False)+'\n')
    require(read(public_path) == publication, 'Public JSON round trip changed a value')
    candidate_lines = []
    for i in range(12):
        s, q = [generation[a]['candidates'][i] for a in ARMS]
        candidate_lines.append(f"| {i}{' (initial)' if i == 0 else ''} | {s['milestones']['Launch']}/{s['milestones']['Space']} | {q['milestones']['Launch']}/{q['milestones']['Space']} | {s['meanP']:.6f} | {q['meanP']:.6f} | {s['fitness']:.6f} | {q['fitness']:.6f} |")
    evaluation_lines = []
    for c in cases[:6]:
        f = c['endpoint']
        evaluation_lines.append(f"| {f['scenario']} / {f['seed']} / {c['case']['variability']} | {f['conditionalPeriapsis']:.6f} | {f['conditionalPeriapsisProgress']:.6f} | {f['conditionalPeriapsisEligibleSeconds']:.3f} | {f['score']:.6f} | {f['time']:.3f} |")
    s, q = [training['arms'][a] for a in ARMS]
    e = evaluation['arms']['standard']
    report = f"""# Smaller orbital proposals: completed 156-flight comparison

**Complete: smaller proposals improved the prespecified development counts,
but neither arm changed its selected controller or achieved a stable orbit,
completed orbit, or landing.** All 144 training flights and 12 reserved
comparison flights reached their original endpoints; all failed.

Among eleven stochastic proposals per arm, quarter-size changes increased
primary-key preservation from **2 to 4**, positive mean periapsis progress
from **1 to 2**, and the combination from **0 to 1**. Both arms still selected
candidate 0, the same frozen initial controller. All six reserved comparison
pairs have identical original endpoints and recorded traces.

## What was compared

The [earlier 588-flight ranking experiment](orbital-progress-comparison.md)
retained its initial controller. This experiment changed only initial proposal
sigma: the quarter arm used 0.25 times the standard vector. Both used the same
28-parameter starting controller, 13 active directions, 15 fixed coordinates,
eleven shared random directions, candidate multipliers, original fitness and
landing/milestone comparator. H/P were recorded, not used to rank candidates.

Each arm trained one generation of twelve candidates on six complete cases
(72 flights), then ran its fixed winner on six fresh matched cases. The
**156-flight budget is closed**, with none pending. The six training cases were
reused development cases; this was not an independent reliability test.

## All training candidates and failures

| Recorded training outcome | Standard | Quarter |
| --- | ---: | ---: |
| Full flights / candidates | 72 / 12 | 72 / 12 |
| Launch / Space milestones | 53 / 23 | 66 / 30 |
| Stable orbit / full orbit / landing | 0 / 0 / 0 | 0 / 0 / 0 |
| Flights with an eligible periapsis observation | 6 | 14 |
| Stochastic flights with an eligible observation | 1 / 66 | 9 / 66 |
| Mean H / longest strict hold | 0 / 0 s | 0 / 0 s |
| Mean physical score, all 72 flights | {s['summary']['numeric']['score']['mean']:.6f} | {q['summary']['numeric']['score']['mean']:.6f} |
| Corridor exit / timeout / early return | 31 / 7 / 34 | 30 / 6 / 36 |
| Selected candidate / original fitness | 0 / 208.305174 | 0 / 208.305174 |
| Top three candidate indices | 0, 1, 3 | 0, 1, 6 |

The quarter arm's aggregate physical score was **lower**. Its better locality
counts do not imply an overall score gain. “Primary preservation” means matching
or improving the initial controller's original landing/milestone key; it does
not mean achieving insertion. Every candidate below had H=0 and no stable
orbit, complete orbit, or landing. L/S are Launch/Space counts out of six.

| Candidate | Standard L/S | Quarter L/S | Standard mean P | Quarter mean P | Standard fitness | Quarter fitness |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(candidate_lines)}

Quarter candidate 1 was the only stochastic proposal with both positive P and
a preserved primary key. Quarter candidate 7 had high mean P but a worse
primary key. Neither displaced candidate 0. All 24 parameter vectors, full
rankings, optimizer states and eleven matched proposal differences are retained
in the [complete JSON](orbital-local-comparison-results.json). The
[144-row training CSV](orbital-local-training-flights.csv) retains every endpoint,
including all 124 cases with no eligible observation.

## Every reserved comparison pair

Each arm completed all six normal-mode cases: three nominal and three with
variability 0.4. Every trip reached Launch and Space, then left the recovery
corridor; none reached stable orbit, a complete orbit, deorbit, entry, final
approach, or landing. All had H=0, while every case had positive P.

The values below apply to both original records in each pair. Scenario indices
are zero-based: 24/25 target 1,000 m; 26 targets 1,400 m. Numerical pair
differences are zero wherever both measurements exist; absent touchdown
measurements remain null.

| Scenario / seed / variability | Best eligible periapsis (m) | P | Eligible time (s) | Physical score | Flight time (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(evaluation_lines)}

Mean P was {e['summary']['numeric']['conditionalPeriapsisProgress']['mean']:.9f};
mean eligible time was {e['summary']['numeric']['conditionalPeriapsisEligibleSeconds']['mean']:.6f} s.
P maps the wide −6000 to 800 m interval to [0,1], so these high values do not
establish insertion. A strict hold also requires periapsis >800 m while
absolute apoapsis error stays below 200 m and absolute radial speed below 5 m/s, consecutively
for three seconds. No trip recorded any strict hold.

The [12-row comparison CSV](orbital-local-evaluation-flights.csv) and
[JSON](orbital-local-comparison-results.json) retain every endpoint, H/P value,
null-aware deficit, trace count/hash and all six paired differences. The mean
adjusted reward, {e['derivedAdjustedRewardMean']:.6f}, is a **descriptive source-formula
calculation**; the original comparison reports did not retain worker aggregates.
Full original traces contain **4,494 samples per arm, 8,988 total**. Their
equality describes these records and is not a separate determinism test.

## Verification and limits

Both original training processes and both original comparison processes exited
zero. The original training arithmetic audit passed **137,011 checks**; the
comparison record audit passed **92,559 checks**. Both arithmetic commands
completed in their initial tool responses, so their session IDs remain null
with explicit successful terminal receipts. The clean supplied environments,
absolute Node executable, 72 runtime files, selected parameters and every
exported weight were verified. Both selected weight digests equal
`{initial_weight_sha}`.

Training trajectories were not recorded. Comparison traces were checked for
complete retained records, finite values, exact schemas and recorded time
order. **No physical replay or independent trajectory reconstruction was
performed.** Physical scores, hold integrals, eligibility intervals, actions
and sensory values remain recorded model evidence. Publication adds no flight,
fit, new controller selection or replay.

One paired population does not establish broad reliability, convergence,
optimizer superiority, biological transfer or release eligibility. Ground
retention and independent JavaScript release tests were not performed. No
model was promoted.

The [frozen proposal](orbital-local-comparison-plan.json) remains the original
prospective record; this completed report supersedes its historical status.
The [launcher](../scripts/run-orbital-local-comparison.py) and
[deterministic reporter](../scripts/report-orbital-local-complete.py) identify
the execution and publication contracts. Complete audit sources, methods,
receipts, endpoint exports and original traces remain in the local archive at
`{BASE}`. Its hashes and exact receipt identities are retained in the JSON;
see [archive availability](reproducibility.md#files-included-and-excluded).
Data files retain full precision; only display tables are rounded.
"""
    (output/'orbital-local-comparison.md').write_text(report)
    for relative, digest in sources.items():
        require(sha(root/relative) == digest, 'Input changed during publication: '+relative)
    verification = dict(status='PASS', reporterSHA256=sha(__file__), trainingRows=144, comparisonRows=12,
                        candidates=24, comparisonPairs=6, retainedTraceSamples=8988,
                        csvRoundTripExact=True, jsonRoundTripExact=True, allInputsUnchanged=True,
                        newNeuralFlights=0, newPhysicalReplays=0, newFits=0,
                        files={p.name: sha(p) for p in sorted(output.iterdir()) if p.is_file()})
    (output/'publication-identities.json').write_text(json.dumps(verification, indent=2)+'\n')
    print(json.dumps(verification, indent=2))


if __name__ == '__main__':
    main()
