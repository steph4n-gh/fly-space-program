# Fly Space Program

A small connectome-derived fruit fly controller learns to land a rocket on a moving ocean platform. Static browser app, Canvas flight scene, one shared JavaScript physics/controller module, and a Web Worker for local reward training. No application framework, paid API, GPU, or backend process is needed to use the deployed app.

## Run

```sh
npm start
# http://localhost:4173
```

Choose Flight school for vertical descents, Ocean rendezvous for the moving ship, or Bad idea for stronger gusts. The shipped checkpoint is already trained. Choose Fresh brain and Train the fly to start over; My trainee continues local progress. Training does not depend on playback speed. Human controls: W/S throttle, A/D attitude jets, Q/E gimbal; touch users have a throttle slider and attitude buttons.

Checkpoints persist in this browser's local storage. Save brain exports the selected checkpoint. Closing the tab stops training; the latest saved weights remain. Training in a different browser starts a separate trainee. The site's access remains private.

## What is biological

The original data is the MaleCNS v1.0 connectome from HHMI Janelia FlyEM, the University of Cambridge, MRC Laboratory of Molecular Biology and Google Research: <https://male-cns.janelia.org/>. It is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The active controller uses **96 actual descending neurons, 3,199 directed connections, and 85,785 synaptic contacts**. We start with DNa02, DNg13, DNp09 and DNp01, then select strongly connected neighbors from the central-complex/descending candidate set. The resulting 96 selected neurons all have descending-neuron annotations. Every retained biological edge exists in the source data. Body IDs, cell types, neurotransmitter predictions, soma coordinates, edge counts, and normalized weights ship in `dist/assets/circuit.json`. The visualization projects actual soma coordinates; its activity comes from the running controller.

The 166,000+ source neurons are **not** all simulated. This is a small experimental motor circuit, not an uploaded animal or a biologically validated whole brain.

## What is engineered and learned

Flight telemetry is eight normalized signals: lateral position/velocity relative to the ship, vertical velocity relative to an altitude-derived descent cue, attitude, angular velocity, altitude, fuel, and deck velocity. This artificial BCI is not a model of fly vision. The descent cue is a stopping-distance-based sensor feature; it does not generate actions.

A fixed random encoder feeds a tanh rate model. Synaptic weights begin proportional to the square root of synapse counts, normalized by total incoming magnitude. Acetylcholine is treated as excitatory and GABA/glutamate as inhibitory, based on predicted transmitter identities. We do not model receptor-specific signs, spikes, detailed cellular physiology, or natural plasticity.

The neural transformation is `tanh(0.65 * tanh(encoder * telemetry) + W * tanh(encoder * telemetry))`. A fixed pseudoinverse calibrated to the linearized circuit preserves the sensor channels through this transformation. It is task-agnostic interface calibration, **not** a learned flight teacher. There are no recurrent time-state dynamics in this first rate model. Neural updates run every three 50 ms physics steps.

Antithetic evolution strategies optimize **27 output coefficients and 12 multiplicative gain groups on existing connections**. The gain groups are assigned by presynaptic index; positive gains preserve edge signs and topology. A candidate is accepted only when its average reward is at least the incumbent's on identical initial conditions. There is no language model, pretrained generic lander policy, or scripted landing autopilot in the control path. Most task parameters live in the output interface, and a smaller set modulates the circuit itself; this experiment does not establish that fly wiring improves learning.

Flight school starts upright with zero lateral velocity and learns thrust; gimbal and attitude-output coefficients remain frozen at their initial zero values for that lesson. Ocean training unlocks all outputs. The stylized 2D physics includes gravity, mass change with fuel, thrust, gimbal torque, attitude jets, drag, gusts, and sinusoidal ship motion. A successful touchdown requires lateral error under 10 m, vertical speed under 3.4 m/s, relative lateral speed under 2.8 m/s, and tilt under 0.18 radians. This is a game-like control task, not an aerospace engineering model.

Reward penalizes position/velocity/attitude errors, fuel use and time, with a bonus for a safe landing and penalties for failures. The app chart shows actual per-generation training-batch rewards; it is not a held-out learning curve. The displayed flight may finish using an older checkpoint while training runs; new flights pick up the newest weights.

## Reproduce training and evidence

```sh
node scripts/train.mjs 220 0
# Preserve this as flight-school.json before moving on.
node scripts/train.mjs 600 1 --resume
node scripts/check.mjs
```

The shipped flight-school checkpoint underwent 36,960 reward-training rollouts and the ocean checkpoint 137,760 cumulative rollouts. These counts include both candidate perturbations and incumbent/candidate comparison flights. Evaluation results are in `dist/assets/flight-school-report.json` and `dist/assets/training-report.json`. Both compare fresh and frozen trained checkpoints on 20 evaluation initial conditions excluded from the training batches; neither evaluation selected or updated the shipped checkpoint. Results are evidence for these scenarios and model settings, not a broad benchmark or a claim of biological fidelity.

The training command overwrites `graduate.json` and `training-report.json`; copy a checkpoint before retraining if you want to preserve it. A resume restores weights and counters but deliberately seeds a new training RNG stream; it is not bit-for-bit continuation of an interrupted run. Individual flights are deterministic for a given seed and checkpoint.

## Regenerate the circuit

Requires Python with numpy, pandas, and pyarrow. The three source files total about 1.1 GB and remain outside Git:

```sh
uv venv .venv
uv pip install --python .venv/bin/python numpy pandas pyarrow
.venv/bin/python scripts/fetch_connectome.py
.venv/bin/python scripts/build_circuit.py
```

Exact original URLs, byte sizes, and SHA-256 hashes are recorded in `scripts/source-lock.json`. The derived circuit preserves attribution and identifies the transformations above. Original application code is MIT licensed; connectome data retains CC BY 4.0.

Validation: shared-engine determinism, fuel exhaustion, unsafe touchdown rejection, an actual training update path, biological edge metadata, local asset references, and JavaScript syntax. Broad browser UI testing was not requested. Optional WebMCP tools are feature-detected and were not runtime-verified in a supported browser context.
