# Completed all-ground learning and fresh selection

The completed ground-joint-all lesson **passes the independent artifact, proposal, optimizer and checkpoint arithmetic audit**. The predeclared generation-6 selected candidate (index 5) lands **34 of 48 training cases**: 18/24 nominal and 16/24 at variability 0.4. This is a training result. The subsequent [384-flight selection](ground-all-selection.md) is also complete and rejects this candidate: its 64/96 overall result includes a regression from 28/40 to 25/40 on the released ten missions.

The original session 80488 terminal exit 0 was confirmed by the parent before any training-output read. The audited ledger has exactly six consecutive generations, 12 candidates per generation and 48 complete flights per candidate: **72 candidates and 3,456 flights**. Every generation/candidate covers all 24 missions once nominally and once at 0.4 variability, with exact seed and mission identities matching the original plan. Each mission therefore has 144 adaptive training flights, split 72 nominal/72 varied. No record is censored; the original ground schema, activation gain 1 and disabled style bonus are preserved.

All frozen hashes checked at preparation were verified again. Initial and final 21,300 weights reconstruct exactly from their 28 parameters and the frozen basis/directions. The 17 active indices are [0,1,2,3,4,5,6,7,8,9,10,11,23,24,25,26,27]. All eleven inactive indices [12,13,14,15,16,17,18,19,20,21,22] equal the initial checkpoint in every proposal; 17 of 17 eligible indices differ in the final selected checkpoint. Initial native-build metadata present: false; no missing historical field was invented. Completed state, candidate and each generation ledger agree with the frozen native build record and hashes.

The independent calculator reconstructs all 72 deterministic proposals from the released-G5 initial parameters, archived scales, proposal RNG, original 0.4/1.4 mixture, covariance Cholesky factor and three-elite updates. All proposal vectors and final mean, sigma and covariance match exactly. Ranking preserves landings first and then the old fitness because no ground record has orbital milestones. Every selected generation and history entry agrees with the original trainer selection. Final state.best, candidate parameters/history, generation 6 and episodes 3456 all agree; no earlier checkpoint is substituted.

Mean recorded score recomputation has maximum absolute error 0; mean fitness error is 0. Ground fitness is the mean recorded full-flight score minus 3 × (vertical touchdown speed² + lateral touchdown speed²) for successful landings only. Static comparison proves the prior trainer is unchanged apart from the separate orbital eligibility clause and the intended ground-joint-all variability pairing. Frozen ground physics/result hashes are unchanged. The per-flight accumulated base reward cannot be independently reconstructed without stored trajectories; this audit verifies its original source and aggregate arithmetic.

| Generation | Selected candidate index | Selected landings /48 | All-candidate landings /576 | Selected fitness |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0 | 31 | 199 | -91.911721 |
| 2 | 5 | 32 | 279 | -91.874190 |
| 3 | 3 | 34 | 297 | -59.004949 |
| 4 | 7 | 34 | 337 | -51.951774 |
| 5 | 4 | 36 | 399 | -14.361606 |
| 6 | 5 | 34 | 382 | -11.254144 |

Generation cases change, so their selected counts are not a matched estimate of improvement. The generation-1 initial-policy result is 31/48 on generation-1 cases; it is not matched to generation 6. All-candidate pooled counts characterize adaptive exploration, not fixed-policy reliability: Touchdown: 1893; Missed the ship: 580; Lateral impact: 381; Approach timed out: 401; Hard landing: 163; Attitude at impact: 38. Final selected endpoints: Touchdown: 34; Hard landing: 4; Lateral impact: 5; Missed the ship: 5.

