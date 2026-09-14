#!/usr/bin/env python3
"""Decompose already reported visual-benchmark errors without fitting anything.

Standard library only. Reads preserved prediction vectors; never imports/runs
the benchmark source, an optimizer, or a model, and never opens MAT recordings.
All variances use ddof=0 over the exact stored samples and original equal weights.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


EXPECTED = {
    "published-results.json": "cb30b14da9dce3d107e5bb8f13a126c94327582c83ed48df6c8e3f8dabd17732",
    "plan.json": "3f8a163724cbe7562b15a246a96a4af746610ddb5e704809412fe5d8f9c17564",
    "fit.json": "b3872d3e0b670fe1e6257c25fad7a020e431ddf43ab733a5301897a46049d7c8",
    "evaluation.json": "46468c97805c278bc3f959be2b62b1bbebf2d91891509eeb9affb8806f7afb91",
    "tested-source.py": "60b2b89a4d8d94f149b4d10dd2cdc4bd2fad6341d1b6248771105772114f4afe",
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def close(actual, expected, label, tolerance=1e-14):
    if actual is None or expected is None:
        assert actual is expected, label
    else:
        assert abs(actual - expected) <= tolerance, (label, actual, expected)


def decompose(trace):
    y, p, t = trace["measured"], trace["predicted"], trace["timeSeconds"]
    n = len(y)
    assert len(p) == len(t) == n and n > 0
    assert all(math.isfinite(x) for seq in (y, p, t) for x in seq)
    assert all(a < b for a, b in zip(t, t[1:]))
    my, mp = math.fsum(y) / n, math.fsum(p) / n
    vy = math.fsum((x - my) ** 2 for x in y) / n
    vp = math.fsum((x - mp) ** 2 for x in p) / n
    sy, sp = math.sqrt(vy), math.sqrt(vp)
    covariance = math.fsum((a - mp) * (b - my) for a, b in zip(p, y)) / n
    product = sp * sy
    correlation = covariance / product if product > 0 else None
    delta = mp - my
    mse = math.fsum((a - b) ** 2 for a, b in zip(p, y)) / n
    zero_mse = math.fsum(b * b for b in y) / n
    raw_identity = delta * delta + vp + vy - 2 * covariance
    terms = {
        "meanBiasSquared": delta * delta,
        "sdMismatchSquared": (sp - sy) ** 2,
        "correlationMismatch": 2 * (product - covariance),
    }
    # Undefined correlation for a constant trace has covariance and product zero.
    # Therefore correlationMismatch=0 without assigning an artificial r value.
    regrouped = math.fsum(terms.values())
    assert all(v >= -1e-18 for v in terms.values())
    close(raw_identity, mse, "raw MSE identity", 2e-18)
    close(regrouped, mse, "regrouped MSE identity", 2e-18)
    expected = trace["metrics"]
    close(math.sqrt(mse), expected["rmse"], "preserved RMSE")
    close(delta, expected["meanError"], "preserved mean error")
    close(correlation, expected["correlation"], "preserved correlation", 2e-14)
    skill = 1 - mse / zero_mse if zero_mse > 0 else None
    close(skill, expected["zeroReferenceSkill"], "preserved skill", 2e-14)
    assert expected["samples"] == n
    return {
        "samples": n,
        "firstTimeSeconds": t[0],
        "lastTimeSeconds": t[-1],
        "targetMean": my,
        "predictionMean": mp,
        "targetSD": sy,
        "predictionSD": sp,
        "predictionToTargetSDRatio": sp / sy if sy > 0 else None,
        "targetVariance": vy,
        "predictionVariance": vp,
        "covariance": covariance,
        "correlation": correlation,
        "meanError": delta,
        "mse": mse,
        "rmse": math.sqrt(mse),
        "zeroResponseMSE": zero_mse,
        "zeroReferenceSkill": skill,
        "varianceIdentityTerms": {
            "meanBiasSquared": delta * delta,
            "predictionVariance": vp,
            "targetVariance": vy,
            "negativeTwiceCovariance": -2 * covariance,
        },
        "nonnegativeDecomposition": terms,
        "fractionOfMSE": {key: value / mse if mse > 0 else None for key, value in terms.items()},
        "largestArithmeticTerm": max(terms, key=terms.get),
        "centeredMSE": terms["sdMismatchSquared"] + terms["correlationMismatch"],
        "identityResiduals": {"varianceFormMinusDirect": raw_identity - mse, "threeTermFormMinusDirect": regrouped - mse},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, help="Optional directory containing the original flat input snapshots")
    root = Path(__file__).resolve().parents[1]
    parser.add_argument("--output", type=Path, default=root / "docs/visual-response-error-audit.json")
    args = parser.parse_args()
    folder = root / "artifacts/odor-interface/visual-response-benchmark"
    files = {name: (args.inputs / name if args.inputs else root / "docs/visual-response-benchmark-results.json" if name == "published-results.json" else folder / name) for name in EXPECTED}
    hashes = {name: sha(path) for name,path in files.items()}
    assert hashes == EXPECTED, "Preserved input hashes changed"
    published = json.loads(files["published-results.json"].read_text())
    for name in ("plan", "fit", "evaluation"):
        assert published[name] == json.loads(files[name + ".json"].read_text()), name
    for name in ("fit", "evaluation"):
        assert published[name]["planSHA256"] == hashes["plan.json"]
        assert published[name]["sourceSHA256"] == hashes["tested-source.py"]
    assert published["evaluation"]["fitSHA256"] == hashes["fit.json"]
    assert published["plan"]["sourceSHA256"] == hashes["tested-source.py"]

    records = []
    evaluation = published["evaluation"]
    for cell, models in evaluation["lowLuminance"].items():
        for model, signs in models.items():
            selected = published["fit"]["models"][cell].get(model)
            for polarity, trace in signs.items():
                assert len(trace["measured"]) == 63
                ref = models["zero"][polarity]
                assert trace["measured"] == ref["measured"] and trace["timeSeconds"] == ref["timeSeconds"]
                records.append({
                    "id": f"lowLuminance/{cell}/{model}/{polarity}",
                    "domain": "lowLuminance", "cell": cell, "model": model, "polarity": polarity,
                    "initialization": "isolatedFlashZeroState", "normalization": "grayReference",
                    "selectedTrainingRestart": selected["selectedRestart"] if selected else None,
                    **decompose(trace),
                })
    natural_variants = {
        "primary": ("periodic", "convertedWithPeriodicPredictedCycleMean"),
        "zeroStateSecondary": ("zeroState", "convertedWithPeriodicPredictedCycleMean"),
        "unconvertedPeriodicDiagnostic": ("periodic", "unconvertedGrayReference"),
        "unconvertedZeroStateDiagnostic": ("zeroState", "unconvertedGrayReference"),
    }
    for model, variants in evaluation["natural"].items():
        selected = published["fit"]["models"]["L2"].get(model)
        for variant, (initialization, normalization) in natural_variants.items():
            trace = variants[variant]
            assert trace is not None and len(trace["measured"]) == 708
            ref = evaluation["natural"]["zero"][variant]
            assert trace["measured"] == ref["measured"] and trace["timeSeconds"] == ref["timeSeconds"]
            records.append({
                "id": f"natural/L2/{model}/{variant}",
                "domain": "natural", "cell": "L2", "model": model, "variant": variant,
                "initialization": initialization, "normalization": normalization,
                "selectedTrainingRestart": selected["selectedRestart"] if selected else None,
                "periodicCycleMeanGrayReference": variants["periodicCycleMeanGrayReference"],
                "validPredictedFluorescence": variants["validPredictedFluorescence"],
                **decompose(trace),
            })
    assert len(records) == 24
    by_id = {r["id"]: r for r in records}
    comparisons = {}
    for model in ("one_filter", "two_filter"):
        p = by_id[f"natural/L2/{model}/primary"]
        z = by_id[f"natural/L2/{model}/zeroStateSecondary"]
        u = by_id[f"natural/L2/{model}/unconvertedPeriodicDiagnostic"]
        comparisons[model] = {
            "startupMinusPeriodicMSE": z["mse"] - p["mse"],
            "startupRelativeMSEChange": z["mse"] / p["mse"] - 1,
            "preservedConversionMSEDecrease": u["mse"] - p["mse"],
            "preservedConversionRelativeMSEDecrease": 1 - p["mse"] / u["mse"],
        }
    output = {
        "status": "Post-test development diagnosis of already reported predictions; no new test or calibration",
        "scope": {"records": 24, "lowLuminance": 12, "natural": 12, "models": ["zero", "one_filter", "two_filter"],
                  "optimizerAttemptsEvaluated": 0, "newPredictionsComputed": 0, "newEmpiricalDatasetsOpened": 0},
        "method": {
            "units": "Means and SD in fractional deltaF/F; MSE and variance in squared fractional deltaF/F",
            "weights": "Equal original sample weights, full preserved trace, population SD (ddof=0)",
            "varianceIdentity": "MSE=(meanP-meanY)^2+sdP^2+sdY^2-2*r*sdP*sdY",
            "nonnegativeIdentity": "MSE=(meanP-meanY)^2+(sdP-sdY)^2+2*sdP*sdY*(1-r)",
            "constantTraceConvention": "Correlation is undefined; covariance=0 and correlationMismatch=0 when either SD is zero",
            "interpretationLimits": ["Mean bias is a window-average error, not proof of a sensor-baseline cause",
                                     "SD ratio is descriptive; no rescaling was estimated or applied",
                                     "Correlation term mixes shape, timing, noise and unmodeled effects; it cannot identify a delay",
                                     "Terms are an algebraic accounting, not uniquely identified biological mechanisms"],
        },
        "inputSHA256": hashes,
        "calculatorSHA256": sha(__file__),
        "verification": {"allPreservedMetricsMatched": True,
                         "maxAbsoluteVarianceIdentityResidual": max(abs(r["identityResiduals"]["varianceFormMinusDirect"]) for r in records),
                         "maxAbsoluteThreeTermIdentityResidual": max(abs(r["identityResiduals"]["threeTermFormMinusDirect"]) for r in records)},
        "records": records,
        "comparisonsOfAlreadyPreservedNaturalVariants": comparisons,
    }
    args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(args.output), "records": len(records), "verification": output["verification"]}, indent=2))


if __name__ == "__main__":
    main()
