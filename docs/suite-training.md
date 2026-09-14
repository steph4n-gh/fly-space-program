# Learning the full mission suite

The current work extends the first visual landing lesson toward all 27
missions. The packaged checkpoint landed **60/80 unseen starts across ten
ground missions**, versus **54/80 for the previous controller on the same
starts**, **0/80 with covered eyes** and **0/80 with the indicators disabled**.
These results do not establish mastery of the full suite or transfer to a
living fly. The four original missions totalled 31/32; six engine-failure
missions ranged from 1/8 to 8/8. Every failure remains in the report.

## Presented information

The experimental cockpit uses 12 brightness indicators: measured clearance,
vertical speed, two deck-relative offsets, two deck-relative drift speeds,
pitch, roll, tangential speed, angular travel, destination altitude and fuel.
Destination altitude is a mission instruction. These indicators contain no
recommended throttle, attitude, descent target, or expert action. A camera
and engine display remain available on the other monitors.

The indicators pass through the same physical screen geometry and two
32 × 24 modeled eyes, with 4 × 4 area integration per retinal pixel. The
network receives 1,536 light channels and the existing 22 body/odor channels.
Covering the eyes hides the panel measurements. Disabling the indicators
removes their velocity information. Each of the 12 indicators has a tested
optical path to the retina.

All **166,700 neurons and 25,582,938 directed connections** participate in
both recurrent updates of every decision. The flight physics, decision
intervals, termination rules and success criteria are unchanged. There is
no preflight neural warmup that skips vehicle time.

## Sensory calibration

The static bench presents 2,048 independently randomized indicator patterns
and records 4,096 complete-network output samples. A changing-body bench
adds 6,912 samples from 384 contexts. In those contexts the independent
indicator pattern stays fixed while physical control positions, angular
motion and loads change. These are calibration presentations, not successful
flight trials. Random physical actions generate body feedback; an expert
controller supplies no actions or targets.

Regression fits the 12 actually presented, quantized brightness values and
16 body measurements from the 2,129 descending/motor activities. All samples
from one context remain in the same training or validation partition.
The validation partition selects regularization and is not a final test.
Source-data hashes are retained in the fitted sensory basis.

A later collection adds 3,778 samples from 24 complete flights on Landing
School, Atlantic Return, Fast Ferry and Spinning Entry. Those flights use a
previously learned controller; their targets are the displayed light values
and body feedback, without expert actions. The original calibration remains
preserved. A separate fit combines all 14,786 samples, holding complete
flight contexts together when selecting regularization. On the four held-out
flight contexts, excluding their first eight decisions, the deck-offset
decoding RMSE fell from 0.177/0.185 to 0.113/0.113 encoded units. This is a
calibration development comparison, not independent flight validation.

Static calibration alone was misleading: changing body feedback during
flight produced very large decoding transients and three failed probes.
Adding changing-body and startup examples corrected that failure in the
subsequent probe. The cold network remains part of every flight test. A
worker-dispatch error during data collection was caught through sample
counts; the affected static data were regenerated and the corrected dynamic
collection was checked for mode, count and buffer length before fitting.

![One matched probe before and after changing-body calibration](assets/suite-calibration-probe.png)

This illustrative probe holds the control parameters and initial state fixed.
It demonstrates the calibration failure and correction on one start, rather
than estimating the reliability of a trained controller. The current
[training snapshot](suite-training-progress.json) retains its source hashes.

The fitted coordinates are folded into the ordinary 21,300-coefficient
output readout. The runtime decoder reads neural activity; it does not
receive the calibration labels, numerical instrument measurements, or an
additional navigation array. Some coefficients are large because visual
activity is weak in this normalized rate model. These unitless coefficients
are not biological muscle gains or chemical doses.

## Flight learning and current evidence

Reward-based search first adjusts the vertical-control directions, then
releases symmetric lateral directions and attitude damping. The network
weights within the anatomical graph remain fixed. This is learning in the
external decoder, not demonstrated learning inside an animal.

