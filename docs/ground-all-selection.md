# All-ground selection: candidate rejected

The comparison completed all **384 prescribed flights**: 288 candidate-condition flights and 96 release-comparator flights. The final generation-six candidate failed the frozen retention requirement for the released ten missions: **25/40 landings versus 28/40**. The release remains the supported controller. This candidate does not advance to fresh JavaScript final testing.

The comparison uses 96 physical starts across 24 missions, with two nominal and two variability-0.4 starts per mission. Each start is shared by the candidate on normal inputs, the intact release, the candidate with covered eyes and the candidate with disabled indicators. Both original processes exited successfully before the independent completion audit read their outputs.

| Frozen gate | Candidate | Comparator | Result |
| --- | ---: | ---: | --- |
| Overall superiority | 64/96 | Release 62/96 | Pass |
| Original-four retention | 15/16 | Release 14/16 | Pass |
| Released-ten retention | 25/40 | Release 28/40 | **Fail** |
| Covered-eye separation | 64/96 | Covered 0/96 | Pass |
| Disabled-indicator separation | 64/96 | Disabled 0/96 | Pass |

The normal-input candidate lands 31/48 nominal and 33/48 varied cases; the release lands 31/48 in each condition. Paired against the release, the candidate succeeds alone on 12 starts and fails alone on ten; both land on 52 and neither lands on 22. Within the released ten missions, there are four candidate-only successes and seven candidate-only failures. These development counts do not establish a general reliability improvement.

| Mission | Candidate /4 | Release /4 | Covered /4 | Disabled /4 | Candidate-only successes | Candidate-only failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 — Landing school | 4 | 4 | 0 | 0 | 0 | 0 |
| 1 — Atlantic return | 4 | 4 | 0 | 0 | 0 | 0 |
| 2 — Fast approach | 4 | 4 | 0 | 0 | 0 | 0 |
| 3 — Rough seas | 3 | 3 | 0 | 0 | 0 | 0 |
| 4 — Night shift | 1 | 3 | 0 | 0 | 0 | 2 |
| 5 — Fin trouble | 3 | 0 | 0 | 0 | 3 | 0 |
| 6 — Engine trouble | 0 | 2 | 0 | 0 | 0 | 2 |
| 7 — Absolutely nominal | 0 | 0 | 0 | 0 | 0 | 0 |
| 8 — Precision barge | 4 | 4 | 0 | 0 | 0 | 0 |
| 9 — Fast ferry | 3 | 3 | 0 | 0 | 1 | 1 |
| 10 — Figure-eight deck | 3 | 4 | 0 | 0 | 0 | 1 |
| 11 — Turning vessel | 1 | 0 | 0 | 0 | 1 | 0 |
| 12 — Wind wall | 4 | 4 | 0 | 0 | 0 | 0 |
| 13 — Wind shear | 0 | 0 | 0 | 0 | 0 | 0 |
| 14 — Fuel reserve | 4 | 4 | 0 | 0 | 0 | 0 |
| 15 — Slow hands | 4 | 4 | 0 | 0 | 0 | 0 |
| 16 — Sideways entry | 4 | 4 | 0 | 0 | 0 | 0 |
| 17 — Spinning entry | 4 | 3 | 0 | 0 | 1 | 0 |
| 18 — High return | 4 | 0 | 0 | 0 | 4 | 0 |
| 19 — Tight storm | 0 | 0 | 0 | 0 | 0 | 0 |
| 20 — Early engine fade | 4 | 4 | 0 | 0 | 0 | 0 |
| 21 — Late engine fade | 4 | 4 | 0 | 0 | 0 | 0 |
| 22 — Blackout rendezvous | 0 | 3 | 0 | 0 | 0 | 3 |
| 23 — Last-call recovery | 2 | 1 | 0 | 0 | 2 | 1 |

All **258 failures** remain in the record: 32 candidate normal-input failures, 34 release failures and 192 sensory-control failures. The candidate normal-input failures comprise five hard landings, eleven lateral impacts and sixteen missed ships. The release records seven timeouts, one attitude-at-impact failure, twelve lateral impacts and fourteen missed ships. Covered eyes produce 82 terminated flights, thirteen missed ships and one attitude-at-impact failure; all 96 disabled-indicator flights terminate.

The integrity audit verifies all 384 slots, exact four-way physical variation pairing, the frozen runtime/model identities, both sets of 21,300 decoded weights and stored touchdown checks. This is an audit of complete endpoint records. Selection records omit trajectories, terminal physical state and yaw rate, so their physics, accumulated reward and unrecorded yaw limit cannot be independently reconstructed. The separate selection runtime has 71 pinned files; it does not repair the three missing imports in the historical training archive.

The five-gate protocol and seed were frozen before these selection flights, after the earlier training-plan freeze. The failed result is preserved without replacing the cohort or substituting an earlier candidate. The [separate diagnosis of six training failures](ground-training-diagnostic.md) is now complete; those cases were selected before the completed selection was read. Their diagnosis cannot turn this rejection into a qualification.

The retained evidence includes the [audit summary](ground-all-selection/summary.json), [all 384 outcomes as CSV](ground-all-selection/all-384-outcomes.csv), [all 384 full records](ground-all-selection/all-384-outcomes.jsonl), [all 96 paired cases](ground-all-selection/all-96-pairs.json), [all failures](ground-all-selection/all-failures.jsonl) and [file hashes](ground-all-selection/output-identities.json). The [selection plan](ground-all-selection-plan.json) and [completed training report](ground-all-training.md) record their distinct stages.

Selection plan SHA256: a63a2643f8c6cc74aab64e2797942d5a2bc4a337445ae52c668b3304b669610f.
