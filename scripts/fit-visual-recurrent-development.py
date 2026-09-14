#!/usr/bin/env python3
"""Fit three observation models to previously inspected visual development data."""
import argparse
import hashlib
import importlib.util
import json
import time
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

from visual_recurrent import Parameters, Simulator, NumericalFailure, flash_predictions, normalized_response

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'artifacts/odor-interface/visual-recurrent-development'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def write_new(path, value):
    with Path(path).open('x') as file:
        json.dump(value,file,indent=2,allow_nan=False);file.write('\n')


def verify():
    plan = json.loads((BASE/'plan.json').read_text())
    assert sha(__file__)==plan['sourceSHA256']
    for file, expected in plan['inputSHA256'].items():
        assert sha(ROOT/file)==expected, file
    spec = importlib.util.spec_from_file_location('original_visual',ROOT/plan['filterSource'])
    original = importlib.util.module_from_spec(spec);spec.loader.exec_module(original)
    return plan, original


def data_for(cell, plan):
    fit = json.loads((ROOT/plan['originalFit']).read_text())
    evaluation = json.loads((ROOT/plan['originalEvaluation']).read_text())
    assert evaluation['naturalPrimaryConditionalTransferPassed'] is False
    traces = []
    for condition, source in [('highLum',fit['models'][cell]['one_filter']),
                              ('lowLum',evaluation['lowLuminance'][cell]['zero'])]:
        for polarity in ['dark','bright']:
            trace = source[polarity]
            t, measured = np.asarray(trace['timeSeconds']), np.asarray(trace['measured'])
            assert t.shape==measured.shape==(63,) and np.isfinite(measured).all()
            traces.append({'condition':condition,'polarity':polarity,'times':t,'measured':measured})
    if cell=='L2':
        trace = evaluation['natural']['zero']['primary']
        t, measured = np.asarray(trace['timeSeconds']), np.asarray(trace['measured'])
        assert t.shape==measured.shape==(708,) and np.isfinite(measured).all()
        traces.append({'condition':'natural','polarity':None,'times':t,'measured':measured})
    contrast = np.asarray(evaluation['stimulus']['contrast'])
    assert contrast.shape==(600,)
    return traces, contrast


def predict(name, p, traces, contrast, original, settings):
    t = traces[0]['times']
    diagnostics = {}
    if name=='recurrent':
        params = Parameters(*p)
        flash_options = {'root_xtol':settings['rootTolerance'],'positive_margin':settings['positiveMargin']}
        dark, dark_path = flash_predictions(params,t,-1,**flash_options)
        bright, bright_path = flash_predictions(params,t,1,**flash_options)
        diagnostics['minimumFlashFluorescence'] = 1+min(dark_path.min_r,bright_path.min_r)
    else:
        dark, bright = original.flash(t,p)
        # These raw held-input paths exactly reproduce the continuous flash,
        # including recovery through the final recorded bin endpoint.
        ticks = round(float(t[-1])*300)
        assert abs(ticks/300-t[-1])<1e-12
        pulse = np.zeros(ticks);pulse[:6]=1
        minimum = min(original.natural_minimum(sign*pulse,p,False) for sign in [-1,1])
        diagnostics['minimumFlashFluorescence'] = 1+minimum
    if diagnostics['minimumFlashFluorescence']<=settings['positiveMargin']:
        raise NumericalFailure('Nonpositive or unresolved flash fluorescence')
    predictions = [dark if r['polarity']=='dark' else bright for r in traces[:4]]
    if len(traces)==5:
        times = traces[-1]['times']
        if name=='recurrent':
            sim = Simulator(params,root_xtol=settings['rootTolerance'],positive_margin=settings['positiveMargin'])
            edges = np.arange(601)/300
            periodic, settlement = sim.periodic(edges,contrast,atol=settings['settlingAtol'],rtol=settings['settlingRtol'])
            startup = sim.simulate(edges,contrast)
            mean = settlement['mean']
            prediction = normalized_response(periodic,times,mean)
            startup_prediction = normalized_response(startup,times,mean)
            minimum = 1+min(periodic.min_r,startup.min_r)
            diagnostics['settlement'] = settlement
        else:
            raw, mean, _ = original.natural(times,contrast,p,True)
            startup, _, _ = original.natural(times,contrast,p,False)
            minimum = 1+min(original.natural_minimum(contrast,p,True),original.natural_minimum(contrast,p,False))
            if 1+mean<=settings['positiveMargin'] or minimum<=settings['positiveMargin']:
                raise NumericalFailure('Nonpositive or unresolved natural fluorescence')
            prediction = (1+raw)/(1+mean)-1
            startup_prediction = (1+startup)/(1+mean)-1
        diagnostics.update({'periodicMean':mean,'minimumNaturalFluorescence':minimum,'startupPrediction':startup_prediction.tolist()})
        predictions.append(prediction)
    assert len(predictions)==len(traces) and all(np.isfinite(p).all() for p in predictions)
    return predictions, diagnostics


def residuals(predictions, traces):
    # Each complete trace has equal weight, irrespective of its sample count.
    return np.concatenate([(p-r['measured'])/np.sqrt(len(p)) for p,r in zip(predictions,traces)])