An early vertical candidate completed **8/12 new selection starts**, versus
**0/12 with the eyes covered**, using matched seeds and alternating nominal
and variability-0.4 conditions. This is a model-selection result, not the
final unseen test of a released checkpoint. The exact parameters and weight
hash are recorded in
`artifacts/suite-training/vertical-selection/selection.json`.

The next vertical branch changes training seeds and includes variability
0.4. Its search fitness adds a touchdown-margin term to the original flight
reward: for successful landings, it subtracts three times the sum of squared
vertical and lateral touchdown speeds. The original reward and actual
success result remain recorded separately. The success thresholds are not
relaxed. The first attitude branch starts from the same selected vertical
candidate and trains on Landing School, Atlantic Return and Fast Ferry.

After 450 complete training flights, the revised vertical branch landed
**9/12 of the same selection starts**, versus **0/12 with covered eyes**.
Two visible-eye flights still exceeded the original touchdown-speed limit,
and one timed out. Reusing the selection set makes this a development
comparison, not a final unseen result. The attitude branch reached 3/3
landings in its last training batch, but its separate six-start pitch-gain
check landed only 1/6. A combined ground branch then ran 576 training flights,
ending with 2/6 landings in its final batch. A separate yaw-gain sweep
demonstrated that its positive yaw feedback aggravated the spinning-entry
mission. The selected negative-gain candidate stopped that failure but did
not establish reliable landings by itself.

The correlated attitude branch uses the complete-flight sensory calibration
and searches correlated parameter changes so that steering and damping can
adjust together. It includes Spinning Entry and changing seeds with nominal
and variability-0.4 conditions. Generations two and three each landed 8/8
training cases. The branch completed 768 training flights in eight generations;
that earlier released candidate was frozen at generation two. That candidate had
a separate 16-start model-selection comparison with matched covered-eye controls.
It landed 12/16 with visible inputs and 0/16 with covered eyes: 4/4 on
Landing School, 2/4 on Atlantic Return, 3/4 on Fast Ferry and 3/4 on Spinning
Entry. That set used nominal physics for Landing School and Fast Ferry,
and variability 0.4 for the other two missions. Its four failures were two
hard landings, a timeout and a missed ship.

A subsequent 32-start test uses separate seeds and balances nominal and
variability-0.4 conditions within each of the four missions. It ran the
same frozen generation-two weights through the JavaScript backend, with
matched eyes-covered and indicators-disabled conditions. All 96 complete
trajectories finished under the original mission criteria.

| Mission | Visible inputs | Covered eyes | Indicators disabled |
| --- | ---: | ---: | ---: |
| Landing School | 7/8 | 0/8 | 0/8 |
| Atlantic Return | 7/8 | 0/8 | 0/8 |
| Fast Ferry | 7/8 | 0/8 | 0/8 |
| Spinning Entry | 7/8 | 0/8 | 0/8 |

The visible-input condition landed 16/16 nominal flights and 12/16 varied
flights. Its four failures were three timeouts and a missed ship. Eight
starts per mission provide limited evidence; the result is an experimental
flight capability, not a reliability certification. The frozen weight hash
is `5c01d3c5a48a435d6d226ea1f8b5b1a2372c48b1e2248479595281ee1cfc4cf5`.
The [archived four-mission report](assets/four-mission-report.json) retains every
failure, paired condition, physical variation and source hash.

Checkpoint loading and the shared browser trainer now preserve the selected
sensory-panel version. Existing two-light checkpoints retain their original
presentation. The browser shows the twelve-field legend only for the new
panel, and checkpoint validation rejects unsupported panel names.
Browser inspection verified the twelve-cell display, illuminated retinal
images and black retinas with the eyes covered. It also exposed and fixed
a stale 3D cockpit texture: changing from the reference dashboard to the
sensory image now releases the old GPU allocation before resizing. The
pod's monitors then display the same images used by the sensory model.

At that stage, the other missions, including the full orbital trips,
remained unverified with the four-mission controller. A one-start survey of the remaining
ground profiles is a development probe, not an additional reliability test.
Across all 24 ground profiles, that survey landed 11/24 nominal starts.
All six engine-failure profiles failed. Stronger winds, a turning vessel,
low fuel and the high-speed return also exposed failures. The exact cases
and outcomes are retained in `artifacts/suite-training/ground-suite-scout/scout.json`.

