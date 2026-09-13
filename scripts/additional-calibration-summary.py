"""Verify and export the fixed full-graph chemical/connection-weight sensitivity assay."""
from pathlib import Path
import argparse
import ast
import hashlib
import importlib.metadata
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/odor-interface'
SIDES = ['left', 'right', 'bilateral']
PNS = ['DM1', 'DM6']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stats(values):
    n = len(values)
    mean, sd = statistics.mean(values), statistics.stdev(values)
    margin = {3: 4.302652730, 4: 3.182446305}[n]*sd/math.sqrt(n)
    return {'n': n, 'mean': mean, 'sampleSD': sd, 'nominal95CI': [mean-margin, mean+margin], 'values': values}


def indexed(report):
    result = {(t['name'], t['side'], t['seed']): t for t in report['trials']}
    assert len(result) == len(report['trials'])
    return result


def wing(t):
    return t['motorPoolHz']['wm']['L']-t['motorPoolHz']['wm']['R']


def pn(t, unit):
    rates = t['projectionNeuronPoolHz'][unit]
    return rates['L']-rates['R']


def condition(index, name, side, seeds):
    trials = [index[(name, side, s)] for s in seeds]
    air = [index[('clean air', 'bilateral', s)] for s in seeds]
    result = {
        'seeds': seeds,
        'wingPoolHz': {p: stats([t['motorPoolHz']['wm'][p] for t in trials]) for p in ['L', 'R']},
        'wingDifferenceHz': stats([wing(t) for t in trials]),
        'pairedWingChangeFromAirHz': stats([wing(t)-wing(a) for t, a in zip(trials, air)]),
        'allWingPoolsSilent': all(t['motorPoolHz']['wm'][p] == 0 for t in trials for p in ['L', 'R']),
        'totalNetworkSpikes': stats([t['spikes'] for t in trials]),
        'activeNeurons': stats([t['activeNeurons'] for t in trials]),
        'projectionNeurons': None,
    }
    if all('projectionNeuronPoolHz' in t for t in trials+air):
        sign = 1 if side == 'left' else -1 if side == 'right' else None
        result['projectionNeurons'] = {}
        for unit in PNS:
            entry = {
                'poolHz': {p: stats([t['projectionNeuronPoolHz'][unit][p] for t in trials]) for p in ['L', 'R']},
                'pairedPoolChangeFromAirHz': {p: stats([t['projectionNeuronPoolHz'][unit][p]-a['projectionNeuronPoolHz'][unit][p] for t, a in zip(trials, air)]) for p in ['L', 'R']},
                'hemisphereDifferenceHz': stats([pn(t, unit) for t in trials]),
                'pairedHemisphereChangeFromAirHz': stats([pn(t, unit)-pn(a, unit) for t, a in zip(trials, air)]),
                'ipsilateralMinusContralateralHz': stats([sign*pn(t, unit) for t in trials]) if sign else None,
                'pairedIpsilateralChangeFromAirHz': stats([sign*(pn(t, unit)-pn(a, unit)) for t, a in zip(trials, air)]) if sign else None,
            }
            result['projectionNeurons'][unit] = entry
    return result


