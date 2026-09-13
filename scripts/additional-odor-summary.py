"""Validate and summarize paired additional-odor trials without fitting a decoder."""
from pathlib import Path
import argparse
import csv
import hashlib
import importlib.metadata
import itertools
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/odor-interface'
CLASSES = {'alpha-pinene': 'bicyclic monoterpene', 'limonene': 'cyclic monoterpene',
           'beta-myrcene': 'acyclic monoterpene', '(-)-trans-caryophyllene': 'sesquiterpene',
           'geraniol': 'acyclic monoterpenoid alcohol', 'beta-citronellol': 'acyclic monoterpenoid alcohol',
           'alpha-terpineol': 'cyclic monoterpenoid alcohol', 'eugenol': 'phenylpropanoid phenol'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stats(values):
    n = len(values)
    mean, sd = statistics.mean(values), statistics.stdev(values)
    # Student-t quantiles, two-sided 95%; descriptive normal-sampling assumption.
    critical = {4: 3.182446305, 8: 2.364624252, 12: 2.200985160}[n]
    margin = critical*sd/math.sqrt(n)
    return {'n': n, 'values': values, 'mean': mean, 'sampleSD': sd,
            'nominal95CI': [mean-margin, mean+margin]}


def signflip(values):
    observed = abs(sum(values))
    samples = [abs(sum(s*v for s, v in zip(signs, values)))
               for signs in itertools.product([-1, 1], repeat=len(values))]
    return sum(v >= observed-1e-10 for v in samples)/len(samples)


def raw_rows(path):
    rows = list(csv.reader(path.read_text().splitlines(), delimiter=';'))
    return [dict(zip(['rowIndex']+rows[0], row, strict=True)) for row in rows[1:]]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stem', default='additional-panel')
    parser.add_argument('--skip-first-seeds', type=int, default=0)
    parser.add_argument('--export-docs', action='store_true',
                        help='Copy the verified summary and figure into docs/ and docs/assets/.')
    args = parser.parse_args()
    provenance_path = OUT / (args.stem + '-provenance.json')
    provenance = json.loads(provenance_path.read_text())
    report_path = OUT / (args.stem + '.json')
    report = json.loads(report_path.read_text())
    assert provenance['complete'] and report['complete']
    assert sha(report_path) == provenance['reportSHA256']
    assert (report['neurons'], report['edges']) == (166700, 25582938)
    assert report['trialDurationSeconds'] == .6
    assert report['parameters']['synapticWeightMv'] == .275
    for name, expected in provenance['inputSHA256'].items():
        assert sha(ROOT / name) == expected, f'Input changed: {name}'
    trials = report['trials']
    assert len(trials) == provenance['trialCount']
    seeds = provenance['seeds'][args.skip_first_seeds:]
    baseline = {t['seed']: t for t in trials if t['name'] == 'clean air'}
    assert len(baseline) == len(provenance['seeds'])
    lookup = {(t['name'], t['side'], t['seed']): t for t in trials}
    assert len(lookup) == len(trials)
    difference = lambda t: t['motorPoolHz']['wm']['L']-t['motorPoolHz']['wm']['R']
    base_diffs = [difference(baseline[s]) for s in seeds]
    rows = []
    for odor in provenance['candidates']:
        name = odor['name']
        row = {**odor, 'chemicalClass': CLASSES.get(name)}
        conditions = {}
        for side in ['left', 'right', 'bilateral']:
            selected = [lookup[(name, side, s)] for s in seeds]
            diffs = [difference(t) for t in selected]
            conditions[side] = {
                'wingDifferenceHz': stats(diffs),
                'pairedChangeFromAirHz': stats([d-b for d, b in zip(diffs, base_diffs)]),
                'wingPoolHz': {p: stats([t['motorPoolHz']['wm'][p] for t in selected]) for p in ['L', 'R']},
                'DM1ProjectionHz': {p: stats([t['projectionNeuronPoolHz']['DM1'][p] for t in selected]) for p in ['L', 'R']},
                'DM6ProjectionHz': {p: stats([t['projectionNeuronPoolHz']['DM6'][p] for t in selected]) for p in ['L', 'R']},
            }
        contrasts = [a-b for a, b in zip(conditions['left']['wingDifferenceHz']['values'], conditions['right']['wingDifferenceHz']['values'])]
        contrast = stats(contrasts)
        contrast['sameSignCount'] = sum(x*contrast['mean'] > 0 for x in contrasts)
        contrast['twoSidedExactSignflipP'] = signflip(contrasts)
        lo, hi = contrast['nominal95CI']
        row['conditions'] = conditions
        row['leftVersusRightExposureContrastHz'] = contrast
        row['passesExploratoryReplicationGate'] = (abs(contrast['mean']) >= 1 and
                                                    contrast['sameSignCount'] == len(seeds) and lo*hi > 0)
        rows.append(row)
    # Holm adjustment across the exposure-side contrasts in this batch.
    ordered = sorted(rows, key=lambda r: r['leftVersusRightExposureContrastHz']['twoSidedExactSignflipP'])
    previous = 0
    for i, row in enumerate(ordered):
        c = row['leftVersusRightExposureContrastHz']
        previous = max(previous, min(1, (len(rows)-i)*c['twoSidedExactSignflipP']))
        c['holmAdjustedSignflipP'] = previous
    atlas = json.loads((OUT / 'odor-atlas.json').read_text())
    source_lock_path = OUT / 'additional-sources/source-lock.json'
    source_lock = json.loads(source_lock_path.read_text())
    assert source_lock['commit'] == provenance['dataSourceCommit']
    for entry in source_lock['sources']:
        assert sha(ROOT / entry['file']) == entry['sha256']
    requested_flavonoids = ['quercetin', 'rutin', 'kaempferol', 'luteolin', 'apigenin',
                           'naringenin', 'naringin', 'catechin', 'epicatechin',
                           'epigallocatechin gallate']
    quercetin_raw = next(r for r in raw_rows(OUT / 'additional-sources/Or71a.csv') if r['Name'] == 'quercetin')
    quercetin = next(o for o in atlas['odors'] if o['name'] == 'quercetin')
    quercetin_units = [{**{k: u[k] for k in ['unit', 'glomerulus', 'baseline']},
                       'response': quercetin['responses'][i], 'delta': quercetin['delta'][i]}
                      for i, u in enumerate(atlas['units']) if quercetin['responses'][i] is not None]
    dataset = next(r for r in raw_rows(OUT / 'additional-sources/door_dataset_info.csv') if r['dataset'] == 'Dweck.2015.WT')
    excluded = []
    for name in requested_flavonoids:
        matches = [o for o in atlas['odors'] if name.lower() in o['name'].lower()]
        excluded.append({'requested': name, 'atlasMatches': [{k: o[k] for k in ['name', 'key', 'cas', 'measuredUnits']} for o in matches],
                         'reason': 'Only one mapped measured unit and no validated airborne response profile.' if name == 'quercetin' else 'No matching compound in this pinned atlas; no receptor drive invented.'})
    summary = {
        'schema': 'additional-odor-results-v1', 'complete': True,
        'reportSHA256': sha(report_path), 'provenanceSHA256': sha(provenance_path),
        'summaryScriptSHA256': sha(Path(__file__)),
        'neurons': report['neurons'], 'edges': report['edges'],
        'trialCount': len(trials), 'analyzedSeeds': seeds,
        'wallSeconds': sum(t['wallSeconds'] for t in trials),
        'packages': {p: importlib.metadata.version(p) for p in ['brian2', 'numpy', 'pandas', 'Cython', 'matplotlib']},
        'baselineWingDifferenceHz': stats(base_diffs),
        'baselineWingPoolHz': {p: stats([baseline[s]['motorPoolHz']['wm'][p] for s in seeds]) for p in ['L', 'R']},
        'results': rows,
        'replicationCandidates': [r['name'] for r in sorted(rows, key=lambda r: -abs(r['leftVersusRightExposureContrastHz']['mean'])) if r['passesExploratoryReplicationGate']],
        'flavonoidAudit': {'sourceLockSHA256': sha(source_lock_path), 'candidates': excluded,
                          'quercetinSourceRow': quercetin_raw, 'quercetinDataset': dataset,
                          'quercetinMappedUnits': quercetin_units,
                          'quercetinInterpretation': 'The raw Or71a value is 2 spikes/s in one dataset. An entry and normalized consensus delta do not demonstrate significant detection, delivery feasibility or steering authority. It was not simulated.'},
        'limitations': [
            'Paired simulation seeds are not independent flies, dose measurements or a biological validation.',
            'The t intervals are nominal, exploratory and assume approximately normal independent seed contrasts; exact sign-flip tests additionally assume sign exchangeability under their null.',
            'Clean-air, left, right and bilateral conditions are matched by seed; missing receptor values retain spontaneous rate.',
            'Fixed baseline imbalance and high PN firing under transferred LIF parameters remain unresolved. Wing motor rates are not measured wing mechanics.',
            'A cue-side contrast is needed for controllability, but it is not sufficient for steering or landing.',
        ],
    }
    if args.skip_first_seeds:
        initial = json.loads((OUT / 'additional-panel-summary.json').read_text())
        initial_trials = json.loads((OUT / 'additional-panel.json').read_text())['trials']
        assert args.skip_first_seeds == 4 and len(seeds) == 8 and len(rows) == 1
        assert not set(seeds) & set(initial['analyzedSeeds'])
        assert rows[0]['name'] == initial['replicationCandidates'][0]
        original_lookup = {(t['name'], t['side'], t['seed']): t for t in initial_trials}
        repeated = [t for t in trials if t['seed'] in initial['analyzedSeeds']]
        strip_time = lambda t: {k: v for k, v in t.items() if k != 'wallSeconds'}
        assert len(repeated) == 16
        assert all(strip_time(t) == strip_time(original_lookup[(t['name'], t['side'], t['seed'])]) for t in repeated)
        original_row = next(r for r in initial['results'] if r['name'] == rows[0]['name'])
        c = rows[0]['leftVersusRightExposureContrastHz']
        lo, hi = c['nominal95CI']
        same_direction = c['mean']*original_row['leftVersusRightExposureContrastHz']['mean'] > 0
        summary['independentConfirmation'] = {
            'initialReportSHA256': initial['reportSHA256'],
            'repeatedTrialsExactlyReproduced': len(repeated),
            'independentTrialsAnalyzed': 32,
            'matchesInitialEffectDirection': same_direction,
            'passesPredefinedGate': same_direction and abs(c['mean']) >= 1 and c['sameSignCount'] >= 7 and lo*hi > 0,
            'criterion': 'Same direction as discovery, absolute mean >=1 Hz, at least 7/8 same-sign seed contrasts, and nominal paired Student-t 95% interval excluding zero.',
        }
        summary['replicationCandidates'] = []
    destination = OUT / (args.stem + '-summary.json')
    destination.write_text(json.dumps(summary, indent=2, allow_nan=False)+'\n')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
    figure_height = max(3.5, 2+.55*len(rows))
    fig, ax = plt.subplots(figsize=(10.5, figure_height))
    fig.subplots_adjust(left=.24 if len(rows) > 1 else .12, right=.98,
                        top=1-.7/figure_height, bottom=1.1/figure_height)
    for i, row in enumerate(rows):
        c = row['leftVersusRightExposureContrastHz']
        for j, value in enumerate(c['values']):
            ax.scatter(value, i+(j-(len(seeds)-1)/2)*.055, color='#a1aab9', s=24, zorder=2)
        ax.errorbar(c['mean'], i, xerr=[[c['mean']-c['nominal95CI'][0]], [c['nominal95CI'][1]-c['mean']]],
                    fmt='o', color='#1c5680', capsize=4, linewidth=1.8, zorder=3)
    ax.axvline(0, color='#525b65', linewidth=1)
    ax.set_yticks(range(len(rows)), [r['name'] for r in rows])
    ax.set_ylim(len(rows)-.5, -.5)
    ax.set_xlabel('D under left exposure − D under right exposure (Hz)')
    ax.set_title('Additional chemicals: paired exposure-side effects\n'
                 f'{len(seeds)} fixed seeds; complete 166,700-neuron / 25,582,938-connection graph',
                 loc='left', pad=16, fontsize=13)
    ax.grid(axis='x', alpha=.15)
    fig.text(.01, .02,
             'D = mean left wing-motor Hz − mean right wing-motor Hz. Gray points: paired seed contrasts.\n'
             'Blue: mean and nominal Student-t 95% interval, without multiple-comparison correction.\n'
             f'Clean-air D: {statistics.mean(base_diffs):.3f} Hz. Neural rates are not measured wing motion or steering.',
             fontsize=9, va='bottom')
    figure_path = OUT / (args.stem + '-effects.png')
    fig.savefig(figure_path, dpi=160, bbox_inches='tight')
    plt.close(fig)
    if args.export_docs:
        for source, exported in [(destination, ROOT / 'docs' / destination.name),
                                 (figure_path, ROOT / 'docs/assets' / figure_path.name)]:
            exported.parent.mkdir(parents=True, exist_ok=True)
            exported.write_bytes(source.read_bytes())
            assert sha(exported) == sha(source), f'Export differs from source: {exported}'
            print(json.dumps({'export': str(exported.relative_to(ROOT)),
                              'source': str(source.relative_to(ROOT)), 'sha256': sha(exported)}))
    print(json.dumps({'baselineHz': summary['baselineWingDifferenceHz'],
                      'replicationCandidates': summary['replicationCandidates'],
                      'independentConfirmation': summary.get('independentConfirmation'),
                      'trials': len(trials), 'wallSeconds': summary['wallSeconds']}, indent=2))
    for row in rows:
        c = row['leftVersusRightExposureContrastHz']
        print(row['name'], 'contrastHz', round(c['mean'], 6), 'SD', round(c['sampleSD'], 6),
              'nominal95CI', [round(x, 6) for x in c['nominal95CI']], 'gate', row['passesExploratoryReplicationGate'])


if __name__ == '__main__':
    main()
