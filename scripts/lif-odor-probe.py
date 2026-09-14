"""Probe measured odor-response profiles with a complete-graph spiking model.

Uses the LIF equations and default constants published by Shiu et al., Nature
2024, doi:10.1038/s41586-024-07763-9 (reference implementation MIT licensed).
Applying those constants to MaleCNS and mapping normalized DoOR responses to
Poisson rates are new hypotheses. This is not a reproduction of their feeding
results or a validated model of wing mechanics.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import time
import numpy as np
import pandas as pd
import brian2 as b

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'dist/assets/connectome'
OUT = ROOT / 'artifacts/odor-interface'


def load_graph():
    manifest = json.loads((BASE / 'manifest.json').read_text())
    arr = lambda name, dtype: np.frombuffer(gzip.decompress((BASE / name).read_bytes()), dtype=dtype)
    rows = arr(manifest['nodes']['rows']['file'], np.uint32)
    pre = np.empty(manifest['edges'], np.uint32)
    contacts = np.empty(manifest['edges'], np.uint16)
    for part in manifest['parts']:
        begin, end = part['start'], part['start'] + part['count']
        pre[begin:end] = arr(part['pre']['file'], np.uint32)
        contacts[begin:end] = arr(part['weight']['file'], np.uint16)
    post = np.repeat(np.arange(manifest['neurons'], dtype=np.uint32), np.diff(rows))
    signs = arr(manifest['nodes']['signs']['file'], np.int8).copy()
    labels = json.loads((BASE / 'labels.json').read_text())
    # Keep source-derived signed connectivity; model histamine as inhibitory.
    # Unknown and modulatory transmitter signs retain the documented rate-model
    # assumptions, and still need receptor-specific validation.
    nt = np.array(labels['transmitters'])
    histamine = np.flatnonzero(nt == 'histamine')
    signs[histamine] = -1
    assert len(pre) == len(post) == len(contacts) == 25582938
    assert len(signs) == 166700
    return manifest, pre, post, contacts, signs, histamine


def build_model(pre, post, contacts, signs, sensory, synaptic_weight=.275, dt_ms=.1):
    b.start_scope()
    b.prefs.codegen.target = 'cython'
    b.defaultclock.dt = dt_ms*b.ms
    parameters = {'v_rest': -52*b.mV, 'v_reset': -52*b.mV, 'v_threshold': -45*b.mV,
                  'tau_membrane': 20*b.ms, 'tau_synapse': 5*b.ms}
    neurons = b.NeuronGroup(len(signs), '''
        dv/dt = (v_rest-v+g)/tau_membrane : volt (unless refractory)
        dg/dt = -g/tau_synapse : volt (unless refractory)
        refractory_time : second
    ''', threshold='v > v_threshold', reset='v = v_reset; g = 0*mV',
        refractory='refractory_time', method='exact', namespace=parameters, name='fly_cells')
    neurons.v = parameters['v_rest']
    neurons.refractory_time = 2.2*b.ms
    neurons.refractory_time[sensory] = 0*b.ms
    synapses = b.Synapses(neurons, neurons, 'w : volt', on_pre='g_post += w', delay=1.8*b.ms, name='fly_connections')
    synapses.connect(i=pre.astype(np.int32), j=post.astype(np.int32))
    synapses.w = contacts.astype(np.float64)*signs[pre]*synaptic_weight*b.mV
    source = b.PoissonGroup(len(sensory), rates=np.zeros(len(sensory))*b.Hz, name='odor_source')
    injection = b.Synapses(source, neurons, on_pre='v_post += source_pulse',
                           namespace={'source_pulse': .275*250*b.mV}, name='odor_input')
    injection.connect(i=np.arange(len(sensory)), j=sensory)
    counts = b.SpikeMonitor(neurons, record=False, name='fly_spike_counts')
    network = b.Network(neurons, synapses, source, injection, counts)
    return network, source, counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--odors', nargs='+', default=['ethyl acetate', 'geosmin', 'acetic acid', 'propanoic acid'])
    parser.add_argument('--units', nargs='+', help='Isolated receptor-unit drive for a neural diagnostic, with all other external sources silent')
    parser.add_argument('--max-rate', type=float, default=150)
    parser.add_argument('--duration', type=float, default=.6)
    parser.add_argument('--seeds', type=int, default=2)
    parser.add_argument('--synaptic-weight', type=float, default=.275)
    parser.add_argument('--extra-pools', type=Path, help='Frozen named neuron-index pools to observe without changing the dynamics')
    parser.add_argument('--output', default=str(OUT / 'lif-odor-probe.json'))
    args = parser.parse_args()
    atlas_bytes = (OUT / 'odor-atlas.json').read_bytes()
    atlas = json.loads(atlas_bytes)
    annotation_file = ROOT / 'data/body-annotations-male-cns-v1.0-minconf-0.5.feather'
    assert hashlib.sha256(annotation_file.read_bytes()).hexdigest() == atlas['annotationSHA256']
    cells = pd.read_feather(annotation_file)
    cells = cells[cells.superclass.notna() & (cells.status != 'Glia')].sort_values('bodyId').reset_index(drop=True)
    extra_pool_record = None
    extra_pools = {}
    if args.extra_pools:
        raw_pools = args.extra_pools.read_bytes()
        extra_pool_record = {'sourceFile': str(args.extra_pools), 'SHA256': hashlib.sha256(raw_pools).hexdigest(), 'definition': json.loads(raw_pools)}
        extra_pools = extra_pool_record['definition']['pools']
        for name, indices in extra_pools.items():
            if not name or not indices or len(set(indices)) != len(indices) or not all(isinstance(i, int) and 0 <= i < len(cells) for i in indices):
                raise ValueError('Invalid observation pool: ' + name)
    projection_pools = {unit: {side: cells.index[(cells.type == typename) & (cells.somaSide == side)].tolist()
                              for side in ['L', 'R']}
                        for unit, typename in [('DM1', 'DM1_lPN'), ('DM6', 'DM6_adPN')]}
    sensory, unit_index, sides = [], [], []
    for g, unit in enumerate(atlas['units']):
        for side, key in enumerate(['left', 'right']):
            sensory.extend(unit[key]); unit_index.extend([g]*len(unit[key])); sides.extend([side]*len(unit[key]))
    sensory, unit_index, sides = np.array(sensory), np.array(unit_index), np.array(sides)
    print(json.dumps({'phase': 'loading full graph', 'sensory': len(sensory)}), flush=True)
    manifest, pre, post, contacts, signs, histamine = load_graph()
    print(json.dumps({'phase': 'building spiking model', 'neurons': manifest['neurons'], 'edges': manifest['edges']}), flush=True)
    network, source, counts = build_model(pre, post, contacts, signs, sensory, args.synaptic_weight)
    del pre, post, contacts
    network.store('rest')
    baseline = np.array([u['baseline'] if u['baseline'] is not None else 0 for u in atlas['units']])
    if args.units:
        baseline[:] = 0
        selected = []
        for requested in args.units:
            unit = next(i for i, u in enumerate(atlas['units']) if u['unit'] == requested)
            delta = [0.0]*len(baseline); delta[unit] = 1.0
            selected.append({'name': requested, 'delta': delta})
    else:
        selected = [o for o in atlas['odors'] if o['name'] in args.odors]
        if len(selected) != len(args.odors):
            raise ValueError('Requested odor missing from the atlas')
    conditions = [('no external drive' if args.units else 'clean air', None, 'bilateral')]
    conditions += [(o['name'], o, side) for o in selected for side in ['left', 'right', 'bilateral']]
    trials = []
    for name, odor, side in conditions:
        for repeat in range(args.seeds):
            start = time.perf_counter(); seed = 370019 + repeat*7919
            b.seed(seed); network.restore('rest'); source.rates = baseline[unit_index]*args.max_rate*b.Hz
            network.run(.2*b.second, namespace={})
            before = np.array(counts.count)
            delta = np.array([v if v is not None else 0 for v in odor['delta']]) if odor else np.zeros(len(baseline))
            unilateral = np.ones(len(sensory)) if side == 'bilateral' else (sides == (side == 'right'))
            rates = np.maximum(0, baseline[unit_index]+delta[unit_index]*unilateral)*args.max_rate
            source.rates = rates*b.Hz
            network.run(args.duration*b.second, namespace={})
            spikes = np.array(counts.count)-before
            pools = {name: {side: float(spikes[indices].sum()/len(indices)/args.duration) for side, indices in pool.items()}
                     for name, pool in atlas['motorGroups'].items()}
            projection_rates = {name: {side: float(spikes[indices].mean()/args.duration) for side, indices in pool.items()}
                                for name, pool in projection_pools.items()}
            trials.append({'name': name, 'side': side, 'seed': seed, 'spikes': int(spikes.sum()),
                           'activeNeurons': int((spikes > 0).sum()), 'motorPoolHz': pools,
                           'projectionNeuronPoolHz': projection_rates,
                           'maximumSourceHz': float(rates.max()), 'wallSeconds': time.perf_counter()-start})
            if extra_pools:
                trials[-1]['extraPoolStats'] = {pool: {'neurons': len(indices), 'spikes': int(spikes[indices].sum()),
                                                     'meanHz': float(spikes[indices].mean()/args.duration),
                                                     'activeNeurons': int((spikes[indices] > 0).sum())}
                                                for pool, indices in extra_pools.items()}
            print(json.dumps(trials[-1]), flush=True)
            report = {'schema': 'lif-odor-probe-v1', 'modelSource': 'https://doi.org/10.1038/s41586-024-07763-9',
                      'referenceCommit': '91bdd1e7dcf193f3e7ca5a8933497fcef63b7960',
                      'stimulusMode': 'isolated receptor units; not odor profiles' if args.units else 'DoOR odor profiles',
                      'projectionNeuronIndices': projection_pools,
                      'atlasSHA256': hashlib.sha256(atlas_bytes).hexdigest(), 'neurons': manifest['neurons'], 'edges': manifest['edges'],
                      'histamineInhibitoryCells': len(histamine), 'parameters': {'dtMs': .1, 'restMv': -52, 'thresholdMv': -45,
                      'membraneMs': 20, 'synapseMs': 5, 'refractoryMs': 2.2, 'delayMs': 1.8,
                      'synapticWeightMv': args.synaptic_weight, 'maxSourceHz': args.max_rate}, 'trialDurationSeconds': args.duration,
                      'complete': len(trials) == len(conditions)*args.seeds, 'trials': trials,
                      'limitations': ['Parameters transferred from a female-brain feeding/grooming model to MaleCNS; not a validated transfer.',
                                      'Normalized DoOR responses are mapped to Poisson rates with an assumed scale, not calibrated odor doses.',
                                      'Unknown receptor responses retain matched spontaneous rate where available.',
                                      'No learned motor decoder or flight teacher is used; reported wing rates are not measured wing motion.']}
            if extra_pool_record:
                report['extraPools'] = extra_pool_record
            file = Path(args.output); file.parent.mkdir(parents=True, exist_ok=True)
            file.with_suffix('.tmp').write_text(json.dumps(report, indent=2)); file.with_suffix('.tmp').replace(file)


if __name__ == '__main__':
    main()
