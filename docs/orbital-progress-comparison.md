# Progress ranking produced no training gain in this run

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
| No eligible periapsis sample | 250 | 250 |
| At least one eligible periapsis sample | 38 | 38 |
| Flight left the recovery corridor | 180 | 180 |
| Returned before completing an orbit | 66 | 66 |
| Orbital mission timed out | 42 | 42 |

Recorded conditional periapsis reached at most 335.099194 m
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
| 1 | 0 | 0, 11, 8 | 0.000000 | 0.763603 | 208.305174 |
| 2 | 1 | 1, 2, 0 | 0.000000 | 0.917569 | 211.282527 |
| 3 | 1 | 1, 9, 6 | 0.000000 | 0.917035 | 213.603331 |
| 4 | 1 | 1, 2, 9 | 0.000000 | 0.916950 | 215.632373 |

The selected parameter vector remained the initial controller in every
generation. Selected H/P and fitness vary with the scheduled starts; those
changes are not evidence of training gain. Both final controllers have weight
SHA256 `1c3f9b403128a742ec5db3c9010f75806f5e0dd6abf17ab791082c99c7e449ff`.

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