## Engine recovery experiments

The first engine-bank comparison ran twelve complete flights: one- and
three-engine commands on each of the six engine-failure profiles. Both
conditions failed all six starts. The three-engine condition timed out in
every case, showing that changing the bank also requires a throttle change.

The search therefore adds three calibrated directions: measured selector
position into throttle, and body vibration and throttle position into the
engine-bank command. These are learned output coefficients using the
existing body inputs. The anatomical network and runtime readout format
remain the same. Setting the added coefficients to zero reproduced the
released checkpoint's exact weight hash and one complete JavaScript test
flight, including its original outcome.

An initial correlated search completed 576 flights in six generations
without a successful engine-failure recovery. It stopped after completing
its current generation. A separate two-dimensional grid then tested sixteen
combinations of selector-dependent throttle and vertical-speed feedback,
with four full flights per combination. The best combination landed 2/4:

| Development case | Physics | Outcome |
| --- | --- | --- |
| Landing School | Nominal | Touchdown at 2.32 m/s |
| Engine trouble | Variability 0.4 | Excess tilt and lateral speed |
| Early engine fade | Nominal | Touchdown at 2.77 m/s |
| Blackout rendezvous | Variability 0.4 | Hard landing at 5.41 m/s |

Another grid setting landed the dead-center-engine case, while its other
three cases timed out. The selected shared setting commands the
three-engine bank from the start. Reactive switching after a failure
remains unverified. These development cases selected the next starting
point; they do not establish independent reliability. Every grid case,
failure, parameter combination and archived source hash remains in
`artifacts/suite-training/engine-bank-grid/sweep.json`.

The next search included two normal missions and all six engine-failure
profiles, with changing seeds and physical variation. It releases steering
alongside throttle and engine selection because the grid also exposed
lateral and attitude failures. Its candidate ranking uses landing count
first, then the recorded reward and touchdown-margin fitness. Previously,
a zero-landing candidate with several timeouts displaced a two-landing
candidate from the search elites. Replaying that recorded generation
confirmed that the revised ordering retains three two-landing elites.
The physical success criteria and original rewards are unchanged. The
four-mission controller remained packaged while the new candidate was developed.

That search completed 960 full flights in ten generations. The selected
candidate in each generation landed four or five of its eight development
cases; none reached six. Two subsequent 64-flight grids tested measured
throttle-position and felt-load feedback, then throttle-position feedback
with a command offset. A selected setting met the original vertical-speed
limit in all four grid cases, while only two passed every landing criterion.
The other cases missed the ship or had excessive lateral speed. These
coefficients are model search parameters, not calibrated muscle properties.

Four diagnostic trajectories exactly reproduced those grid outcomes. They
retained all decisions, presented measurements, and their neural decoding.
The later-flight decoding errors were small compared with the remaining
position and attitude failures. A separate steering search therefore starts
from that setting and includes the previously tested four missions alongside
all six engine-failure profiles. The grid, selected initialization and probe
are `engine-position-bias-grid/sweep.json`, `adaptive-steering-initial.json`
and `adaptive-sensory-probe/probe.json` under `artifacts/suite-training/`.
These are development measurements, with no new independent reliability claim.

### Previous ten-mission checkpoint

The adaptive-attitude search completed **1,200 full training flights** in
ten generations. Generation six was the first with nine of ten landings in
its development batch. Its exact parameters were frozen before a separate
40-start selection comparison: 32/40 normal landings versus 0/40 with
covered eyes. All ten missions had two nominal and two varied selection
starts. Later training generations were retained as development records;
they were not substituted after seeing the final test.

The frozen generation-six checkpoint then ran **240 complete JavaScript
flights**: 80 new cases under normal, covered-eye and indicators-disabled
conditions. Within every mission, four starts used nominal physics and four
used variability 0.4. Test seeds did not overlap this lesson or its selection
set. Network startup, physical endpoints and landing limits stayed unchanged.

