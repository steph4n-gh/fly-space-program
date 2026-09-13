"""Optimize an image-to-odor encoder through the complete spiking connectome.

This is a one-axis apparatus simulation, not a landing or a validated fly
biomechanical model. Neural parameters and the motor-pool decoder stay fixed.
Only the external odor encoder is selected by training trajectory scores.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import math
import time
import numpy as np
import brian2 as b

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lif_probe', ROOT / 'scripts/lif-odor-probe.py')
lif = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lif)


def camera(error):
    """Render a light marker; the encoder receives these pixels only."""
    frame = np.zeros((24, 64), dtype=np.float64)
    x = 31.5 + error / math.radians(60) * 31.5
    if -2 < x < 66:
        xx = np.arange(64)
        frame[10:14] = np.exp(-.5*((xx-x)/1.25)**2)
    return frame


def centroid(frame):
    intensity = frame.sum(axis=0)
    if intensity.sum() < .01:
        return 0.0, False
    return float((intensity @ np.arange(64) / intensity.sum()-31.5)/31.5), True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--odor', default='acetic acid')
    parser.add_argument('--duration', type=float, default=6)
    parser.add_argument('--gains', default='-1.5,0,1.5')
    parser.add_argument('--seed-offset', type=int, default=0)
    parser.add_argument('--calibration', choices=['balanced', 'endpoints'], default='balanced')
    parser.add_argument('--output', default=str(ROOT / 'artifacts/odor-interface/odor-steering.json'))
    args = parser.parse_args()
    atlas_path = ROOT / 'artifacts/odor-interface/odor-atlas.json'
    atlas_bytes = atlas_path.read_bytes()
    atlas = json.loads(atlas_bytes)
    odor = next(o for o in atlas['odors'] if o['name'] == args.odor)
    sensory, unit_index, sides = [], [], []
    for g, unit in enumerate(atlas['units']):
        for side, key in enumerate(['left', 'right']):
            sensory.extend(unit[key]); unit_index.extend([g]*len(unit[key])); sides.extend([side]*len(unit[key]))
    sensory, unit_index, sides = np.array(sensory), np.array(unit_index), np.array(sides)
    baseline = np.array([u['baseline'] if u['baseline'] is not None else 0 for u in atlas['units']])
    delta = np.array([v if v is not None else 0 for v in odor['delta']])
    manifest, pre, post, contacts, signs, histamine = lif.load_graph()
    print(json.dumps({'phase': 'building complete spiking network', 'neurons': manifest['neurons'], 'edges': manifest['edges']}), flush=True)
    network, source, counts = lif.build_model(pre, post, contacts, signs, sensory)
    del pre, post, contacts
    network.store('rest')
    pools = atlas['motorGroups']['wm']
    dt, rate_scale = .2, 150
    decoder_hz = 4.0

    def set_exposure(exposure):
        source.rates = np.maximum(0, baseline[unit_index]+delta[unit_index]*exposure[sides])*rate_scale*b.Hz

    def difference(spikes, seconds):
        return float(np.mean(spikes[pools['L']])/seconds - np.mean(spikes[pools['R']])/seconds)

    calibrations = []
    calibration_exposures = [[.5, .5]] if args.calibration == 'balanced' else [[1., 0.], [0., 1.]]
    for exposure_pair in calibration_exposures:
        for original_seed in [913003, 921017, 931033]:
            seed = original_seed+args.seed_offset
            network.restore('rest'); b.seed(seed); set_exposure(np.array(exposure_pair))
            network.run(.4*b.second, namespace={})
            before = np.array(counts.count)
            network.run(.8*b.second, namespace={})
            calibrations.append({'seed': seed, 'exposure': exposure_pair,
                                 'wingDifferenceHz': difference(np.array(counts.count)-before, .8)})
    zero = float(np.mean([c['wingDifferenceHz'] for c in calibrations]))
    print(json.dumps({'phase': 'fixed motor decoder calibration', 'zeroHz': zero, 'trials': calibrations}), flush=True)

    report = {
        'schema': 'odor-steering-training-v1', 'complete': False,
        'odor': {k: odor[k] for k in ['key', 'name', 'cas', 'measuredUnits', 'coverage']},
        'atlasSHA256': hashlib.sha256(atlas_bytes).hexdigest(),
        'scriptSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'neurons': manifest['neurons'], 'edges': manifest['edges'],
        'dtMs': .1, 'decisionSeconds': dt, 'durationSeconds': args.duration,
        'sourceRateScaleHz': rate_scale, 'encoderInput': '64x24 marker image only',
        'encoderCandidates': [float(g) for g in args.gains.split(',')], 'seedOffset': args.seed_offset,
        'decoder': {'description': '(mean left wing motor rate - mean right rate - fixed zero) / 4 Hz',
                    'zeroHz': zero, 'fullScaleHz': decoder_hz, 'filterSeconds': .45,
                    'calibrationMethod': args.calibration, 'calibrations': calibrations},
        'apparatus': {'deliveryDelaySeconds': .2, 'deliveryTimeConstantSeconds': .25,
                      'yawRateLimitRadiansPerSecond': .6, 'yawRateTimeConstantSeconds': .3,
                      'exposureSum': 1, 'visualHalfFieldDegrees': 60},
        'trials': [],
        'limitations': [
            'The optimized component is the external image-to-odor encoder; the fly model does not learn.',
            'Motor-pool firing is an assumed yaw proxy; wing movement and yaw gain are not biologically validated.',
            'Normalized odor exposure, source rates and delivery dynamics are assumptions, not physical doses.',
            'Only olfactory source neurons receive external drive in this assay; the image is read by the apparatus encoder.',
            'This constrained one-axis plant is not any of the 27 flight missions.',
            'Shiu et al. neural parameters are transferred to MaleCNS without experimental validation.'
        ]}
    file = Path(args.output); file.parent.mkdir(parents=True, exist_ok=True)

    def save():
        temporary = file.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2, allow_nan=False))
        temporary.replace(file)

    def trial(split, gain, seed, initial_degrees, mode='contingent'):
        seed += args.seed_offset
        started = time.perf_counter()
        network.restore('rest'); b.seed(seed)
        exposure = np.array([.5, .5]); pending = exposure.copy(); set_exposure(exposure)
        network.run(.4*b.second, namespace={})
        angle = math.radians(initial_degrees); velocity = 0.0
        filtered_rate = zero
        trace = []
        for step in range(round(args.duration/dt)):
            frame = camera(angle)
            visual_position, visible = centroid(frame)
            contrast = float(np.clip(gain*visual_position, -1, 1)) if visible else 0.0
            if mode == 'balanced':
                contrast = 0.0
            elif mode == 'reversed':
                contrast *= -1
            request = np.array([.5+.5*contrast, .5-.5*contrast])
            # One interval transport delay, then a first-order delivery response.
            exposure += (pending-exposure)*(1-math.exp(-dt/.25))
            pending = request
            set_exposure(exposure)
            before = np.array(counts.count)
            network.run(dt*b.second, namespace={})
            raw_rate = difference(np.array(counts.count)-before, dt)
            filtered_rate += (raw_rate-filtered_rate)*(1-math.exp(-dt/.45))
            command = float(np.clip((filtered_rate-zero)/decoder_hz, -1, 1))
            velocity += (.6*command-velocity)*(1-math.exp(-dt/.3))
            angle -= velocity*dt
            trace.append({'seconds': round((step+1)*dt, 8), 'errorDegrees': math.degrees(angle),
                          'pixelCentroidNormalized': visual_position, 'targetVisible': visible,
                          'requestedContrast': contrast, 'deliveredLeft': float(exposure[0]),
                          'deliveredRight': float(exposure[1]), 'wingDifferenceHz': raw_rate,
                          'filteredWingDifferenceHz': filtered_rate, 'command': command})
        errors = np.array([t['errorDegrees'] for t in trace])
        result = {'split': split, 'mode': mode, 'gain': gain, 'seed': seed, 'initialDegrees': initial_degrees,
                  'finalErrorDegrees': float(errors[-1]), 'meanAbsoluteErrorDegrees': float(np.abs(errors).mean()),
                  'rmsErrorDegrees': float(np.sqrt(np.mean(errors**2))),
                  'centered': bool(np.max(np.abs(errors[-5:])) <= 5),
                  'score': float(np.mean(errors**2)+errors[-1]**2),
                  'trace': trace, 'wallSeconds': time.perf_counter()-started}
        report['trials'].append(result); save()
        print(json.dumps({k: v for k, v in result.items() if k != 'trace'}), flush=True)
        return result

    for gain in report['encoderCandidates']:
        for seed, initial in [(1200011, -20), (1208017, 20)]:
            trial('train', gain, seed, initial)
    scores = [{'gain': gain, 'meanScore': float(np.mean([t['score'] for t in report['trials'] if t['gain'] == gain]))}
              for gain in report['encoderCandidates']]
    selected = min(scores, key=lambda c: c['meanScore'])['gain']
    report['selection'] = {'criterion': 'mean training squared error plus terminal squared error',
                           'candidates': scores, 'gain': selected}
    save()
    print(json.dumps({'phase': 'selected encoder', **report['selection']}), flush=True)
    for mode in ['contingent', 'balanced', 'reversed']:
        for seed, initial in [(2200013, -25), (2208019, 25), (2216021, -15), (2224027, 15)]:
            trial('test', selected, seed, initial, mode)
    report['testSummary'] = {mode: {
        'trials': 4, 'centered': sum(t['centered'] for t in report['trials'] if t['split'] == 'test' and t['mode'] == mode),
        'meanAbsoluteErrorDegrees': float(np.mean([t['meanAbsoluteErrorDegrees'] for t in report['trials'] if t['split'] == 'test' and t['mode'] == mode])),
        'meanAbsoluteFinalErrorDegrees': float(np.mean([abs(t['finalErrorDegrees']) for t in report['trials'] if t['split'] == 'test' and t['mode'] == mode]))
    } for mode in ['contingent', 'balanced', 'reversed']}
    report['complete'] = True; save()
    print(json.dumps({'phase': 'complete', 'testSummary': report['testSummary']}), flush=True)


if __name__ == '__main__':
    main()
