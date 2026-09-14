# Testing progress toward the missing periapsis condition

The [paired diagnostic](orbital-joint-paired.md) found zero insertion time in
all twelve trips. Even when apoapsis and radial speed met their original
limits, periapsis remained below 248 m; it must exceed 800 m. The final
controller improved the old shaped score at a low altitude without meeting
that requirement.

This experiment compares two outcome rankings from the same frozen controller.
Both use the same 13 learned throttle/pitch directions, sensory basis,
166,700 neurons, 25,582,938 directed connections and two recurrent updates per
decision. The physics, flight endpoints, original milestones and success
criteria remain unchanged. All action commands still come from the learned
readout of neural activity.

## The single change

Both arms record two additional physical outcome measures after every original
physics step:

- **H:** longest consecutive time satisfying periapsis >800 m,
  |apoapsis − destination| <200 m and |radial speed| <5 m/s, capped at three
  seconds and divided by three. Any failing step resets the consecutive time.
- **P:** greatest finite periapsis among steps satisfying the original
  apoapsis and radial-speed limits. Clamp that value to [−6000, 800] m, add
  6000 and divide by 6800. With no eligible step, P is zero. The lower bound
  is the existing planet radius below the surface, and the upper bound is
  the existing periapsis requirement.

The control arm ranks candidates by the current landing count, original
milestones and fitness. The experimental arm preserves landings and the same
milestone order first, then compares mean H, mean P and existing fitness in
that order. Every failed flight contributes to the means. No new reward
weight, command schedule or sensory input is introduced. Both arms retain the
old rolling quality, original reward and fitness separately.

H measures sampled physical hold time. P can improve through a brief eligible
crossing and cannot establish insertion by itself. Neither measure changes
the simulator's phase or success flags.

## Frozen comparison

Both arms start from the final generation-eight joint controller with fresh
optimizers at the original proposal scales. Each runs four generations of
12 candidates on six complete trips: one nominal and one variability-0.4 case
for each orbital mission. That is **288 training trips per arm, 576 total**.
They share the same fresh proposal seed and original changing-case rule;
earlier training cases can recur.

After training, the selected generation-four candidate from each arm receives
the same six new normal-vision cases, with one nominal and one varied start
per mission. These **12 comparison trips** retain complete trajectories for
independent replay. The entire prescribed budget is **588 complete flights**.
No earlier-generation fallback, additional restart or comparison-based
coefficient replacement is allowed.

Both training arms launched on September 14, 2026. Before launch, independent
checks verified the numerical measures, fixed inputs and launch wiring. An
instrumented replay of all twelve existing diagnostic flights exactly matched
all 23,225 retained physical steps and every endpoint. These checks establish
instrumentation consistency; they supply no additional successful flights.

The frozen plan and launcher pin the complete 72-file runtime, graph assets,
native build, initial coefficients, environments, cases and analysis rules.
The plan is in the [training record](suite-training-progress.json). A plan
alone is not evidence that either process is running or has completed.

## How results will be interpreted

Every paired result will be reported, starting with original stable-orbit,
complete-orbit, return and landing milestones, followed by strict hold time,
conditional periapsis, old fitness, fuel and failed endpoints. An improvement
in P without qualifying hold still represents failed orbital capability.
This small development comparison does not qualify a release; independent
JavaScript testing remains necessary for any future capability claim.

The eligibility gate is discontinuous, a best-P crossing may be brief, and
averaging can trade progress between missions. One optimizer seed and six
comparison cases cannot establish general optimizer superiority. This change
also leaves the unbound-tail plateau and retention of an earlier best value
intact. It tests the demonstrated periapsis bottleneck while keeping the
controller's available directions fixed.

Implementation: `scripts/insertion-progress.mjs`, the shared
`scripts/train-suite.mjs`, and `scripts/run-orbital-progress-comparison.py`.
The experiment archive retains the independent design review and immutable
inputs under `artifacts/suite-training/orbital-progress-comparison`.
