"""Build a metadata-only, source-backed inventory of eight visual exports.

Uses Python's standard library; never opens response .mat files, executes author
analysis, imports the simulator, fits, simulates, or changes the repository.
"""
import csv
import hashlib
import json
from pathlib import Path


ROOT = Path('/Users/sarrington/Documents/ChatGPT/connectome')
OUT = Path('/tmp/visual-export-context-manifest')
SOURCES = OUT / 'sources'
SOURCES.mkdir(parents=True, exist_ok=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def freeze(source_id, path, snapshot_name, expected=None):
    content = path.read_bytes()
    sha = digest(content)
    if expected is not None:
        assert sha == expected, (source_id, sha, expected)
    snapshot = SOURCES / snapshot_name
    snapshot.write_bytes(content)
    return {
        'sourceId': source_id, 'originalPath': str(path),
        'snapshotPath': str(snapshot.relative_to(OUT)), 'sha256': sha,
        'hashVerifiedThisTask': True,
    }, content


evidence_source, evidence_bytes = freeze(
    'context-review', Path('/tmp/visual-context-identifiability-review/evidence.json'),
    'context-identifiability-evidence.json',
    'c265adf024688da20363c996b5f1776df8d78ded39da9aa8c8cb7588e5e3692d')
evidence = json.loads(evidence_bytes)
assert evidence['exactCompactFilenamePhysicalContextJoinFound'] is False

plan_relative = 'artifacts/odor-interface/cdm-response-comparison/plan.json'
manifest_relative = 'artifacts/odor-interface/cdm-response-comparison/source-manifest.json'
plan_source, plan_bytes = freeze('comparison-plan', ROOT / plan_relative,
    'cdm-comparison-plan.json', evidence['inputSHA256'][plan_relative])
input_source, input_bytes = freeze('export-inventory', ROOT / manifest_relative,
    'cdm-source-manifest.json', evidence['inputSHA256'][manifest_relative])
plan, inventory = json.loads(plan_bytes), json.loads(input_bytes)
assert plan['manifestSHA256'] == input_source['sha256']
assert len(inventory['data']) == 8 and len(plan['pairs']) == 4

author_by_path = {record['path']: record for record in evidence['verifiedSources']}
exporter_key = 'imaging-analysis/HHY_stimulusSpecificAnalysisScripts/shortFlashProcessed_saveMean.m'
stimulus_key = 'stimulus/fullfield_LDflash20ms_Gray500ms.txt'
notebook_key = 'computational-model/CDM_results.ipynb'
exporter_source, _ = freeze('generic-exporter',
    Path('/tmp/visual-calibration-sources/shortFlashProcessed_saveMean.m'),
    'shortFlashProcessed_saveMean.m', author_by_path[exporter_key]['sha256'])
stimulus_source, _ = freeze('generic-stimulus',
    ROOT / 'artifacts/odor-interface/visual-response-benchmark/data/fullfield_LDflash20ms_Gray500ms.txt',
    'fullfield_LDflash20ms_Gray500ms.txt', author_by_path[stimulus_key]['sha256'])
for record, key in [(exporter_source, exporter_key), (stimulus_source, stimulus_key)]:
    record.update({k: v for k, v in author_by_path[key].items() if k != 'sha256'})
    record['sourceCommit'] = evidence['verifiedSourceCommit']
code_source, code_bytes = freeze('raw-model-source', ROOT / 'scripts/visual_recurrent.py',
    'visual_recurrent.py')

source_catalog = [input_source, plan_source, evidence_source, exporter_source,
                  stimulus_source, code_source]


def ref(source_id, pointer=None, lines=None):
    out = {'sourceId': source_id}
    if pointer is not None:
        out['jsonPointer'] = pointer
    if lines is not None:
        out['linesOneBasedInclusive'] = lines
    return out


def field(value, status, evidence_refs, qualification=None):
    out = {'value': value, 'status': status, 'evidence': evidence_refs}
    if qualification:
        out['qualification'] = qualification
    return out


unresolved = {
    'originalProcessedFilename': ('export-lineage', 'No exact compact-export-to-original-processed-file join was found in the bounded review.'),
    'exportRenameRecord': ('export-lineage', 'The exporter preserves its input filename, but no executed export/rename inventory joins that input to this compact file.'),
    'selectedROIIdentifiers': ('recording-selection', 'A generic iResp/roiDataMat selection algorithm does not identify the ROIs used for this compact export.'),
    'selectedTimeSeriesIdentifiers': ('recording-selection', 'No executed recording/time-series selection table is joined to this compact export.'),
    'animalIdentifiers': ('recording-selection', 'Individual response columns or counts do not establish animal identities.'),
    'animalTreatmentPairing': ('recording-selection', 'Documented compact-file comparisons do not establish matched animals before/after treatment.'),
    'stimulusRunLog': ('stimulus-history', 'No acquisition-specific stimulus run log is joined to this compact export.'),
    'stimulusPrehistory': ('stimulus-history', 'An isolated zero-initialized model flash and a generic gray duration do not establish the recording prehistory.'),
    'actualStimulusTiming': ('stimulus-history', 'No source-backed join establishes the acquisition-specific onsets, durations, epoch sequence, or clock alignment for this compact export.'),
    'PWMSetting': ('optical-calibration', 'Intermediate 200/20 PWM selection filenames are not an exact mapping to this compact export.'),
    'opticalFilterSetting': ('optical-calibration', 'No acquisition-specific optical filter setting is joined to this compact export.'),
    'backgroundRadiance': ('optical-calibration', 'Neither a compact condition label nor general apparatus radiance establishes calibrated background radiance for this export.'),
    'flashRadiances': ('optical-calibration', 'No calibrated bright/dark flash radiances are joined to this compact export.'),
    'radianceCalibrationIdentifier': ('optical-calibration', 'No calibration record identifier is joined to the acquisition underlying this compact export.'),
}

pair_by_file = {}
for i, pair in enumerate(plan['pairs']):
    for file_key, other_key, label in [('controlFile', 'cdmFile', 'control'),
                                        ('cdmFile', 'controlFile', 'CDM')]:
        assert pair[file_key] not in pair_by_file
        pair_by_file[pair[file_key]] = (i, pair, file_key, other_key, label)

exports = []
for i, item in enumerate(inventory['data']):
    name = item['file']
    pair_i, pair, file_key, other_key, treatment = pair_by_file[name]
    notebook_i = 0 if pair['cell'] == 'L1' else 1
    cell_source = evidence['compactFilenamePairingCells'][notebook_i]['source']
    assert name in cell_source and pair[other_key] in cell_source
    inventory_ref = lambda key: [ref('export-inventory', f'/data/{i}/{key}')]
    pair_ref = lambda key: [ref('comparison-plan', f'/pairs/{pair_i}/{key}')]
    notebook_ref = ref('context-review', f'/compactFilenamePairingCells/{notebook_i}')
    fields = {
        'compactFilename': field(name, 'verified-existing-metadata', inventory_ref('file') + [notebook_ref]),
        'archiveMember': field(item['archiveMember'], 'verified-existing-metadata', inventory_ref('archiveMember')),
        'bytes': field(item['bytes'], 'recorded-source-identity', inventory_ref('bytes'), 'Recorded in the frozen prior inventory; response file bytes were not reread this task.'),
        'sha256': field(item['sha256'], 'recorded-source-identity', inventory_ref('sha256'), 'The inventory hash is verified this task; this response file digest is a prior recorded digest, not a new response-file hash.'),
        'schema': field(item['schema'], 'verified-existing-metadata', inventory_ref('schema'), 'Stored variable names, types, and dimensions only; no response values or new ROI counts inspected.'),
        'cellType': field(pair['cell'], 'documented-compact-label', pair_ref('cell') + [notebook_ref]),
        'conditionLabel': field(pair['condition'], 'documented-compact-label', pair_ref('condition') + [notebook_ref], 'A compact highLum/lowLum label; no physical luminance, radiance, or ratio is assigned.'),
        'treatmentLabel': field(treatment, 'documented-compact-label', pair_ref(file_key) + [notebook_ref], 'CDM is chlordimeform in the source experiment; label does not supply dose or acquisition-specific exposure history.'),
        'treatmentMeaning': field('chlordimeform (octopamine agonist), source brain-bath treatment' if treatment == 'CDM' else 'control comparator for the named CDM condition', 'documented-existing-analysis', [ref('comparison-plan', '/interpretationLimits/0')] + pair_ref(file_key), 'No per-record dose, exposure time, animal matching, or airborne odor inference.'),
        'documentedComparisonFile': field(pair[other_key], 'documented-file-comparison', pair_ref(other_key) + [notebook_ref], 'Comparison by cell type and compact condition only; animal/recording pairing remains unresolved.'),
        'sampleCount': field(63, 'verified-existing-metadata', inventory_ref('schema')),
        'storedPolarityRowsZeroBased': field({'0': 'dark', '1': 'bright'}, 'documented-existing-analysis', [ref('comparison-plan', '/observation')]),
        'observationBinWidthSeconds': field({'numerator': 1, 'denominator': 120}, 'documented-existing-analysis', [ref('comparison-plan', '/observation')], 'Observation sampling metadata from the prior comparison; not acquisition-specific flash timing.'),
        'timeCoordinateConvention': field('t contains trailing bin endpoints; all 63 bins retained', 'documented-existing-analysis', [ref('comparison-plan', '/observation')], 'No original stimulus clock, realized sequence, baseline state, or adaptation history is thereby recovered.'),
    }
    for key, (category, reason) in unresolved.items():
        fields[key] = field(None, 'unresolved', [
            ref('context-review', '/exactCompactFilenamePhysicalContextJoinFound'),
            ref('context-review', '/boundedConclusion'),
        ], reason)
        fields[key]['neededRecordCategory'] = category
    assert all(v['shape'] == [2, 63] for v in item['schema'] if v['name'] == 'meanResp')
    exports.append({'exportId': name.removesuffix('.mat'), 'fields': fields})

needed_records = [
    {'id': 'export-lineage', 'records': 'Original export/rename or deposition mapping, linking each compact filename and SHA-256 to the exact processed filename and version.', 'minimumEvidence': 'Exact mapping row or executed export record, source location, file hash, and export identity.'},
    {'id': 'recording-selection', 'records': 'Processed-file metadata and executed selection records: iResp, roiDataMat indices, ROI IDs, time-series/recording IDs, animal IDs, and any before/after treatment matching.', 'minimumEvidence': 'Selections joined through the export-lineage record, with stable identifiers and record hashes.'},
    {'id': 'stimulus-history', 'records': 'Per-recording stimulus run logs and acquisition clocks: actual epochs/onsets/durations, realized ordering or seed plus generator version, prefix/adaptation history, and alignment to recorded t.', 'minimumEvidence': 'A log-to-recording-to-export join, preserved stimulus prefix and timing, source location, and record hashes.'},
    {'id': 'optical-calibration', 'records': 'Per-recording PWM/filter/hardware settings and the corresponding calibration table for background and bright/dark flash spectral radiance.', 'minimumEvidence': 'A setting/session/calibration join through recording/export identity, units and wavelength/band, measurement uncertainty when documented, and calibration record hashes.'},
]

manifest = {
    'schema': 'visual-export-context-manifest-v1',
    'status': 'eight-export-metadata-manifest-complete; original-record-context-unresolved',
    'scope': 'Existing source and metadata only. No new response arrays, fits, simulations, author contact, or repository edits.',
    'sourceCommit': evidence['verifiedSourceCommit'],
    'sourceCatalog': source_catalog,
    'authorNotebook': author_by_path[notebook_key],
    'archiveIdentity': {
        'file': inventory['archiveFile'], 'sha256': inventory['archiveSHA256'],
        'status': 'recorded-in-frozen-existing-inventory', 'rehashThisTask': False,
        'evidence': [ref('export-inventory', '/archiveFile'), ref('export-inventory', '/archiveSHA256')],
    },
    'responseFilesRehashedThisTask': False,
    'newResponseArraysRead': 0,
    'exports': exports,
    'genericReferencesNotJoinedToExports': [
        {
            'kind': 'stimulus-definition', 'linkedToAnyExactCompactExport': False,
            'sourceId': 'generic-stimulus',
            'definition': {
                'stimulusClass': 'FullFieldFlashOntoGray', 'flashDurationSeconds': [0.02, 0.02],
                'flashContrastSourceValues': [0, 1], 'grayDurationSeconds': 0.5,
                'grayContrastSourceValue': 0.5, 'repeatRNGSeedSourceValue': 0,
            },
            'evidence': [ref('generic-stimulus', lines=[1, 8])],
            'qualification': 'Verified source definition only; not evidence that this exact configuration or realized sequence generated any particular compact export. Contrast entries are source-file values, not calibrated radiances.',
        },
        {
            'kind': 'generic-export-script', 'linkedToAnyExactCompactExport': False,
            'sourceId': 'generic-exporter',
            'documentedAlgorithm': 'Select pairedEpochs [1 2]; take roiDataMat(iResp,2); export selected rats means and individual arrays with t from the first selected ROI; preserve input fileName.',
            'evidence': [ref('generic-exporter', lines=[14, 15]), ref('generic-exporter', lines=[25, 31]), ref('generic-exporter', lines=[35, 56])],
            'qualification': 'No compact renaming table or executed file/ROI selection inventory is supplied by this algorithm. Its filename preservation does not resolve the original processed filename.',
        },
    ],
    'originalRecordsNeeded': needed_records,
    'completionRule': 'Resolve an individual field only with an exact source-backed chain from compact export identity to original recording and the relevant record, preserving the source pointer and record hash. Never infer an export join from 200/20 PWM intermediate selection names, a compact label ratio, or general apparatus radiance.',
    'boundedMissingJoinConclusion': evidence['boundedConclusion'],
    'rawModelImplication': {
        'note': 'raw-model-scaling.md', 'sourceId': 'raw-model-source',
        'conclusion': 'For admissible positive scaling of the complete input and initial state, the raw dynamical response and fixed bin-integral observation are positively homogeneous. Condition-specific positive amplitude scaling shared before/after treatment cannot by itself reverse the treatment-change sign between otherwise identical high/low conditions.',
        'limitations': 'Exact mathematical model, not bitwise floating-point equality. Scaled inputs must satisfy the code domain and both paths must pass validity checks. Excludes unscaled/arbitrary prehistory, condition-dependent parameters or observation operators, and periodic natural-response normalization.',
    },
}

(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

csv_keys = ['exportId', 'compactFilename', 'cellType', 'conditionLabel', 'treatmentLabel',
            'sha256', 'bytes', 'documentedComparisonFile', 'sampleCount',
            'observationBinWidthSeconds', 'timeCoordinateConvention',
            *unresolved.keys(), 'allOriginalContextFieldsStatus', 'evidencePointer']
with (OUT / 'exports.csv').open('w', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=csv_keys)
    writer.writeheader()
    for i, item in enumerate(exports):
        row = {'exportId': item['exportId']}
        for key in csv_keys:
            if key in item['fields']:
                value = item['fields'][key]['value']
                row[key] = '1/120' if key == 'observationBinWidthSeconds' else value
        row['allOriginalContextFieldsStatus'] = 'unresolved; empty CSV fields correspond to explicit JSON nulls'
        row['evidencePointer'] = f'manifest.json#/exports/{i}/fields'
        writer.writerow(row)


def pointer_get(obj, pointer):
    for piece in pointer.lstrip('/').split('/'):
        piece = piece.replace('~1', '/').replace('~0', '~')
        obj = obj[int(piece)] if isinstance(obj, list) else obj[piece]
    return obj


by_source = {record['sourceId']: record for record in source_catalog}
checks = []
for source in source_catalog:
    assert digest((OUT / source['snapshotPath']).read_bytes()) == source['sha256']
checks.append('All six source snapshot hashes match recorded identities; frozen comparison metadata hashes agree with the prior context review.')
for export in exports:
    for key, entry in export['fields'].items():
        assert entry['evidence'], (export['exportId'], key)
        for source_ref in entry['evidence']:
            source_path = OUT / by_source[source_ref['sourceId']]['snapshotPath']
            if 'jsonPointer' in source_ref:
                pointer_get(json.loads(source_path.read_text()), source_ref['jsonPointer'])
        if key in unresolved:
            assert entry['value'] is None and entry['status'] == 'unresolved'
checks.append('Every export field has resolving JSON evidence pointers; all 14 unresolved context fields remain null for each of eight exports.')
by_name = {item['fields']['compactFilename']['value']: item for item in exports}
for name, item in by_name.items():
    other_name = item['fields']['documentedComparisonFile']['value']
    assert by_name[other_name]['fields']['documentedComparisonFile']['value'] == name
    assert item['fields']['conditionLabel']['value'] == by_name[other_name]['fields']['conditionLabel']['value']
    assert item['fields']['cellType']['value'] == by_name[other_name]['fields']['cellType']['value']
checks.append('Four comparison pairs are reciprocal and agree on cell type and compact condition; this check makes no animal-pairing claim.')
with (OUT / 'exports.csv').open(newline='') as handle:
    csv_rows = list(csv.DictReader(handle))
assert len(exports) == len(csv_rows) == len(by_name) == 8
assert len({item['fields']['sha256']['value'] for item in exports}) == 8
checks.append('JSON and CSV contain exactly eight unique compact exports and eight distinct recorded response-file hashes.')
checks.append('Construction read metadata/source snapshots only; no .mat file or response archive was opened and no model code was executed.')
validation = {
    'status': 'passed', 'checks': checks, 'exportCount': 8,
    'unresolvedContextFieldCountPerExport': len(unresolved),
    'manifestSHA256': digest((OUT / 'manifest.json').read_bytes()),
    'csvSHA256': digest((OUT / 'exports.csv').read_bytes()),
    'builderSHA256': digest(Path(__file__).read_bytes()),
    'newResponseArraysRead': 0, 'responseFilesRehashedThisTask': 0,
    'fits': 0, 'simulations': 0, 'repositoryEdits': 0,
}
(OUT / 'validation.json').write_text(json.dumps(validation, indent=2) + '\n')
print(json.dumps(validation, indent=2))
