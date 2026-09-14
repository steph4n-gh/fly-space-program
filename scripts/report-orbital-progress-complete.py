#!/usr/bin/env python3
"""Publish completed orbital training and evaluation; no simulation or fitting."""
import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

BASE = 'artifacts/suite-training/orbital-progress-comparison'
ARMS = ('control', 'conditional_periapsis')
PINS = {
 'plan.json': 'ecd27042dae78467a42111660e44e5da4d1fa8717852118626d920a7a6fdb8a7',
 'completion-audit/training-audit/summary.json': 'e3cc84d155bda3f90726d45474b184300e90c0ea86fe63d75eab3b85814fae30',
 'completion-audit/training-audit/output-identities.json': 'de572dc66e2d8a5dc80218eb839294395f81fb70f3c47e4382d2f604433b7295',
 'ordering-diagnostic/package-identities.json': '9497104781af37a1790436158135e209d0d221b7109f9d547c7942618725c940',
 'evaluation-audit-terminal-observation.json': 'cda9e3a6c785f385365fbca59d846fbcd3c1548ff54b65172569185ed7e7c6db',
 'evaluation-audit/replay/summary.json': '787226136402c9d3f13ff0457cd95b21aef2032c29b168574c7a5b5a6d8f4d50',
 'evaluation-audit/replay/output-identities.json': '24a439d1c3ec5aa09adea3935a15f93130d1e04056fd1c75e415783191fa680b',
 'evaluation-audit/audit.mjs': 'fc8128d0a01eccfa18393812c651740be447447dbf6a70ad5eb13adf8db1c5ae',
 'evaluation-audit/method.md': 'd6dd5d9fb52b4b9cca5f6077d82ad5667ea4101177721447e2a5796d1f0902bb',
 'evaluation-audit/presented.mjs': '6994920ca33ec4d1388ec468cb6433b5cdf0687d6ac48912be3611fe0b2f8b7f',
 'evaluation-audit/root-execution-freeze.json': '9ffceba33757f78176059d7f75adebc5bccd22f4860a477187b77172f93a4584',
 'original-evaluation-terminal-confirmation.json': 'bb4da37e3d1273af356027335e131b375b4e649c23a3bf1fe0da7e93a01e4f5d',
 'evaluation-execution/freeze.json': '443fa06996ee9bd763bfc9fd65043c905bb05ccf7fc90864a9b0edd595c49d5a',
}
TRAINING_PUBLIC = {
 'docs/orbital-progress-training-results.json': '079a995f82d0a793aedae801a27f9a7010ffc5d1d55616ae1b7884c4bbbc2f8e',
 'docs/orbital-progress-training-flights.csv': '762ab04c2c1457d9a828ea3ea27d4b20c35507b9029f273208a68fab5f93133c',
}
PATTERNS = tuple(f'{i:03b}' for i in range(8))
ENDPOINT_KEYS = ('seed','scenario','activationGain','score','landed','styleBonus','styleRecovered',
 'turnDegrees','reason','variation','touchdown','time','orbitComplete','orbits','maxAltitude','milestones')
REWARD_KEYS = ('insertionQuality','insertionReward','insertionHoldQuality','insertionHoldReward')
PROGRESS_KEYS = ('longestStrictInsertionHoldSeconds','conditionalPeriapsis','conditionalPeriapsisEligibleSeconds',
 'strictInsertionHoldProgress','conditionalPeriapsisProgress')
