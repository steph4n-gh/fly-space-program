# Fly Space Program

A fruit fly connectome controls a stylized 3D booster returning to a moving ocean platform. The crew pod, expressive fly, cockpit instruments and ocean are drawn with Three.js. A separate worker runs the complete retained MaleCNS graph and supplies every automated control command.

## Run

```sh
npm start
# http://localhost:4173
```

Flight starts after the complete graph loads. Eight missions progress from calm landing school to storms, a jammed fin, reduced center-engine thrust and combined faults. Missions 07 and 08 select separate output-weight checkpoints. “Fly with flair” adds a turn target and enables a recovery-gated style bonus. Turn it off for a recovery-only assignment. The academy advances after three consecutive safe landings.

Train the fly runs complete graph-driven candidate flights on this device. Each completed generation saves a local checkpoint; Save brain exports it. The v4 storage key preserves earlier small-controller checkpoints separately. Training is deliberately slower than the earlier 96-cell implementation.

Chase, Wide, Deck and Pod cameras show the flight; drag to orbit or scroll to zoom. Fly’s view looks through the cockpit from the pilot’s head. Expressions and radio jokes are cosmetic reactions, not evidence of feelings or intentions. Controls have bounded travel rates, and inverse kinematics places limbs on them; individual limb joints are not learned.

Drag the anatomical atlas to orbit, scroll to zoom and select a neuron to inspect its source ID, type and activity. Keyboard arrows rotate; plus/minus zoom. Whole CNS reveals the nerve cord. Spotlight selects all 2,129 output cells. Pulse injects eight recurrent passes of excitation into the selected neuron. Gust, fin and engine buttons perturb the simulated flight.

Human controls: W/S throttle; arrows or A/D attitude jets; Q/E yaw; IJKL gimbal; Z/C and U/O fins. On-screen controls include throttle, attitude buttons, engine-bank selection and gaze. Human mode takes direct control and holds the graph atlas; the automated decision inspector is disabled.

## The actual controller

Every automated decision runs **two complete recurrent passes over 166,700 neurons and 25,582,938 directed connections**, then reads activity from **all 1,314 confirmed descending neurons and 815 annotated motor neurons**. There is no separate 96-cell pilot, motor-state override or frozen-feedback shortcut in the active flight/training path.

Nineteen engineered numerical inputs drive 17,937 sensory-annotated neurons with a deterministic channel/polarity mapping. Inputs encode body-frame lateral errors and velocities, tilt/rates, a stopping-distance descent cue, altitude, instrument memory, unwrapped heading relative to the turn target, yaw rate and style preference. Body-frame cues let the landing task remain consistent as the vehicle turns. These are engineered features, not learned pixel vision. Looking left samples fuel; looking right samples engine health. Other cues remain available.

For neuron i, each pass computes tanh(0.05 × previous rate + signed incoming signal × 0.55 / incoming contact count + sensory drive). Sensory drive is 0.7 × tanh(0.15 × input), with an assigned polarity. Synapse counts and transmitter-derived signs come from the retained graph. Acetylcholine is excitatory; GABA/glutamate are inhibitory under this simplified rule; unknown/other transmitters default to excitatory. No spikes, receptor-specific signs or detailed cell physiology are modeled.

Each of ten commands is tanh of a learned weighted sum of the 2,129 output rates and a bias: **21,300 trainable output weights**. The graph’s individual anatomical synapse counts and signs remain fixed. All retained cells and edges are evaluated, including cells without displayed coordinates; connectivity determines which activity can eventually reach an output.

A decision is followed by exactly three 50 ms physics steps. Live flight, offline evaluation and every training candidate use this same sequence. Playback speed changes wall-clock waiting, not model timing or skipped graph passes. If computation is slower than the requested playback rate, flight slows down. The atlas receives the same activity used for control. Its reported decisions/s measures computation throughput, not biological time.

## Recovery and style

Safe touchdown requires radial deck error <11 m, vertical speed <3.6 m/s, relative lateral speed <3 m/s, tilt <0.2 rad and yaw rate <0.3 rad/s. Safe landings earn 100 points plus remaining-fuel credit. Flight penalties cover position, speed, tilt, time, fuel use and stale readings.

Flair enables a one-turn target, relative to the starting heading. The capped **25-point style bonus** requires:

- Roughly 360° of net yaw travel (0.2 rad completion tolerance), without the pre-completion altitude dropping below 30 m, tilt exceeding 0.4 rad or yaw rate exceeding 2.8 rad/s.
- At least 0.6 seconds of recovered attitude, low rotation rates and lateral speed above 12 m altitude.
- A subsequent safe landing. Crashes always earn zero style points.

