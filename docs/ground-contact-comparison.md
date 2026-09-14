# Testing failed-contact quality in ground learning

This paired experiment tests whether changing the ranking of failed contacts
helps the existing controller learn all 24 ground missions. The implementation
has passed static and synthetic checks; the prescribed flights have not yet
started. There is no new performance result or released checkpoint.

The [six-flight training diagnostic](ground-training-diagnostic.md) found
separate contact-speed and tracking failures. The original flight reward
already penalizes failed contacts. This experiment changes how those outcomes
rank candidates while retaining that reward, the sensory representation and
the same 17 adjustable control directions.

Both arms start from the original final generation-six training checkpoint,
with a fresh optimizer and the same search seed. Each arm runs four generations,
12 candidates per generation and 48 complete flights per candidate: **2,304
flights per arm, 4,608 in total**. Every generation includes all 24 ground
missions in nominal and variability-0.4 conditions. The case schedule reuses
the first four generations of the original training plan. It is training
evidence, and does not reuse the later 384-flight selection comparison.

Successful landings and the existing ordered milestone counts retain first
priority in both arms. The control then ranks by the unchanged scalar fitness.
The treatment first compares mean failed-contact quality, then the same
fitness. Exact ties retain the original candidate order.

For each failed contact, quality is:

`1 / max(1, position error / landing radius, absolute vertical speed / 3.6,
lateral speed / 3, tilt / 0.2)`.

The mission's original landing radius is used. Every failed noncontact
contributes zero, and the mean includes all failed flights. Successful
landings are excluded from this mean; an all-landed candidate has a neutral
quality value of zero because its landing count already takes priority.
A quality of one can still describe a failure at an exact strict boundary
or a yaw failure: the stored contact record omits yaw speed. This metric is
not a landing probability or a replacement success rule.

The complete worker calculation is unchanged. It still runs every neural
decision and physical step to the original endpoint. The main process saves
each raw returned result before checking case identity, contact fields,
scores, landing counts and quality. All candidates in the generation finish
before an invalid result blocks ranking and the optimizer update. Complete
ledgers retain per-case quality, the original fitness and the ranking keys
for both arms.

After both original training runs finish and their full ledgers pass the
arithmetic audit, only each arm's selected generation-four checkpoint enters
the reserved development comparison. That comparison contains **48 fresh
matched starts per arm**, one nominal and one varied start per ground mission,
with normal visible inputs. Every result is reported, including contact and
noncontact failures, paired gains and losses, and cases where quality and
landing outcomes disagree. These 96 comparison flights bring the complete
experiment budget to **4,704 flights**.

One paired optimizer seed and two new starts per mission cannot establish
reliability or authorize a release. Mean quality can improve while individual
missions worsen. The experiment keeps the original landing criteria and
reports those outcomes separately from the learning metric.
