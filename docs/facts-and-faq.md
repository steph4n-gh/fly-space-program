# Fly facts and project FAQ

## What are you trying to do?

Train and test a simulated fly controller through a demanding 27-mission
flight curriculum, taking the software as far as possible before building
physical Fly Cube boxes. The rocket simulator makes control failures easy to
see: a promising reward curve still has to end in a safe landing, and an
orbital mission still has to complete its required journey.

The project combines a real anatomical dataset, authored simulation choices,
learned control software and a speculative hardware direction. The
[science guide](science-and-hypotheses.md) explains how those pieces fit together.

## Is this a real fly brain?

The wiring comes from a real fly's reconstructed central nervous system.
The running activity is a mathematical model. MaleCNS includes the brain and
ventral nerve cord; it is not a recording of a living fly playing the game.
[MaleCNS source project](https://male-cns.janelia.org/).

The distinction is useful: a map tells us where connections were found, while
a simulation needs additional choices about how signals behave. Those
choices can be tested and improved.

## Does the whole network actually run?

Yes: both recurrent updates of every flight decision evaluate all **166,700
retained neurons and 25,582,938 directed connections**. A drawing of a small
highlighted circuit does not replace that computation. “Retained” matters:
the build excludes unassigned objects and annotated glia, as documented in
the [manifest](../dist/assets/connectome/manifest.json).

The flight model uses continuous activity values. A separate spiking study
exists in the research scripts; it is not the browser flight controller.

## What does the simulated fly see?

The trained cockpit presents twelve brightness indicators through two
modeled 32 × 24 eyes. The indicators encode quantities such as clearance,
velocity, deck offset and fuel. They do not tell the controller which action
to take. The model also receives authored body and odor inputs.

These eyes are a simplified grayscale interface, not a complete reproduction
of fly vision. The [curriculum guide](suite-training.md#presented-information)
describes the inputs and matched visual controls.

## Who chooses the throttle and steering?

A learned external decoder maps activity from 2,129 descending/motor neurons
to ten control commands. Its 21,300 coefficients include output biases.
At runtime, this decoder reads network activity. Calibration labels and
numerical instrument readings do not enter it as an extra navigation input.

The application also has an engineered reference pilot. Its actions and
results belong to that reference controller. See the
[controller guide](controller-and-provenance.md) for the control path and
provenance details.

## What is learning?

Software calibrates and optimizes the external decoder. The anatomical
connections within the flight network stay fixed. “Training the simulated
fly” is shorthand for training this complete software controller; it does
not mean a living animal has learned the missions, or that biological
synaptic learning has been reproduced.

## Has it solved all 27 missions?

No. The [mission curriculum report](suite-training.md) identifies the
packaged checkpoint's evaluated missions, successes, controls and failures.
Further [ground](ground-all-training.md) and [orbital](orbital-progress-comparison.md)
experiments have their own scopes and outcomes. Success on a subset does not
establish the whole suite, and a touchdown before completing an orbital
requirement does not count as orbit success.

The simulator uses stylized physics and a deliberately compact world. It is
a challenging experimental environment, not flight-qualified vehicle
software. A simulated landing does not demonstrate control of a real rocket.

## Is there a box full of flies somewhere?

No physical Fly Cube has been built or tested. The
[hardware illustrations](harness-concept.md) are generated design mock-ups.
The immediate priority is simulation work before hardware construction.

The proposed five trays of 25 cells make a 125-cell cube. That is a design
choice, not a discovered optimum. A future system would measure individual
movement and compare an aggregate with its constituent measurements. It
would not directly read 125 brains' “votes.” Reliable loading and the
transition into a flight-measurement position remain unresolved.

## Could an odor become a steering command?

That is an experimental question. Odor can influence visual processing in
flies, but attraction or aversion does not specify a throttle setting or a
left turn. The project's [chemical studies](physical-fly-interface.md) have
not established useful odor-assisted steering or a transferable chemical
control program.

Normalized odor inputs, simulated neural input rates and global circuit
gains are different quantities. None is a measured physical concentration
at an antenna. A new molecule would also require evidence about receptor
responses; the current simulator has no molecule-to-receptor predictor.

## Three facts worth bringing to mission control

- **Flies have a mechanical balance system.** Their halteres are modified
  hindwings that help detect body rotation and stabilize flight. The small
  structures behind the wings are working sensory organs.
  [Dickinson, 1999](https://doi.org/10.1098/rstb.1999.0442).
- **Fly flight simulators predate this project by decades.** A 1996 study
  demonstrated learned visual orientation in tethered flies. Performance
  varied with age, practice and diet: the participant mattered as well as
  the apparatus. [Guo et al., 1996](https://doi.org/10.1101/lm.3.1.49).
- **Smell can change how a fly responds to motion.** Experiments have linked
  odor-dependent changes in visual responses to neuromodulation. Sensory
  channels interact, which is one reason chemistry remains an interesting
  research direction. [Wasserman et al., 2015](https://doi.org/10.1016/j.cub.2014.12.012).

“Guidance is awake” is the joke in the concept art. Whether guidance can
reliably complete the next mission is the experiment.