Oscillations do not accumulate net turns, and repeated turns never multiply the bonus. The label distinguishes pending progress, lost eligibility, recovered turns and a banked landing bonus. Yaw penalties are small at altitude and stronger near touchdown. The first supported flourish is an upright yaw turn; this is not a learned aerobatic repertoire.

## Learning and evidence

The shipped readouts were initialized by ridge-fitting 2,400 independent synthetic telemetry/history samples through the full graph. Targets came from historical reward-trained landing policies, with a yaw-target demonstration rule. The historical 96-cell teacher is an **offline initialization source**; it is not called by the live controller or reward trainer. This is supervised transfer followed by full-graph reward search, not training from scratch or evidence that a biological fly learned to fly a rocket.

Reward training perturbs every output weight in paired positive/negative directions. Incumbent and both candidates each fly the same two seeds through the complete graph. More safe landings take priority; ties are resolved by mean shaped reward, including style only after successful recovery and landing. Rejected candidates leave weights unchanged. The chart shows these small training batches, not an independent learning curve. A separate 24-flight evaluation across all eight missions produced **17 safe landings and 14 banked style bonuses**. Atlantic return landed 3/3; night and engine-fault missions remain unreliable. Final evaluation results, seeds, failures and checkpoint lineages are recorded in `dist/assets/full-pilot-report.json`; the app links this report.

The actual graph, readout and training interfaces are an experimental model, not a biologically validated emulation or a demonstrated advantage over simpler/shuffled networks. There is no language model in the control loop.

## Exact decision inspection

The inspector records all 19 numerical inputs immediately before the worker decision, physical context, ten commands and actuator targets. It separates sampled readings from current actuator positions and remembered instrument readings from simulator truth. Raw values are rounded visually, with full precision in tooltips and the read-only `get_control_decision` browser tool.

Pause & inspect replays the complete graph using the exact pre-decision recurrent state, weights and pulse state. Each replay sets just one encoded input to zero. The signed effect is actual command minus replay; these isolated interventions are not additive or physical-world counterfactuals. An additional replay resets graph history. A baseline replay is compared against the actual command and the error is displayed. Diagnostic replays restore all live state and do not advance flight. Live view displays exact commands and readings; input effects remain blank until calculated while paused.

## Data and anatomy

MaleCNS v1.0 is from [HHMI Janelia FlyEM, Cambridge/MRC LMB and Google Research](https://male-cns.janelia.org/). Source data retains [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); application code is MIT licensed.

The retained graph contains **166,700 annotated non-glial neurons, 25,582,938 directed neuron pairs and 124,177,617 synaptic contacts**. All edges between retained annotated neurons are included without a weight cutoff. Unresolved objects and glia are excluded; exact counts and source hashes are in the manifest.

The atlas draws **3,487,943 measured synaptic endpoints** and soma fallbacks, using a deterministic one-in-128 coordinate sample plus a measured anchor per located neuron. This drawing sample does not prune computation. These are anatomical points, not complete skeletons. 166,579 neurons have positions; 121 participate without invented locations. Historical small circuits and reports remain as transfer provenance, not active-controller validation.

The first visit downloads approximately 91 MB of graph/anatomy. A graph worker uses roughly 160 MB plus state; training loads a second graph worker. The anatomical renderer uploads about 56 MB of coordinates. Decompression and browser/GPU allocations add overhead. WebGL 2 and native gzip decompression are required. A loading failure stops automated flight with a visible error.

The vehicle uses game-scale translation/rotation, thrust, gravity, fuel-dependent mass, drag, fin torque, crosswinds and moving deck dynamics. Only the center engine and opposing auxiliary pair are selectable for these descent lessons. It is not a flight-qualified Falcon model. Night lighting affects the spectator view, while numerical cues remain available.

## Reproduce

Source URLs, sizes and SHA-256 hashes are pinned in `scripts/source-lock.json`. Four original source files total approximately 7.9 GB and remain outside Git. Python data generators require numpy, pandas and pyarrow. Existing compressed graph/anatomy artifacts are sufficient to run the app or reproduce training.

```sh
node scripts/calibrate-full.mjs
.venv/bin/python scripts/fit-full.py
node scripts/train-full.mjs 1 5
node scripts/train-full.mjs 6 2
node scripts/train-full.mjs 7 2
node scripts/evaluate-full.mjs 3 4430
node scripts/report-full.mjs
node scripts/check-full-network.mjs
node scripts/check-decision.mjs
```

Calibration uses `/tmp/fly-full` for large temporary matrices. The fit writes the three full-controller checkpoints; rerunning it replaces their learned weights/counters. The first reward generations used 0.12 perturbation scale and later generations use 0.015; the report records that lineage. Exact reproduction requires those scales at the recorded generation boundary. Changing the model or calibration invalidates previous evaluations.
