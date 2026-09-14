# Fly Space Program

An experimental fruit-fly connectome controls a 3D booster. The default **Perceiving fly** receives light at two modeled eyes, body feedback and receptor-specific odor stimuli. Its cockpit presents a camera and twelve measured flight indicators. These measurements reach the graph through eye pixels; no numerical navigation array or target trajectory enters the controller. See [Learning the mission suite](docs/suite-training.md) for the training procedure, frozen-checkpoint tests and limitations.

The shipped checkpoint achieved **60/80 safe landings on unseen starts
across ten missions**, versus **54/80** for the previous controller on the
same starts. It landed 8/8 each on Landing School, Atlantic Return and
Spinning Entry, and 7/8 on Fast Ferry; results on the six engine-failure
missions ranged from 1/8 to 8/8. It landed 29/40 nominal and 31/40 varied flights.
Covering its eyes or disabling the indicators reduced it to **0/80** in each
matched control. All 20 failures remain in the report. The paired comparison
rescued seven prior failures and lost one prior success. These small tests
do not establish mastery of all 27 missions or transfer to a living fly.

The release learns gimbal corrections alongside attitude-jet steering.
Two separate movement probes confirmed actual corrections below half a
degree; one landed and one failed on lateral speed. The gimbal readout now
shows tenths of a degree so small corrections are visible. The previous
ten-mission checkpoint's 56/80 result used a different cohort and is retained
in its [historical report](docs/assets/ten-mission-g6-report.json).

The previous four-mission checkpoint achieved 28/32 on its original test.
A chemical pilot with those earlier weights landed **10/16** additional
starts in clean air and **9/16** with either tested odor; it did not
establish a chemical benefit. The earlier
[first landing lesson](docs/landing-training.md) achieved 6/24 on its separate
stationary-deck test; that was a different checkpoint and test set.

The physical-interface research target, 27-mission baseline, expanded 689-odor atlas, complete-graph spiking experiments and odor-controller trials are documented in [A physically testable fly interface](docs/physical-fly-interface.md). The additional [eight-compound panel](docs/additional-odor-tests.md) and [calibration follow-up](docs/odor-calibration-followup.md) did not establish chemical steering. [Harness mockups](docs/harness-concept.md) explore a 125-cell cube and individual fly chambers. The current software is not a validated predictor of a living fly's behavior.

[Biology experiments](docs/biology-experiments.md) prioritizes odor-dependent visual tracking, cue/reward learning and targeted circuit tests. It records 336 static odor/visual trajectories, 48 matched chemical flights and two 28-trial spiking-model recruitment assays. The expanded anatomy identifies octopamine contacts into inputs of the visual-motion pathway. The follow-up found modest, variable odor responses in additional candidates; all observed visual populations remained silent without visual input. Neither assay establishes visual enhancement.

Two further isolated visual-input diagnostics found photoreceptor spikes
and voltage changes in direct targets, but no spikes outside the driven
cells. The inherited spiking model therefore needs validated visual
transmission before its odor-dependent visual effects can be interpreted.
The [diagnostic record](docs/visual-transmission-results.json) preserves all
phase counts and voltage traces.

An [eight-trial follow-up](docs/visual-transmission-background-results.json)
added the existing clean-air olfactory background. The flash changed spike
counts elsewhere in the active graph, while every measured visual pool
remained silent. Paired voltage responses were present. This narrows the
model limitation without establishing visual-motion processing or a
chemical benefit.

Run `npm start`, then open `http://localhost:4173`. The complete graph must load before automated flight begins. Mission shows the flight, Cockpit shows the articulated fly and exact sampled eye images, and Flight lab contains training, the anatomical atlas and decision inspection. The default is the short landing-school mission. All 27 landing/orbital profiles remain available. The instrument-trained V8 pilot is a labeled reference option.

## Perception and control

Every decision evaluates **166,700 retained neurons and 25,582,938 directed connections twice**, then reads all **2,129 descending/motor neurons** to produce ten commands. All **124,177,617 measured synaptic contacts** between retained annotated non-glial cells are included. No language model, separate small pilot or action override supplies the commands. All 21,300 output weights can be trained; the anatomical graph stays fixed.

The embodied input has 1,558 channels:

- Two 32 × 24 grayscale eye images drive **6,091 photoreceptors**, selected by `ol_sensory` annotation and left/right `rootSide`. Retinotopy uses synapse-weighted links to annotated optic-column coordinates; 196 photoreceptors without direct column evidence borrow the nearest measured same-eye photoreceptor’s column. Eye projection, calibration, grayscale encoding and response curves are model choices.
- Eighteen body channels represent control/joint position, angular motion, felt load, contact and vibration. Inputs go to matching annotated proprioceptive, haltere, tactile, wind/gravity and auditory classes. Within-class directions and fictional control associations are authored, not experimentally measured tuning. Specific force removes gravity and orbital-frame acceleration; freefall does not masquerade as an upward body load.
- Four odor channels represent left/right normalized ethyl acetate and geosmin exposure. They drive **115 annotated ORN_DM1 and ORN_DA2 cells**. Unknown modalities receive no invented direct drive; every retained cell still computes.

A deterministic optical renderer works identically in browser and offline workers. A fixed vehicle-mounted downward camera sees the geometric deck, ocean/spherical planet and sky, with night/fog affecting received light. It never aims itself at a hidden target. The current cockpit shows that camera on the left, twelve brightness indicators in the center, and engine lights on the right. The indicators encode clearance, vertical speed, two deck-relative offsets, two drift speeds, pitch, roll, tangential speed, angular travel, destination altitude and fuel. Destination altitude is a mission instruction; no indicator recommends a control action. Earlier two-light checkpoints retain their original presentation. Each eye pixel averages a 4×4 grid of rays intersecting those physical monitor planes. Head yaw changes the received image. The cockpit’s pixel previews are the exact sampled images, before presentation interpolation. This is a simplified optical scene, not a biological compound-eye optical model or the high-detail spectator renderer.