TEXT_CSV = ('arm','mode','reason')


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
    base, audit_dir = root / BASE, root / BASE / 'evaluation-audit/replay'
    require(not output.exists(), 'Use a fresh publication directory')
    require(not output.is_relative_to(root), 'Preparation must not edit the repository')
    sources = {}

    def checked(path, expected):
        path = Path(path)
        require(path.is_file() and not path.is_symlink(), 'Missing or symlinked input: ' + str(path))
        actual = sha(path)
        require(actual == expected, 'Changed input: ' + str(path))
        sources[str(path.relative_to(root))] = actual

    # Require the completed ORIGINAL audit before reading its case projections.
    terminal_path = base / 'evaluation-audit-terminal-observation.json'
    checked(terminal_path, PINS['evaluation-audit-terminal-observation.json'])
    terminal = read(terminal_path)
    require(terminal['schema'] == 'orbital-progress-root-evaluation-audit-terminal-v1'
            and terminal['confirmedBy'] == '/root' and terminal['originalSessionId'] == 62010
            and terminal['originalAttempt'] is True and type(terminal['exitCode']) is int and terminal['exitCode'] == 0,
            'Original replay completion evidence missing')
    for key in ('allOutputHashesVerified','allCopiedBytesExact','allSixRecordedActionAndEndpointPairsExactlyEqual','allPairMetricDifferencesZero'):
        require(terminal[key] is True, 'Root audit receipt did not pass ' + key)
    for relative, digest in PINS.items():
        checked(base / relative, digest)
    for relative, digest in TRAINING_PUBLIC.items():
        checked(root / relative, digest)
    require(not (audit_dir / 'failure.json').exists(), 'Replay failure artifact exists')
    for directory, filename in ((audit_dir,'output-identities.json'),
            (base/'ordering-diagnostic','package-identities.json'),
            (base/'completion-audit/training-audit','output-identities.json')):
        for name, digest in read(directory/filename).items():
            target = directory/name
            require(not Path(name).is_absolute() and target.resolve().is_relative_to(directory.resolve()), 'Archive path escape')
            checked(target, digest)

    training = read(root/'docs/orbital-progress-training-results.json')
    training_audit = read(base/'completion-audit/training-audit/summary.json')
    plan = read(base/'plan.json')
    evaluation = read(audit_dir/'summary.json')
    cases, pairs = read(audit_dir/'cases.json'), read(audit_dir/'paired-cases.json')
    ordering = read(base/'ordering-diagnostic/summary.json')
    candidates = read(base/'ordering-diagnostic/candidates-paired.json')
    comparisons = read(base/'ordering-diagnostic/all-pair-comparisons.json')
    require(training['totalTrainingFlights'] == training_audit['totalTrainingFlights'] == 576
            and training['totalCandidates'] == training_audit['totalCandidates'] == 96
            and training_audit['allChecksPassed'] is True and training_audit['checks'] == 162426,
            'Complete training count/check mismatch')
    require(training['selectedControllerUnchangedFromInitialEveryGeneration'] is True
            and training['allFourGenerationsResultObjectsExactlyEqual'] is True
            and training['allFourFullRankOrdersExactlyEqual'] is True, 'Training conclusion changed')
    original_rows = [json.loads(line) for line in (base/'completion-audit/training-audit/all-576-training-flights.jsonl').read_text().splitlines()]
    require([dict(zip(training['flightTable']['columns'], row)) for row in training['flightTable']['rows']] == original_rows
            and len(original_rows) == 576, 'Prior training table does not retain every audited endpoint')
    require(evaluation['status'] == 'PASS' and evaluation['allInputsUnchanged'] is True
            and evaluation['noNeuralFlights'] is True and evaluation['releaseEligible'] is False,
            'Completed replay audit mismatch')
    expected_counts = dict(physicalReplaysStarted=12, physicalReplaysCreated=12, physicalReplaysCompleted=12,
        physicalAdvanceCalls=25324, physicalStepsCompleted=25324, decisionsVerified=8980,
        exactStateValues=62860, exactPresentedValues=251440, exactEndpoints=12, neuralFlights=0)
    require(evaluation['counters'] == terminal['counters'] == expected_counts, 'Replay accounting mismatch')
    require(terminal['summarySHA256'] == PINS['evaluation-audit/replay/summary.json']
            and terminal['outputIdentitiesSHA256'] == PINS['evaluation-audit/replay/output-identities.json'], 'Terminal archive linkage mismatch')
    require(evaluation['maximumError']['rollingQuality'] <= 1e-11
            and evaluation['maximumError']['rollingReward'] <= 2e-8, 'Frozen replay tolerance exceeded')
    expected_tests = [dict(scenario=24+i%3,seed=94617031+i*104729,variability=0 if i<3 else .4,mode='normal') for i in range(6)]
    require(plan['comparison']['cases'] == expected_tests and len(cases) == 12 and len(pairs) == 6,
            'Missing comparison cases or pairs')
    case_index = {(c['arm'],c['caseIndex']):c for c in cases}
    require(len(case_index) == 12 and set(case_index) == {(a,i) for a in ARMS for i in range(6)}, 'Duplicate or missing arm/case')
    original_terminal = read(base/'original-evaluation-terminal-confirmation.json')
    compact_pairs = []
    predicate_durations = {}
    for arm, session in zip(ARMS,(86855,48145)):
        receipt = original_terminal['arms'][arm]
        require(receipt['originalSessionId'] == session and receipt['exitCode'] == 0 and receipt['originalAttempt'] is True,
                'Original evaluation terminal mismatch')
        report_path = root/plan['executionArms'][arm]['comparisonFile']
        checked(report_path,receipt['reportSHA256'])
        report = read(report_path)
        require(report['complete'] is True and len(report['flights']) == 6, 'Original report incomplete')
        flights = {(f['scenario'],f['seed'],f['variation']['level'],f['mode']):f for f in report['flights']}
        require(len(flights) == 6,'Original report duplicate case')
        selected = [case_index[(arm,i)] for i in range(6)]
        for i,c in enumerate(selected):
            test = expected_tests[i]
            require({k:c[k] for k in test} == test and c['exactPhysicalReplay'] is True and c['exactPresentedReplay'] is True,
                    'Case identity or exact replay mismatch')
            original = flights[(test['scenario'],test['seed'],test['variability'],test['mode'])]
            require(all(c[k] == original[k] for k in ENDPOINT_KEYS+REWARD_KEYS+PROGRESS_KEYS)
                    and original['censored'] is False,'Published original endpoint changed')
            require(set(c['passPatternSeconds']) == set(PATTERNS)
                    and c['passPatternBitOrder'] == ['periapsis','apoapsis','verticalSpeed']
                    and all(type(v) in (int,float) and math.isfinite(v) and v>=0 for v in c['passPatternSeconds'].values()),
                    'Missing predicate durations')
            require(set(c['componentPhysicalDeficits']) == {'periapsis','apoapsis','verticalSpeed'}, 'Missing physical deficit')
            require(c['strictInsertionHoldProgress'] == c['longestStrictInsertionHoldSeconds'] == c['qualifyingSeconds'] == 0
                    and c['passPatternSeconds']['111'] == 0 and c['reason'] == 'Flight left the recovery corridor'
                    and not c['landed'] and not c['orbitComplete'] and c['noEligibleSample'] is False,
                    'Outcome conclusion changed')
        aggregate = evaluation['aggregates'][arm]
        require(aggregate['flights'] == 6 and aggregate['landings'] == aggregate['completeOrbits'] == 0
                and aggregate['milestones']['Stable orbit'] == 0 and aggregate['noEligibleCases'] == 0,
                'Evaluation capability count changed')
        require(all(mean([c[key] for c in selected]) == value for key,value in aggregate['means'].items()), 'Evaluation mean projection mismatch')
        predicate_durations[arm] = {pattern:sum(c['passPatternSeconds'][pattern] for c in selected) for pattern in PATTERNS}
    for i,pair in enumerate(pairs):
        require(pair['caseIndex'] == i and pair['control'] == case_index[('control',i)]
                and pair['conditional_periapsis'] == case_index[('conditional_periapsis',i)], 'Pair summary changed')
        require(pair['exactRecordedActionsAndStates'] is True and pair['exactRecordedEndpoint'] is True
                and all(value == 0 for value in pair['conditionalMinusControl'].values()),'Nonzero paired difference')
        compact_pairs.append({k:v for k,v in pair.items() if k not in ARMS} | {
            'caseReferences':{'control':i,'conditional_periapsis':6+i}})
    require(cases == [case_index[(a,i)] for a in ARMS for i in range(6)],'Public case reference order changed')
    require(predicate_durations['control'] == predicate_durations['conditional_periapsis'], 'Predicate durations differ')
    require(len(candidates) == 48 and len(comparisons) == 264 and ordering['checksPassed'] == 558
            and ordering['all48MatchedResultObjectsEqual'] is True and ordering['allFourOptimizerStatesEqualAcrossArms'] is True,
            'Ordering diagnostic count/check mismatch')
    stochastic = [c for c in candidates if c['kind']=='stochastic']
    require(len(stochastic) == 41 and all(not c['parametersEqualInitial'] and c['meanH']==0 for c in stochastic), 'Stochastic proposal accounting changed')
    tied = [c for c in stochastic if c['primaryComparedWithInitial']==0]
    worse = [c for c in stochastic if c['primaryComparedWithInitial']<0]
    require(len(tied)==21 and len(worse)==20
            and all(c['pDifferenceFromInitial']<0 and c['fitnessDifferenceFromInitial']<0 for c in tied), 'Initial-controller loss explanation changed')
    decisions = dict(Counter(c['decision'] for c in comparisons))
    require(decisions == ordering['pairCounts'] == {'primary_blocks_HP':156,'HP_agrees_with_fitness':33,'HP_tied_fitness_decides':75},'Ordering pair counts changed')
    require(all(c['oldLexicographicWinner']==c['hpLexicographicWinner'] for c in comparisons)
            and all(c['hpPreferenceWinner']==c['originalFitnessWinner'] for c in comparisons if c['decision']=='HP_agrees_with_fitness'),
            'Ordering conflict found')
    for g, row in zip(training['generations'],ordering['generationSummaries']):
        require(g['generation']==row['generation'] and all(g['arms'][a]['stableRankedIndices']==row['oldOrder']==row['hpOrder'] for a in ARMS), 'Training order publication mismatch')

    publication = dict(schema='orbital-progress-complete-experiment-publication-v1',status='COMPLETE_NO_TRAINING_OR_EVALUATION_GAIN',
        budget=dict(trainingNeuralFlights=576,evaluationNeuralFlights=12,totalNeuralFlights=588,plannedNeuralFlights=588,
                    pendingNeuralFlights=0,recordedActionPhysicalReplays=12,newNeuralFlightsDuringReplayOrPublication=0),
        training=dict(totalCandidates=96,totalFlights=576,arms=training['arms'],
            allFourGenerationsResultObjectsExactlyEqual=True,allFourFullRankOrdersExactlyEqual=True,
            selectedControllerUnchangedFromInitialEveryGeneration=True,initialController=training['initialController'],
            finalControllers=training['finalControllers'],generations=training['generations'],
            fullEndpointData=dict(json='orbital-progress-training-results.json',csv='orbital-progress-training-flights.csv',
                note='Unchanged training-stage artifact; its historical pending-comparison status is superseded by this completed report.'),
            verification=dict(checks=162426,allChecksPassed=True,sourceIdentity=PINS['completion-audit/training-audit/summary.json'])),
        orderingDiagnostic={k:v for k,v in ordering.items() if k not in ('inputSHA256','limitations','generationSummaries')},
        evaluation=dict(arms=evaluation['aggregates'],cases=cases,pairs=compact_pairs,predicateDurationPerArm=predicate_durations,
            pairedRecordedActionsStatesAndEndpointsExactlyEqual=True,allMetricDifferencesZero=True,
            interpretation='All twelve trips failed. Positive conditional-periapsis progress did not satisfy insertion.'),
        definitions=dict(strictInsertion=dict(periapsis='finite and >800 m',apoapsis='finite and abs(apoapsis-target)<200 m',
                radialSpeed='finite and abs(vy)<5 m/s',requiredConsecutiveSeconds=3),
            H='min(3,longest consecutive strict hold seconds)/3',
            P='(max(-6000,min(800,best eligible periapsis ?? -6000))+6000)/6800',
            eligibility='Finite periapsis and the strict apoapsis and radial-speed conditions',
            noEligibleSample='conditionalPeriapsis:null and P=0; never omit the failed case',
            deficits=dict(periapsis='max(0,800-periapsis) m',apoapsis='max(0,abs(apoapsis-target)-200) m',
                verticalSpeed='max(0,abs(vy)-5) m/s',normalization={'periapsis':200,'apoapsis':200,'verticalSpeed':5}),
            nonfiniteEncoding='Nonfinite diagnostics remain explicit strings such as Infinity; null retains its distinct no-event/no-eligible meaning',
            durations='Original post-action physical intervals at the original 50/250 ms steps; reported pattern bits are periapsis, apoapsis, radial speed',
            independentRollingTolerances=dict(quality=1e-11,reward=2e-8)),
        replay=dict(status='PASS',counters=expected_counts,maximumError=evaluation['maximumError'],
            originalEvaluationSessions={a:original_terminal['arms'][a]['originalSessionId'] for a in ARMS},originalReplaySession=62010,
            auditSource=BASE+'/evaluation-audit/audit.mjs',method=BASE+'/evaluation-audit/method.md',
            completeCaseArchive=BASE+'/evaluation-audit/replay/cases.json',completePairArchive=BASE+'/evaluation-audit/replay/paired-cases.json',
            completeDecisionArchive=BASE+'/evaluation-audit/replay/decisions.jsonl',completePhysicalStepArchive=BASE+'/evaluation-audit/replay/physical-steps.jsonl',
            archiveIdentities=BASE+'/evaluation-audit/replay/output-identities.json'),
        provenance=dict(historicalTrainingFullEnvironmentRecorded=False,historicalTrainingExecutableHashRecorded=False,
            historicalTrainingNodeResolution='PATH',trainingLimitation=evaluation['trainingProvenanceLimit'],
            prospectiveEvaluationFullEnvironmentRecorded=True,prospectiveEvaluationPinnedNode=True,
            evaluationExecutionFreeze=BASE+'/evaluation-execution/freeze.json',reporterSHA256=sha(__file__)),
        sources=sources,limits=[
            'This is one paired optimizer seed and six development cases per arm, not a reliability estimate or proof of optimizer superiority.',
            'There were no stable orbits, complete orbits or landings in 588 prescribed flights; no insertion capability or release eligibility was demonstrated.',
            'Training lacked full trajectories. Its audit establishes retained outcome, proposal, optimizer and ranking arithmetic; the separate evaluation replay verifies every recorded physical step.',
            'The two final controllers are identical to the frozen initial controller, so the matching evaluation outcomes do not compare two different learned policies.',
            'An eligible P peak is a brief best-so-far statistic. It does not certify a three-second strict insertion hold or penalize later departure.',
            'Ordering pair counts are exhaustive logical comparisons, not observed JavaScript sort-call counts.',
            'Ground retention and independent JavaScript release tests were not performed in this experiment.'
        ],capabilityEstablished=False,releaseEligible=False)

    # Both textual and numeric projections remain complete; no stored value is rounded.
    output.mkdir(parents=True)
    csv_path=output/'orbital-progress-evaluation-cases.csv'
    columns=list(cases[0])
    require(all(set(c)==set(columns) for c in cases),'Case summary schema differs')
    with csv_path.open('w',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(columns)
        for c in cases:
            writer.writerow([c[k] if k in TEXT_CSV else json.dumps(c[k],separators=(',',':'),allow_nan=False) for k in columns])
    publication['csv']=dict(file=csv_path.name,rows=12,sha256=sha(csv_path),
        encoding='arm/mode/reason are text; every other cell is exact JSON. All nested case summaries, eight predicate durations and physical deficits are retained.')
    public_path=output/'orbital-progress-evaluation-results.json'
    public_path.write_text(json.dumps(publication,separators=(',',':'),allow_nan=False)+'\n')
    require(public_path.stat().st_size<192000,'Compact public JSON exceeded 192 kB')
    published=read(public_path)
    require(published['evaluation']['cases']==cases and published['evaluation']['pairs']==compact_pairs,'JSON projection changed case/pair values')
    with csv_path.open(newline='') as stream:
        reread=[{key:value if key in TEXT_CSV else json.loads(value) for key,value in row.items()} for row in csv.DictReader(stream)]
    require(reread==cases,'CSV round-trip changed case values')
    s=training['arms']['control'];e=evaluation['aggregates']['control'];p=predicate_durations['control']
    generation_lines=[]
    for g in training['generations']:
        selected=g['arms']['control'];best=selected['rankingByOriginalIndex'][selected['selectedCandidateIndex']]
        generation_lines.append(f"| {g['generation']} | {selected['selectedCandidateIndex']} | {', '.join(map(str,selected['eliteCandidateIndices']))} | {best['meanH']:.6f} | {best['meanP']:.6f} | {best['fitness']:.6f} |")
    evaluation_lines=[]
    for i in range(6):
        c=case_index[('control',i)]
        evaluation_lines.append(f"| {c['scenario']}, {c['seed']}, {c['variability']} | {c['conditionalPeriapsis']:.6f} | {c['conditionalPeriapsisProgress']:.6f} | {c['conditionalPeriapsisEligibleSeconds']:.3f} | {c['insertionHoldQuality']:.6f} | {c['time']:.3f} |")
    pattern_lines=['| '+' | '.join('Pass' if bit=='1' else 'Fail' for bit in pattern)+f' | {p[pattern]:.3f} |' for pattern in PATTERNS]
    report=f"""# Progress ranking produced no gain across the completed 588-flight experiment

Both arms completed all **576 training trips and 12 reserved comparison trips**.
Adding H/P to the ranking changed neither the four complete candidate orders nor
the selected controllers. Both final controllers retained the original
generation-eight controller's exact 21,300 weights. All six evaluation pairs
then produced exactly identical recorded actions, states and physical endpoints.

There were **0 stable orbits, 0 completed orbits and 0 landings in 588 trips**.
Every training and comparison trip had zero strict insertion-hold time. All
12 comparison trips left the recovery corridor. This experiment is complete;
it demonstrated no training gain, insertion capability or release eligibility.
It does not establish that learning or the method is impossible.

## Every training outcome

| Recorded outcome | Control | H/P ranking |
| --- | ---: | ---: |
| Complete training trips | 288 | 288 |
| Nominal / variability-0.4 trips | 144 / 144 | 144 / 144 |
| Stable orbit / completed orbit / landing | 0 / 0 / 0 | 0 / 0 / 0 |
| No eligible periapsis sample | 250 | 250 |
| At least one eligible periapsis sample | 38 | 38 |
| Flight left the recovery corridor | 180 | 180 |
| Returned before completing an orbit | 66 | 66 |
| Orbital mission timed out | 42 | 42 |

Recorded conditional periapsis reached at most {s['maximumRecordedConditionalPeriapsis']:.6f} m
among eligible training samples, below the original strict 800 m requirement.
All failures, ineligible cases, original rewards, rolling quality values and H/P
fields remain intact in the [576-row CSV](orbital-progress-training-flights.csv)
and [training JSON](orbital-progress-training-results.json). That unchanged
training-stage JSON describes the comparison as pending at its publication time;
this completed report and the evaluation data below supersede that status.

## Identical selection in all four generations

Candidate indices are zero-based. Both arms had the same complete twelve-candidate
ordering and top-three elites, retained with each candidate's original fitness,
H, P and milestone counts in the training JSON.

| Generation | Selected candidate | Top three | Selected mean H | Selected mean P | Original fitness |
| --- | ---: | --- | ---: | ---: | ---: |
{chr(10).join(generation_lines)}

The selected vector remained the initial controller in every generation. The
scheduled starts changed between generations, so changes in selected H/P or
fitness are not evidence of controller improvement. Both final controllers have
weight SHA256 `{training['initialController']['weightSHA256']}`.

H never distinguished a candidate. P did distinguish **33 candidate pairs inside
primary ties**, and every preference agreed with original fitness. Of all 264
logical within-generation pairs per arm, the original landing/milestone keys
decided 156 before H/P and H/P remained tied for the other 75. These are exhaustive
pair counts, not the number of JavaScript sort calls. No ordering conflict arose.

All **41 distinct stochastic proposals lost to the initial controller**: 20 had
worse primary keys; 21 tied the primary keys but had both lower P and lower
fitness. The three updated means also lost. The
[completed ordering diagnostic](orbital-progress-verification/ordering-diagnostic.md)
retains every candidate, primary tie group and pair comparison. It also records
11 primary-different pairs where P would prefer the lower-primary candidate;
those preferences were never reached by the comparator. This explains the
realized unchanged selection without claiming a general failure to learn.

## Every reserved comparison outcome

Both original evaluation processes exited zero. Each arm evaluated all six
predeclared normal cases with its frozen generation-four controller. The two
arms' values below are identical; the linked data explicitly retain all
**12 arm/case summaries and all six pair differences**.

| Recorded outcome | Control | H/P ranking |
| --- | ---: | ---: |
| Complete comparison trips | 6 | 6 |
| Nominal / variability-0.4 trips | 3 / 3 | 3 / 3 |
| Stable orbit / completed orbit / landing | 0 / 0 / 0 | 0 / 0 / 0 |
| Deorbit / atmospheric entry / final approach | 0 / 0 / 0 | 0 / 0 / 0 |
| Longest strict insertion hold / mean H | 0 s / 0 | 0 s / 0 |
| No eligible periapsis sample | 0 | 0 |
| Mean P | {e['means']['conditionalPeriapsisProgress']:.6f} | {e['means']['conditionalPeriapsisProgress']:.6f} |
| Mean old rolling quality | {e['means']['insertionHoldQuality']:.6f} | {e['means']['insertionHoldQuality']:.6f} |
| Mean original fitness | {e['means']['fitness']:.6f} | {e['means']['fitness']:.6f} |
| Flight left the recovery corridor | 6 | 6 |
| Full elapsed flight time | {e['elapsedFlightSeconds']:.3f} s | {e['elapsedFlightSeconds']:.3f} s |

Each row below describes one matched pair. Scenario indices are zero-based;
24 and 25 target 1,000 m, while 26 targets 1,400 m. Every listed trip failed at its
original endpoint, with no strict hold and no stable-orbit milestone.

| Scenario, seed, variability | Best eligible periapsis (m) | P | Eligible time (s) | Old rolling quality | Elapsed time (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(evaluation_lines)}

The high P values correspond to best eligible periapses of only
{min(c['conditionalPeriapsis'] for c in cases):.6f}–{max(c['conditionalPeriapsis'] for c in cases):.6f} m.
P maps the wide −6000 to 800 m interval to zero through one; these values do not
mean insertion was nearly successful. Apoapsis and radial speed passed together
for only {p['011']:.3f} seconds across six trips in each arm, and periapsis failed
throughout those intervals. All three conditions never passed together.

The original post-step predicate durations below apply independently to each arm
and retain all eight combinations. Each column uses the strict conditions defined
below. Durations aggregate all six complete trips, including departure and failure.

| Periapsis | Apoapsis | Radial speed | Seconds per arm |
| --- | --- | --- | ---: |
{chr(10).join(pattern_lines)}

The [12-row CSV](orbital-progress-evaluation-cases.csv) and
[compact evaluation JSON](orbital-progress-evaluation-results.json) retain every
original endpoint and reward, all H/P values, all eight durations, the three
physical-deficit summaries, initial/final states and recorded peak states.
Nonfinite apoapsis deficits remain explicitly `Infinity`; no failing interval is
dropped. Full decisions and every original physical step remain in the
[replay archive's hashed file list](orbital-progress-verification/replay-output-identities.json),
with [audit source](orbital-progress-verification/audit.mjs) and
[frozen method](orbital-progress-verification/method.md). Huge traces are linked,
not duplicated in the public JSON. The complete local trajectory archive is not
included in Git; the linked source, method and hash manifest identify it. See
[reproducibility](reproducibility.md) for archive availability. Data files retain full precision; table values
are rounded only for display.

## What changed and what stayed fixed

The [earlier paired diagnostic](orbital-joint-paired.md) motivated testing the
missing periapsis condition. Both arms used the same frozen controller, fresh
optimizer, original proposal scales and seed, 13 active directions, sensory
basis, full anatomical network, physics and success criteria. Each generation
tested twelve candidates on six complete trips: nominal and varied starts for
each of three orbital missions. The unchanged changing-case schedule can repeat
earlier training starts. Four generations gave 288 training trips per arm.

H is the longest consecutive sampled hold satisfying **finite periapsis >800 m,
finite absolute apoapsis error <200 m and finite absolute radial speed <5 m/s**,
capped at three seconds and divided by three. P takes the greatest finite
periapsis while the other two strict conditions hold, clamps it to [−6000, 800] m
and maps it to [0, 1]. P is zero when no sample qualifies. A brief eligible P
crossing is not successful insertion.

The control orders by landings, original milestone counts and original fitness.
The H/P arm preserves those primary keys, then compares mean H, mean P and
original fitness. Every complete failed trip contributes to the means. No action
command, sensory input, success threshold or old fitness formula changed.
Physical deficits remain periapsis shortfall below 800 m, apoapsis-error excess
beyond 200 m and absolute-speed excess beyond 5 m/s. Their old reward scales are
200 m, 200 m and 5 m/s respectively; a zero deficit at an exact boundary does not
turn a strict failure into a pass.

## Verification and limits

The original training processes both exited zero. Their completed JavaScript
audit passed **162,426 checks** of frozen inputs, all 96 candidates, proposal and
optimizer arithmetic, ranking, rewards and final weights. Training publication
matched all 576 exported endpoints to the original ledgers and checked all four
full cross-arm result objects and orders. The ordering diagnostic passed 558
additional checks. All training tables and data links remain intact.

Training trajectories were not recorded, so that audit cannot reconstruct every
training physics step or eligibility interval. Before the experiment,
instrumentation replay matched 23,225 retained steps and endpoints from twelve
earlier diagnostic trips. Those were instrumentation checks, not new successes.

The separately frozen evaluation audit completed its **one authorized pass of
12 recorded-action physical replays**, using the original cadence and 50/250 ms
steps. It verified **25,324 physical steps, 8,980 decisions, 62,860 stored state
values and 251,440 presented values**, plus every endpoint and H/P summary.
All six paired recorded sequences and endpoints matched exactly, and every
reported metric difference was zero. The independent rolling calculation's
maximum quality/reward errors were {evaluation['maximumError']['rollingQuality']:.6g} and
{evaluation['maximumError']['rollingReward']:.6g}, below the frozen 1e-11/2e-8 tolerances.
Replay and publication ran no new neural flight, fit or controller selection.

The historical training plan and launcher pinned the 72-file runtime and
explicit experiment settings. They **did not record the full environment
supplied to Node or its historical executable hash**; Node was resolved through
PATH. The completed evaluation used a separate prospectively frozen clean
wrapper with the full supplied environment and pinned Node executable. That
stronger later evidence cannot recover the missing historical training evidence.

The prescribed **588 full neural-flight budget is closed: 576 training plus 12
comparison, with none pending**. The twelve recorded-action replays are separate
verification passes, not twelve additional neural-controller evaluations. One
paired optimizer seed and six development cases establish no general reliability,
optimizer superiority, ground retention or release claim. Independent JavaScript
release testing remains unperformed. No model was promoted.

Implementation and immutable records are under `scripts/insertion-progress.mjs`,
`scripts/train-suite.mjs`, and `artifacts/suite-training/orbital-progress-comparison`.
"""
    markdown=output/'orbital-progress-comparison.md';markdown.write_text(report)
    # Keep the original two training tables byte-for-byte despite the new overview.
    prior=(root/'docs/orbital-progress-comparison.md').read_text()
    for heading in ('| Recorded outcome | Control | H/P ranking |','| Generation | Selected candidate | Top three | Selected mean H | Selected mean P | Original fitness |'):
        start=prior.index(heading);end=prior.index('\n\n',start)
        require(prior[start:end] in report,'A prior training table changed')
    for relative,digest in sources.items():
        require(sha(root/relative)==digest,'Input changed during publication: '+relative)
    identities={p.name:sha(p) for p in sorted(output.iterdir()) if p.is_file()}
    verification=dict(status='PASS',sourceSHA256=sha(__file__),files=identities,trainingRowsPreserved=576,
        evaluationCaseSummaries=12,pairedComparisons=6,predicateCombinationsPerCase=8,
        originalEvaluationEndpointsExactlyMatched=12,allPairsExactlyEqual=True,allPairMetricDifferencesZero=True,
        jsonRoundTripExact=True,csvRoundTripExact=True,originalTrainingTablesUnchanged=True,
        allReadInputsUnchanged=True,newNeuralFlights=0,newPhysicalReplays=0,newFits=0,
        publicJSONBytes=public_path.stat().st_size,repositoryWrites=0)
    (output/'publication-identities.json').write_text(json.dumps(verification,indent=2)+'\n')
    print(json.dumps(verification,indent=2))


if __name__=='__main__':
    main()
