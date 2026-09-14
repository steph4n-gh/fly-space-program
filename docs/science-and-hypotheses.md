# Science, hypotheses and what would count as progress

The ambition is to take a simulated fly controller as far as possible through
the 27-mission flight curriculum **before building physical Fly Cube boxes**.
That includes understanding failed landings, improving the model and testing
whether learned behavior survives new conditions. A successful simulator
controller would be a substantial software result. Establishing which parts
reflect fly biology, and whether any behavior transfers to a living fly, are
additional research questions. The physical harness has not been built.

## What is biological, and what is modeled?

The anatomical starting point is the [MaleCNS v1.0 connectome](https://male-cns.janelia.org/).
It includes the brain and ventral nerve cord from one male fruit fly, with
their connecting neck pathways intact. The ventral nerve cord is especially
relevant to movement; calling this only a brain obscures part of the source.
[Janelia's project overview](https://www.janelia.org/project-team/flyem/male-cns-connectome)
describes the reconstruction.

The application retains **166,700 annotated neurons, 25,582,938 directed
connections and 124,177,617 synaptic contacts**. It excludes objects without
an assigned neuronal superclass and explicitly annotated glia, together with
their connections. It adds no further contact-count threshold to the pinned
source files. Thus “full graph” means the complete retained neuronal graph,
with these exclusions stated. The [graph manifest](../dist/assets/connectome/manifest.json)
and [builder](../scripts/build_full_connectome.py) make the boundary inspectable.

| Part | What the project uses | What that does not establish |
| --- | --- | --- |
| Wiring | Measured anatomical connections and contact counts | Complete synaptic physiology or the animal's moment-to-moment activity |
| Flight controller's neural dynamics | Two recurrent updates of every retained neuron and connection per decision | Measured neural timing, spikes or biological firing rates |
| Sensory input | Modeled retinal images, body feedback and odor channels | A fully calibrated eye, mechanosensory system or chemical delivery apparatus |
| Control output | A learned external decoder of descending/motor activity | A biological mapping from muscles to rocket controls |
| Learning | Software fits and searches the external decoder while anatomical connections stay fixed | Synaptic plasticity or learning demonstrated inside a living fly |

The flight controller is a **signed, continuous rate-style model**. Its
activity values are dimensionless numbers, not measured hertz. Its
[implementation](../dist/full-network.js) normalizes incoming contact counts
and applies a nonlinear update. Transmitter signs, input tuning and timing
remain assumptions; treating histamine and unknown transmitters as excitatory
is a documented limitation. Computing the entire graph makes the anatomical
scope real, but does not make every modeled property biologically accurate.

## Why try this?

Connectomes can constrain useful models. Lappalainen and colleagues combined
fly visual-system connectivity with task-based fitting of unknown parameters
and obtained neural-response predictions that agreed with many experimental
observations. Their result supports combining anatomy, optimization and
physiological validation. It does not imply that a wiring diagram alone
specifies a working brain. [Lappalainen et al., 2024](https://doi.org/10.1038/s41586-024-07939-3).

Shiu and colleagues used a connectome-based spiking model to make and test
predictions about sensorimotor pathways, including feeding and grooming.
This project also has a **separate Brian2 spiking experiment** informed by
that work. Transferring its parameters to MaleCNS, olfaction and wing-motor
output introduces new assumptions; the browser's flight controller remains
the rate-style model described above. [Shiu et al., 2024](https://doi.org/10.1038/s41586-024-07763-9);
[local experiment record](physical-fly-interface.md#expanded-chemistry-and-a-separate-spiking-experiment).

Living flies can also participate in closed-loop visual tasks. Conditioned
visual orientation has been demonstrated in a tethered flight simulator,
with performance depending on factors such as experience and age. This
supports the possibility of a measured sensory-to-movement interface. The
published task and a rocket-landing curriculum are very different problems.
[Guo et al., 1996](https://doi.org/10.1101/lm.3.1.49).

## The hypotheses to keep separate

These are research questions, not promises or claims that every comparison
below has already been run.

| Hypothesis | Evidence that would support it | Current interpretation |
| --- | --- | --- |
| Presented visual information helps the controller fly. | A frozen controller performs better with useful visual input than under matched input controls. | The [mission curriculum](suite-training.md) reports matched covered-eye and disabled-indicator tests. Their support is limited to the evaluated checkpoint and missions. |
| The measured wiring contributes something that a generic network would not. | A fair comparison with suitably matched alternative wiring, using the same inputs, decoder capacity, training budget and final test conditions. | Full-graph participation alone does not establish this. The visual controls do not isolate the value of anatomical wiring. |
| A curriculum can develop broader competence. | Improvements on new, reserved starts while retaining earlier skills; complete orbit-and-return success where required. | Ground and orbital development have separate [experiment reports](../README.md). Training reward and a few good trajectories cannot substitute for final task success. |
| Odor can usefully change responses to visual cues. | Reproducible, calibrated changes that improve a specified task against matched controls. | This is biologically plausible, but the project's chemical studies have not established useful steering or physical control. |
| An ensemble of flies could improve a future interface. | Measured individual and aggregate behavior showing a benefit after accounting for invalid measurements and shared errors. | The 125-cell [Fly Cube](harness-concept.md) is a design concept. Its cell count and aggregation rule have no demonstrated control advantage. |

The odor hypothesis has a specific biological motivation: Wasserman and
colleagues found that odor altered motion-vision processing and optomotor
responses through a neuromodulatory pathway. That makes sensory context worth
studying. It does not assign an odor a universal meaning such as “turn left,”
nor turn a software gain into a chemical dose.
[Wasserman et al., 2015](https://doi.org/10.1016/j.cub.2014.12.012).

## Reading the evidence

Three kinds of progress answer different questions. **Simulation performance**
asks whether the frozen software completes the specified missions on unseen
starts. **Biological validation** asks whether the model predicts measured
responses to comparable stimuli. **Physical transfer** asks whether a real,
measured fly interface closes a useful control loop. Success at one level
does not automatically establish the next.

Read [the controller and provenance guide](controller-and-provenance.md) for
the implemented control path, [mission training](suite-training.md) for flight
evidence, and [biology experiments](biology-experiments.md) for calibration
results and their limits. The [physical-interface plan](physical-fly-interface.md)
records what would need measurement when hardware work begins. For now, the
priority is to develop and challenge the simulated system as far as it can go.