| Mission | All-candidate landings /144 | Nominal /72 | Varied /72 | Final GEN6 /2 | Final nominal endpoint | Final varied endpoint |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 0 — Landing school | 133 | 69 | 64 | 2 | Touchdown | Touchdown |
| 1 — Atlantic return | 132 | 67 | 65 | 2 | Touchdown | Touchdown |
| 2 — Fast approach | 124 | 62 | 62 | 2 | Touchdown | Touchdown |
| 3 — Rough seas | 90 | 41 | 49 | 2 | Touchdown | Touchdown |
| 4 — Night shift | 46 | 31 | 15 | 0 | Lateral impact | Missed the ship |
| 5 — Fin trouble | 46 | 24 | 22 | 1 | Touchdown | Lateral impact |
| 6 — Engine trouble | 37 | 16 | 21 | 1 | Touchdown | Missed the ship |
| 7 — Absolutely nominal | 1 | 1 | 0 | 0 | Hard landing | Hard landing |
| 8 — Precision barge | 123 | 59 | 64 | 2 | Touchdown | Touchdown |
| 9 — Fast ferry | 103 | 58 | 45 | 2 | Touchdown | Touchdown |
| 10 — Figure-eight deck | 92 | 47 | 45 | 2 | Touchdown | Touchdown |
| 11 — Turning vessel | 13 | 4 | 9 | 0 | Lateral impact | Lateral impact |
| 12 — Wind wall | 120 | 59 | 61 | 2 | Touchdown | Touchdown |
| 13 — Wind shear | 0 | 0 | 0 | 0 | Missed the ship | Missed the ship |
| 14 — Fuel reserve | 125 | 62 | 63 | 2 | Touchdown | Touchdown |
| 15 — Slow hands | 121 | 61 | 60 | 2 | Touchdown | Touchdown |
| 16 — Sideways entry | 118 | 59 | 59 | 1 | Touchdown | Lateral impact |
| 17 — Spinning entry | 109 | 55 | 54 | 2 | Touchdown | Touchdown |
| 18 — High return | 35 | 19 | 16 | 2 | Touchdown | Touchdown |
| 19 — Tight storm | 18 | 6 | 12 | 1 | Missed the ship | Touchdown |
| 20 — Early engine fade | 113 | 56 | 57 | 2 | Touchdown | Touchdown |
| 21 — Late engine fade | 100 | 51 | 49 | 2 | Touchdown | Touchdown |
| 22 — Blackout rendezvous | 57 | 28 | 29 | 0 | Hard landing | Hard landing |
| 23 — Last-call recovery | 37 | 24 | 13 | 2 | Touchdown | Touchdown |

The final 48 outcomes are retained without exclusions:

