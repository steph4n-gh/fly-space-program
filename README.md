# Fly Space Program

A fruit fly connectome controls a stylized 3D booster returning to a moving ocean platform. The crew pod, expressive fly, cockpit instruments and ocean are drawn with Three.js. A separate worker runs the complete retained MaleCNS graph and supplies every automated control command.

## Run

```sh
npm start
# http://localhost:4173
```

Flight starts after the complete graph loads. The default mission is a complete round trip: launch from a barge, reach a stable orbit, complete at least one revolution, deorbit, enter the atmosphere and land back on the barge. Auto pace runs orbit at 4× and the final approach at 1× for a roughly 2–3 minute viewing experience on a capable device. The 27 mission profiles also include short landing lessons, moving deck patterns, wind shear, fuel limits, delayed controls, spinning entries and combined faults. Center-engine, reduced-thrust, engine-out and orbital assignments use separate learned readouts. “Fly with flair” adds a turn target and enables a recovery-gated style bonus. Turn it off for a recovery-only assignment. The academy advances after three consecutive safe landings.

Train the fly runs complete graph-driven candidate flights on this device. Each completed generation saves the trainee for its engine/mission family; Save brain exports the selected checkpoint. Storage uses `fly-space-program-brains-v5` and migrates a compatible earlier full-network trainee without deleting it. Training is deliberately slower than the earlier 96-cell implementation.

Chase, Wide, Deck and Pod cameras show the flight; drag to orbit or scroll to zoom. Fly’s view looks through the cockpit from the pilot’s head. Expressions and radio jokes are cosmetic reactions, not evidence of feelings or intentions. Controls have bounded travel rates, and inverse kinematics places limbs on them; individual limb joints are not learned.

Drag the anatomical atlas to orbit, scroll to zoom and select a neuron to inspect its source ID, type and activity. Keyboard arrows rotate; plus/minus zoom. Whole CNS reveals the nerve cord. Spotlight selects all 2,129 output cells. Pulse injects eight recurrent passes of excitation into the selected neuron. Gust, fin and engine buttons perturb the simulated flight.

Human controls: W/S throttle; arrows or A/D attitude jets; Q/E yaw; IJKL gimbal; Z/C and U/O fins. On-screen controls include throttle, attitude buttons, engine-bank selection and gaze. Human mode takes direct control and holds the graph atlas; the automated decision inspector is disabled.

## The actual controller

Every automated decision runs **two complete recurrent passes over 166,700 neurons and 25,582,938 directed connections**, then reads activity from **all 1,314 confirmed descending neurons and 815 annotated motor neurons**. There is no separate 96-cell pilot, motor-state override or frozen-feedback shortcut in the active flight/training path.

Nineteen engineered numerical inputs drive 17,937 sensory-annotated neurons with a deterministic channel/polarity mapping. Inputs encode body-frame lateral errors and velocities, tilt/rates, a stopping-distance descent cue, altitude, instrument memory, unwrapped heading relative to the turn target, yaw rate and style preference. Body-frame cues let the landing task remain consistent as the vehicle turns. These are engineered features, not learned pixel vision. Looking left samples fuel; looking right samples engine health. Other cues remain available.

For neuron i, each pass computes tanh(0.05 × previous rate + signed incoming signal × 0.55 / incoming contact count + sensory drive). Sensory drive is 0.7 × tanh(0.15 × input), with an assigned polarity. Synapse counts and transmitter-derived signs come from the retained graph. Acetylcholine is excitatory; GABA/glutamate are inhibitory under this simplified rule; unknown/other transmitters default to excitatory. No spikes, receptor-specific signs or detailed cell physiology are modeled.

Each of ten commands is tanh of a learned weighted sum of the 2,129 output rates and a bias: **21,300 trainable output weights**. The graph’s individual anatomical synapse counts and signs remain fixed. All retained cells and edges are evaluated, including cells without displayed coordinates; connectivity determines which activity can eventually reach an output.

A decision is followed by exactly three physics steps: 50 ms for ordinary flights and the low-altitude portion of orbital missions, 250 ms above 250 m in orbital missions. Live flight, offline evaluation and every training candidate use this same sequence. Playback speed changes wall-clock waiting, not model timing or skipped graph passes. If computation is slower than the requested playback rate, flight slows down. The atlas receives the same activity used for control. Its reported decisions/s measures computation throughput, not biological time.

## The orbital program

