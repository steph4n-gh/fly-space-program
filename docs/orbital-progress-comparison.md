# Progress ranking produced no gain across the completed 588-flight experiment

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

Recorded conditional periapsis reached at most 335.099194 m
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
| 1 | 0 | 0, 11, 8 | 0.000000 | 0.763603 | 208.305174 |
| 2 | 1 | 1, 2, 0 | 0.000000 | 0.917569 | 211.282527 |
| 3 | 1 | 1, 9, 6 | 0.000000 | 0.917035 | 213.603331 |
| 4 | 1 | 1, 2, 9 | 0.000000 | 0.916950 | 215.632373 |

The selected vector remained the initial controller in every generation. The
scheduled starts changed between generations, so changes in selected H/P or
fitness are not evidence of controller improvement. Both final controllers have
weight SHA256 `1c3f9b403128a742ec5db3c9010f75806f5e0dd6abf17ab791082c99c7e449ff`.

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
| Mean P | 0.917403 | 0.917403 |
| Mean old rolling quality | 0.045455 | 0.045455 |
| Mean original fitness | 206.139238 | 206.139238 |
| Flight left the recovery corridor | 6 | 6 |
| Full elapsed flight time | 954.900 s | 954.900 s |

Each row below describes one matched pair. Scenario indices are zero-based;
24 and 25 target 1,000 m, while 26 targets 1,400 m. Every listed trip failed at its
original endpoint, with no strict hold and no stable-orbit milestone.

| Scenario, seed, variability | Best eligible periapsis (m) | P | Eligible time (s) | Old rolling quality | Elapsed time (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 24, 94617031, 0 | 227.093690 | 0.915749 | 1.900 | 0.051829 | 154.150 |
| 25, 94721760, 0 | 239.261230 | 0.917538 | 1.400 | 0.046685 | 155.500 |
| 26, 94826489, 0 | 249.040768 | 0.918977 | 1.500 | 0.049655 | 166.850 |
| 24, 94931218, 0.4 | 234.957928 | 0.916906 | 1.300 | 0.043741 | 157.550 |
| 25, 95035947, 0.4 | 242.469335 | 0.918010 | 1.100 | 0.040032 | 154.300 |
| 26, 95140676, 0.4 | 237.210969 | 0.917237 | 1.100 | 0.040789 | 166.550 |

The high P values correspond to best eligible periapses of only
227.093690–249.040768 m.
P maps the wide −6000 to 800 m interval to zero through one; these values do not
mean insertion was nearly successful. Apoapsis and radial speed passed together
for only 8.300 seconds across six trips in each arm, and periapsis failed
throughout those intervals. All three conditions never passed together.

The original post-step predicate durations below apply independently to each arm
and retain all eight combinations. Each column uses the strict conditions defined
below. Durations aggregate all six complete trips, including departure and failure.

| Periapsis | Apoapsis | Radial speed | Seconds per arm |
| --- | --- | --- | ---: |
| Fail | Fail | Fail | 233.500 |
| Fail | Fail | Pass | 471.850 |
| Fail | Pass | Fail | 0.000 |
| Fail | Pass | Pass | 8.300 |
| Pass | Fail | Fail | 241.250 |
| Pass | Fail | Pass | 0.000 |
| Pass | Pass | Fail | 0.000 |
| Pass | Pass | Pass | 0.000 |

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
maximum quality/reward errors were 1.83187e-15 and
2.16005e-12, below the frozen 1e-11/2e-8 tolerances.
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
