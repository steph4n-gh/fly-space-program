# Eight-export visual context manifest

`manifest.json` inventories all eight compact L1/L2 control and CDM exports from
the existing verified source metadata. Every populated field has a source
pointer. The package preserves the metadata and source text used for the
manifest in `sources/`, with checked SHA-256 digests. `exports.csv` is a flat
eight-row index; empty context cells correspond to explicit unresolved/null
fields in the JSON.

| Compact control export | Documented CDM comparison export | Cell | Condition label |
|---|---|---|---|
| L1_highLum.mat | L1_CDM_highLum.mat | L1 | highLum |
| L1_lowLum.mat | L1_CDM_lowLum.mat | L1 | lowLum |
| L2_highLum.mat | L2_CDM_highLum.mat | L2 | highLum |
| L2_lowLum.mat | L2_CDM_lowLum.mat | L2 | lowLum |

The manifest records exact filenames, archive members, prior recorded byte
counts and response-file hashes, stored variable schemas, compact cell/condition/
treatment labels, and the four reciprocal file comparisons. These comparisons
do not establish matched animals. CDM is chlordimeform, an octopamine agonist used
in the source brain-bath experiment; no per-record dose or exposure history is
assigned.

The existing comparison plan documents 63 samples, zero-based row 0 dark and
row 1 bright, and trailing 1/120-second observation-bin endpoints. Those are
observation metadata. No acquisition-specific stimulus timing or prehistory
has an exact source-backed join to an individual compact export in this bounded
review. The generic source definition specifies 20 ms flashes and 500 ms gray,
but is explicitly retained as **unjoined reference material**. Fixed analysis
windows and isolated zero-initialized model flashes do not establish the
original stimulation sequence or adaptation state.

All eight exports explicitly leave these original-record fields unresolved:
processed filename and rename record; selected ROI and time-series IDs; animal
IDs and treatment pairing; stimulus run log, prehistory and actual timing;
PWM/filter settings; background/flash radiances and calibration ID. Neither
200/20 PWM intermediate selection names nor highLum/lowLum labels provide the
missing export mapping. The bounded review's failure to find that join is not a
claim that the original records do not exist elsewhere.

The original records needed to complete the manifest are:

1. An export/deposition mapping joining each compact filename and SHA-256 to the
   exact processed file and version, including any rename step.
2. Executed ROI/recording selection records: `iResp`, `roiDataMat` indices, ROI,
   time-series and animal IDs, and any before/after treatment matching.
3. Recording-specific stimulus logs, actual timing and sequence, prefix/history,
   and clock alignment to the exported time coordinate.
4. Recording-specific PWM/filter/hardware settings joined to the corresponding
   calibrated background and flash radiances, with units, spectral information,
   uncertainty when documented, and calibration record IDs.

Each completed field needs an exact export-to-record chain, source pointer and
record hash. The JSON contains these requirements by field and record category.

`raw-model-scaling.md` independently checks the source-level mathematical point:
with otherwise identical raw-flash conditions, positive amplitude multipliers
shared before/after treatment scale each treatment-change vector by a positive
constant and cannot reverse its sign. The proof covers admissible inputs and
zero/scaled initial states; it excludes arbitrary unscaled prehistories and the
nonlinear periodic natural-response normalization.

`build_manifest.py` uses only the Python standard library and existing metadata/
source text. `validation.json` reports eight distinct export identities,
reciprocal comparisons, resolving evidence pointers, frozen input hashes, and
14 unresolved context fields per export. No response MAT files or response
archives were opened, no new response arrays were read, and no model was run.
Response-file and archive hashes are explicitly labeled as prior recorded
identities; only the metadata/source snapshots were rehashed for this task.
