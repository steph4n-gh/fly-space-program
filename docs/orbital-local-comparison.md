# Testing smaller orbital proposals

The [completed 588-flight ranking experiment](orbital-progress-comparison.md)
retained its initial controller in all four generations. All 41 stochastic
proposals lost to that controller. Before changing another reward or
comparator, this experiment asks whether smaller parameter changes preserve
more useful behavior around the same starting point.

**Status:** both original training processes were observed live when launched
on 14 September 2026 at 13:39 UTC. This is a dated launch observation, not a
claim that training or evaluation has completed. No outcome is inferred from
the plan or partial process output.

## One experimental difference

Both arms start from the frozen generation-eight controller, use the same
13 active directions and 15 fixed coordinates, and draw the same random
perturbation directions. The **standard** arm uses the original initial
sigma vector. The **quarter** arm multiplies it by 0.25. The original
candidate-index multipliers, fitness, comparator, flight physics and
completion conditions stay the same.

| Stage | Per arm | Both arms |
| --- | ---: | ---: |
| One generation, twelve candidates, six complete training cases each | 72 flights | 144 flights |
| Fixed selected controller on six matched fresh comparison cases | 6 flights | 12 flights |
| Entire prescribed experiment | 78 flights | **156 flights** |

Training reuses the earlier experiment's generation-one cases. The six
comparison seeds are disjoint within the inspected configuration archive.
This is a paired development experiment, not an independent reliability or
release test.

## What will be checked

A standalone prelaunch arithmetic check reconstructed both complete
populations and all shared draws. It passed 49,637 checks: the standard
initialization matches the unchanged trainer's default route; both initial
controllers decode to the same 21,300 weights; and quarter-arm displacements
before adding the mean are exactly one quarter of the standard arm's.
Small rounding residuals in subsequent parameter subtraction are retained.

After both original training processes exit successfully, a separate
arithmetic audit must check all 144 stored endpoints, 24 candidate vectors,
full rankings, optimizer updates and selected weights. Only then may the
fixed generation-one winners run their six comparison cases. No fallback
candidate, extra evaluation or post-comparison selection is prescribed.

The descriptive comparison will show all eleven matched stochastic
proposals: whether they retain the initial controller's primary milestone
key, whether they have positive conditional-periapsis progress, and whether
both conditions hold. Every failure and ineligible case remains in the
report. Full comparison traces are retained, but this plan does not include
physical replay or independent reconstruction of every trajectory step.

Smaller changes, better reward or positive periapsis progress do not replace
stable insertion, a complete orbit or a safe landing. No model promotion
follows from this experiment alone.

## Records

The [frozen proposal](orbital-local-comparison-plan.json) preserves all cases,
parameters and the 72-file runtime map. It is the original prospective
document, so its historical “not implemented” wording is superseded by the
launch status above. The [launcher](../scripts/run-orbital-local-comparison.py)
verifies the prepared states, runtime, clean environment and pinned Node
before execution. Complete local preparation and process receipts live at
`artifacts/suite-training/orbital-local-proposal-comparison`; see
[archive availability](reproducibility.md#files-included-and-excluded).

Execution-plan SHA-256:
`c8265282a8c6384e2716e2b090fcd0c8682e35053c2ea4f2e0f3eb5b451a46a0`.
Reviewed launcher SHA-256:
`174684d31ff03b6359e128530976b6f68c228bb763198ee9d096601b56d209e4`.
