# Learning the first landing

This page records the earlier stationary-deck checkpoint. The current
[mission-suite checkpoint](suite-training.md) adds steering and stabilization
and has separate tests across four missions.

The frozen generation-9 checkpoint made **6 safe landings in 24 unseen starts**:
5/12 under nominal conditions and 1/12 with variability 0.4. The earlier
visual-orientation checkpoint made 0/24 on the same starts with the updated
optics. The new checkpoint made 0/24 with its eyes covered and 0/24 with the
landing indicators disabled. This is a first landing result with limited
reliability, not mastery of the mission.

The six successful touchdowns had vertical speeds from 1.27 to 3.45 m/s,
below the unchanged 3.6 m/s limit. All 18 failures are included in the report.
The training search selected 5/6 safe starts in generation 9; a separate
six-flight model-selection check achieved 3/6.
Weights were frozen before that final test and were not adjusted afterward.

Automatic odor release produced the same 6/24 landing count and the same
success/failure assignments. The release rule fired once in just one flight
(ethyl acetate; relative peak exposure 0.7). This mostly inactive control does
not establish whether a suitably delivered odor could help. Its stimulus audit
replayed recorded commands and verified every recorded height, speed and time;
landing outcomes came from the original full-network flights.

This curriculum trains the complete-connectome controller on the stationary
Landing school deck. The fly sees a camera image and two explicit light
indicators on its center monitor. Indicator brightness represents measured
clearance (0–150 m above touchdown) and vertical speed (−25 to +25 m/s).
These are visual instrument readings that could be displayed in a physical
apparatus. They do not specify a throttle setting or a target trajectory.

The indicators pass through the same screen geometry, two modeled eyes and
annotated photoreceptors as the camera image. Each retinal pixel averages a
4×4 grid of rays. The 1,558 neural input channels remain 1,536 eye pixels and
22 body/odor signals. No numerical position or velocity channel was added.

Every decision evaluates all 166,700 retained neurons and 25,582,938 directed
connections twice. A single 21,300-weight motor readout supplies the commands.
There is no instrument-trained pilot supplying actions. The anatomical graph,
synaptic contact counts and neurotransmitter signs remain fixed.

## Training and evaluation

1. Eighteen exploration flights vary only the throttle output bias and collect
   1,275 complete-network activity samples. This data collection stops at 20 s
   when necessary; censored exploration trajectories are not landing results.
   A separate calibration bench adds 512 samples from 256 presentations with
   independently varied indicator brightness, camera backgrounds and body
   feedback. These presentations reduce confusion between the two lights.
2. A regularized linear fit learns to recover the two presented indicator
   brightnesses and body feedback from the 2,129 descending/motor activities.
   Four entire trajectories and one fifth of the independent presentations
   are reserved for choosing regularization. The
   fitting targets come from the displayed pixels and physical body signals.
3. Cross-entropy search tunes the throttle policy using complete-flight reward.
   Each candidate is tested on six starts: four repeated starts and two new
   starts per generation. The search includes coarse and fine changes.
   Its proposal covariance learns which decoder coefficients need to change
   together, using rewards from evaluated candidates.
   Checkpoint selection prioritizes safe landing count, then reward.
4. The learned sensory basis is folded into the ordinary motor readout. It adds
   no runtime state estimator or second controller. Pitch, roll, yaw, fins and
   gaze remain neutral for this first lesson; the single-engine selector stays
   fixed. The vehicle still runs the ordinary six-degree-of-freedom physics.
5. Model-selection flights and final-test flights use separate seeds. Final
   tests keep the checkpoint fixed and pair normal input with covered eyes,
   disabled landing indicators and automatic odor release. Every final flight
   runs to the simulator's own termination condition.

A safe touchdown requires position error below 11 m, vertical speed below
3.6 m/s, lateral speed below 3 m/s, tilt below 0.2 rad and yaw rate below
0.3 rad/s. These limits and the 65 s mission duration are unchanged.
The nominal starting positions, heights and entry speeds are unchanged.
Half of the final starts use variability 0.4, which varies the relevant mass,
thrust and actuator parameters. The embodied sensor renderer does not add
independent observation noise.

The [archived landing report](assets/first-landing-report.json) records the frozen
checkpoint hash, every test seed, each outcome, sensory controls and the scope
of the result. The [archived checkpoint](assets/first-landing-checkpoint.json)
is the earlier model tested here. The app's **Perceiving fly** option now uses
the separately tested mission-suite checkpoint. **My trainee** preserves the
user's separate local checkpoint.

## Reproduction

From the repository root, with Node and a Python environment containing NumPy:

```sh
node scripts/collect-landing-features.mjs
node scripts/collect-independent-lights.mjs
python3 scripts/fit-landing-basis.py
node scripts/train-landing.mjs
cp artifacts/landing-training/candidate.json artifacts/landing-training/frozen-candidate.json
LANDING_CHECKPOINT=artifacts/landing-training/frozen-candidate.json node scripts/test-landing.mjs
node scripts/summarize-landing.mjs
npm run check
```

The experiments used NumPy 2.4.6. The scripts retain calibration records,
candidate trials, selection histories and final trajectories under
`artifacts/landing-training/`. `train-landing.mjs --resume` continues a saved
search. A SIGINT finishes the current generation before stopping.
`LANDING_CHECKPOINT` selects a frozen checkpoint for `test-landing.mjs`.
The summarizer checks that the checkpoint hash matches all completed paired
tests before copying that checkpoint and its measured report into the app.

Earlier experiments are retained separately: point-sampled camera input,
camera-brightness features and camera-only range/speed estimation. They produced
isolated training landings but did not establish reliable camera-only control.
One intermediate search used a 30 s training cutoff; that cutoff was removed.
It is not part of the final training or evaluation procedure above.

## What this demonstrates

The result concerns an external decoder learned around a complete anatomical
graph, with visible instrument stimuli. It does not demonstrate camera-only
navigation, learning inside the biological synapses, a predictive muscle model,
or transfer to a living fly. A practical measurement of movement and a calibrated
movement-to-control mapping are still required for a physical apparatus.
Chemical assistance remains a separate hypothesis. See the
[physical interface assessment](physical-fly-interface.md) for the odor and
spiking-model experiments and their limitations.

The other 26 missions, including steering, moving decks, faults and orbital
flight, remain outside this first landing lesson's demonstrated scope.