| Mission | Seed | Variability | Original endpoint | Error m | Vertical speed m/s | Lateral speed m/s | Tilt rad | Time s |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 0 — Landing school | 817792 | 0 | Touchdown | 2.177 | 2.459 | 0.848 | 0.022 | 19.45 |
| 0 — Landing school | 1067176 | 0.4 | Touchdown | 4.294 | 1.745 | 0.225 | 0.030 | 22.35 |
| 1 — Atlantic return | 828183 | 0 | Touchdown | 3.660 | 2.357 | 1.298 | 0.005 | 30.70 |
| 1 — Atlantic return | 1077567 | 0.4 | Touchdown | 2.187 | 2.263 | 0.543 | 0.025 | 28.20 |
| 2 — Fast approach | 838574 | 0 | Touchdown | 7.388 | 2.159 | 1.332 | 0.033 | 41.05 |
| 2 — Fast approach | 1087958 | 0.4 | Touchdown | 2.809 | 1.752 | 1.232 | 0.014 | 39.50 |
| 3 — Rough seas | 848965 | 0 | Touchdown | 6.113 | 2.126 | 1.790 | 0.135 | 37.85 |
| 3 — Rough seas | 1098349 | 0.4 | Touchdown | 2.476 | 2.132 | 2.791 | 0.037 | 35.30 |
| 4 — Night shift | 859356 | 0 | Lateral impact | 8.642 | 2.071 | 3.126 | 0.119 | 40.60 |
| 4 — Night shift | 1108740 | 0.4 | Missed the ship | 15.962 | 2.754 | 3.633 | 0.079 | 36.10 |
| 5 — Fin trouble | 714133 | 0 | Touchdown | 10.036 | 2.336 | 1.267 | 0.158 | 41.65 |
| 5 — Fin trouble | 869747 | 0.4 | Lateral impact | 4.458 | 2.294 | 3.817 | 0.043 | 40.90 |
| 6 — Engine trouble | 630754 | 0 | Touchdown | 7.120 | 3.042 | 2.278 | 0.096 | 38.10 |
| 6 — Engine trouble | 880138 | 0.4 | Missed the ship | 13.930 | 3.299 | 3.845 | 0.101 | 36.80 |
| 7 — Absolutely nominal | 641145 | 0 | Hard landing | 10.228 | 4.010 | 3.498 | 0.148 | 38.55 |
| 7 — Absolutely nominal | 890529 | 0.4 | Hard landing | 7.506 | 4.189 | 4.574 | 0.192 | 37.35 |
| 8 — Precision barge | 651536 | 0 | Touchdown | 3.989 | 2.382 | 0.846 | 0.025 | 28.45 |
| 8 — Precision barge | 900920 | 0.4 | Touchdown | 4.595 | 2.226 | 1.100 | 0.015 | 30.20 |
| 9 — Fast ferry | 661927 | 0 | Touchdown | 6.697 | 2.465 | 1.411 | 0.022 | 33.55 |
| 9 — Fast ferry | 911311 | 0.4 | Touchdown | 5.220 | 2.358 | 0.930 | 0.079 | 33.70 |
| 10 — Figure-eight deck | 672318 | 0 | Touchdown | 9.706 | 1.939 | 2.370 | 0.044 | 35.30 |
| 10 — Figure-eight deck | 921702 | 0.4 | Touchdown | 2.546 | 2.308 | 2.189 | 0.070 | 36.15 |
| 11 — Turning vessel | 682709 | 0 | Lateral impact | 7.112 | 2.113 | 3.488 | 0.099 | 38.75 |
| 11 — Turning vessel | 932093 | 0.4 | Lateral impact | 8.125 | 2.247 | 3.423 | 0.057 | 35.55 |
| 12 — Wind wall | 693100 | 0 | Touchdown | 9.133 | 2.121 | 2.050 | 0.083 | 35.40 |
| 12 — Wind wall | 942484 | 0.4 | Touchdown | 8.071 | 2.029 | 0.942 | 0.089 | 37.55 |
| 13 — Wind shear | 703491 | 0 | Missed the ship | 61.599 | 2.054 | 1.047 | 0.196 | 36.60 |
| 13 — Wind shear | 952875 | 0.4 | Missed the ship | 53.058 | 1.982 | 2.468 | 0.222 | 40.15 |
| 14 — Fuel reserve | 713882 | 0 | Touchdown | 6.176 | 1.424 | 0.544 | 0.040 | 33.45 |
| 14 — Fuel reserve | 963266 | 0.4 | Touchdown | 6.068 | 1.396 | 0.441 | 0.011 | 33.10 |
| 15 — Slow hands | 724273 | 0 | Touchdown | 2.912 | 1.698 | 1.273 | 0.010 | 34.00 |
| 15 — Slow hands | 973657 | 0.4 | Touchdown | 1.879 | 2.516 | 1.302 | 0.049 | 33.40 |
| 16 — Sideways entry | 734664 | 0 | Touchdown | 4.098 | 2.252 | 1.296 | 0.043 | 36.25 |
| 16 — Sideways entry | 984048 | 0.4 | Lateral impact | 6.866 | 1.954 | 3.138 | 0.062 | 38.30 |
| 17 — Spinning entry | 745055 | 0 | Touchdown | 4.770 | 1.808 | 1.435 | 0.016 | 40.75 |
| 17 — Spinning entry | 994439 | 0.4 | Touchdown | 8.001 | 2.059 | 1.257 | 0.055 | 43.60 |
| 18 — High return | 755446 | 0 | Touchdown | 2.236 | 2.217 | 1.531 | 0.129 | 57.40 |
| 18 — High return | 1004830 | 0.4 | Touchdown | 8.182 | 2.474 | 2.019 | 0.019 | 52.65 |
| 19 — Tight storm | 765837 | 0 | Missed the ship | 9.793 | 2.450 | 2.345 | 0.196 | 42.90 |
| 19 — Tight storm | 1015221 | 0.4 | Touchdown | 5.322 | 2.018 | 2.736 | 0.143 | 45.80 |
| 20 — Early engine fade | 776228 | 0 | Touchdown | 5.823 | 2.788 | 1.277 | 0.063 | 38.20 |
| 20 — Early engine fade | 1025612 | 0.4 | Touchdown | 7.440 | 2.792 | 1.990 | 0.033 | 39.75 |
| 21 — Late engine fade | 786619 | 0 | Touchdown | 4.132 | 3.123 | 1.998 | 0.129 | 37.50 |
| 21 — Late engine fade | 1036003 | 0.4 | Touchdown | 1.018 | 3.183 | 1.857 | 0.086 | 36.00 |
| 22 — Blackout rendezvous | 797010 | 0 | Hard landing | 9.097 | 3.663 | 2.079 | 0.105 | 35.00 |
| 22 — Blackout rendezvous | 1046394 | 0.4 | Hard landing | 5.313 | 3.644 | 3.764 | 0.050 | 36.30 |
| 23 — Last-call recovery | 807401 | 0 | Touchdown | 10.894 | 3.442 | 2.509 | 0.094 | 39.15 |
| 23 — Last-call recovery | 1056785 | 0.4 | Touchdown | 5.342 | 3.280 | 1.549 | 0.083 | 40.05 |