def fit_cell(cell, plan, original):
    out = BASE/cell;out.mkdir(exist_ok=False)
    traces, contrast = data_for(cell,plan)
    total_samples = sum(len(r['measured']) for r in traces)
    models = {}
    for name, cfg in plan['optimization'].items():
        lower, upper = np.asarray(cfg['lower']),np.asarray(cfg['upper'])
        attempts = []
        for index, start in enumerate(cfg['starts']):
            invalid_count, calls = 0, 0
            begun = time.monotonic()
            def objective(p):
                nonlocal invalid_count, calls
                calls += 1
                try:
                    predictions, _ = predict(name,p,traces,contrast,original,plan['numerics'])
                    return residuals(predictions,traces)
                except (NumericalFailure,FloatingPointError,OverflowError) as error:
                    invalid_count += 1
                    with (out/'invalid-proposals.jsonl').open('a') as file:
                        file.write(json.dumps({'model':name,'restart':index,'call':calls,'parameters':p.tolist(),'reason':str(error)})+'\n')
                    return np.full(total_samples,plan['invalidProposalResidualNorm']/np.sqrt(total_samples))
            try:
                with np.errstate(over='raise',invalid='raise',divide='raise'):
                    result = least_squares(objective,start,bounds=(lower,upper),method='trf',jac='2-point',
                                           diff_step=plan['solver']['diff_step'],x_scale='jac',
                                           ftol=plan['solver']['ftol'],xtol=plan['solver']['xtol'],
                                           gtol=plan['solver']['gtol'],max_nfev=plan['solver']['max_nfev'])
            except Exception as error:
                attempt = {'model':name,'restart':index,'initial':start,'parameters':None,
                           'success':False,'validPredictions':False,'meanTraceMSE':None,
                           'functionCalls':calls,'invalidProposals':invalid_count,
                           'elapsedSeconds':time.monotonic()-begun,
                           'error':{'phase':'optimization','type':type(error).__name__,'message':str(error)}}
                write_new(out/f'{name}-attempt-{index}.json',attempt);attempts.append(attempt)
                print(json.dumps({'cell':cell,**attempt}),flush=True)
                continue
            valid = True
            try:
                predictions, diagnostics = predict(name,result.x,traces,contrast,original,plan['numerics'])
                score = float(np.sum(residuals(predictions,traces)**2)/len(traces))
            except Exception as error:
                valid, score, diagnostics = False,None,{'reason':str(error),'type':type(error).__name__}
            svd_error = None
            try:
                singular_values = np.linalg.svd(result.jac*(upper-lower)[None,:],compute_uv=False).tolist()
                if not np.isfinite(singular_values).all():
                    raise NumericalFailure('Nonfinite Jacobian singular values')
            except Exception as error:
                singular_values = None
                svd_error = {'type':type(error).__name__,'message':str(error)}
            attempt = {'model':name,'restart':index,'initial':start,'parameters':result.x.tolist(),
                       'success':bool(result.success),'status':int(result.status),'message':result.message,
                       'validPredictions':valid,'meanTraceMSE':score,'functionCalls':calls,'nfev':int(result.nfev),
                       'invalidProposals':invalid_count,'optimality':float(result.optimality),
                       'elapsedSeconds':time.monotonic()-begun,'numerics':diagnostics,
                       'boundHits':[int(i) for i in np.flatnonzero((result.x-lower<=1e-6*(upper-lower))|(upper-result.x<=1e-6*(upper-lower)))],
                       'rangeScaledJacobianSingularValues':singular_values,'jacobianDiagnosticError':svd_error}
            write_new(out/f'{name}-attempt-{index}.json',attempt);attempts.append(attempt)
            print(json.dumps({'cell':cell,**{k:v for k,v in attempt.items() if k in ['model','restart','success','validPredictions','meanTraceMSE','functionCalls','elapsedSeconds','boundHits']}}),flush=True)
        eligible = [a for a in attempts if a['success'] and a['validPredictions']]
        if not eligible:
            models[name] = {'attempts':attempts,'selected':None,'complete':False}
            continue
        selected = min(eligible,key=lambda a:(a['meanTraceMSE'],a['restart']))
        try:
            predictions, diagnostics = predict(name,selected['parameters'],traces,contrast,original,plan['numerics'])
            tighter, tight_diagnostics = predict(name,selected['parameters'],traces,contrast,original,plan['verificationNumerics'])
            convergence_error = max(float(np.max(np.abs(a-b))) for a,b in zip(predictions,tighter))
            if 'startupPrediction' in diagnostics:
                startup_error = float(np.max(np.abs(np.asarray(diagnostics['startupPrediction'])-tight_diagnostics['startupPrediction'])))
                convergence_error = max(convergence_error,startup_error)
        except Exception as error:
            models[name] = {'attempts':attempts,'selected':selected,'complete':False,
                            'verificationError':{'type':type(error).__name__,'message':str(error)}}
            continue
        records = [{k:v for k,v in r.items() if k not in ['times','measured']}|
                   {'timeSeconds':r['times'].tolist(),'measured':r['measured'].tolist(),'predicted':p.tolist(),
                    'metrics':original.metrics(r['measured'],p)} for r,p in zip(traces,predictions)]
        models[name] = {'attempts':attempts,'selected':selected,'traces':records,'numerics':diagnostics,
                        'tightNumerics':tight_diagnostics,'tightPredictionMaximumDifference':convergence_error,
                        'complete':all(a['success'] and a['validPredictions'] and a['jacobianDiagnosticError'] is None for a in attempts) and convergence_error<=plan['maximumConvergenceDifference']}
    result = {'stage':'development fitting only; all response data previously inspected','cell':cell,
              'planSHA256':sha(BASE/'plan.json'),'sourceSHA256':sha(__file__),'coreSHA256':sha(ROOT/'scripts/visual_recurrent.py'),
              'complete':all(r['complete'] for r in models.values()),'models':models,
              'originalTransferStillFailed':True,'independentResponseTestPerformed':False,'connectomeParametersInstalled':False}
    write_new(out/'fit.json',result)
    print(json.dumps({'cell':cell,'complete':result['complete'],'fitSHA256':sha(out/'fit.json')}),flush=True)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__);parser.add_argument('cell',choices=['L1','L2']);args=parser.parse_args()
    plan, original = verify();fit_cell(args.cell,plan,original)
