"""Inventory annotated amine cells and measured contacts into named target pools.

This reads anatomy only. Contact counts are not physiological release strength,
receptor expression, an effective dose, or evidence of a behavioral effect.
"""
from pathlib import Path
from collections import Counter
import argparse
import gzip
import hashlib
import json
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'dist/assets/connectome'
parser = argparse.ArgumentParser()
parser.add_argument('--motion-inputs', action='store_true', help='Also inventory named ON-motion inputs implicated by published physiology')
parser.add_argument('--output', type=Path, default=ROOT/'docs/neuromodulator-targets.json')
args = parser.parse_args()
if args.motion_inputs and args.output.resolve() == (ROOT/'docs/neuromodulator-targets.json').resolve():
    parser.error('Use a separate output for the expanded inventory')
manifest = json.loads((BASE / 'manifest.json').read_text())
labels = json.loads((BASE / 'labels.json').read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
source_hashes = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in [BASE/'manifest.json', BASE/'labels.json', Path(__file__)]}

def array(entry, dtype):
    file = BASE / entry['file']
    raw = file.read_bytes()
    assert sha(raw) == entry['sha256'], file
    source_hashes[str(file.relative_to(ROOT))] = entry['sha256']
    decoded = gzip.decompress(raw)
    assert len(decoded) == entry['bytes']
    return np.frombuffer(decoded, dtype=dtype)

ids = array(manifest['nodes']['ids'], '<u4')
types = np.array(labels['types'])[array(manifest['nodes']['types'], '<u2')]
rows = array(manifest['nodes']['rows'], '<u4')
transmitters = np.array(labels['transmitters'])
assert len(ids) == len(types) == len(transmitters) == manifest['neurons'] == 166700
annotation_file = ROOT / 'data/body-annotations-male-cns-v1.0-minconf-0.5.feather'
transmitter_file = ROOT / 'data/body-neurotransmitters-male-cns-v1.0.feather'
annotations = pd.read_feather(annotation_file, columns=['bodyId', 'type', 'superclass', 'status'])
annotations = annotations[annotations.superclass.notna() & (annotations.status != 'Glia')].sort_values('bodyId').reset_index(drop=True)
consensus = pd.read_feather(transmitter_file, columns=['body', 'consensus_nt']).set_index('body').consensus_nt
assert np.array_equal(annotations.bodyId.to_numpy(np.uint64), ids.astype(np.uint64))
assert np.array_equal(annotations.type.fillna('untyped').to_numpy(), types)
assert np.array_equal(annotations.bodyId.map(consensus).fillna('unknown').to_numpy(), transmitters)
for file in [annotation_file, transmitter_file]:
    source_hashes[str(file.relative_to(ROOT))] = sha(file.read_bytes())
assert len(rows) == len(ids)+1 and rows[0] == 0 and rows[-1] == manifest['edges'] == 25582938
assert np.all(rows[1:] >= rows[:-1])
posts = np.repeat(np.arange(len(ids), dtype=np.uint32), np.diff(rows))
target_types = {
    'T4': ['T4a', 'T4b', 'T4c', 'T4d'],
    'T5': ['T5a', 'T5b', 'T5c', 'T5d'],
    'Kenyon cells': sorted({t for t in types if t.startswith('KC')}),
}
if args.motion_inputs:
    target_types.update({name: [name] for name in ['Mi1', 'Tm3', 'Mi4', 'Mi9', 'L5']})
targets = {name: np.isin(types, names) for name, names in target_types.items()}
amines = ['octopamine', 'dopamine', 'serotonin']
source_masks = {name: transmitters == name for name in amines}
contacts = {(amine, target): np.zeros(len(ids), dtype=np.int64) for amine in amines for target in targets}
edge_counts = {key: 0 for key in contacts}
target_cells = {key: set() for key in contacts}
total_contacts = 0
position = 0
for part in manifest['parts']:
    assert part['start'] == position
    pre = array(part['pre'], '<u4')
    weights = array(part['weight'], '<u2')
    assert len(pre) == len(weights) == part['count'] and pre.max() < len(ids)
    post = posts[position:position+len(pre)]
    for amine, source_mask in source_masks.items():
        source_matches = source_mask[pre]
        for target, target_mask in targets.items():
            key = (amine, target)
            selected = source_matches & target_mask[post]
            np.add.at(contacts[key], pre[selected], weights[selected].astype(np.int64))
            edge_counts[key] += int(selected.sum())
            target_cells[key].update(map(int, post[selected]))
    total_contacts += int(weights.sum(dtype=np.uint64))
    position += len(pre)
assert position == manifest['edges'] and total_contacts == manifest['synapticContacts']

connections = []
for amine in amines:
    for target in targets:
        key = (amine, target)
        indices = np.flatnonzero(contacts[key])
        ranked = sorted(map(int, indices), key=lambda i: (-int(contacts[key][i]), int(ids[i])))
        connections.append({'sourceTransmitterLabel': amine, 'targetPool': target,
                            'sourceCellsWithContacts': len(indices), 'targetCellsReached': len(target_cells[key]),
                            'directedEdges': edge_counts[key], 'synapticContacts': int(contacts[key].sum()),
                            'sources': [{'index': i, 'bodyId': int(ids[i]), 'type': str(types[i]), 'contacts': int(contacts[key][i])} for i in ranked]})
report = {'schema': 'neuromodulator-target-inventory-v1', 'dataset': manifest['dataset'], 'source': manifest['source'],
          'license': manifest['license'], 'sourceSHA256': source_hashes,
          'checkedGraph': {'neurons': len(ids), 'edges': position, 'synapticContacts': total_contacts},
          'transmitterCounts': dict(Counter(map(str, transmitters))),
          'targets': {name: {'types': names, 'cells': int(targets[name].sum())} for name, names in target_types.items()},
          'motionInputsIncluded': args.motion_inputs,
          'unclearMotionTypesExcluded': {name: int((types == name).sum()) for name in ['T4_unclear', 'T5a_unclear']},
          'hxLabelMatches': [name for name in labels['types'] if 'hx' in name.lower()],
          'connections': connections,
          'limitations': ['Transmitter consensus labels are annotations, not measured release under the proposed stimuli.',
                          'Chemical synaptic contacts do not specify postsynaptic receptor expression or receptor-dependent effects.',
                          'Extrasynaptic signaling, co-transmission, release kinetics and plasticity are not established by these counts.',
                          'No Hx homology is inferred when a matching cell-type label is absent.',
                          'Ranked contact counts identify anatomical candidates for follow-up, not intervention efficacy or physical dose.']}
output = args.output
output.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'output': str(output), 'checkedGraph': report['checkedGraph'],
                  'targets': report['targets'], 'connections': [{k: v for k, v in c.items() if k != 'sources'} for c in connections]}))