For each stored touchdown, the calculator checks the original strict error-radius, vertical-speed <3.6 m/s, lateral-speed <3 m/s and tilt <0.2 rad bounds and failure reason precedence. Original physical success also requires absolute yaw rate <0.3 rad/s, but yaw rate is not stored; the audit cannot independently verify that value. The [failure-constraint table](ground-all-training-failure-constraints.json) records every failed final case and every violated stored touchdown bound, including additional violations hidden by the original reason priority. Non-contact termination and timeout records are retained. There are no training trajectories to reintegrate, so no new physical validation is claimed.

The historical tested-runtime subset is not transitively complete: dist/engine.js, dist/signals.js, dist/visual-lesson.js are not archived in it. Existing pinned source/graph/native hashes and completed metadata are verifiable; present-day contents cannot retroactively certify those absent historical imports. This limitation is retained explicitly. No flight, neural recurrence, parameter fitting or repository edit was performed by this audit.

Only this audited completed GEN6 entered the [separately frozen selection plan](ground-all-selection-plan.json). The plan binds 96 new starts across all 24 ground missions, candidate normal/covered/disabled-indicator conditions, and the intact release on normal inputs: 384 full flights. Every mission has two nominal and two variability-0.4 starts per condition. All five gates must pass: overall superiority over the release; retention of its original-four and released-ten landing counts; and superiority over each sensory control. This seed and numeric protocol were frozen before selection, after the earlier training plan. Both original processes completed successfully and the independent audit retained all 384 outcomes. Four gates pass, but released-ten retention fails; this candidate does not advance to fresh unseen JavaScript final testing or deployment. The [complete comparison](ground-all-selection.md) retains all mission counts and failures. The complete training audit values and source identities remain in the [machine-readable training report](ground-all-training-results.json).

Plan SHA256: a2bbcdb88c05548a4cb2fcf02c493d896ed4ded98839431f79d9f826db5666d2.

Completed ledger SHA256: 2a4cafd077b063e4c5a3e4d8e14d11beb01a6f59797d52582826d8313d85d184.

Completed state SHA256: 0a18fa8a1fc85fe8b414274c96b918ebd8f6fc79bdaafc237d18ab2a1a81d31d.

Final candidate SHA256: a1a2f0a25316fc26b77b7c0f1eaf92e01a921faee1fba546996b5114cc7a0fde.
