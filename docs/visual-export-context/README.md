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

## Third-party source attribution

The upstream source snapshots and quoted source excerpts in this package come
from [Code for imaging analysis, visual stimulus, and computational model](https://doi.org/10.5281/zenodo.13367946)
by Michelle Pang, Feng Chen, Marjorie Xie, Shaul Druckmann, Thomas Clandinin and
Helen Yang, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

The two complete source snapshots are **unmodified** copies of these deposited
archive members:

| Snapshot | Archive member |
| --- | --- |
| [shortFlashProcessed_saveMean.m](sources/shortFlashProcessed_saveMean.m) | `imaging-analysis.zip` → `imaging-analysis/HHY_stimulusSpecificAnalysisScripts/shortFlashProcessed_saveMean.m` |
| [fullfield_LDflash20ms_Gray500ms.txt](sources/fullfield_LDflash20ms_Gray500ms.txt) | `stimulus.zip` → `stimulus/fullfield_LDflash20ms_Gray500ms.txt` |

For the public-readiness check, both member SHA-256 hashes matched the snapshots
recorded in [manifest.json](manifest.json). The archive MD5 hashes matched the
[publisher's record](https://zenodo.org/records/13367946):
`ab8412190bef160000f35b082ed99a68` for `imaging-analysis.zip` and
`2d060bbfeb2f5dbec0f751673869e60e` for `stimulus.zip`.

The [visual_recurrent.py](sources/visual_recurrent.py) snapshot and the generated
analysis records are project-authored. The project's [No Theo License](../../LICENSE)
does not replace the CC BY 4.0 terms of the upstream material.