| Mission | Normal inputs | Covered eyes | Indicators disabled |
| --- | ---: | ---: | ---: |
| Landing school | 8/8 | 0/8 | 0/8 |
| Atlantic return | 8/8 | 0/8 | 0/8 |
| Engine trouble | 4/8 | 0/8 | 0/8 |
| Absolutely nominal | 1/8 | 0/8 | 0/8 |
| Fast ferry | 8/8 | 0/8 | 0/8 |
| Spinning entry | 8/8 | 0/8 | 0/8 |
| Early engine fade | 7/8 | 0/8 | 0/8 |
| Late engine fade | 6/8 | 0/8 | 0/8 |
| Blackout rendezvous | 3/8 | 0/8 | 0/8 |
| Last-call recovery | 3/8 | 0/8 | 0/8 |
| Total | 56/80 | 0/80 | 0/80 |

Normal-input landings were 27/40 under nominal physics and 29/40 under varied
physics. The 24 failures were 21 lateral impacts and three missed ships.
“Engine trouble” failed all four nominal starts but landed all four varied
starts, an important limit on generalization. The original four missions
totalled 32/32 in this cohort; that does not establish perfect reliability
on future starts. The harder profiles still need substantial improvement.

The [historical report](assets/ten-mission-g6-report.json) contains all 240
outcomes and the frozen pre-test plan. Its weight SHA-256 is
`eaf58811ecf1862590ac820a0d8dcafbfad66346850c51aea2372b3346626a3c`.
That checkpoint uses the three-engine bank from the start. Its throttle
and steering adapt to the existing measured body feedback; reactive
engine-bank switching is not established. These results cover ten ground
missions, leaving 17 missions without final validation for this checkpoint.

