# Completed failed-contact quality comparison in ground learning

The completed paired experiment landed **40 of 48 development flights with
contact ranking, versus 36 of 48 with the control**. Across the 48 matched
starts, ranking gained six landings, lost two, landed with both controllers
in 34 cases and failed with both in six. It improved the overall result while
losing both Night shift landings. Neither checkpoint was promoted or released.

All **4,608 training flights and 96 comparison flights completed**, closing the
4,704-flight budget with no flights pending. The original training and comparison
processes all exited successfully. The prepared arithmetic audits passed
591,502 training checks and 138,324 comparison checks. These checks verified
stored results and calculations; they did not replay physics.

The [six-flight training diagnostic](ground-training-diagnostic.md) had found
separate contact-speed and tracking failures. The original flight reward already
penalized failed contacts. This experiment changed how those outcomes ranked
candidates while retaining that reward, the sensory representation and the same
17 adjustable control directions.

Both arms started from the original final generation-six training checkpoint,
which the [earlier selection comparison](ground-all-selection.md) had rejected.
**That ancestor was not the released generation-five controller.** Both arms
used a fresh optimizer and the same search seed. Each ran four generations,
12 candidates per generation and 48 complete flights per candidate: 2,304
flights per arm. Each generation included all 24 ground missions in nominal
and variability-0.4 conditions. Its case schedule reused the first four
generations of the original training plan, without reusing the later
384-flight selection comparison. These adaptive training results are training
evidence, not qualification of the selected controller.

Successful landings and the existing ordered milestone counts retained first
priority in both arms. The control then ranked by the unchanged scalar fitness.
The treatment first compared mean failed-contact quality, then the same fitness.
Exact ties retained the original candidate order.

For each failed contact, quality was:

`1 / max(1, position error / landing radius, absolute vertical speed / 3.6,
lateral speed / 3, tilt / 0.2)`.

The mission's original landing radius was used. Each failed noncontact
contributed zero, and the mean included all failed flights. Successful landings
were excluded; an all-landed candidate received neutral mean quality zero
because landing count already had priority. Quality one can still describe a
failure at an exact strict boundary or a yaw failure: the stored contact record
omits yaw speed. The metric is not a landing probability or a replacement
success rule. In the paired tables below, descriptive contact quality is one
for a successful landing; this differs from the failed-only ranking mean.

The worker calculation stayed unchanged, running every neural decision and
physical step to the original endpoint. Each raw returned result was saved
before checking case identity, contact fields, scores, landing counts and
quality. All candidates in each generation finished before ranking and the
optimizer update. The complete 73-file runtime and execution environments had
been frozen before launch. Arithmetic reconstruction and the completed audit
confirmed identical first-generation proposals and raw results for both arms:
12 candidates with 28 parameters each, preserving all 11 fixed coordinates.
Later populations were allowed to diverge through their different rankings.

The training totals and final selections were:

| Training result | Control | Contact ranking |
| --- | ---: | ---: |
| Full flights across all candidates | 2,304 | 2,304 |
| Landings across all candidates | 1148 | 1191 |
| Failures across all candidates | 1156 | 1113 |
| Selected generation-four candidate index | 9 | 5 |
| Selected candidate's training landings | 37/48 | 38/48 |
| Selected candidate's mean failed-contact quality | 0.5547094104764423 | 0.7238504716120965 |
| Selected candidate's unchanged fitness | -20.870459133637137 | 4.847701391089701 |

Only those two selected generation-four checkpoints entered the reserved
comparison, after training completed and its ledgers passed the audit. It used
48 fresh matched starts per arm, one nominal and one variability-0.4 start per
mission, with normal visible inputs. No further selection was performed.

| Development comparison | Control | Contact ranking |
| --- | ---: | ---: |
| Landings | 36/48 | 40/48 |
| Nominal landings | 18/24 | 20/24 |
| Varied landings | 18/24 | 20/24 |
| Failed flights in quality denominator | 12 | 8 |
| Mean failed-contact quality | 0.5851499869213287 | 0.6382269590767518 |
| Mean original score | -12.607018506755688 | 24.71781308771205 |
| Mean unchanged fitness | -23.20577019668743 | 6.649795505206378 |