The orbital world has a **6,000 m radius** and gravitational parameter **9.81 × radius²**. This intentionally compresses orbital distances and periods; it is not an Earth/Falcon trajectory model. Dynamics integrate radial and tangential velocity with inverse-square gravity, centrifugal and curvature terms, drag below an 800 m atmospheric boundary, thrust, fuel use, actuator travel and a simplified attitude/cross-track response. The barge remains at the same geographic point; the next whole-turn coordinate identifies the same landing site. The rocket does not teleport between stages.

Insertion requires a bounded orbit above the atmosphere and a three-second stable hold. The revolution counter starts after insertion. Deorbit is gated on a complete revolution, then waits for the barge interception window; successful flights can coast beyond the required one revolution. Returning early cannot earn mission success. A complete mission must pass launch, space, stable orbit, full revolution, deorbit, entry and safe touchdown. Orbit conservation and milestone ordering have separate tests.

**Orbital mission guidance is engineered.** It supplies radius/velocity targets, attitude errors and an explicit thrust cue derived from simulator state. The same full connectome computes the ten actuator commands; guidance never substitutes an action vector or overrides output-cell activity. The orbital readout is initialized from synthetic full-graph samples and on-policy demonstrations of guidance tracking, then reward-trained with complete round-trip rollouts. This is a trained neural motor controller following mission guidance, not a learned orbital mission planner or training from scratch. The inspector labels orbital cues separately, including the thrust cue’s log-odds encoding.

Rocket and limb motion are interpolated in a timestamped presentation buffer. Rendering follows `requestAnimationFrame`; no interpolation enters the sensors, physics or rewards. The atlas redraws only after activity, camera or configuration changes, and offscreen 3D views skip rendering. Measured FPS and simulation pace appear in the flight feed. The display may trail authoritative telemetry briefly; pausing aligns the rendered pose with the current actuator state.

## Recovery and style

Safe touchdown requires radial deck error below the profile’s limit (normally 11 m; precision profiles use 7 or 8 m), vertical speed <3.6 m/s, relative lateral speed <3 m/s, tilt <0.2 rad and yaw rate <0.3 rad/s. Safe landings earn 100 points plus remaining-fuel credit. Flight penalties cover position, speed, tilt, time, fuel use and stale readings.

Flair enables a one-turn target, relative to the starting heading. The capped **25-point style bonus** requires:

- Roughly 360° of net yaw travel (0.2 rad completion tolerance), without the pre-completion altitude dropping below 30 m, tilt exceeding 0.4 rad or yaw rate exceeding 2.8 rad/s.
- At least 0.6 seconds of recovered attitude, low rotation rates and lateral speed above 12 m altitude.
- A subsequent safe landing. Crashes always earn zero style points.

Oscillations do not accumulate net turns, and repeated turns never multiply the bonus. The label distinguishes pending progress, lost eligibility, recovered turns and a banked landing bonus. Yaw penalties are small at altitude and stronger near touchdown. The first supported flourish is an upright yaw turn; this is not a learned aerobatic repertoire.

## Learning and evidence

The landing readouts were initialized by ridge-fitting 2,400 independent synthetic telemetry/history samples through the full graph. Targets came from historical reward-trained landing policies, with a yaw-target demonstration rule. The historical 96-cell teacher is an **offline initialization source**; it is not called by the live controller or reward trainer. This is supervised transfer followed by full-graph reward search, not training from scratch or evidence that a biological fly learned to fly a rocket.

Reward training tests paired positive/negative changes to every output weight, combining a correlated gain change per control with small independent coefficient noise. Incumbent and both candidates fly the same starting conditions. A mixed course rotates through three profiles from the selected family; a single-mission course uses two starting seeds. More safe landings take priority; ties are resolved by mean shaped reward, including style only after recovery and landing. Rejected candidates leave the incumbent unchanged. The chart shows small training batches, not an independent learning curve.

The shipped checkpoints receive additional complete-graph reward training and independent evaluation on all 27 profiles. The machine-readable `dist/assets/full-pilot-report.json` records exact checkpoint hashes, training counts, seeds, successes and every failure. Profile cards show those measured results. A small evaluation is not a reliability guarantee; the engine-out scenarios remain especially difficult.

The actual graph, readout and training interfaces are an experimental model, not a biologically validated emulation or a demonstrated advantage over simpler/shuffled networks. There is no language model in the control loop.

## Exact decision inspection

The inspector records all 19 numerical inputs immediately before the worker decision, physical context, ten commands and actuator targets. It separates sampled readings from current actuator positions and remembered instrument readings from simulator truth. Raw values are rounded visually, with full precision in tooltips and the read-only `get_control_decision` browser tool.

