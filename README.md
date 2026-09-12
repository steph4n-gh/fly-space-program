# Fly Space Program

A fruit fly connectome drives a stylized 3D Falcon-inspired booster toward a moving recovery ship. A tiny Dragon-style crew pod, complete with antenna, houses an articulated fly with flight-linked expressions and live cockpit instruments. The browser runs the complete retained neuronal graph and displays measured synaptic anatomy. Three.js draws the vehicle and cockpit; no application framework, paid API, or backend simulation is needed.

## Run and explore

```sh
npm start
# http://localhost:4173
```

The app starts on Atlantic return with a trained 3D checkpoint. Eight missions progress through landing school, two-axis ocean recovery, faster descent, rough seas, night conditions, a jammed fin, reduced center-engine thrust, and combined faults with a completely dead center engine. Night lighting and fog affect the spectator view; the pilot still receives engineered flight cues. Harder missions select specialist checkpoints trained for those faults. The enabled academy option advances after three consecutive safe landings; uncheck it to stay on a mission. You can choose Fresh brain or train the selected checkpoint further. Training and saved progress stay on this device; Save brain exports weights. The v3 storage key preserves earlier v1/v2 saved checkpoints separately.

Chase, Wide, Deck and Pod cameras show the flight from different perspectives. Drag the flight scene to orbit or scroll to zoom. Fly’s view looks across the cockpit from the pilot’s head. The fly’s head turns, eyes, brows and antennae react to actual commands and flight conditions; touchdown earns a celebration. These are authored cosmetic reactions, not evidence of emotions or awareness. A small antenna Easter egg is available by clicking the crew pod antenna.

Drag the anatomical atlas to orbit, scroll to zoom and click a neuron to inspect its ID and annotation. Keyboard arrows rotate the focused atlas; plus/minus zoom. Switch activity/anatomy, show the whole CNS, spotlight the motor interface, or expand the atlas. Pulse neuron injects eight graph updates of excitation. Throw a gust, Jam a fin, and Engine fault alter the live simulation.

Human controls: W/S throttle; arrows or A/D for attitude control on two axes; Q/E yaw; IJKL gimbal; Z/C and U/O fins. On-screen controls include throttle, four attitude buttons, engine-bank selection and gaze. Touch controls provide the main flight inputs; full gimbal/fin/yaw controls use a keyboard.

## The data and anatomical coverage

MaleCNS v1.0 comes from HHMI Janelia FlyEM, the University of Cambridge, MRC Laboratory of Molecular Biology and Google Research: <https://male-cns.janelia.org/>. Data retains [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); original application code is MIT licensed.

The graph contains **166,700 annotated non-glial neurons, 25,582,938 directed neuron-pair connections, and 124,177,617 measured synaptic contacts**. All edges between retained annotated neurons are included with no additional weight threshold. Rows involving objects without an assigned neuronal superclass or annotated glia are excluded. This is the complete retained neuronal graph, not every unresolved object in the source tables. The manifest records the exact source and exclusion counts.

The atlas uses **3,487,943 measured synaptic endpoints**, plus real soma fallbacks where needed, to expose the brain's actual anatomical shape. A deterministic coordinate hash retains one in 128 endpoints, plus an initial measured endpoint per located neuron. This drawing sample does not prune the graph used for computation. These are anatomical points, not complete neuronal skeletons or every synaptic site. **166,579 neurons have coordinates; 121 have no available position** and remain in computation without invented geometry. Brain view clips the nerve cord; Whole CNS reveals the complete anatomical extent.

The fast motor interface contains 96 real descending neurons, 3,199 connections and 85,785 contacts, selected around DNa02, DNg13, DNp09 and DNp01. IDs, annotations and source edge counts remain in `dist/assets/circuit.json`. The complete compressed graph, anatomy, labels and manifests are in `dist/assets/connectome/`.

## Computed activity and control

This is an experimental connectome-derived controller, not a biologically validated fly emulation. Activity is a calculated rate signal, not recorded biological firing. There is no language model in the control loop.

Eighteen engineered telemetry channels encode relative position and velocity on two lateral axes, a stopping-distance descent cue, two tilt angles/rates, heading/rate, altitude, remembered fuel and engine health, and time since instrument checks. The descent cue is a sensor feature, not an action-generating autopilot. The first eight channels also drive annotated sensory groups in the whole network; the 96-cell motor activity includes all 18 channels. This does not model fly vision.

A background worker propagates every retained edge with signed, count-weighted tanh rate dynamics. Incoming contact totals normalize recurrent input; previous activity contributes a decaying state term. Acetylcholine is excitatory; GABA/glutamate are inhibitory under a simplified transmitter rule. Other or unknown transmitter assignments default to excitatory. Receptor-specific signs, spikes and detailed cell physiology are not modeled.

The whole graph targets one update per 160 ms of wall time, slowing down on less capable devices. The UI displays its observed cadence. The 96 motor neurons update every three 50 ms physics steps. Their rates enter the whole graph; the whole graph’s candidate rates feed the next motor update with gain 0.12. Flight playback speed does not accelerate the full graph, so live coupled trajectories depend on device timing.

The motor circuit uses a fixed 18-channel encoder and task-agnostic pseudoinverse calibration through the signed biological matrix. The original eight-channel encoder is preserved and ten columns are added; none of the 96 neurons or 3,199 edges is changed. The 2D output weights initialize the corresponding control channels on both lateral axes. Additional engine/gaze initialization is documented in `scripts/build_3d_interface.py`.

