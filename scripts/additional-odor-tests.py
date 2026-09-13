"""Reproducible additional-chemical screen using the unchanged full-graph assay.

This script records its selection and inputs before invoking lif-odor-probe.py.
It adds no chemical physiology, receptor routing or neural dynamics.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/odor-interface'
PANEL = ['alpha-pinene', 'limonene', 'beta-myrcene',
         '(-)-trans-caryophyllene', 'geraniol', 'beta-citronellol',
         'alpha-terpineol', 'eugenol']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-stem', default='additional-panel')
    parser.add_argument('--odors', nargs='+', default=PANEL)
    parser.add_argument('--seeds', type=int, default=4)
    args = parser.parse_args()
    assert args.output_stem.startswith('additional-')
    atlas_path = OUT / 'odor-atlas.json'
    atlas = json.loads(atlas_path.read_text())
    candidates = [next(o for o in atlas['odors'] if o['name'] == n) for n in args.odors]
    assert len(candidates) == len(set(args.odors))
    assert all(o['measuredUnits'] >= 20 for o in candidates)
    script = ROOT / 'scripts/lif-odor-probe.py'
    report_path = OUT / (args.output_stem + '.json')
    provenance_path = OUT / (args.output_stem + '-provenance.json')
    assert not report_path.exists(), 'Retain every run; choose a new output stem.'
    graph_dir = ROOT / 'dist/assets/connectome'
    manifest = json.loads((graph_dir / 'manifest.json').read_text())
    assert (manifest['neurons'], manifest['edges']) == (166700, 25582938)
    graph_files = [graph_dir / 'manifest.json', graph_dir / 'labels.json']
    graph_files += [graph_dir / manifest['nodes'][n]['file'] for n in ['ids', 'rows', 'signs']]
    graph_files += [graph_dir / part[n]['file'] for part in manifest['parts'] for n in ['pre', 'weight']]
    input_files = [Path(__file__), script, ROOT / 'scripts/build-odor-atlas.py',
                   atlas_path, ROOT / 'data/body-annotations-male-cns-v1.0-minconf-0.5.feather',
                   *[ROOT / 'data/odor' / s['file'] for s in atlas['sources']], *graph_files]
    provenance = {
        'schema': 'additional-odor-panel-provenance-v1',
        'startedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'complete': False,
        'selectionBasis': 'Chemical diversity and >=20 measured mapped-unit deltas; no new LIF results used for panel selection.',
        'candidates': [{k: o[k] for k in ['name', 'key', 'cas', 'measuredUnits', 'coverage']} for o in candidates],
        'conditions': ['clean air', 'left-only odor', 'right-only odor', 'bilateral odor'],
        'seeds': [370019 + 7919*i for i in range(args.seeds)],
        'trialCount': (1 + 3*len(candidates))*args.seeds,
        'prewarmSeconds': .2, 'observationSeconds': .6,
        'followupGate': {
            'contrast': '(mean left wing-pool Hz minus mean right wing-pool Hz) under left exposure minus that under right exposure, paired by seed',
            'screen': 'At least 1 Hz absolute mean contrast, all four screening seed contrasts have the same sign, and nominal paired Student-t 95% interval excludes zero.',
            'interpretation': 'Exploratory gate for independent replication only; no multiplicity-corrected inference or controllability claim.',
            'confirmation': 'If any passes, choose largest absolute contrast and run 12-seed assay; first four seeds are repeats, final eight are independent confirmation. Require same contrast sign, >=1 Hz magnitude, >=7/8 same-sign seeds, and nominal 95% interval excluding zero before considering one bounded steering run.',
        },
        'inputSHA256': {}, 'dataAttribution': atlas['attribution'],
        'dataLicense': atlas['license'], 'dataSourceCommit': atlas['sourceCommit'],
        'dataSources': atlas['sources'],
        'pythonVersion': sys.version,
        'failures': [],
    }
    print(json.dumps({'phase': 'hashing simulation inputs', 'files': len(input_files)}), flush=True)
    for path in input_files:
        provenance['inputSHA256'][str(path.relative_to(ROOT))] = sha(path)
    for entry in atlas['sources']:
        assert sha(ROOT / 'data/odor' / entry['file']) == entry['sha256']
    assert sha(input_files[4]) == atlas['annotationSHA256']
    command = [sys.executable, str(script), '--odors', *args.odors,
               '--duration', '0.6', '--seeds', str(args.seeds), '--output', str(report_path)]
    provenance['command'] = command
    write(provenance_path, provenance)
    # Keep an immutable copy of the invoked model code beside each experiment.
    (OUT / (args.output_stem + '-lif-source.py')).write_bytes(script.read_bytes())
    print(json.dumps({'phase': 'running fixed batch', 'trials': provenance['trialCount'],
                      'log': str(OUT / (args.output_stem + '.log'))}), flush=True)
    with (OUT / (args.output_stem + '.log')).open('w') as log:
        run = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    provenance['exitCode'] = run.returncode
    provenance['finishedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if run.returncode:
        provenance['failures'].append({'stage': 'spiking assay', 'exitCode': run.returncode})
    if report_path.exists():
        report = json.loads(report_path.read_text())
        provenance['completedTrials'] = len(report['trials'])
        provenance['reportSHA256'] = sha(report_path)
        provenance['complete'] = run.returncode == 0 and report['complete'] and len(report['trials']) == provenance['trialCount']
    write(provenance_path, provenance)
    print(json.dumps({k: provenance.get(k) for k in ['complete', 'completedTrials', 'exitCode', 'reportSHA256']}), flush=True)
    if not provenance['complete']:
        raise SystemExit(run.returncode or 1)


if __name__ == '__main__':
    main()
