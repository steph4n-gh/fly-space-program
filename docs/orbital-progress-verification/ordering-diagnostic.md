# Completed orbital training: why both orderings stayed identical

All counts below are per arm. Every matched result object and optimizer state was exactly equal across the two arms, so each table of 48 candidate slots applies to both; the candidate CSV explicitly retains all 96 arm/candidate rows.

**H never distinguished a candidate: all 48 candidate means and all 288 flight H values were zero. P did distinguish candidates inside primary ties, but every such preference agreed with the original fitness order.** Across 264 unordered candidate pairs, the primary landing/milestone keys decided 156 before H/P; H/P stayed tied for 75; P distinguished 33 and agreed with fitness in all 33. There were no ordering conflicts, so all four full orders and top-three elite sets stayed identical.

These are exhaustive logical pair counts, not observed JavaScript sort call counts. For a primary-different pair, the comparator returns before H/P. Primary is ordered as: landings, Final approach, Atmospheric entry, Deorbit, One full orbit, Stable orbit, Space, Launch.

Of the 156 primary-decided pairs, 40 had different P values. In 11 of those 40, P would favor the candidate with worse primary keys, but the comparator could not reach P for that pair. This is distinct from the 33 P preferences inside primary ties, all of which agreed with fitness.

| Generation | Primary decides | H/P tied, fitness decides | P distinguishes and agrees | Initial slot | Initial P | Initial fitness | Stochastic tied/worse primary |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 51 | 12 | 3 | 0 | 0.763603138622 | 208.305174236386 | 3/8 |
| 2 | 47 | 12 | 7 | 1 | 0.917568745163 | 211.282527231861 | 4/6 |
| 3 | 29 | 22 | 15 | 1 | 0.917035008153 | 213.603331317521 | 7/3 |
| 4 | 29 | 29 | 8 | 1 | 0.916949801148 | 215.632372617495 | 7/3 |

The initial controller beat every stochastic proposal. Of 41 stochastic proposals, 20 had worse primary keys and 21 tied the initial controller on primary keys; all 21 had lower P and lower original fitness. The three updated means also tied on primary keys and had lower P and fitness. Thus the initial controller won with either comparator in every generation.

Only three stochastic proposals had positive mean P. Generation 2 candidates 8 and 10 used scale 1.4 around the updated mean; they reached Space on 0/6 and 3/6 flights respectively, so neither could challenge the initial controller’s 6/6 primary Space count. Generation 3 candidate 9 used scale 0.4 around the incumbent and tied its 6/6 Space and Launch counts. Its P was 0.9163432351243291 versus 0.9170350081534525, and its fitness was 209.21226268459756 versus 213.60333131752074. This was a real competitive proposal, but both criteria preferred the initial controller.

Eligibility was sparse: 38/288 flights had an eligible conditional-periapsis observation. The four initial/incumbent slots supplied 23 eligible flights; the three positive-P stochastic proposals supplied the other 15. The remaining 250 flights were ineligible, and 38/41 stochastic proposals had P=0. No flight accumulated strict insertion hold. H/P supplied no preference against the existing order in this realized population.

The proposal mix was 21 stochastic steps at scale 0.4 and 20 at scale 1.4, plus the initial slot, three incumbent repeats, and three updated means. All 41 stochastic vectors were distinct, differed from the initial controller, and changed all 13 active coefficients. The 15 fixed coefficients stayed fixed. Among 48 slots there were 45 unique parameter vectors; the sole repeated vector was the intentionally retained initial/incumbent controller.

The frozen proposal and decode code have no coefficient bounds or clipping, so parameter-bound collisions are not an applicable explanation. The sigma minimum, covariance regularizer, and Cholesky floor control distribution arithmetic. Sigma for coefficient 19 reached its 0.16 floor only in the update after generation 4; no other active sigma reached its floor. The correlated proposal branch draws from covariance, and that final update happened after all 48 candidates had already been evaluated. This does not assess action saturation inside flight dynamics.

The demonstrated constraint is that the added criterion produced no preference conflict inside the primary ties. A later experiment intended to change selection needs training evidence that its proposed signal varies among candidates competitive on the primary keys and sometimes favors a different elite than the existing fitness. That is a design implication, not a tested remedy; these four generations do not establish a general failure to learn.

Complete primary tie groups are below. The first six primary entries (landings through Stable orbit) are zero for every candidate, so Space/Launch are the only varying primary entries. Candidate indices are zero based.

| Generation | Space/Launch | Candidate group | Original fitness order | Distinct H | Distinct P | P distinguishing pairs |
| --- | --- | --- | --- | --- | --- | ---: |
| 1 | 6/6 | [0,5,8,11] | [0,11,8,5] | [0.0] | [0.0,0.7636031386215322] | 3 |
| 1 | 4/6 | [2] | [2] | [0.0] | [0.0] | 0 |
| 1 | 0/6 | [1,3,9,10] | [9,10,3,1] | [0.0] | [0.0] | 0 |
| 1 | 0/0 | [4,6,7] | [4,6,7] | [0.0] | [0.0] | 0 |
| 2 | 6/6 | [0,1,2,5,7,11] | [1,2,0,11,7,5] | [0.0] | [0.0,0.917568745162835] | 5 |
| 2 | 3/6 | [10] | [10] | [0.0] | [0.46489938852012197] | 0 |
| 2 | 0/6 | [3,8,9] | [8,3,9] | [0.0] | [0.0,0.9099278581306843] | 2 |
| 2 | 0/0 | [4,6] | [4,6] | [0.0] | [0.0] | 0 |
| 3 | 6/6 | [0,1,2,4,5,6,7,9,11] | [1,9,6,5,2,4,0,11,7] | [0.0] | [0.0,0.9163432351243291,0.9170350081534525] | 15 |
| 3 | 0/6 | [3,10] | [10,3] | [0.0] | [0.0] | 0 |
| 3 | 0/0 | [8] | [8] | [0.0] | [0.0] | 0 |
| 4 | 6/6 | [0,1,2,5,7,8,9,10,11] | [1,2,9,11,10,8,0,7,5] | [0.0] | [0.0,0.9169498011477558] | 8 |
| 4 | 0/6 | [3] | [3] | [0.0] | [0.0] | 0 |
| 4 | 0/0 | [4,6] | [4,6] | [0.0] | [0.0] | 0 |

The old fitness order equals H/P-then-fitness order in every group. Full candidate metrics, original-score and hold-reward contributions, all 28 coefficients, proposal centers/scales, and every logical pair comparison are in the CSV/JSON files beside this report. The original fitness accumulates total = total + 0.1 × score + insertion-hold reward - touchdown penalty in flight order, then divides by the six flights; touchdown penalty is zero because every training flight failed. Separately rounded means need not sum bit-for-bit to that ordered computation.

Inputs are SHA-256 checked against the completed training audit and frozen plan. No evaluation or ground output was read. No proposals, neural runs, physical runs, reward changes, or fits were performed.