The ten outputs are throttle; gimbal X/Z; attitude jets X/Z and yaw; fin X/Z; engine-bank selection; and gaze. Each output has 18 coefficients and a bias: **190 output coefficients plus 12 multiplicative biological-edge gain groups = 202 trainable parameters**. The 12 positive gains preserve biological edge signs and topology. The full graph’s individual edge weights are not all optimized.

Antithetic evolution strategies generate paired random weight perturbations, simulate candidate flights, estimate a reward-improving update from the better perturbations, and accept it only if it beats the incumbent on identical starting conditions. Engine-selector perturbations are eight times wider because small changes often cannot cross the discrete one/three-engine threshold. This is reward-based parameter search without backpropagation through the simulator.

Training rewards penalize landing error, speed, attitude, fuel use, time and stale instrument readings; safe touchdowns earn a bonus. Fast candidate flights use a frozen snapshot of the latest whole-network feedback. They do not resimulate the full graph for every candidate. New live flights use the latest trained weights with dynamic whole-network coupling. The chart is training-batch reward, not a held-out learning curve.

Throttle, gimbal, pedals, fins, selector and gaze have bounded travel rates. The selected control positions drive the physics; inverse kinematics attaches the rendered limbs to those positions. Individual leg joints and physical contact forces are not learned. Looking left samples a numerical fuel reading; looking right samples engine health; other flight cues remain available. There is no learned raw-pixel visual system.

The 3D physics integrates translation and rotation with gravity, fuel-dependent mass, thrust, gimbal torque, attitude jets, aerodynamic fin torque, drag, crosswinds, ship motion and deck roll/pitch. A center engine and an opposing auxiliary pair form selectable one/three-engine banks; the other six nozzles are modeled visually but are not selectable during these descent lessons. The center-engine fault reduces its thrust to 48% in mission 07 and zero in mission 08. Grid fin 01 can jam at a fixed deflection. This is a game-scale approximation, not a flight-qualified SpaceX vehicle model. Touchdown requires radial deck error under 11 m, vertical speed under 3.6 m/s, relative lateral speed under 3 m/s and tilt under 0.2 radians.

Nothing here demonstrates a shortcut to LLM development or an advantage of biological topology. Equal-budget comparisons with simpler and shuffled networks would be needed before making efficiency claims.

## Downloads and performance

The first visit fetches about 91 MB of compressed graph and anatomy; the motor pilot starts while it loads. Browser HTTP caching can reuse the assets on later visits. The graph worker holds roughly 160 MB of graph arrays plus state; the renderer uploads about 56 MB of anatomical coordinates. Transient decompression and browser/GPU allocations add overhead. A current desktop browser with WebGL 2 and native gzip decompression is recommended. A visible error reports unavailable anatomy or graph loading; the motor pilot remains usable.

## Reproduce data and training

Python generators require numpy, pandas and pyarrow. Four original source files total about 7.9 GB and stay outside Git. Exact URLs, sizes and SHA-256 hashes are pinned in `scripts/source-lock.json`. `scripts/fetch_connectome.py` downloads graph/annotation sources and `scripts/fetch_anatomy.py` downloads synaptic positions.

```sh
.venv/bin/python scripts/build_circuit.py
.venv/bin/python scripts/build_full_connectome.py
.venv/bin/python scripts/build_anatomy.py
.venv/bin/python scripts/build_3d_interface.py
node scripts/train-falcon.mjs 80 1
# Preserve graduate + report as falcon-ocean.json and falcon-ocean-report.json.
node scripts/train-falcon.mjs 120 6 --resume
# Preserve graduate + report as falcon-specialist.json and falcon-specialist-report.json.
node scripts/train-falcon.mjs 100 7 --resume
# Preserve graduate + report as falcon-expert.json and falcon-expert-report.json.
node scripts/check-falcon.mjs
```

The CLI writes `falcon-graduate.json` and `falcon-training-report.json`; the app loads the named ocean/specialist/expert copies. Resume restores weights and counters with a new RNG stream. Training is not bit-for-bit reproducible across algorithm revisions: the shipped ocean and engine-fault checkpoints used narrow selector mutations; the combined-fault run introduced wider selector exploration after an unsuccessful narrow-exploration branch. The stored attempt count follows each checkpoint’s retained training lineage.

The 3D checkpoints have recorded lineages of **6,240 / 15,600 / 23,400 training rollouts**. Their evaluation results are **12/12 Atlantic, 11/12 reduced-engine, and 11/12 combined-fault landings**, respectively, on 12 fixed evaluation seeds separate from training. These evaluations hold whole-network feedback at zero. They do not validate asynchronous live behavior, unseen mission distributions or biological fidelity. Reports are linked inside the app. The live counter records actual observed flights.

`falcon-integration-report.json` records actuator/gaze/fault checks and two numerical smoke flights coupled to all 25.6 million edges. Browser visual testing and optional feature-detected WebMCP tools were not runtime-tested. The old 2D engine and its training reports remain available for historical evidence; they are not the active 3D controller.

The earlier 2D checkpoints used 36,960 / 137,760 rollouts and each landed 20/20 evaluation flights. Those weights are the transfer source, not evidence for the new model’s reliability.
