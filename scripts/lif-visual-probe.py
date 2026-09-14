"""Qualify visual transmission in the existing complete-graph LIF model.

Uniform Poisson photoreceptor drive is a diagnostic model input, not calibrated
light or a biological photoreceptor model. No tonic drive or graded release is
added. Keep the established odor-probe equations and every measured connection.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import time
import numpy as np
import pandas as pd
import brian2 as b

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lif_odor_probe', ROOT/'scripts/lif-odor-probe.py')
lif = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lif)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', type=Path, default=ROOT/'artifacts/odor-interface/visual-transmission/plan.json')
    args = parser.parse_args()
    plan_path = args.plan.resolve()
    out = plan_path.parent
    plan = json.loads(plan_path.read_text())
    for path, expected in plan['sourceSHA256'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest() == expected, path
    assert not (out/'results.json').exists(), 'Preserve the existing experiment'
    assert not list(out.glob('*-counts.bin')), 'Preserve existing partial experiment counts'
    annotation = ROOT/'data/body-annotations-male-cns-v1.0-minconf-0.5.feather'
    sensory_map = json.loads((ROOT/'dist/assets/connectome/sensory-map.json').read_text())
    assert hashlib.sha256(annotation.read_bytes()).hexdigest() == sensory_map['sourceSHA256']
    cells = pd.read_feather(annotation)
    cells = cells[cells.superclass.notna() & (cells.status != 'Glia')].sort_values('bodyId').reset_index(drop=True)
    photo = cells.index[(cells.superclass == 'ol_sensory') & cells.rootSide.isin(['L', 'R'])].to_numpy()
    assert len(photo) == 6091
    labels = json.loads((ROOT/'dist/assets/connectome/labels.json').read_text())
    assert all(labels['transmitters'][i] == 'histamine' for i in photo)
    pools = {'photoreceptors': photo}
    for name in ['L1', 'L2', 'L3', 'L4', 'L5', 'Mi1', 'Tm3', 'Mi4', 'Mi9']:
        pools[name] = cells.index[cells.type == name].to_numpy()
        assert len(pools[name]) > 0, name
    for name in ['T4', 'T5']:
        pools[name] = cells.index[cells.type.fillna('').str.startswith(name)].to_numpy()
        assert len(pools[name]) > 0, name
    assert {name: indices.tolist() for name, indices in pools.items()} == plan['pools']
    sensory = photo
    background_rates = np.array([], dtype=float)
    if plan.get('background'):
        background = plan['background']
        assert background['mode'] == 'clean-air-ORN'
        atlas = json.loads((ROOT/background['atlasFile']).read_text())
        assert atlas['annotationSHA256'] == sensory_map['sourceSHA256']
        orn, background_rates = [], []
        for unit in atlas['units']:
            rate = (unit['baseline'] if unit['baseline'] is not None else 0)*background['maxRateHz']
            for side in ['left', 'right']:
                orn.extend(unit[side]); background_rates.extend([rate]*len(unit[side]))
        assert len(orn) == len(set(orn)) == 2141 and not set(orn).intersection(photo)
        assert orn == background['indices'] and background_rates == background['sourceHz']
        sensory = np.concatenate([photo, orn])
        background_rates = np.array(background_rates)
    print(json.dumps({'phase': 'loading full graph', 'photoreceptors': len(photo),
                      'backgroundSources': len(background_rates)}), flush=True)
    manifest, pre, post, contacts, signs, histamine = lif.load_graph()
    assert np.all(signs[photo] == -1)
    network, source, counts = lif.build_model(pre, post, contacts, signs, sensory)
    neurons = next(obj for obj in network.objects if obj.name == 'fly_cells')
    del pre, post, contacts
    voltage_samples = []

    def sample_voltage():
        values = np.asarray(neurons.v/b.mV)
        voltage_samples.append({'time': float(network.t/b.second),
                                'meanMv': {name: float(values[indices].mean()) for name, indices in pools.items()}})

    monitor = b.NetworkOperation(sample_voltage, dt=5*b.ms, when='end', name='visual_voltage_observer')
    network.add(monitor)
    network.store('rest')
    trials = []
    for condition in plan['conditions']:
        start = time.perf_counter()
        b.seed(condition['seed']); network.restore('rest'); voltage_samples.clear()
        phases = []
        for phase in plan['phases']:
            rates = condition['sourceHz'] if phase['name'] == 'on' else 0
            source.rates = np.concatenate([np.full(len(photo), rates), background_rates])*b.Hz
            before = np.asarray(counts.count).copy()
            network.run(phase['seconds']*b.second, namespace={})
            spikes = np.asarray(counts.count)-before
            raw = spikes.astype('<u4').tobytes()
            path = out/(condition['name']+'-'+phase['name']+'-counts.bin')
            path.write_bytes(raw)
            phases.append({'phase': phase['name'], 'durationSeconds': phase['seconds'],
                           'spikes': int(spikes.sum()), 'activeNeurons': int((spikes > 0).sum()),
                           'nonPhotoreceptorSpikes': int(spikes.sum()-spikes[photo].sum()),
                           'pools': {name: {'neurons': len(indices), 'spikes': int(spikes[indices].sum()),
                                            'meanHz': float(spikes[indices].mean()/phase['seconds'])}
                                     for name, indices in pools.items()},
                           'spikeCounts': {'file': str(path.relative_to(ROOT)), 'dtype': 'uint32-le',
                                           'SHA256': hashlib.sha256(raw).hexdigest()}})
        trials.append({'condition': condition, 'phases': phases,
                       'voltageSamples': list(voltage_samples), 'wallSeconds': time.perf_counter()-start})
        report = {'purpose': plan['purpose'], 'planSHA256': hashlib.sha256(plan_path.read_bytes()).hexdigest(),
                  'neurons': manifest['neurons'], 'edges': manifest['edges'], 'photoreceptors': len(photo),
                  'histamineInhibitoryCells': len(histamine), 'brianVersion': b.__version__,
                  'complete': len(trials) == len(plan['conditions']), 'trials': trials,
                  'background': plan.get('background'),
                  'limitations': [('Existing clean-air ORN background remains on in all phases; no added odor.' if plan.get('background') else
                                   'Isolated source-drive diagnostic; all other external inputs are silent.'),
                                  'Poisson source rate is an assumed model input, not physical light intensity.',
                                  'The inherited model uses spikes for transmission and starts at rest without tonic drive.',
                                  'Voltage and spike responses are model outputs, not calcium signals, wing motion or living-fly predictions.']}
        temporary = out/'results.json.tmp';temporary.write_text(json.dumps(report, indent=2)+'\n');temporary.replace(out/'results.json')
        print(json.dumps({'condition': condition['name'], 'phases': [{k: p[k] for k in ['phase', 'spikes', 'activeNeurons', 'nonPhotoreceptorSpikes']} for p in phases]}), flush=True)


if __name__ == '__main__':
    main()