The [chemical flight pilot](biology-experiments.md#completed-chemical-flight-comparison)
used the earlier four-mission weights, preserved in the
[historical checkpoint](assets/four-mission-checkpoint.json). Its 10/16
clean-air and 9/16 odor results must not be attributed to the new checkpoint.
Chemical inputs remain off by default in the new release.

## Additional ground missions and gimbal steering

A development survey used the frozen previous controller on the other 14
ground missions: one nominal and one variability-0.4 start per mission,
with new seeds fixed before execution. It landed **16/28** full flights.
These two starts per mission identify curriculum gaps; they do not extend
the release's final validation to those missions.

| Additional mission | Landings / starts |
| --- | ---: |
| Fast approach | 2/2 |
| Rough seas | 0/2 |
| Night shift | 1/2 |
| Fin trouble | 1/2 |
| Precision barge | 2/2 |
| Figure eight | 2/2 |
| Turning vessel | 0/2 |
| Wind wall | 2/2 |
| Wind shear | 0/2 |
| Fuel reserve | 2/2 |
| Slow hands | 2/2 |
| Sideways entry | 2/2 |
| High return | 0/2 |
| Tight storm | 0/2 |

All 28 outcomes, including the failures, are retained in the development
section of the [progress record](suite-training-progress.json), alongside
the frozen checkpoint and test-plan hashes. High return timed out on both
starts; Rough seas failed on lateral speed on both. These results support
further steering and recovery training rather than a reliability claim.

That previous checkpoint has zero weights in both gimbal output heads. This
explains its motionless gimbal: it learned attitude control with the jets
while gimbal directions were held fixed. An isolated actuator check applied
opposite commands to each gimbal axis and confirmed opposite torque and
lateral acceleration, plus the corresponding foreleg linkage changes.
That check verifies the physical/control path; it is not browser visual QA
or evidence of learned steering.

The `gimbal-steering` lesson starts from a frozen copy of that previous
controller and adds five search directions: lateral position, lateral
drift, pitch, roll and angular motion. They feed both existing gimbal heads
using the same calibrated sensory activity. Jet steering and damping can
adapt jointly. All five additions start at zero; with them inactive, a
complete JavaScript flight exactly matched the released weights and
entire original outcome. No extra observations or prescribed actions are
introduced. The eight generations completed 960 full training
flights across the same ten missions. A candidate needs separate selection
and final tests before replacing the release.

Generation two was frozen after landing 9/10 training starts, then compared
on a predeclared set of 40 additional starts, with two nominal and two
varied starts per mission. All **160 selection flights** completed:

| Selection condition | Landings / starts | Original four missions |
| --- | ---: | ---: |
| Previous controller | 29/40 | 16/16 |
| Generation-two gimbal candidate | 30/40 | 15/16 |
| Same candidate with only its five gimbal coefficients zeroed | 29/40 | 16/16 |
| Gimbal candidate with covered eyes | 0/40 | 0/16 |

Compared with its gimbal-disabled counterpart, the candidate rescued two
starts and lost one windy start by missing the ship. The frozen promotion
rule required preserving both total landings and the original four-mission
landings relative to the release. **This candidate failed that criterion
and was not installed.** The small total gain does not establish reliable
improvement. These are development comparisons, not final validation.

Two separate complete-flight probes confirmed movement in both gimbal
commands and actual actuator-position feedback. The corrections stayed
within about one degree, and both probes landed. They establish that the
learned path operates; they do not override the failed selection criterion.
The eight-generation lesson subsequently completed all **960 training
flights**. Its best candidates landed 7, 9, 8, 7, 9, 9, 9 and 9 of their ten
starts, respectively. Starts changed across generations; these are training
outcomes, not reliability estimates.

Generation five was frozen before a second comparison on the same 40-start
development cohort. It landed 30/40 overall and 16/16 on the original four
missions. Its gimbal-disabled counterpart landed 29/40 and 16/16, and its
covered-eye control landed 0/40. This candidate passed the landing selection
rule. A separate plan fixed 80 new starts using the JavaScript
calculation: 240 candidate flights across three sensory conditions and 80
matched previous-controller flights. The candidate stayed fixed for that
final comparison; later training generations were not substituted.

Two additional development probes of generation five recorded both gimbal
commands and actuator-position feedback. Replaying every action reproduced
both physical flights exactly, including the recorded feedback. Corrections
stayed below half a degree on both axes. Landing School landed; the varied
windy flight failed at 3.19 m/s lateral speed. These probes demonstrate
movement, with a retained failure; they do not replace the final comparison.

### Released learned-gimbal checkpoint

All **320 final JavaScript flights** completed under that frozen plan.
Generation five landed **60/80**, compared with **54/80** for the previous
controller on exactly the same starts. Both landed 31/32 on the original
four missions, satisfying the predeclared promotion criterion. The new
controller rescued seven previous failures and lost one previous success;
the net gain was six landings. This is a small matched cohort, not a claim
of dependable performance on all missions.

| Mission | Learned gimbal and jets | Previous controller |
| --- | ---: | ---: |
| Landing school | 8/8 | 8/8 |
| Atlantic return | 8/8 | 8/8 |
| Engine trouble | 5/8 | 1/8 |
| Absolutely nominal | 1/8 | 1/8 |
| Fast ferry | 7/8 | 7/8 |
| Spinning entry | 8/8 | 8/8 |
| Early engine fade | 8/8 | 8/8 |
| Late engine fade | 5/8 | 5/8 |
| Blackout rendezvous | 7/8 | 7/8 |
| Last-call recovery | 3/8 | 1/8 |
| Total | 60/80 | 54/80 |

The candidate landed 29/40 nominal and 31/40 varied starts. Its covered-eye
and indicators-disabled controls each landed 0/80. All 20 failures remain:
15 lateral impacts and five missed ships. The lost matched success occurred
on a varied Late engine fade start. Jet weights changed with gimbal weights,
so the net gain cannot be attributed to gimbal alone; the earlier 40-start
gimbal ablation is a separate development comparison.

The [current report](../dist/assets/landing-report.json) retains the 240
candidate/control outcomes, all 80 baseline outcomes, paired results and
the frozen plans. Its weight SHA-256 is
`9953d20ee4e6b8ab7838b035ff0159c2da785ab7137566f19e91815247c0e855`.
The checkpoint was frozen after generation five and 600 trials of the
960-trial gimbal lesson. Both gimbal output heads now have learned weights;
fins and gaze remain neutral. The previous
[checkpoint](assets/ten-mission-g6-checkpoint.json) and its separate 56/80
historical cohort are preserved. This release still has no final validation
on the remaining 17 missions.

## Throttle timing across all ground missions

A full High return probe of the previous controller reproduced the timeout
seen in the earlier survey. It started with 482.03 metres of clearance and
32.92 m/s downward speed, then slowed to about 6.90 m/s while still almost
395.5 metres above the deck. After eight seconds, descent stayed between
4.20 and 6.95 m/s. It reached the unchanged mission deadline with 68.86
metres of clearance remaining. Replaying every recorded action reproduced
the entire flight result exactly.

Over that later interval, clearance and vertical-speed decoding errors
were 0.0125 and 0.0207 RMSE in encoded units. This one probe supports
testing throttle timing; it does not establish the cause of every failed
ground approach. Its trajectory samples and source hash are in the
[progress record](suite-training-progress.json).

The `vertical-all-ground` lesson starts from the frozen released controller
and adjusts only the five existing throttle directions. Every generation
includes all 24 ground missions, with rotating nominal/varied conditions
and changing training seeds. Its plan specifies four generations of eight
candidates, or 768 complete flights. Physical deadlines and touchdown
limits stay fixed. This is a separate learning branch: combining its
parameters with learned gimbal steering would require complete-flight
testing of that combined controller.

## Orbital ascent experiments

The earlier four-mission controller completed three nominal orbital baseline trials,
one per orbital mission, with the same frozen weight hash. All three returned
before reaching space. Their maximum altitudes were 19.71, 20.46 and
19.96 meters, and all flights ended after approximately 230 simulated
seconds. The complete results are in
`artifacts/suite-training/orbital-baseline/baseline.json`.

The orbital search adds seven output directions using the existing visible
destination, tangential-speed, clearance and angular-travel indicators.
All seven start at zero. A complete JavaScript flight with those additions
inactive exactly matched the packaged weights and original flight outcome.
No new controller observation, phase flag or expert action is introduced.

Training also records a separate insertion reward, evaluated from physical
outcomes after each action. Let `d` be the sum of the absolute periapsis and
apoapsis errors divided by the mission altitude, plus absolute radial speed
divided by 40. The best finite `exp(-d / 4)` reached during the flight is
its insertion quality. The extra reward is 1,200 times that quality plus
200 times the fraction of destination altitude reached, capped at one.
This gives the search a smooth measure of progress toward a circular orbit.
The original reward, actual milestones and full mission result remain
separate. Computing this reward does not set any mission-completion flag,
and its measurements never enter the sensory packet or action calculation.

The first insertion lesson uses the complete-round-trip mission, with
nominal and variability-0.4 physics and changing training seeds. Every
candidate still runs to the original physical endpoint. Its success
criterion remains a full orbit followed by deorbit, entry and barge
touchdown. This stage has not yet established an orbital flight capability.

The first insertion search completed 72 full flights in three generations:
62 reached the launch milestone and 24 reached space. None achieved a stable
orbit, a full revolution or a completed return. The original flight reward
can favor an early low-altitude failure over a longer ascent. The next search
therefore ranks actual completed mission milestones before its smooth fitness,
after checking full-mission landings first. Among candidates with equal
milestones, orbital fitness uses one tenth of the original flight reward
plus the insertion reward. Ground-flight fitness is unchanged. Original
rewards and every failed endpoint remain recorded separately. This change
does not lower any physical milestone or completion criterion.

The new `orbital-progress` experiment starts from a recorded candidate chosen
under that ordering, preserves the old trials, and retains the version of its
selection rule and fitness. It still requires independent evaluation before
any orbital capability can be claimed.

That search completed **288 full trips** in twelve generations: 276 reached
the launch milestone and 199 reached space, but none reached stable orbit,
a full revolution or a completed return. Increasing the smooth insertion
score did not satisfy any of those missing physical milestones. The current
ten-mission ground checkpoint has not received an orbital capability claim.

A full trajectory probe of the final orbital-training candidate reproduced
its nominal failure exactly. It showed substantial differences between the
presented pitch/roll indicators and their neural decoding during sustained
attitude changes. This suggests extending sensory calibration with these
observed flight contexts before another orbital search. It is a development
diagnosis, not a reason to replace eye inputs with direct flight state.

The follow-up collected **18 complete trajectories** across the three
orbital missions, six per mission with equal nominal/varied counts. This
added 21,348 examples of motor activity paired only with the actual
presented indicator and body signals. Unique context identifiers keep
whole flights together; 15 contexts enter fitting and three enter
regularization selection, one per mission. The resulting separate basis
uses 36,134 examples in total and preserves the original ground basis.

Both bases were compared on the exact same held-out contexts:

| Held-out collection | Contexts / samples | Pitch RMSE, old → extended | Roll RMSE, old → extended |
| --- | ---: | ---: | ---: |
| Earlier ground flights | 4 / 910 | 0.0161 → 0.0144 | 0.0216 → 0.0212 |
| Added orbital flights | 3 / 3,701 | 0.0788 → 0.0115 | 0.3045 → 0.0251 |

Errors are in encoded display units. These contexts selected fit
regularization, so this is a calibration-development comparison.
Independent full-flight probes of all three orbital missions still left
the recovery corridor without establishing stable orbit or a completed
return. On the one start with a matched earlier probe, post-startup pitch
decoding RMSE fell from 0.0835 to 0.0117 and roll from 0.3308 to 0.0822.
The changed trajectories mean these latter errors describe each flight's
own experienced inputs; they are not the matched-sample table above.

The `orbital-calibrated` search used this basis, with both attitude axes,
yaw damping and gimbal steering available to reward learning. It completed
all **144 full training trips** in its frozen plan: 138 reached launch and
94 reached space. None reached stable orbit, a full revolution, deorbit,
entry or a completed return. It retained the original physical criteria.
Neither improved decoding nor reaching a greater altitude counts as
completing those missing milestones.

An exact physical replay of the three initial probes found zero insertion
hold time. Their peak smooth insertion qualities ranged from 0.693 to
0.740, but all later climbed out of the recovery corridor. The score uses
the best instant during a flight; it does not measure sustained insertion.
The replay now records time above several quality levels and the original
insertion hold at every physics step.

The finished generation-six candidate also failed all three complete
development probes, each reproduced exactly by replay. Peak quality rose
to 0.782–0.805, but time above 0.7 was only 2.7–3.6 seconds and insertion
hold remained zero. At its peak, each trajectory was only 209–213 metres
high and still using roughly 78–80% throttle. All three later exhausted
their fuel and left the recovery corridor. This supports revising the
outcome-only learning reward to value sustained proximity to the original
insertion conditions; it provides no evidence of orbital capability.

### Sustained insertion lesson

The new `orbital-hold` lesson measures closeness to the actual insertion
limits after each original physics step: periapsis above 800 m, apoapsis
within 200 m of the destination, and radial speed below 5 m/s. Outside those
limits, normalized distance produces a smooth value between zero and one.
The learning score uses its best time-weighted mean over three seconds,
with missing time at startup counted as zero. A brief pass near the limits
cannot receive the same score as maintaining them for the full interval.

The exact distance is `max(0,800-periapsis)/200 +
max(0,abs(apoapsis-destination)-200)/200 + max(0,abs(radialSpeed)-5)/5`.
Instantaneous quality is `exp(-distance)`, or zero for a non-finite distance.
The original instantaneous insertion metric remains in every flight record.
The revised orbital fitness uses one tenth of the original flight score,
1,200 times the sustained quality and the existing altitude-progress term.
The existing successful-touchdown margin penalty also remains: three times
the sum of squared vertical and lateral touchdown speeds. That launch
parameter was omitted from the plan's prose formula; an explicit supplement
records it without changing the original plan. Actual landings and achieved
mission milestones still determine candidate ordering before fitness.

An engine-off circular-orbit control received full quality only after the
required duration, without completing a revolution or landing. An independent
sum over six complete recorded trajectories agreed with the rolling measure
within `7.3e-16`, including the change between 50 ms and 250 ms physics steps.
Two further full learned flights checked the new instrumentation: one ground
flight with 183 decisions and one orbital flight with 591. Every recorded
command, presented signal, decoded signal and physical result matched its
earlier counterpart exactly. Only the added reward measurements differed.

The frozen plan specifies **432 full training trips**: six generations of
12 candidates, with one nominal and one variability-0.4 start for each of
the three orbital missions in every generation. It starts from the completed
generation-six candidate and preserves the original observations, output
directions, physical endpoints and complete-return criterion. No reward
measurement enters the network's inputs or replaces its actions. This is
training in progress, not evidence of stable orbit or a completed return.

## Optional native calculation

The optional Node backend evaluates every CSR row and edge with Float32
state, double accumulation, and the same activation. The newer implementation
overlaps two adjacent independent row sums, preserving addition order within
each neuron and the synchronous neural update.
It performs no pruning or approximation. The browser implementation stays
in JavaScript. A 100-decision comparison across five mission contexts,
including the supported gain change and a neural pulse, found exactly zero
activity and command differences. The latest comparison measured a 1.66×
speedup over JavaScript on the development machine. A separate 200-decision
comparison and two complete physical trajectories found zero activity and
command differences against the previous native implementation, with a
1.145× speedup. The flight comparisons reused development starts and check
calculation parity rather than new flight reliability. The build record
retains compiler flags, Node version, source hash and binary hash; new
training records retain that build metadata and verify the binary hash.

Final flight results must also run through the browser's JavaScript backend;
the native check alone does not establish flight reliability.

## Reproduction

Run the collections sequentially when recreating the calibration files:

```sh
node scripts/collect-suite-senses.mjs
SUITE_CALIBRATION_CONTEXTS=384 SUITE_CALIBRATION_PARTS=3 node scripts/collect-suite-senses.mjs --dynamic
artifacts/lif-runtime/bin/python scripts/fit-suite-senses.py --dynamic
node scripts/check-perception.mjs
SUITE_POPULATION=9 SUITE_BATCH=3 SUITE_GENERATIONS=10 node scripts/train-suite.mjs
node scripts/build-rate-native.mjs
node scripts/check-native-rate.mjs
artifacts/lif-runtime/bin/python scripts/report-suite-training.py
# Inspect a completed probe by replaying its recorded actions:
node scripts/summarize-flight-probe.mjs artifacts/suite-training/gimbal-g5-probe/probe.json
# Inspect the new outcome measure on a complete orbital trace:
node scripts/summarize-flight-probe.mjs artifacts/suite-training/orbital-calibrated-g6-probe/probe.json --insertion-hold
node scripts/check-insertion-hold.mjs
# After all 240 frozen generation-six tests have completed:
node scripts/summarize-suite.mjs --adaptive
# For generation five of the gimbal lesson, after its 240 final tests
# and all 80 matched released-controller flights have completed:
node scripts/summarize-suite.mjs --gimbal
```

Training resumes the state in its named experiment directory. Use a new
`SUITE_BLOCK` for an independent experiment. `--evaluate` records all requested
matched conditions and writes a completion flag only after every flight
finishes. Artifacts retain failed trials as well as successes. The separate
[chemical panel](additional-odor-tests.md) did not identify a compound that
qualified for a steering follow-up.

The gimbal packager verifies the frozen selection and final plans, both
complete sensory controls, all matched baseline outcomes and the tested
runtime sources. The exact test scripts remain archived as later research
evolves; served calculations must still match the tested version. It refuses
to package a candidate that regresses on total
landings or on the original four missions in either comparison. Packaging
alone leaves the shipped checkpoint unchanged; `--install` copies a
candidate only after these same checks pass.

When the direction layout or selection order changes, initialize a new
experiment directory with `SUITE_INITIAL` pointing to the prior checkpoint
or parameter file. The trainer rejects incompatible saved search states.
