# The simulator, as it runs

Browse the [31-image interface gallery](https://fly.steph4n.dev/screenshots/) or view the captures below. Click an image in the web gallery for its original resolution.

These are actual browser captures from 14 September 2026, saved without replacing UI text, neural data, flight results or image pixels. The browser used its normal desktop viewport. Ordinary flights were briefly run and paused for stable frames; no controller training or research runs were started.

Most images show public release `e1ebec6`. Flight Lab and the outcome capture use `41f073a`, which fixes the redraw of the existing training-history chart when the lab opens. Each image has its exact revision, dimensions, capture context and SHA-256 in the [manifest](../dist/screenshots/manifest.json).

Screenshots are software observations, not a fresh benchmark or evidence of living-fly control. Formal results remain in the [landing report](../dist/assets/landing-report.json). The [Fly Cube concept gallery](harness-concept.md) contains separately labeled AI-generated mockups; no physical apparatus has been built.

## Mission control

### 01. Mission control

![Mission control](../dist/screenshots/01-mission-control.jpg)

The released Perceiving fly on Landing school, with flight telemetry, the Chase camera, animated crew and actuator traces. Session counts are local observations, not the formal benchmark.

### 02. Wide flight camera

![Wide flight camera](../dist/screenshots/02-wide-camera.jpg)

The same paused flight in Wide view shows the booster and ocean landing platform together.

### 03. Deck flight camera

![Deck flight camera](../dist/screenshots/03-deck-camera.jpg)

The deck camera looks up toward the descending booster. It is an external spectator view.

### 04. Pod flight camera

![Pod flight camera](../dist/screenshots/04-pod-camera.jpg)

An external camera near the crew compartment, with the cockpit illustration alongside it.

### 05. Flight options

![Flight options](../dist/screenshots/05-flight-options.jpg)

Quality, varied conditions, flair, progression, engine and fin faults, and gust controls. The controls are shown without injecting a fault or starting training.

### 24. Manual flight controls

![Manual flight controls](../dist/screenshots/24-manual-flight.jpg)

Human control mode exposes thrust, rotation, translation, engine-bank and gaze controls, plus keyboard bindings. This frame is a manual flight, not a neural-controller result.

### 25. Orbital flight interface

![Orbital flight interface](../dist/screenshots/25-orbital-flight.jpg)

The launch phase of the complete-round-trip scenario with the perceiving fly selected. A launch frame does not demonstrate a completed orbit or recovery.

### 31. A completed landing

![A completed landing](../dist/screenshots/31-flight-outcome.jpg)

A real paused Landing School touchdown from this browsing session: 1.6 m/s at contact and 81% fuel remaining. The local session count does not change the published 60/80 unseen-start evaluation.

## Inside the crew pod

### 06. Cockpit and selected limb

![Cockpit and selected limb](../dist/screenshots/06-cockpit.jpg)

The enlarged crew pod with the throttle limb selected, engine-bank indicators and command traces. The fly is an animated illustration.

### 07. Fly’s cockpit perspective

![Fly’s cockpit perspective](../dist/screenshots/07-flys-view.jpg)

The illustrative view from inside the crew pod, facing the rendered monitors. Exact sampled eye inputs are documented separately.

### 08. Exact visual inputs

![Exact visual inputs](../dist/screenshots/08-sensory-inputs.jpg)

The actual monitor and 32 × 24 eye samples from the last controller decision. The checked indicator setting and sensory explanation describe how measurements reach the Perceiving fly through light.

### 09. Odor controls and body feedback

![Odor controls and body feedback](../dist/screenshots/09-odor-body-feedback.jpg)

Receptor-specific odor controls, zero-exposure meters and the event log, followed by actuator and body-feedback cards. These cards are mission-control context, not extra hidden numerical inputs to the Perceiving fly.

### 10. Covered-eye control

![Covered-eye control](../dist/screenshots/10-covered-eyes.jpg)

Both eyes are covered in a fresh, sampled flight. The eye arrays are black while the external monitor remains visible; the checked control is shown alongside them.

### 26. Reference-pilot input boundary

![Reference-pilot input boundary](../dist/screenshots/26-reference-pilot-inputs.jpg)

Instrument-pilot mode explicitly receives 46 numerical channels. Its eye and odor displays are inactive; this interface distinguishes the reference controller from the perceiving fly.

## Flight Lab and anatomy

### 11. Flight Lab overview

![Flight Lab overview](../dist/screenshots/11-flight-lab.jpg)

The Flight Lab shows the complete-connectome explorer and shipped generation-five checkpoint with 600 training attempts. Its five historical reward points are visible after the chart redraw fix; no new training was run for this gallery.

### 12. Modeled neural activity

![Modeled neural activity](../dist/screenshots/12-brain-activity.jpg)

The expanded brain explorer overlays modeled activity on measured anatomy. At this paused sample, 4,492 cells have modeled rate magnitude above 0.01. Dimness reflects this computed state.

### 13. Whole central nervous system

![Whole central nervous system](../dist/screenshots/13-whole-cns-anatomy.jpg)

Anatomy mode and Whole CNS reveal the measured brain and nerve-cord point cloud. These are anatomical locations, not reconstructed neuron skeletons.

### 14. Brain anatomy

![Brain anatomy](../dist/screenshots/14-brain-anatomy.jpg)

Measured synaptic anatomy in the expanded brain explorer, zoomed out using its keyboard camera controls. Straight highlighted links connect anchors and are not traced neuron arbors.

### 15. Output-neuron inspector

![Output-neuron inspector](../dist/screenshots/15-neuron-inspector.jpg)

An output neuron selected in the measured anatomy: DNge094, ID 26644. The displayed rate is modeled activity; the pulse control has not been activated.

### 16. Neural arousal controls

![Neural arousal controls](../dist/screenshots/16-neural-arousal.jpg)

Baseline global gain and the historical matched instrument-pilot experiment. The 9/12, 9/12 and 7/12 results are a software gain comparison, not biological stimulation measurements.

## Follow a decision

### 17. From wiring to movement

![From wiring to movement](../dist/screenshots/17-wiring-to-movement.jpg)

The paused throttle trace shows measured incoming edges, four displayed output cells, the learned readout and authored left-foreleg linkage. The command calculation still uses all 2,129 output cells.

### 18. Measured-edge details

![Measured-edge details](../dist/screenshots/18-measured-edge-details.jpg)

The expanded edge table records source and output IDs, contact counts, modeled signs and isolated final-pass removal effects. These effects are not whole-flight lesion experiments.

### 19. Live decision trace

![Live decision trace](../dist/screenshots/19-decision-overview.jpg)

A paused sample shows mission-control context and all ten requested versus actual control positions. Numerical descent cues and instrument memory are not inputs to the perceiving fly.

### 20. Exact decision replay

![Exact decision replay](../dist/screenshots/20-exact-decision-replay.jpg)

Throttle input-removal effects computed from the exact pre-decision state. The interface confirms the unmodified replay matches the live command exactly; isolated effects are not additive or statements about intentions.

### 21. Body and odor replay rows

![Body and odor replay rows](../dist/screenshots/21-body-odor-replay.jpg)

The remainder of the sensory-effect table includes body loads, contact, vibration and receptor-specific odor channels, followed by the recurrent-state comparison and command-scale notes.

## Choose a mission

### 22. Mission profile catalogue

![Mission profile catalogue](../dist/screenshots/22-mission-profiles.jpg)

The mission catalogue separates tested landing profiles from unverified conditions. Per-profile counts come from the shipped unseen-start evaluation, not this browsing session.

### 23. Orbital mission profiles

![Orbital mission profiles](../dist/screenshots/23-orbital-profiles.jpg)

The three orbital profiles are explicitly marked unverified for the perceiving fly. These cards describe available scenarios, not demonstrated orbital skill.

## The experiment and its evidence

### 27. The experiment: anatomy and controller

![The experiment: anatomy and controller](../dist/screenshots/27-experiment-overview.jpg)

The experiment dialog explains the retained connectome, measured anatomical positions and complete controller. It distinguishes sampled drawing geometry from full-graph computation.

### 28. The experiment: learning and arousal

![The experiment: learning and arousal](../dist/screenshots/28-learning-and-arousal.jpg)

The dialog describes the external decoder-learning procedure, the fixed anatomical graph and the limits of the global neural-gain experiment.

### 29. The experiment: model limitations

![The experiment: model limitations](../dist/screenshots/29-model-limitations.jpg)

The experiment explains recovery scoring, simplified neural activity, the lack of demonstrated orbital skill for the perceiving fly, and the fictional vehicle. These are software-model limitations.

### 30. The experiment: evidence and sources

![The experiment: evidence and sources](../dist/screenshots/30-sources-and-license.jpg)

The end of the dialog links evaluation data, the graph manifest, original data and source code. It states the source-available No Theo License and the limits of the shipped landing result.

## Earlier captures

The original three public-launch screenshots remain in [the earlier capture manifest](assets/screenshots/manifest.json). The expanded gallery above supersedes that small selection.
