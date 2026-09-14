#!/usr/bin/env python3
"""Read-only descriptive anatomy audit of the frozen 8-trial visual assay.

Run with artifacts/lif-runtime/bin/python; writes only to --output.
No new simulations, fits, exclusions, statistical tests, or graph loading.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--output', type=Path, default=Path('artifacts/odor-interface/visual-transmission-background/anatomy'))
args = parser.parse_args()
ROOT, OUT = args.root.resolve(), args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
BASE = ROOT/'artifacts/odor-interface/visual-transmission-background'
SEEDS = [370019, 377938, 385857, 393776]
PHASES = ['pre', 'on', 'off']
sha = lambda raw: hashlib.sha256(raw).hexdigest()
plan_raw = (BASE/'plan.json').read_bytes()
plan = json.loads(plan_raw)
result_raw = (BASE/'results.json').read_bytes()
result = json.loads(result_raw)
launch = json.loads((BASE/'launch-record.json').read_text())
assert result['complete'] is True and len(result['trials']) == plan['expectedTrials'] == 8
assert sha(plan_raw) == result['planSHA256'] == launch['planSHA256']
assert [t['condition'] for t in result['trials']] == plan['conditions']
assert result['background'] == plan['background']
hash_checks = []
for rel, expected in plan['sourceSHA256'].items():
    # Archived script copies are the assay sources even if working scripts change.
    path = BASE/'sources'/Path(rel).name if rel.startswith('scripts/') else ROOT/rel
    actual = sha(path.read_bytes())
    assert actual == expected, (str(path), actual, expected)
    hash_checks.append({'source': rel, 'checkedFile': str(path), 'SHA256': actual, 'matchesFrozenPlan': True})
annotation_rel = 'data/body-annotations-male-cns-v1.0-minconf-0.5.feather'
cells = pd.read_feather(ROOT/annotation_rel)
cells = cells[cells.superclass.notna() & (cells.status != 'Glia')].sort_values('bodyId').reset_index(drop=True)
N = len(cells)
assert N == result['neurons'] == 166700 and cells.bodyId.is_unique
photo = np.flatnonzero((cells.superclass == 'ol_sensory') & cells.rootSide.isin(['L', 'R']))
assert photo.tolist() == plan['pools']['photoreceptors']
for name, indices in plan['pools'].items():
    expected = photo if name == 'photoreceptors' else np.flatnonzero(cells.type.fillna('').str.startswith(name)) if name in ('T4', 'T5') else np.flatnonzero(cells.type.eq(name))
    assert expected.tolist() == indices, name
atlas_orn = np.asarray(plan['background']['indices'])
assert len(atlas_orn) == len(np.unique(atlas_orn)) == 2141
assert set(atlas_orn).isdisjoint(photo)
assert cells.iloc[atlas_orn]['class'].eq('olfactory').all()
photo_mask, atlas_orn_mask = np.zeros(N, dtype=bool), np.zeros(N, dtype=bool)
photo_mask[photo] = True
atlas_orn_mask[atlas_orn] = True
labels = json.loads((ROOT/'dist/assets/connectome/labels.json').read_text())
transmitters = np.array(labels['transmitters'])
assert len(transmitters) == N

counts = {}
count_checks = []
for trial in result['trials']:
    condition = trial['condition']
    assert condition['seed'] in SEEDS
    kind = 'flash' if condition['sourceHz'] == 50 else 'dark'
    assert condition['sourceHz'] in [0, 50]
    assert [p['phase'] for p in trial['phases']] == PHASES
    for phase in trial['phases']:
        rec = phase['spikeCounts']
        raw = (ROOT/rec['file']).read_bytes()
        assert rec['dtype'] == 'uint32-le' and len(raw) == N*4
        assert sha(raw) == rec['SHA256'], rec['file']
        arr = np.frombuffer(raw, dtype='<u4').astype(np.int64)
        assert int(arr.sum()) == phase['spikes']
        assert int(np.count_nonzero(arr)) == phase['activeNeurons']
        for name, pool in plan['pools'].items():
            assert int(arr[pool].sum()) == phase['pools'][name]['spikes']
        counts[(condition['seed'], kind, phase['phase'])] = arr
        count_checks.append({'file': rec['file'], 'SHA256': sha(raw), 'bytes': len(raw), 'matchesResult': True, 'summaryCountsMatch': True})
assert len(counts) == len(count_checks) == 24
durations = {p['name']: p['seconds'] for p in plan['phases']}
prechecks = []
for seed in SEEDS:
    dark_trial = next(t for t in result['trials'] if t['condition']['seed'] == seed and t['condition']['sourceHz'] == 0)
    flash_trial = next(t for t in result['trials'] if t['condition']['seed'] == seed and t['condition']['sourceHz'] == 50)
    # The observer samples at end of each step. Only times strictly before on.
    dark_v = [s for s in dark_trial['voltageSamples'] if s['time'] < durations['pre']]
    flash_v = [s for s in flash_trial['voltageSamples'] if s['time'] < durations['pre']]
    assert dark_v == flash_v and len(dark_v) == 40
    d = counts[(seed, 'flash', 'pre')] - counts[(seed, 'dark', 'pre')]
    assert np.count_nonzero(d) == 0
    prechecks.append({'seed': seed, 'allNeuronCountsExactlyEqual': True, 'preCountSHA256': sha(counts[(seed, 'dark', 'pre')].astype('<u4').tobytes()), 'frozenPoolVoltageSamplesExactlyEqual': True, 'voltageSamplesPerTrial': len(dark_v)})

def summarize(indices, phase):
    ix = np.asarray(indices, dtype=int)
    dark = np.stack([counts[(s, 'dark', phase)][ix] for s in SEEDS])
    flash = np.stack([counts[(s, 'flash', phase)][ix] for s in SEEDS])
    delta = flash - dark
    sums = delta.sum(axis=1)
    abs_sums = np.abs(delta).sum(axis=1)
    n = len(ix)
    strict = 'positive_all_4' if np.all(sums > 0) else 'negative_all_4' if np.all(sums < 0) else 'zero_all_4' if np.all(sums == 0) else 'mixed_or_zero'
    rec = {'phase': phase, 'neurons': n, 'signedDirection': strict,
           'frozenPhotoreceptors': int(np.count_nonzero(photo_mask[ix])),
           'atlasDrivenORNs': int(np.count_nonzero(atlas_orn_mask[ix])),
           'signedDeltaMeanSpikes': float(sums.mean()), 'signedDeltaMinSpikes': int(sums.min()), 'signedDeltaMaxSpikes': int(sums.max()),
           'meanAbsNeuronDeltaSpikes': float(abs_sums.mean()),
           'signedMeanDeltaHzPerNeuron': float(sums.mean()/n/durations[phase]),
           'meanAbsNeuronDeltaHz': float(abs_sums.mean()/n/durations[phase]),
           'neuronsChangedAnySeed': int(np.count_nonzero(np.any(delta != 0, axis=0))),
           'neuronsPositiveAllSeeds': int(np.count_nonzero(np.all(delta > 0, axis=0))),
           'neuronsNegativeAllSeeds': int(np.count_nonzero(np.all(delta < 0, axis=0)))}
    for i, seed in enumerate(SEEDS):
        rec.update({f'darkSpikes_{seed}': int(dark[i].sum()), f'flashSpikes_{seed}': int(flash[i].sum()),
                    f'signedDeltaSpikes_{seed}': int(sums[i]), f'absNeuronDeltaSpikes_{seed}': int(abs_sums[i]),
                    f'changedNeurons_{seed}': int(np.count_nonzero(delta[i])),
                    f'positiveNeurons_{seed}': int(np.count_nonzero(delta[i] > 0)),
                    f'negativeNeurons_{seed}': int(np.count_nonzero(delta[i] < 0))})
    return rec

def csvwrite(name, rows):
    with (OUT/name).open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

all_ix = np.arange(N)
nonphoto = np.setdiff1d(all_ix, photo)
all_olfactory = np.flatnonzero(cells['class'].eq('olfactory'))
selected = {
    'all_neurons': (all_ix, 'All 166700 retained neurons; includes externally driven photoreceptors.'),
    'all_except_photoreceptors': (nonphoto, 'All retained neurons excluding frozen bilateral photoreceptor pool.'),
    'frozen_visual_pools_except_photoreceptors': (np.unique(np.concatenate([v for k,v in plan['pools'].items() if k != 'photoreceptors'])), 'Union of frozen L1-L5, Mi1, Tm3, Mi4, Mi9, T4, T5 indices.'),
    'atlas_driven_ORNs': (atlas_orn, 'Exact 2141 ORN indices and fixed clean-air source rates in frozen plan.'),
    'annotated_olfactory_sensory': (all_olfactory, "class == 'olfactory'; all 2639 also have superclass == 'cb_sensory'. Includes atlas-driven ORNs."),
    'annotated_olfactory_not_atlas_driven': (np.setdiff1d(all_olfactory, atlas_orn), 'Annotated olfactory sensory cells excluding directly driven atlas subset.'),
    'antennal_lobe_projection_ALPN': (np.flatnonzero(cells['class'].eq('ALPN')), "class == 'ALPN'; all also have superclass == 'cb_intrinsic'."),
    'antennal_lobe_local_ALLN': (np.flatnonzero(cells['class'].eq('ALLN')), "class == 'ALLN'."),
    'visual_projection': (np.flatnonzero(cells.superclass.eq('visual_projection')), "superclass == 'visual_projection'; excludes 2 visual_projection_tbc."),
    'motor': (np.flatnonzero(cells.superclass.isin(['cb_motor','vnc_motor'])), "superclass in {'cb_motor', 'vnc_motor'}; excludes efferent/endocrine classes."),
    'cb_motor': (np.flatnonzero(cells.superclass.eq('cb_motor')), "superclass == 'cb_motor'."),
    'vnc_motor': (np.flatnonzero(cells.superclass.eq('vnc_motor')), "superclass == 'vnc_motor'."),
    'annotated_DAN': (np.flatnonzero(cells['class'].eq('DAN')), "class == 'DAN'; exact annotation category, not a complete census of modulatory neurons."),
}
for nt in ['dopamine','octopamine','serotonin']:
    selected['label_transmitter_'+nt] = (np.flatnonzero(transmitters == nt), 'Frozen labels.json transmitter label == '+repr(nt)+'; label-based pool, not receptor/functional validation.')
selected_rows = []
for phase in PHASES:
    for name,(ix,definition) in selected.items():
        selected_rows.append({'category': name, 'definition': definition, **summarize(ix,phase)})
csvwrite('selected-categories.csv', selected_rows)

# Full tables include all groups and every seed; no activity/sign filtering in export.
group_rows = []
for column in ['superclass','class','type','subclass']:
    for name, indices in cells.groupby(cells[column].fillna('(unannotated)'), sort=True).indices.items():
        for phase in PHASES:
            group_rows.append({'annotationColumn': column, 'annotationValue': str(name), **summarize(indices,phase)})
for column in ['superclass','class','type','subclass']:
    for phase in PHASES:
        partition = [r for r in group_rows if r['annotationColumn'] == column and r['phase'] == phase]
        assert sum(r['neurons'] for r in partition) == N
        assert sum(r['frozenPhotoreceptors'] for r in partition) == len(photo)
        assert sum(r['atlasDrivenORNs'] for r in partition) == len(atlas_orn)
        for seed in SEEDS:
            for kind in ['dark','flash']:
                assert sum(r[f'{kind}Spikes_{seed}'] for r in partition) == int(counts[(seed,kind,phase)].sum())
csvwrite('all-annotation-groups.csv', group_rows)

# Give consistent individual neurons an explicit small-population denominator.
neuron_rows = []
photo_set, atlas_orn_set = set(photo), set(atlas_orn)
for phase in ['on','off']:
    delta = np.stack([counts[(s, 'flash',phase)]-counts[(s,'dark',phase)] for s in SEEDS])
    nonzero_any = np.flatnonzero(np.any(delta != 0, axis=0))
    for i in nonzero_any:
        rec = {'phase': phase,'index': int(i),'bodyId': int(cells.bodyId.iloc[i]),
               **{col: '' if pd.isna(cells[col].iloc[i]) else str(cells[col].iloc[i]) for col in ['superclass','class','type']},
               'isPhotoreceptor': bool(i in photo_set), 'isAtlasDrivenORN': bool(i in atlas_orn_set),
               'signedDeltaMeanSpikes': float(delta[:,i].mean()),
               'meanAbsDeltaSpikes': float(np.abs(delta[:,i]).mean()),
               'direction': 'positive_all_4' if np.all(delta[:,i]>0) else 'negative_all_4' if np.all(delta[:,i]<0) else 'mixed_or_zero'}
        rec.update({f'signedDeltaSpikes_{s}':int(delta[j,i]) for j,s in enumerate(SEEDS)})
        neuron_rows.append(rec)
csvwrite('changed-neurons.csv', neuron_rows)

summary = {
    'design': {'classification':'Descriptive post-hoc reanalysis; no simulation or biological replication inference.', 'seeds':SEEDS,'phasesSeconds':durations,'neurons':N,
               'contrast':'flash (50 Hz assumed photoreceptor Poisson input during on) minus matched dark (0 Hz); exact same frozen ORN source configuration throughout.',
               'definitionSignedDelta':'Sum of (flash count minus dark count) across neurons in the category, then arithmetic mean across the four seed pairs.',
               'definitionAbsoluteDelta':'Sum of abs(flash count minus dark count) across neurons in each seed pair, then arithmetic mean; measures count redistribution and must not be called a signed mean effect.',
               'consistencyRule':'positive_all_4 and negative_all_4 require strict positive or strict negative aggregate paired count difference in every retained seed. This post-hoc descriptive label is not a significance test.',
               'scopeCaution':'Groups have very different sizes; each row includes n, all seed totals, mean Hz per neuron, absolute count differences, and individual-neuron consistency. No multiplicity, biological uncertainty, timing, path, behavioral effect, or gain estimate is made.'},
    'inputs': {'analysisSourceSHA256':sha(Path(__file__).read_bytes()), 'csvSHA256':{name:sha((OUT/name).read_bytes()) for name in ['selected-categories.csv','all-annotation-groups.csv','changed-neurons.csv']}, 'planFile':str(BASE/'plan.json'),'planSHA256':sha(plan_raw),'resultsFile':str(BASE/'results.json'),'resultsSHA256':sha(result_raw),
               'sourceHashChecks':hash_checks,'countHashChecks':count_checks,'prePhaseChecks':prechecks,
               'groupPartitionChecks':'Every superclass/class/type/subclass partition preserves all N neurons, all photo/ORN source memberships, and each of the 24 original count totals.',
               'retentionAndOrder':"superclass.notna() & (status != 'Glia'), sort_values('bodyId'), reset_index(drop=True)",
               'sortedBodyIdsUint64LE_SHA256':sha(cells.bodyId.to_numpy(dtype='<u8').tobytes())},
    'categories':selected_rows,
    'groupCounts':{col:{'allGroups':len([r for r in group_rows if r['annotationColumn']==col and r['phase']=='on']),
                        'strictConsistentNonzeroOn':len([r for r in group_rows if r['annotationColumn']==col and r['phase']=='on' and r['signedDirection'] in ['positive_all_4','negative_all_4']])}
                   for col in ['superclass','class','type','subclass']},
    'typeConsistencySizeBands':{band:{'allTypes':len([r for r in group_rows if r['annotationColumn']=='type' and r['annotationValue']!='(unannotated)' and r['phase']=='on' and low<=r['neurons']<=high]),
                                     'strictConsistentNonzeroOn':len([r for r in group_rows if r['annotationColumn']=='type' and r['annotationValue']!='(unannotated)' and r['phase']=='on' and low<=r['neurons']<=high and r['signedDirection'] in ['positive_all_4','negative_all_4']])}
                                for band,low,high in [('singleton',1,1),('2-19',2,19),('20-plus',20,N)]},
}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')

def table(rows):
    lines = ['| Category | n | Signed count change: 370019 / 377938 / 385857 / 393776 | Mean signed Hz/neuron | Mean absolute count difference |',
             '|---|---:|---|---:|---:|']
    for r in rows:
        name = r.get('category',r.get('annotationValue'))
        changes = ' / '.join(f"{r[f'signedDeltaSpikes_{s}']:+,}" for s in SEEDS)
        lines.append(f"| {name} | {r['neurons']:,} | {changes} | {r['signedMeanDeltaHzPerNeuron']:+.4f} | {r['meanAbsNeuronDeltaSpikes']:,.2f} |")
    return '\n'.join(lines)

on = [r for r in selected_rows if r['phase']=='on']
off = [r for r in selected_rows if r['phase']=='off']
consistent_super = [r for r in group_rows if r['annotationColumn']=='superclass' and r['phase']=='on' and r['signedDirection'] in ['positive_all_4','negative_all_4']]
consistent_class = [r for r in group_rows if r['annotationColumn']=='class' and r['phase']=='on' and r['signedDirection'] in ['positive_all_4','negative_all_4']]
consistent_types = [r for r in group_rows if r['annotationColumn']=='type' and r['phase']=='on' and r['annotationValue']!='(unannotated)' and r['signedDirection'] in ['positive_all_4','negative_all_4']]
large_types = sorted([r for r in consistent_types if r['neurons']>=20],key=lambda r:-abs(r['signedMeanDeltaHzPerNeuron']))
large_nonphoto_types = [r for r in large_types if r['frozenPhotoreceptors'] == 0]
small_types = sorted([r for r in consistent_types if 2<=r['neurons']<20],key=lambda r:-abs(r['signedMeanDeltaHzPerNeuron']))
singleton_types = sorted([r for r in consistent_types if r['neurons']==1],key=lambda r:-abs(r['signedMeanDeltaHzPerNeuron']))
md = ['# Frozen visual-background assay: descriptive anatomical count changes',
      '', 'This post-hoc analysis uses all eight existing trials and all 24 count arrays. No simulation, fit, trial removal, parameter selection, or biological replication claim is involved.',
      '', 'All seven source hashes (using the archived simulation scripts), all 24 recorded array hashes, the launch/result plan hash, array length and recorded count summaries passed. The retained annotation contains 166,700 unique body IDs in the frozen filter/sort order. Every pre-phase count is exactly paired-equal at all 166,700 neurons, and all 40 pre-phase frozen-pool voltage samples are also exactly paired-equal, for every seed.',
      '', 'The contrast is flash minus dark within the listed seed. On and off each last 0.3 seconds; pre lasts 0.2 seconds. Mean signed Hz/neuron is the four-pair mean signed group count difference divided by group size and duration. Mean absolute count difference sums the absolute per-neuron differences before averaging across seeds; it measures redistribution and does not establish a directional effect.',
      '', 'In the on phase, 8,942 / 9,032 / 9,063 / 9,033 nonphotoreceptor neurons changed counts, but their total signed differences were −1,781 / +433 / +848 / −896 spikes. The mean signed change was −349 spikes versus 13,833.5 mean absolute per-neuron count difference; these are very different quantities. Across all four pairs, 148 nonphotoreceptor neurons increased in every pair and 191 decreased in every pair, out of 15,612 changed in at least one pair. All 29,843 cells in the frozen downstream visual pools remained spike-silent in every trial/phase.',
      '', '## Requested categories, on phase', '', table(on),
      '', 'The atlas ORN subset is exactly the frozen 2,141 driven indices. The broader olfactory category uses annotation class `olfactory` (all 2,639 are `cb_sensory`). ALPN, ALLN and DAN use exact annotation classes. Motor combines `cb_motor` and `vnc_motor`. The transmitter pools use the separately frozen `labels.json`, and transmitter labels do not validate receptor effects or modulatory function. Category definitions and overlap are explicit in selected-categories.csv; these categories are not disjoint.',
      '', '## On-phase superclass aggregates with the same nonzero sign in all four pairs', '', table(consistent_super),
      '', 'Screening denominator: all 27 superclasses. Three have strictly nonzero same-sign on totals; one is the directly driven ol_sensory superclass. These two remaining groups are exploratory descriptors, not confirmed modulation targets.',
      '', '## On-phase class aggregates with the same nonzero sign in all four pairs', '', table(consistent_class),
      '', 'Screening denominator: 22 class groups (21 named plus unannotated). Two have strictly nonzero same-sign on totals; one is the directly driven visual class. MBON is the other. Post-hoc same-sign results across many groups can occur by chance.',
      '', '## Consistent on-phase named types of at least 20 cells',
      '', 'Screening denominator: 11,752 type groups (11,751 named plus unannotated). In total, 264 have strictly nonzero same-sign on totals. Among named types: 14 of 533 types with n ≥ 20, 249 of 10,899 types with n = 2–19, and 1 of 319 single-cell types meet this rule. Every group is retained in the full matrix; sign consistency across four stochastic seeds is an exploratory descriptor after screening many groups, with no statistical or biological confirmation claim.',
      '', 'Four nonphotoreceptor types meet this descriptive criterion. The minimum group size of 20 is used only for readable display. The complete export includes every named type and every seed, regardless of size or result. Aggregate sign consistency need not mean every individual neuron shares that sign.', '', table(large_nonphoto_types),
      '', 'For example, no individual MBON neuron decreased strictly in all four pairs despite the negative class totals. Neither the ORN_DC1 nor ORN_DM6 pools has an individual neuron with strictly positive changes in all four pairs. The KCab-s aggregate increases in all four pairs, but it has zero individually consistent increasers and one consistent decreaser. These totals describe group averages, not a uniform cellular response.',
      '', 'Ten additional named types with n ≥ 20 are the directly driven photoreceptor types; their mean increases are about 49–51 Hz/neuron as expected from the imposed 50 Hz input. The source membership counts are retained for every group in the complete CSV.',
      '', '## Small types (2–19 cells), kept separate', '', 'Descriptive top 15 by the same criterion; these denominators are small and are not equivalent evidence to large populations.', '', table(small_types[:15]),
      '', '## Single-cell types, kept separate', '', 'Descriptive top 10 by the same criterion. Each row is one modeled neuron observed under four random seeds; it is not a replicated cell population.', '', table(singleton_types[:10]),
      '', '## Off phase, all requested categories', '', table(off),
      '', '## Limits and reproduction',
      '', 'Signed differences across four stochastic seeds describe this one simulated circuit under this fixed protocol. Consistency is not a statistical test, a biological-replication result, or a claim of an effective behavioral/gain response. Count-only observations cannot establish which anatomical path carried a perturbation or its timing. The silent frozen visual pools do not imply the rest of the graph is unresponsive, and widespread absolute count changes do not imply a large net directional shift.',
      '', 'Run from any directory:', '', '```sh',
      f'{ROOT}/artifacts/lif-runtime/bin/python {ROOT}/scripts/summarize-visual-anatomy.py --root {ROOT} --output {OUT}', '```',
      '', 'Outputs: summary.json (checks, definitions, complete requested-category data), selected-categories.csv, all-annotation-groups.csv (all superclass/class/type/subclass groups for pre/on/off), changed-neurons.csv (all neurons with any paired difference, retaining each seed), and this report.']
(OUT/'report.md').write_text('\n'.join(md)+'\n')
print(json.dumps({'output':str(OUT),'verifiedArrays':24,'verifiedSources':len(hash_checks),'preEqualitySeeds':SEEDS,'onCategories':[{k:v for k,v in r.items() if k in ['category','neurons','signedDirection','signedDeltaMeanSpikes','meanAbsNeuronDeltaSpikes','signedMeanDeltaHzPerNeuron'] or k.startswith('signedDeltaSpikes_')} for r in on],'groupCounts':summary['groupCounts'],'typeConsistencySizeBands':summary['typeConsistencySizeBands']},indent=2))
