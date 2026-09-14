# Smaller orbital proposals: completed 156-flight comparison

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
| Mean physical score, all 72 flights | -538.814487 | -560.842585 |
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
| 0 (initial) | 6/6 | 6/6 | 0.763603 | 0.763603 | 208.305174 | 208.305174 |
| 1 | 6/6 | 6/6 | 0.000000 | 0.457488 | 152.226847 | 189.463958 |
| 2 | 0/0 | 0/0 | 0.000000 | 0.000000 | -57.907824 | -60.907609 |
| 3 | 6/6 | 6/6 | 0.000000 | 0.000000 | 151.680141 | 167.208420 |
| 4 | 6/5 | 6/6 | 0.000493 | 0.000000 | 130.539159 | 151.081419 |
| 5 | 6/0 | 6/0 | 0.000000 | 0.000000 | -45.648424 | -40.088864 |
| 6 | 5/0 | 6/6 | 0.000000 | 0.000000 | -27.215514 | 168.273153 |
| 7 | 6/0 | 6/0 | 0.000000 | 0.913662 | -17.170865 | 24.311794 |
| 8 | 0/0 | 6/0 | 0.000000 | 0.000000 | -59.837111 | -26.601950 |
| 9 | 6/0 | 6/0 | 0.000000 | 0.000000 | -35.284824 | -28.276937 |
| 10 | 0/0 | 6/0 | 0.000000 | 0.000000 | -56.501480 | -51.559802 |
| 11 | 6/0 | 6/0 | 0.000000 | 0.000000 | -61.354783 | -37.355501 |

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
| 24 / 196417031 / 0 | 227.093690 | 0.915749 | 1.900 | -483.703537 | 154.150 |
| 25 / 196521760 / 0 | 233.408397 | 0.916678 | 1.450 | -480.970669 | 152.900 |
| 26 / 196626489 / 0 | 250.061903 | 0.919127 | 1.250 | -488.321346 | 164.900 |
| 24 / 196731218 / 0.4 | 248.859197 | 0.918950 | 0.500 | -482.878995 | 173.200 |
| 25 / 196835947 / 0.4 | 227.484313 | 0.915807 | 1.500 | -485.382573 | 144.300 |
| 26 / 196940676 / 0.4 | 212.514042 | 0.913605 | 4.400 | -484.973453 | 168.700 |

Mean P was 0.916652489;
mean eligible time was 1.833333 s.
P maps the wide −6000 to 800 m interval to [0,1], so these high values do not
establish insertion. A strict hold also requires periapsis >800 m while
absolute apoapsis error stays below 200 m and absolute radial speed below 5 m/s, consecutively
for three seconds. No trip recorded any strict hold.

The [12-row comparison CSV](orbital-local-evaluation-flights.csv) and
[JSON](orbital-local-comparison-results.json) retain every endpoint, H/P value,
null-aware deficit, trace count/hash and all six paired differences. The mean
adjusted reward, 209.031917, is a **descriptive source-formula
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
`1c3f9b403128a742ec5db3c9010f75806f5e0dd6abf17ab791082c99c7e449ff`.

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
`artifacts/suite-training/orbital-local-proposal-comparison`. Its hashes and exact receipt identities are retained in the JSON;
see [archive availability](reproducibility.md#files-included-and-excluded).
Data files retain full precision; only display tables are rounded.
