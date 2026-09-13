"""Run the fixed 68-trial full-graph synaptic-weight sensitivity assay.

Only the existing assay's synaptic-weight argument changes. The source pulse,
odor response profiles, seeds, neural equations and graph stay fixed.
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
PANEL = ['limonene', 'eugenol', 'linalool', '4-ethylguaiacol']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n')
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prefix', default='additional-calibration')
    args = parser.parse_args()
    assert args.prefix.startswith('additional-calibration') and '/' not in args.prefix
    script = ROOT / 'scripts/lif-odor-probe.py'
    previous_path = OUT / 'additional-panel-provenance.json'
    previous = json.loads(previous_path.read_text())
    assert previous['complete']
    inputs = dict(previous['inputSHA256'])
    for name, expected in inputs.items():
        assert sha(ROOT / name) == expected, f'Input changed since matched reference: {name}'
    for path in [Path(__file__), previous_path, OUT / 'additional-panel.json',
                 OUT / 'lif-expanded-panel.json', OUT / 'lif-odor-probe-v1.py']:
        inputs[str(path.relative_to(ROOT))] = sha(path)
    atlas = json.loads((OUT / 'odor-atlas.json').read_text())
    candidates = [next(o for o in atlas['odors'] if o['name'] == name) for name in PANEL]
    assert all(o['measuredUnits'] >= 20 for o in candidates)
    jobs = []
    for suffix, weight, odors in [('low-weight', .055, PANEL),
                                   ('reference', .275, ['4-ethylguaiacol'])]:
        report = OUT / (args.prefix+'-'+suffix+'.json')
        assert not report.exists(), 'Retain prior results; choose another --prefix.'
        jobs.append({'name': suffix, 'synapticWeightMvPerContact': weight, 'odors': odors,
                     'plannedTrials': (1+3*len(odors))*4,
                     'report': str(report.relative_to(ROOT)),
                     'log': str(report.with_suffix('.log').relative_to(ROOT)),
                     'command': [sys.executable, str(script), '--odors', *odors,
                                 '--seeds', '4', '--duration', '0.6', '--max-rate', '150',
                                 '--synaptic-weight', str(weight), '--output', str(report)]})
    provenance_path = OUT / (args.prefix+'-provenance.json')
    assert not provenance_path.exists(), 'Retain the existing provenance.'
    provenance = {
        'schema': 'additional-calibration-provenance-v1', 'complete': False,
        'startedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'purpose': 'Fixed synaptic-weight sensitivity experiment addressing the known PN calibration problem; not parameter optimization or physical odor calibration.',
        'neurons': 166700, 'edges': 25582938,
        'candidateMetadata': [{k: o[k] for k in ['name', 'key', 'cas', 'measuredUnits', 'coverage']} for o in candidates],
        'plannedTrials': 68, 'seeds': [370019+7919*i for i in range(4)],
        'prewarmSeconds': .2, 'observationSeconds': .6, 'sourceRateScaleHz': 150,
        'sourcePulseMv': .275*250, 'sourcePulseIsUnchanged': True,
        'conditions': ['clean air', 'left-only odor', 'right-only odor', 'bilateral odor'],
        'inputSHA256': inputs, 'pythonVersion': sys.version,
        'priorInputProvenanceSHA256': sha(previous_path),
        'dataSourceCommit': atlas['sourceCommit'], 'dataAttribution': atlas['attribution'],
        'dataLicense': atlas['license'],
        'analysisPlan': [
            'Report absolute wing-motor firing, same-seed clean-air changes and exposure-side contrasts with sample SD and nominal paired t intervals.',
            'Report DM1/DM6 absolute PN rates and same-seed changes, including ipsilateral-minus-contralateral rates for each unilateral exposure; these are aggregate pool rates, not latency measurements.',
            'Use only identical protocol, atlas and intersecting seeds for cross-weight comparisons. Never fill missing original-weight PN data.',
            'Limonene and eugenol have four-seed original-weight records. Linalool has only three matched original-weight seeds and no PN records.',
            'Lower or absent firing does not validate the transferred model. This bounded batch triggers no gain selection or steering optimization.',
        ],
        'jobs': jobs, 'failures': [],
    }
    save(provenance_path, provenance)
    (OUT / (args.prefix+'-lif-source.py')).write_bytes(script.read_bytes())
    for job in jobs:
        print(json.dumps({'phase': 'running fixed sensitivity condition',
                          'weight': job['synapticWeightMvPerContact'], 'trials': job['plannedTrials']}), flush=True)
        with (ROOT / job['log']).open('w') as log:
            run = subprocess.run(job['command'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        job['exitCode'] = run.returncode
        report_path = ROOT / job['report']
        if report_path.exists():
            report = json.loads(report_path.read_text())
            job['completedTrials'] = len(report['trials'])
            job['reportSHA256'] = sha(report_path)
            job['complete'] = run.returncode == 0 and report['complete'] and len(report['trials']) == job['plannedTrials']
        if not job.get('complete'):
            provenance['failures'].append({'job': job['name'], 'exitCode': run.returncode})
            save(provenance_path, provenance)
            raise SystemExit(run.returncode or 1)
        save(provenance_path, provenance)
        print(json.dumps({'phase': 'condition complete', 'name': job['name'],
                          'trials': job['completedTrials'], 'reportSHA256': job['reportSHA256']}), flush=True)
    provenance['complete'] = True
    provenance['finishedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(provenance_path, provenance)
    print(json.dumps({'complete': True, 'trials': sum(j['completedTrials'] for j in jobs)}), flush=True)


if __name__ == '__main__':
    main()