The mean failed-contact quality difference was
+0.05307697215542306, over different failure
sets of 12 and eight flights. Control failures were five missed ships, four
lateral impacts, two timeouts and one attitude impact; ranked failures were
four lateral impacts and four missed ships.

Every mission is shown below. Each arm's `N/V` column gives its two outcomes
in nominal/varied order: **L** means landed and **F** means failed. `0*` means
both flights landed, so the failed-only mean is neutral zero. An unstarred
zero means actual failures with zero quality. Quality values retain the
exported numerical precision.

| Mission index | Mission | Control N/V | Ranked N/V | Control failed mean | Ranked failed mean |
| ---: | --- | :---: | :---: | ---: | ---: |
| 0 | Landing school | L/L | L/L | 0* | 0* |
| 1 | Atlantic return | L/L | L/L | 0* | 0* |
| 2 | Fast approach | L/L | L/L | 0* | 0* |
| 3 | Rough seas | L/L | L/L | 0* | 0* |
| 4 | Night shift | L/L | F/F | 0* | 0.803944382835261 |
| 5 | Fin trouble | F/L | L/L | 0.8891431685158449 | 0* |
| 6 | Engine trouble | F/F | L/L | 0.8855722374681939 | 0* |
| 7 | Absolutely nominal | F/F | F/F | 0.7659018585367444 | 0.7026136177746903 |
| 8 | Precision barge | L/L | L/L | 0* | 0* |
| 9 | Fast ferry | L/L | L/L | 0* | 0* |
| 10 | Figure-eight deck | L/F | L/L | 0.9168482345997345 | 0* |
| 11 | Turning vessel | L/L | L/L | 0* | 0* |
| 12 | Wind wall | L/L | L/L | 0* | 0* |
| 13 | Wind shear | F/F | F/F | 0.1719048098639031 | 0.19203717996164799 |
| 14 | Fuel reserve | L/L | L/L | 0* | 0* |
| 15 | Slow hands | L/L | L/L | 0* | 0* |
| 16 | Sideways entry | L/L | L/L | 0* | 0* |
| 17 | Spinning entry | L/L | L/L | 0* | 0* |
| 18 | High return | F/F | L/L | 0 | 0* |
| 19 | Tight storm | F/F | F/F | 0.7845253141013409 | 0.8543126557354082 |
| 20 | Early engine fade | L/L | L/L | 0* | 0* |
| 21 | Late engine fade | L/L | L/L | 0* | 0* |
| 22 | Blackout rendezvous | L/L | L/L | 0* | 0* |
| 23 | Last-call recovery | L/L | L/L | 0* | 0* |

All eight pairs with a changed landing outcome are listed here. Case indices
are zero-based and identify the exact seed and endpoints in the
[complete paired cases](ground-contact-comparison/evaluation/paired-cases.json).

| Case | Mission and condition | Control endpoint | Ranked endpoint | Control contact quality | Ranked contact quality |
| ---: | --- | --- | --- | ---: | ---: |
| 4 | Night shift, nominal | Touchdown | Lateral impact | 1 | 0.7441451426130802 |
| 5 | Fin trouble, nominal | Missed the ship | Touchdown | 0.8891431685158449 | 1 |
| 6 | Engine trouble, nominal | Lateral impact | Touchdown | 0.8509901548213513 | 1 |
| 18 | High return, nominal | Approach timed out | Touchdown | 0 | 1 |
| 28 | Night shift, varied | Touchdown | Lateral impact | 1 | 0.8637436230574418 |
| 30 | Engine trouble, varied | Lateral impact | Touchdown | 0.9201543201150365 | 1 |
| 34 | Figure-eight deck, varied | Missed the ship | Touchdown | 0.9168482345997345 | 1 |
| 42 | High return, varied | Approach timed out | Touchdown | 0 | 1 |

Five of the six pairs that failed in both arms improved contact quality; one
worsened. Their exact results are:

| Case | Mission and condition | Control endpoint | Ranked endpoint | Control contact quality | Ranked contact quality | Ranked minus control |
| ---: | --- | --- | --- | ---: | ---: | ---: |
| 7 | Absolutely nominal, nominal | Lateral impact | Missed the ship | 0.6184887093270844 | 0.9328255020566919 | +0.31433679272960746 |
| 13 | Wind shear, nominal | Missed the ship | Missed the ship | 0.1697329508853518 | 0.20268120520522015 | +0.032948254319868336 |
| 19 | Tight storm, nominal | Attitude at impact | Missed the ship | 0.9027533805989649 | 0.922958163198303 | +0.02020478259933811 |
| 31 | Absolutely nominal, varied | Missed the ship | Lateral impact | 0.9133150077464044 | 0.47240173349268877 | -0.4409132742537156 |
| 37 | Wind shear, varied | Missed the ship | Missed the ship | 0.1740766688424544 | 0.1813931547180758 | +0.007316485875621392 |
| 43 | Tight storm, varied | Lateral impact | Lateral impact | 0.6662972476037169 | 0.7856671482725133 | +0.11936990066879638 |

Landing count and the failed-only mean can move in opposite directions.
Night shift fell from two landings to zero while its failed-only mean rose
from neutral zero to 0.803944382835261. Fin trouble, Engine trouble and
Figure-eight deck gained landings while their failed-only means fell to neutral
zero because both ranked flights landed. High return gained both landings
while the failed-only mean stayed zero: control had two noncontact timeouts,
and ranking had two successes. These zero values have different meanings.
No pair had identical descriptive contact quality with different landing flags.

Quality also disagreed with the original reward on the varied Absolutely
nominal case (31). Its quality fell by 0.4409132742537156 while its score and
fitness each improved by 13.651612013223541. Across both starts of that mission,
mean failed quality fell from 0.7659018585367444 to 0.7026136177746903 despite
improvement in the original score and fitness. Aggregate improvement therefore
does not establish improvement on every mission or metric.

The [publication summary](ground-contact-comparison/summary.json) records the
closed budget and audit receipt identities. Its SHA-256 is
`c786abbf7cdf112d352b20ed6ba8a02cbc885d41ab9c8ccdd495ed434f4447e8`.
Selected candidate file identities are `30f0bf55a136…` for control and
`748632cf364d…` for ranking; full candidate, parameter, weight, runtime and
source digests are retained in the linked summaries and identity inventories.

- Training: [all 4,608 original endpoints](ground-contact-comparison/training/all-training-flights.jsonl),
  [all 2,269 failures](ground-contact-comparison/training/all-training-failures.jsonl),
  [every ranking and optimizer state](ground-contact-comparison/training/rankings-and-optimizer.json),
  [selected candidates' training cases](ground-contact-comparison/training/final-training-cases.json),
  [first-generation equality](ground-contact-comparison/training/generation-one-equality.json),
  [audit summary](ground-contact-comparison/training/summary.json) and
  [source identities](ground-contact-comparison/training/input-identities.json).
- Comparison: [all 96 original endpoints](ground-contact-comparison/evaluation/all-comparison-outcomes.jsonl),
  [all 20 failures](ground-contact-comparison/evaluation/all-comparison-failures.jsonl),
  [original returned reports](ground-contact-comparison/evaluation/original-results.json),
  [48 matched pairs](ground-contact-comparison/evaluation/paired-cases.json),
  [pairs CSV](ground-contact-comparison/evaluation/pairs.csv),
  [all 24 missions](ground-contact-comparison/evaluation/missions.json),
  [audit summary](ground-contact-comparison/evaluation/summary.json) and
  [source identities](ground-contact-comparison/evaluation/input-identities.json).
- Method and reproduction: [original experiment launcher](../scripts/run-ground-contact-comparison.py),
  [contact-quality calculation](../scripts/ground-contact-progress.mjs),
  [publication exporter](../scripts/report-ground-contact-complete.py) and
  [included and excluded reproduction files](reproducibility.md#files-included-and-excluded).

The exports preserve the original endpoint records, including failures; they
do not add full physical traces. The original binary records and runtime
archives remain local and are identified by the published hashes. Historical
missing imports from ancestral generation-six training remain unresolved;
the frozen current runtime does not repair that earlier provenance gap.

One paired optimizer seed and two new starts per mission cannot establish
reliability or authorize a release. This completed development comparison
supports a modest overall landing gain under this fixed budget, with a clear
Night shift regression and remaining failures on three other missions.
The released generation-five controller remains unchanged.