Automatic simulated odor release uses received light, retinal change and body rotation: steady rotation with visible monitor light releases ethyl acetate; rapid rotation or image change releases geosmin. Releases are separated by at least two simulated seconds; exposure decays with a 1.8-second time constant. Manual releases and an automatic-release switch are available. Odor feeds the sensory graph; it neither selects actions nor changes the training reward. This is external odor stimulation, not pheromone signaling, a chemical dose, internal dopamine or guaranteed innate valence. Mapping evidence and limitations are in `dist/assets/connectome/sensory-map.json`. See [Or42b/DM1 ethyl acetate research](https://pubmed.ncbi.nlm.nih.gov/28670618/) and [DoOR 2.0](https://www.nature.com/articles/srep21841).

Each neuron uses `tanh(gain × (0.05 × previous activity + 0.55 × normalized signed incoming activity + sensory drive))`, with drive `0.7 × tanh(0.15 × input)` and a modeled polarity. Light is scaled to 0–3. Acetylcholine is excitatory and GABA/glutamate inhibitory under the simplified rule; other/unknown transmitters, including histamine, currently default to excitatory. This does **not** reproduce receptor-specific physiology, spikes, fly color vision, full dendrites or a living fly. Fixed anatomical wiring alone does not supply learned visual behavior; [connectome-constrained visual modeling](https://www.nature.com/articles/s41586-024-07939-3) also requires modeling and fitting unknown parameters.

## Learning and evidence

The embodied controller starts independently of the old instrument-trained checkpoints. The curriculum calibrates full-network motor activity against presented indicator brightness and body feedback, then learns throttle, lateral steering and attitude stabilization from complete-flight reward. A learned sensory basis is folded into the ordinary 21,300-weight readout. Correlated parameter search adjusts steering and damping together. The released ten-mission checkpoint uses a three-engine bank from the start, with learned throttle feedback and joint gimbal/attitude-jet steering; reactive switching after a failure remains unverified. Fins and gaze remain neutral. Anatomical connections stay fixed. The remaining 17 missions have no final validation for this checkpoint.

The earlier visual-orientation curriculum presented luminous monitor markers at different positions and head angles. The target gaze came from the marker’s apparent position in the retinal image. Six decisions let each stimulus propagate through the complete graph, then a regularized fit updated the gaze readout using all 2,129 output activities. Feature scaling was folded into the learned weights. There was no flight teacher or hidden flight action.

That earlier visual checkpoint used 158 training images, a separate 32-image validation set, and 47 visible held-out test images. Its gaze mean squared error fell from **0.3972 to 0.1019**; covering both eyes raised it to **0.4772**. This historical static-image result describes the earlier point-sampled optics and checkpoint, not the current landing decoder. Two of 160 proposed training patterns and one of 48 test patterns were outside the eye view and excluded. Exact retained seeds, counts and checkpoint hashes are recorded in `dist/assets/perception-report.json`.

Train the fly runs the selected course locally. Visual orientation fits new image batches and keeps a candidate only if it improves a separate validation subset. Flight reward training compares incumbent and paired weight perturbations on identical starting seeds, keeping more safe landings first and higher shaped reward second. Every candidate uses the full graph and the same embodied observations as live flight. A mixed flight course rotates through the selected engine family; a single course repeats one mission with new seeds. Variation changes mass, thrust, servo speed, wind and deck motion. The older telemetry noise model only applies to the reference pilot.

Embodied progress is saved in the separate `embodied` entry of `fly-space-program-brains-v6`; earlier family checkpoints are preserved and never used to initialize the new fly. **Perceiving fly** selects the shipped checkpoint; **My trainee** selects the separately saved local checkpoint. Save brain exports the selected checkpoint. **Fresh brain** starts independent random weights for that flight/training run. Ordinary observed flights do not automatically update weights; use Train the fly. Learning can plateau or regress on unseen conditions; eventual flight mastery is not guaranteed.

## Orbital timing and the reference pilot

The sandbox planet has a 6,000 m radius, inverse-square gravity and explicit orbital milestones. Launch, stable insertion, a full revolution, deorbit, entry and safe barge touchdown are all required. The reference pilot receives engineered guidance; the embodied pilot does not.

The V9 orbital fix removes tiny thrust-direction corrections during certified coast and holds the reference guidance attitude steady. Aloft, decisions now advance **two 250 ms physics steps**; near the surface they advance **three 50 ms steps**. The former 750 ms attitude-control interval caused oscillation. No readout command is filtered or replaced. Timing is shared by live flight and reward training. Render interpolation affects presentation only.

The archived V8 evaluation is `dist/assets/full-pilot-report.json`: 169/216 landings versus 166/216 for its earlier comparison, including 21/24 complete round-trip landings. Its arousal experiment had 9/12 landings at gain 1.00, 9/12 at 1.02 and 7/12 at 1.05. Those results describe the **earlier instrument-trained implementation before the orbital timing fix**, not the embodied fly or current reliability. The optional gain control remains a global responsiveness experiment, not a model of chemical concentration or dopamine-mediated learning. The new `dist/assets/orbital-control-report.json` records 12/12 completed orbits and safe round-trip landings across three missions, two seeds and nominal/varied conditions. Two matched nominal comparisons showed more than 99% less mean RCS command change during coast; this is a narrow control-stability result.

## Inspection, anatomy and limits

Pause & inspect replays the exact pre-decision graph state. The embodied inspector groups each eye’s 768 pixels into one ablation plus 22 body/odor ablations, for 24 isolated replays. Full pixel values are available through the read-only `get_control_decision` browser tool. Replays restore live state and do not advance flight. Mission-control position, guidance and instrument-memory cards are labeled spectator context. The wiring view traces measured edges into four influential output cells and the selected limb; the complete readout still includes every output cell.

The atlas uses 3,487,943 measured synaptic endpoints and soma fallbacks. Its deterministic coordinate sample does not prune computation. These are anatomical points, not full neuron skeletons. 121 cells have no available position and compute without invented locations. Data is from [MaleCNS v1.0](https://male-cns.janelia.org/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); application code is MIT licensed. The first download is about 91 MB. Training loads a second full graph; a current desktop browser with WebGL 2 works best.

The vehicle, controls, limb linkage, forces and tolerances are fictional game-scale approximations, not a flight-qualified Falcon model. Expressions and radio jokes are cosmetic. Human controls remain W/S throttle, arrows/A/D attitude jets, Q/E yaw, IJKL gimbal, Z/C and U/O fins. Safe landings can bank one recovered 360° style maneuver, up to 25 points; crashes earn no style bonus.

## Reproduce

```sh
npm run check
node scripts/measure-orbit-control.mjs
# Requires numpy, pandas, pyarrow and the pinned original annotations:
python3 scripts/build-sensory-map.py
```

The [suite training guide](docs/suite-training.md) lists the current calibration, reward-search and final-test commands. The [first landing guide](docs/landing-training.md) records the earlier stationary-deck checkpoint. `train-perception.mjs` runs the older gaze-only curriculum and replaces the embodied starter and its visual report. The map builder uses the pinned source annotations and all retained connections. Source URLs and hashes are in `scripts/source-lock.json`; approximately 7.9 GB of original source data remains outside Git. The V8 implementation and training provenance are preserved at Git revision `ca4fcaed774e78c1b71d65b6dd91738b0c4d9e15`. Its historical scripts must be run at that revision to reproduce its original timing exactly.