Pause & inspect replays the complete graph using the exact pre-decision recurrent state, weights and pulse state. Each replay sets just one encoded input to zero. The signed effect is actual command minus replay; these isolated interventions are not additive or physical-world counterfactuals. An additional replay resets graph history. A baseline replay is compared against the actual command and the error is displayed. Diagnostic replays restore all live state and do not advance flight. Live view displays exact commands and readings; input effects remain blank until calculated while paused.

The wiring view traces the strongest final-pass inputs into four output neurons with large contributions to the selected control. It shows real source IDs, measured contact counts, modeled signs, readout coefficients, the sum over all 2,129 output cells and the linked cockpit limb. Its edge-removal value is **removed command minus actual command** for one final graph pass with earlier state and other inputs fixed. These are not whole-flight ablations. Tests remove each displayed edge and independently run the complete pass to verify the result. Atlas lines connect measured neuron anchors; they are not reconstructed axon paths. Control-to-limb inverse kinematics is authored, shared by the inspector and renderer, and clearly distinguished from biological wiring.

## Data and anatomy

MaleCNS v1.0 is from [HHMI Janelia FlyEM, Cambridge/MRC LMB and Google Research](https://male-cns.janelia.org/). Source data retains [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); application code is MIT licensed.

The retained graph contains **166,700 annotated non-glial neurons, 25,582,938 directed neuron pairs and 124,177,617 synaptic contacts**. All edges between retained annotated neurons are included without a weight cutoff. Unresolved objects and glia are excluded; exact counts and source hashes are in the manifest.

The atlas draws **3,487,943 measured synaptic endpoints** and soma fallbacks, using a deterministic one-in-128 coordinate sample plus a measured anchor per located neuron. This drawing sample does not prune computation. These are anatomical points, not complete skeletons. 166,579 neurons have positions; 121 participate without invented locations. Historical small circuits and reports remain as transfer provenance, not active-controller validation.

The first visit downloads approximately 91 MB of graph/anatomy. A graph worker uses roughly 160 MB plus state; training loads a second graph worker. The anatomical renderer uploads about 56 MB of coordinates. Decompression and browser/GPU allocations add overhead. WebGL 2 and native gzip decompression are required. A loading failure stops automated flight with a visible error.

The vehicle uses game-scale translation/rotation, thrust, gravity, fuel-dependent mass, drag, fin torque, crosswinds and moving deck dynamics. Only the center engine and opposing auxiliary pair are selectable for these descent lessons. It is not a flight-qualified Falcon model. Night lighting affects the spectator view, while numerical cues remain available.

## Reproduce

Source URLs, sizes and SHA-256 hashes are pinned in `scripts/source-lock.json`. Four original source files total approximately 7.9 GB and remain outside Git. Python data generators require numpy, pandas and pyarrow. Existing compressed graph/anatomy artifacts are sufficient to run the app or reproduce training.

```sh
# Rebuild the original landing initialization only when intentionally replacing it:
node scripts/calibrate-full.mjs
.venv/bin/python scripts/fit-full.py

# Orbital initialization and on-policy refinement:
node scripts/calibrate-orbit.mjs
.venv/bin/python scripts/fit-orbit.py
node scripts/refine-orbit.mjs
.venv/bin/python scripts/fit-orbit.py

# Further full-network training:
node scripts/train-profiles.mjs center 6
node scripts/train-profiles.mjs degraded 6
node scripts/train-profiles.mjs out 6
node scripts/train-profiles.mjs orbital 2

# Independent evaluation and validation:
node scripts/evaluate-mission-family.mjs center
node scripts/evaluate-mission-family.mjs degraded
node scripts/evaluate-mission-family.mjs out
node scripts/evaluate-mission-family.mjs orbital
node scripts/report-missions.mjs
npm run check
```

Landing calibration uses `/tmp/fly-full`; orbital calibration uses `/tmp/fly-orbit` for temporary matrices. `fit-orbit.py` appends trajectory samples when their files exist, so remove only those generated temporary matrices when intentionally rebuilding the initial synthetic fit. The fit writes the three full-controller checkpoints; rerunning it replaces their learned weights/counters. The earliest landing generations used 0.12 coefficient noise, later generations used 0.015, and the current trainer uses 0.06 correlated head gains plus 0.008 coefficient noise. The report records the lineage; rerunning all historical generations with the current trainer will not reproduce older weights. Exact reproduction requires those scales at the recorded generation boundary. Changing the model or calibration invalidates previous evaluations.
