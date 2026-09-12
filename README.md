# Fly Space Program

A fruit fly connectome drives a rocket trying to land on a moving ocean platform. The browser runs the complete retained neuronal graph, displays measured synaptic anatomy in WebGL, and animates an articulated fly operating the live flight controls. The static app has no application framework, paid API, or backend simulation.

## Run and explore

```sh
npm start
# http://localhost:4173
```

Ocean rendezvous starts with a trained motor checkpoint. Flight school teaches vertical descent; Bad idea adds harder conditions. Choose Fresh brain and Train the fly to start over, or My trainee to continue locally saved weights. Save brain exports the checkpoint. Closing the page stops training. Each browser keeps a separate trainee.

Drag the brain to orbit, scroll to zoom, and click a neuron to inspect its real body ID and cell annotation. Keyboard arrows rotate the focused atlas; plus/minus zoom. Switch between modeled activity and anatomical colors, reveal the whole central nervous system, spotlight the 96-cell motor interface, or expand the atlas. Pulse neuron injects excitation for eight graph updates. Throw a gust adds a decaying lateral force to the current flight. Human controls: W/S throttle, A/D attitude jets, Q/E gimbal; touch users have throttle and attitude controls.

The cockpit's six limbs articulate from the same throttle, gimbal and attitude commands applied to rocket physics. Its traces show those commands. It is procedural game geometry, not a prerecorded animation.

## The data and anatomical coverage

MaleCNS v1.0 comes from HHMI Janelia FlyEM, the University of Cambridge, MRC Laboratory of Molecular Biology and Google Research: <https://male-cns.janelia.org/>. Data retains [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); original application code is MIT licensed.

The graph contains **166,700 annotated non-glial neurons, 25,582,938 directed neuron-pair connections, and 124,177,617 measured synaptic contacts**. All edges between retained annotated neurons are included with no additional weight threshold. Rows involving objects without an assigned neuronal superclass or annotated glia are excluded. This is the complete retained neuronal graph, not every unresolved object in the source tables. The manifest records the exact source and exclusion counts.

The atlas uses **3,487,943 measured synaptic endpoints**, plus real soma fallbacks where needed, to expose the brain's actual anatomical shape. A deterministic coordinate hash retains one in 128 endpoints, plus an initial measured endpoint per located neuron. This drawing sample does not prune the graph used for computation. These are anatomical points, not complete neuronal skeletons or every synaptic site. **166,579 neurons have coordinates; 121 have no available position** and remain in computation without invented geometry. Brain view clips the nerve cord; Whole CNS reveals the complete anatomical extent.

The fast motor interface contains 96 real descending neurons, 3,199 connections and 85,785 contacts, selected around DNa02, DNg13, DNp09 and DNp01. IDs, annotations and source edge counts remain in `dist/assets/circuit.json`. The complete compressed graph, anatomy, labels and manifests are in `dist/assets/connectome/`.

## Computed activity and control

This is an experimental connectome-derived controller, not a biologically validated fly emulation. Activity is a calculated rate signal, not recorded biological firing. There is no language model in the control loop.

Eight engineered telemetry channels encode relative position/velocity, a stopping-distance descent cue, attitude, angular velocity, altitude, fuel and deck velocity. The descent cue is a sensor feature, not an action-generating autopilot. Annotated sensory groups receive these proxy inputs; this does not model fly vision.

A background worker propagates every retained edge with signed, count-weighted tanh rate dynamics. Incoming contact totals normalize recurrent input; previous activity contributes a decaying state term. Acetylcholine is excitatory; GABA/glutamate are inhibitory under a simplified transmitter rule. Other or unknown transmitter assignments default to excitatory. Receptor-specific signs, spikes and detailed cell physiology are not modeled.

The whole graph targets one update per 160 ms of wall time, slowing down on less capable devices. The UI displays its observed cadence. The 96 motor neurons run at the faster controller cadence (every three 50 ms physics steps). Their current rates are inserted into the whole graph; the whole graph's candidate rates feed the next motor update with gain 0.12. Thus activity has a real route through the whole network back into rocket commands. Flight playback speed does not accelerate the full graph; this multirate system is intentionally asynchronous, so coupled live runs depend on device timing.

The motor circuit uses a fixed random encoder, signed normalized biological edges, and task-agnostic pseudoinverse interface calibration to preserve sensor channels. Antithetic evolution strategies optimize **27 output coefficients and 12 multiplicative gain groups on existing motor connections**. Positive gains retain edge signs and topology. Each candidate is compared with the incumbent on identical initial conditions.

Fast training rollouts use a frozen snapshot of the latest full-network feedback; they do not resimulate 25.6 million edges for every candidate. New live flights use the latest saved motor weights and dynamically coupled graph. Training rewards are measured batch rewards, not a held-out learning curve. This setup does not establish that fly topology improves learning compared with other networks.

Flight school learns thrust only; ocean training unlocks all outputs. Stylized 2D physics includes gravity, fuel-dependent mass, thrust, gimbal torque, attitude jets, drag, gusts and ship motion. A safe touchdown requires lateral error under 10 m, vertical speed under 3.4 m/s, relative lateral speed under 2.8 m/s, and tilt under 0.18 radians.

## Downloads and performance

The first visit fetches about 91 MB of compressed graph and anatomy; the motor pilot starts while it loads. Browser HTTP caching can reuse the assets on later visits. The graph worker holds roughly 160 MB of graph arrays plus state; the renderer uploads about 56 MB of anatomical coordinates. Transient decompression and browser/GPU allocations add overhead. A current desktop browser with WebGL 2 and native gzip decompression is recommended. A visible error reports unavailable anatomy or graph loading; the motor pilot remains usable.

## Reproduce data and training

Python generators require numpy, pandas and pyarrow. The four original source files total about 7.9 GB and stay outside Git. URLs, exact byte sizes and SHA-256 hashes are pinned in `scripts/source-lock.json`. Download the listed files into `data/`; `scripts/fetch_connectome.py` fetches the original three graph/annotation files. Run `scripts/fetch_anatomy.py` to fetch the large synapse-position file before anatomy generation.

```sh
.venv/bin/python scripts/build_circuit.py
.venv/bin/python scripts/build_full_connectome.py
.venv/bin/python scripts/build_anatomy.py
node scripts/check.mjs
node scripts/check-full-network.mjs
```

The shipped starter flight-school checkpoint used 36,960 rollouts and the ocean checkpoint 137,760 cumulative rollouts. Their original motor-only evaluations each landed 20/20 separate evaluation flights versus 0/20 fresh. Reports remain in `dist/assets/flight-school-report.json` and `dist/assets/training-report.json`. **These results precede whole-network coupling and are not evidence for the expanded model's landing reliability.** The live counter records the flights actually observed in the app.

`full-network-report.json` records numerical graph integrity, a verified feedback effect on motor commands, an excitation injection check, and one coupled smoke flight. It is not a benchmark. The base checks cover deterministic motor-only replay, fuel exhaustion, unsafe touchdown rejection, a real training update, edge metadata and local asset references. Browser visual testing and optional feature-detected WebMCP tools were not runtime-tested.

To retrain starter checkpoints with the original motor-only command-line harness:

```sh
node scripts/train.mjs 220 0
# Copy graduate.json to flight-school.json before moving on.
node scripts/train.mjs 600 1 --resume
```

The harness overwrites `graduate.json` and `training-report.json`. Resume restores counters and weights with a new RNG stream; it is not bit-for-bit continuation. Motor-only flights are deterministic for a given seed and checkpoint; live asynchronous whole-network coupling has the timing dependency described above.