def direction(index, name, seeds):
    left = [index[(name, 'left', s)] for s in seeds]
    right = [index[(name, 'right', s)] for s in seeds]
    return {
        'wingExposureSideContrastHz': stats([wing(a)-wing(b) for a, b in zip(left, right)]),
        'projectionExposureSideContrastHz': {unit: stats([pn(a, unit)-pn(b, unit) for a, b in zip(left, right)]) for unit in PNS}
        if all('projectionNeuronPoolHz' in t for t in left+right) else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prefix', default='additional-calibration')
    parser.add_argument('--export-docs', action='store_true')
    args = parser.parse_args()
    provenance_path = OUT / (args.prefix+'-provenance.json')
    provenance = json.loads(provenance_path.read_text())
    assert provenance['complete'] and not provenance['failures']
    for name, expected in provenance['inputSHA256'].items():
        assert sha(ROOT/name) == expected, f'Input changed: {name}'
    source_paths = {job['name']: ROOT/job['report'] for job in provenance['jobs']}
    source_paths.update({'previousPanel': OUT/'additional-panel.json', 'previousLinalool': OUT/'lif-expanded-panel.json'})
    reports = {name: json.loads(path.read_text()) for name, path in source_paths.items()}
    for job in provenance['jobs']:
        assert job['complete'] and job['exitCode'] == 0
        assert sha(ROOT/job['report']) == job['reportSHA256']
        assert len(reports[job['name']]['trials']) == job['plannedTrials']
        assert reports[job['name']]['parameters']['synapticWeightMv'] == job['synapticWeightMvPerContact']
    low, ref, previous, linalool = [reports[k] for k in ['low-weight', 'reference', 'previousPanel', 'previousLinalool']]
    fixed_parameters = {k: v for k, v in low['parameters'].items() if k != 'synapticWeightMv'}
    for report in reports.values():
        assert report['complete']
        assert (report['neurons'], report['edges']) == (166700, 25582938)
        assert report['atlasSHA256'] == low['atlasSHA256']
        assert report['trialDurationSeconds'] == .6
        assert {k: v for k, v in report['parameters'].items() if k != 'synapticWeightMv'} == fixed_parameters
    for report in [ref, previous, linalool]:
        assert report['parameters']['synapticWeightMv'] == .275
    indices = {name: indexed(report) for name, report in reports.items()}
    seeds = provenance['seeds']
    assert len(seeds) == 4
    # Older linalool code differs in diagnostic logging, not in the model helpers.
    helper_asts = []
    for path in [OUT/'lif-odor-probe-v1.py', ROOT/'scripts/lif-odor-probe.py']:
        module = ast.parse(path.read_text())
        helper_asts.append({n.name: ast.dump(n, include_attributes=False) for n in module.body if isinstance(n, ast.FunctionDef) and n.name in ['load_graph', 'build_model']})
    assert helper_asts[0] == helper_asts[1]
    reproduced_air = []
    for label in ['previousPanel', 'previousLinalool']:
        for key, old in indices[label].items():
            if key[0] != 'clean air':
                continue
            new = indices['reference'][key]
            common = old.keys() & new.keys() - {'wallSeconds'}
            assert all(old[k] == new[k] for k in common), (label, key)
            reproduced_air.append({'source': label, 'seed': key[2], 'sameNumericalFields': sorted(common)})
    results = []
    for metadata in provenance['candidateMetadata']:
        name = metadata['name']
        origin = 'reference' if name == '4-ethylguaiacol' else 'previousLinalool' if name == 'linalool' else 'previousPanel'
        high_index, low_index = indices[origin], indices['low-weight']
        matched = [s for s in seeds if (name, 'left', s) in high_index]
        assert len(matched) == (3 if name == 'linalool' else 4)
        for s in matched:
            for side in SIDES:
                assert (name, side, s) in high_index and (name, side, s) in low_index
                assert high_index[(name, side, s)]['maximumSourceHz'] == low_index[(name, side, s)]['maximumSourceHz']
        cross = {}
        for side in SIDES:
            lower = [low_index[(name, side, s)] for s in matched]
            upper = [high_index[(name, side, s)] for s in matched]
            lower_air = [low_index[('clean air', 'bilateral', s)] for s in matched]
            upper_air = [high_index[('clean air', 'bilateral', s)] for s in matched]
            cross[side] = {
                'pairedWingPoolLowMinusOriginalHz': {p: stats([a['motorPoolHz']['wm'][p]-b['motorPoolHz']['wm'][p] for a, b in zip(lower, upper)]) for p in ['L', 'R']},
                'pairedChemicalEffectLowMinusOriginalHz': stats([(wing(a)-wing(aa))-(wing(b)-wing(bb)) for a, aa, b, bb in zip(lower, lower_air, upper, upper_air)]),
                'pairedProjectionPoolLowMinusOriginalHz': {unit: {p: stats([a['projectionNeuronPoolHz'][unit][p]-b['projectionNeuronPoolHz'][unit][p] for a, b in zip(lower, upper)]) for p in ['L', 'R']} for unit in PNS}
                if all('projectionNeuronPoolHz' in t for t in upper) else None,
            }
        low_direction, high_direction = direction(low_index, name, matched), direction(high_index, name, matched)
        results.append({
            **metadata, 'originalSource': origin, 'matchedSeeds': matched,
            'originalPNAvailable': name != 'linalool',
            'lowerWeightAllFourSeeds': {'conditions': {side: condition(low_index, name, side, seeds) for side in SIDES}, **direction(low_index, name, seeds)},
            'originalWeightMatchedSeeds': {'conditions': {side: condition(high_index, name, side, matched) for side in SIDES}, **high_direction},
            'crossWeightMatchedSeeds': {'conditions': cross,
                'wingExposureSideContrastLowMinusOriginalHz': stats([a-b for a, b in zip(low_direction['wingExposureSideContrastHz']['values'], high_direction['wingExposureSideContrastHz']['values'])]),
                'projectionExposureSideContrastLowMinusOriginalHz': {unit: stats([a-b for a, b in zip(low_direction['projectionExposureSideContrastHz'][unit]['values'], high_direction['projectionExposureSideContrastHz'][unit]['values'])]) for unit in PNS}
                if high_direction['projectionExposureSideContrastHz'] else None},
        })
    summary = {
        'schema': 'additional-calibration-results-v1', 'complete': True,
        'purpose': provenance['purpose'], 'newTrials': 68,
        'neurons': 166700, 'edges': 25582938, 'seeds': seeds,
        'synapticWeightsMvPerContact': [.055, .275], 'sourcePulseMv': provenance['sourcePulseMv'],
        'unchangedNeuralParameters': fixed_parameters,
        'sourceRateScaleHz': 150, 'prewarmSeconds': .2, 'observationSeconds': .6,
        'sourceReportSHA256': {name: sha(path) for name, path in source_paths.items()},
        'provenanceSHA256': sha(provenance_path), 'summaryScriptSHA256': sha(Path(__file__)),
        'atlasSHA256': low['atlasSHA256'], 'dataSourceCommit': provenance['dataSourceCommit'],
        'dataAttribution': provenance['dataAttribution'], 'dataLicense': provenance['dataLicense'],
        'packages': {p: importlib.metadata.version(p) for p in ['brian2', 'numpy', 'pandas', 'Cython', 'matplotlib']},
        'projectionNeuronIndices': low['projectionNeuronIndices'],
        'referenceAudit': {'modelHelperASTsMatchArchivedVersion': True,
                           'olderOdorModeReview': 'Archived source differs by annotation verification, optional isolated-unit mode, and PN logging. The default odor loop and source rate formula are unchanged.',
                           'cleanAirTrialsExactlyReproduced': reproduced_air,
                           'linaloolMissingOriginalSeeds': [s for s in seeds if s not in results[2]['matchedSeeds']],
                           'linaloolOriginalPNUnavailable': True},
        'baseline': {'lowerWeight': condition(indices['low-weight'], 'clean air', 'bilateral', seeds),
                     'originalWeight': condition(indices['reference'], 'clean air', 'bilateral', seeds)},
        'results': results,
        'lowerWeightWingSilentTrialCount': sum(all(t['motorPoolHz']['wm'][p] == 0 for p in ['L', 'R']) for t in low['trials']),
        'lowerWeightAllMotorGroupsSilentTrialCount': sum(all(v == 0 for group in t['motorPoolHz'].values() for v in group.values()) for t in low['trials']),
        'wallSecondsNewTrials': sum(t['wallSeconds'] for report in [low, ref] for t in report['trials']),
        'executionFailures': provenance['failures'],
        'limitations': [
            '0.055 mV/contact is a fixed connection-weight sensitivity setting, not a physical dose or a validated calibration.',
            'The external source pulse and normalized DoOR-to-Poisson mapping stay fixed; changing connection weights alters transmission throughout the graph.',
            'Lower PN rates or motor silence do not establish better physiology. Aggregate PN counts do not measure onset latency, single-neuron saturation curves or behavioral steering.',
            'Nominal paired Student-t 95% intervals assume approximately normal independent seed contrasts and are not corrected for multiple descriptive comparisons; zero observed counts do not prove biological silence.',
            'Linalool has only three matched original-weight seeds and no original-weight PN record. Those missing measurements are not inferred.',
            'All graph neurons and connections remain present. No model, gain or odor setting was optimized for a positive motor outcome, and no browser model was replaced.',
        ],
    }
    summary_path = OUT/(args.prefix+'-results.json')
    summary_path.write_text(json.dumps(summary, indent=2, allow_nan=False)+'\n')
    make_figures(summary, args.prefix, args.export_docs)
    if args.export_docs:
        target = ROOT/'docs'/summary_path.name
        target.write_bytes(summary_path.read_bytes())
        assert sha(target) == sha(summary_path)
        print(json.dumps({'export': str(target.relative_to(ROOT)), 'sha256': sha(target)}))
    print(json.dumps({'newTrials': 68, 'wingSilentLowerWeightTrials': summary['lowerWeightWingSilentTrialCount'],
                      'allMotorGroupsSilentLowerWeightTrials': summary['lowerWeightAllMotorGroupsSilentTrialCount'],
                      'wallSeconds': summary['wallSecondsNewTrials'],
                      'referenceAirRepeats': len(reproduced_air)}, indent=2))
    for row in results:
        print(row['name'], 'matched', len(row['matchedSeeds']),
              'originalWingContrast', row['originalWeightMatchedSeeds']['wingExposureSideContrastHz'],
              'lowWingContrast', row['lowerWeightAllFourSeeds']['wingExposureSideContrastHz'])


def make_figures(summary, prefix, export_docs):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
    colors = {'lowerWeightAllFourSeeds': '#1b7481', 'originalWeightMatchedSeeds': '#99603c'}
    names = [r['name'] for r in summary['results']]
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.8))
    fig.subplots_adjust(left=.18, right=.98, bottom=.28, top=.79, wspace=.45)
    for i, row in enumerate(summary['results']):
        for stage, offset, label in [('lowerWeightAllFourSeeds', -.13, '0.055 mV/contact'), ('originalWeightMatchedSeeds', .13, '0.275 mV/contact')]:
            c = row[stage]['wingExposureSideContrastHz']
            axes[1].errorbar(c['mean'], i+offset, xerr=c['sampleSD'], fmt='o', color=colors[stage], capsize=3, label=label if i == 0 else None)
            for side in SIDES:
                for pool, dx in [('L', -.02), ('R', .02)]:
                    values = row[stage]['conditions'][side]['wingPoolHz'][pool]
                    axes[0].scatter(values['mean'], i+offset+dx, s=22, alpha=.65, color=colors[stage])
    for ax in axes:
        ax.set_ylim(3.5, -.5); ax.set_yticks(range(4), names); ax.grid(axis='x', alpha=.15)
    axes[0].set_xlabel('Mean wing-motor pool rate (Hz)')
    axes[0].set_title('Absolute output activity')
    axes[1].set_title('Paired exposure-side contrast')
    axes[1].set_xlabel('D under left exposure − D under right (Hz)')
    axes[1].axvline(0, color='#888', linewidth=.8)
    fig.legend(*axes[1].get_legend_handles_labels(), loc='upper right',
               bbox_to_anchor=(.98, .92), ncol=2, fontsize=8)
    fig.suptitle('Fixed connection-weight sensitivity: motor output', x=.18, ha='left', fontsize=14)
    fig.text(.02, .025, 'D = mean left wing-motor Hz − mean right wing-motor Hz. Bars: sample SD.\n'
             'Left panel dots: both wing pools under left/right/bilateral exposure. Lower weight uses four seeds;\n'
             'original linalool uses only three matched seeds. These weights are neural parameters, not odor doses.', fontsize=9, va='bottom')
    save_figure(fig, OUT/(prefix+'-motor.png'), export_docs)
    fig, axes = plt.subplots(2, 2, figsize=(11, 8))
    fig.subplots_adjust(left=.18, right=.97, top=.88, bottom=.18, wspace=.45, hspace=.45)
    for col, unit in enumerate(PNS):
        for i, row in enumerate(summary['results']):
            for stage, offset in [('lowerWeightAllFourSeeds', -.13), ('originalWeightMatchedSeeds', .13)]:
                d = row[stage]['projectionExposureSideContrastHz']
                if d is None:
                    continue
                for side in SIDES:
                    for p in ['L', 'R']:
                        v = row[stage]['conditions'][side]['projectionNeurons'][unit]['poolHz'][p]['mean']
                        axes[0, col].scatter(v, i+offset, color=colors[stage], s=22, alpha=.55)
                c = d[unit]
                axes[1, col].errorbar(c['mean'], i+offset, xerr=c['sampleSD'], fmt='o', capsize=3, color=colors[stage])
        axes[0, col].set_title(unit+' absolute PN firing')
        axes[0, col].set_xlabel('Mean PN pool rate (Hz)')
        axes[1, col].set_title(unit+' exposure-side lateralization')
        axes[1, col].set_xlabel('(PN L−R) under left − right exposure (Hz)')
        axes[1, col].axvline(0, color='#888', linewidth=.8)
    for ax in axes.flat:
        ax.set_ylim(3.5, -.5); ax.set_yticks(range(4), names); ax.grid(axis='x', alpha=.15)
    fig.suptitle('Fixed connection-weight sensitivity: projection neurons', x=.18, ha='left', fontsize=14)
    fig.text(.02, .025, 'Teal: 0.055 mV/contact. Brown: 0.275 mV/contact. Bars: sample SD.\n'
             'Upper dots: left/right PN pool means in each exposure. Lower contrast cancels fixed hemisphere bias.\n'
             'Original-weight linalool PN data are unavailable. Aggregate rates do not measure response latency\n'
             'or establish that lower activity is a physiologically better model.', fontsize=9, va='bottom')
    save_figure(fig, OUT/(prefix+'-pn.png'), export_docs)


def save_figure(fig, path, export_docs):
    import matplotlib.pyplot as plt
    fig.savefig(path, dpi=150, bbox_inches='tight'); plt.close(fig)
    if export_docs:
        target = ROOT/'docs/assets'/path.name
        target.write_bytes(path.read_bytes())
        assert sha(target) == sha(path)
        print(json.dumps({'export': str(target.relative_to(ROOT)), 'sha256': sha(target)}))


if __name__ == '__main__':
    main()
