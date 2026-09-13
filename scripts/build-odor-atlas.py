"""Join a pinned DoOR response matrix to annotated MaleCNS olfactory cells.

DoOR.data is CC BY-SA 4.0. Missing measurements stay null. No synthetic receptor
selectivity, physiological concentrations, or innate motor meanings are added.
"""
from pathlib import Path
from urllib.request import urlopen
import gzip
import hashlib
import json
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
COMMIT = 'db323a496577c4b4a72b5c2fcd1859e07521ffb5'
CACHE = ROOT / 'data/odor'
OUT = ROOT / 'artifacts/odor-interface'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
sources = []
for name in ['door_response_matrix.csv', 'door_mappings.csv', 'odor.csv']:
    url = f'https://raw.githubusercontent.com/ropensci/DoOR.data/{COMMIT}/data/{name}'
    file = CACHE / name
    if not file.exists():
        file.write_bytes(urlopen(url).read())
    sources.append({'file': name, 'url': url, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})

response = pd.read_csv(CACHE / 'door_response_matrix.csv', sep=';', index_col=0)
mapping = pd.read_csv(CACHE / 'door_mappings.csv', sep=';', index_col=0)
odors = pd.read_csv(CACHE / 'odor.csv', sep=';', index_col=0).set_index('InChIKey')
annotation_file = ROOT / 'data/body-annotations-male-cns-v1.0-minconf-0.5.feather'
cells = pd.read_feather(annotation_file)
cells = cells[cells.superclass.notna() & (cells.status != 'Glia')].sort_values('bodyId').reset_index(drop=True)
graph_dir = ROOT / 'dist/assets/connectome'
manifest = json.loads((graph_dir / 'manifest.json').read_text())
graph_ids = np.frombuffer(gzip.decompress((graph_dir / manifest['nodes']['ids']['file']).read_bytes()), np.uint32)
assert np.array_equal(cells.bodyId.to_numpy(), graph_ids), 'Annotation order must match every retained graph neuron'

# DoOR's canonical `code` rows resolve co-expressed receptor profiles to the
# measured OSN unit (e.g. ab4B for DA2); do not double-count those receptors.
units = []
for _, row in mapping.iterrows():
    if pd.isna(row.code) or row.receptor not in response.columns:
        continue
    selected = cells[(cells['class'] == 'olfactory') & (cells.type == 'ORN_' + row.code)]
    if selected.empty:
        continue
    baseline = response.loc['SFR', row.receptor]
    units.append({'unit': row.receptor, 'glomerulus': row.code,
                  'baseline': float(baseline) if pd.notna(baseline) else None,
                  'left': selected.index[selected.rootSide == 'L'].tolist(),
                  'right': selected.index[selected.rootSide == 'R'].tolist(),
                  'unknownSide': selected.index[~selected.rootSide.isin(['L', 'R'])].tolist()})

mapped = [i for unit in units for side in ['left', 'right'] for i in unit[side]]
assert len(mapped) == len(set(mapped)), 'An olfactory neuron must not receive duplicate direct stimulation'

candidates = []
for key, row in response.iterrows():
    if key in ['SFR', 'solvent'] or key not in odors.index:
        continue
    meta = odors.loc[key]
    values = [float(row[u['unit']]) if pd.notna(row[u['unit']]) else None for u in units]
    delta = [v-u['baseline'] if v is not None and u['baseline'] is not None else None for v, u in zip(values, units)]
    known = sum(v is not None for v in delta)
    candidates.append({'key': key, 'name': str(meta.Name), 'cas': str(meta.CAS),
                       'responses': values, 'delta': delta, 'measuredUnits': known,
                       'coverage': known/len(units)})

# Anatomical motor pools are exported for separate response assays. These are
# cell identities, not a validated mapping from neural rate to wing movement.
motors = cells[cells.superclass == 'vnc_motor']
motor_groups = {}
for subclass in ['wm', 'fl', 'ml', 'hl']:
    motor_groups[subclass] = {side: motors.index[(motors.subclass == subclass) & (motors.somaSide == side)].tolist() for side in ['L', 'R']}

atlas = {'schema': 'door-male-cns-odor-atlas-v1', 'sourceCommit': COMMIT,
         'sources': sources, 'license': 'CC BY-SA 4.0',
         'attribution': 'DoOR.data contributors; Münch and Galizia, DoOR 2.0 (2016), doi:10.1038/srep21841',
         'annotationSHA256': hashlib.sha256(annotation_file.read_bytes()).hexdigest(),
         'neurons': len(cells), 'units': units, 'odors': candidates, 'motorGroups': motor_groups,
         'limitations': ['Consensus relative responses are not concentrations or dose-response curves.',
                        'Deltas subtract the matched spontaneous firing response where available.',
                        'Missing odor or spontaneous response measurements remain null.',
                        'Unknown-side ORNs are not directly stimulated; all retained graph cells compute.',
                        'Interpolating exposure amplitude and adding mixtures are separate, unvalidated model assumptions.',
                        'Anatomical motor pools do not establish a neural-to-movement transfer function.']}
(OUT / 'odor-atlas.json').write_text(json.dumps(atlas, separators=(',', ':'), allow_nan=False))
print(json.dumps({'output': str(OUT / 'odor-atlas.json'), 'odors': len(candidates), 'units': len(units),
                  'directlyMappedORN': sum(len(u['left'])+len(u['right']) for u in units),
                  'unknownSideORN': sum(len(u['unknownSide']) for u in units),
                  'candidateCoverage': {str(n): sum(o['measuredUnits'] >= n for o in candidates) for n in [20, 30, 40]}}))
