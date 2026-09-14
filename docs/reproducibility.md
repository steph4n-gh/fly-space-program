# Reproducibility

A clone contains the runnable browser application, packaged checkpoints,
compressed graph assets, scripts, and selected research reports. Reproducing a
published experiment also requires its original inputs and execution record.
The repository does not contain every archive referenced by those reports.

## Run the application and regression checks

From a full clone, use Node.js 24 with npm and Python 3:

```sh
npm ci
npm run check
npm start
```

Open [localhost:4173](http://localhost:4173). The server serves `dist/` directly;
there is no bundler or build command. Browser graphics require WebGL 2. The graph
and anatomy assets account for about 91 MB of the first browser load, and the
complete graph must load before automated control begins.

`npm run check` uses the committed assets and runs the seven check scripts listed
in [package.json](../package.json). It covers graph integrity, decision replay,
historical physics, orbital reference dynamics, sensors, activation gain, and
perception. It includes complete-graph calculations and some flight evaluations;
it does not rerun the research training campaigns. Data downloads, native
compilation, and a Python scientific environment are unnecessary for this check.

The historical physics check reads
`0bec91b8bf08a5166283c41b65592f7d6fecf98a:dist/engine3d.js` through Git. An archive
download or shallow clone may therefore be insufficient. For a shallow clone,
fetch its history with `git fetch --unshallow`. CI uses `fetch-depth: 0` for this
reason, installs Node 24, and runs `npm ci` followed by `npm run check` in one
bounded job. CI does not publish the site or start a population training search.
The workflow follows the official [checkout](https://github.com/actions/checkout)
and [setup-node](https://github.com/actions/setup-node) action interfaces.

Current frozen native experiments record Node **v24.3.0** on **macOS arm64**.
The CI Node 24/Linux environment is a regression-check environment, not a
reconstruction of that original machine. Record the exact Node/npm versions,
operating system, architecture, and Git revision when comparing runs.

## Files included and excluded

| Location | Contents and availability |
| --- | --- |
| `dist/` | Committed browser modules, vendor files, compressed graph/anatomy, and packaged checkpoints. |
| `scripts/source-lock.json` | Committed URLs, byte counts, and SHA-256 identities for four original MaleCNS tables. |
| `docs/` | Committed reports, selected machine-readable results, and figures. |
| `data/` | Ignored downloaded source tables and other local research data. |
| `artifacts/` | Ignored native binaries, calibration samples, training states, logs, traces, frozen runtime copies, and audit products. |
| `.venv/`, `node_modules/` | Ignored local dependency installations. |

The four locked MaleCNS tables total **7,886,187,192 bytes**, approximately
**7.9 GB** before working files or derived outputs. They are not downloaded by
`npm ci` or `npm start`. Local experiment archives can require additional space.
Links into `artifacts/` describe the author's local archive and will not resolve
from an ordinary clone unless that archive is supplied separately. A hash
identifies missing bytes; it does not make them available or reproduce a run.

MaleCNS data retains its CC BY 4.0 attribution and Three.js retains its MIT
notice. The project's [No Theo License 1.0](../LICENSE) applies to project code;
it does not replace those third-party terms.

## Rebuild anatomical assets only when needed

Use a separate checkout when rebuilding data-derived assets: the builders write
into tracked `dist/assets/` paths. The acquisition helpers use Python 3.11 or
newer because they call `hashlib.file_digest`.

```sh
python3 scripts/fetch_connectome.py
python3 scripts/fetch_anatomy.py
```

These helpers record the bytes they find; they do not enforce the existing lock.
The first rewrites the lock with three tables, and the second adds the anatomy
table. Run them in that order, then verify every file against the lock committed
at the checked-out revision before using a builder:

```sh
python3 - <<'PY'
import hashlib
import json
import subprocess
from pathlib import Path

lock = json.loads(subprocess.check_output(
    ['git', 'show', 'HEAD:scripts/source-lock.json'], text=True))
for name, expected in lock.items():
    file = Path('data') / name
    with file.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if file.stat().st_size != expected['bytes'] or digest != expected['sha256']:
        raise SystemExit('Source identity mismatch: ' + name)
    print('Verified', name)
PY
git diff -- scripts/source-lock.json
```

An unexpected lock diff or digest mismatch needs investigation. Updating the
lock to accept different source bytes changes the input dataset.

The core builders use NumPy, pandas, and PyArrow. The repository has no locked
Python environment for these builders; preserve package versions when running
them. A separate environment can be prepared with:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install numpy pandas pyarrow
.venv/bin/python -m pip freeze > /tmp/fly-space-program-python-packages.txt
.venv/bin/python scripts/build_full_connectome.py
.venv/bin/python scripts/build_anatomy.py
.venv/bin/python scripts/build-sensory-map.py
```

This sequence rebuilds the core graph, display anatomy, and sensory routing from
the verified tables, using the committed `dist/assets/circuit.json` as a graph
builder input. It does not recreate every odor atlas, trained checkpoint, or
research figure. Compare the resulting manifests, array identities, and Git diff
with the selected revision. Different Python, NumPy, PyArrow, compression, or
platform versions can affect output bytes; exact equality must be checked.

## Reproduce an experiment

Start with the specific report's frozen method and runtime rather than applying
its old command to today's trainer. The [suite guide](suite-training.md) records
the evolving calibration and flight procedures. The historical V8 implementation
is at `ca4fcaed774e78c1b71d65b6dd91738b0c4d9e15`; its original timing requires that
revision. Later experiments also pin isolated source copies under `artifacts/`,
which must be obtained separately when absent from the clone.

For a meaningful comparison, retain the exact source/runtime identities, initial
checkpoint and decoded weights, sensory basis, backend, full supplied environment,
cases and seeds, variation settings, worker count, search state, budget, and
selection rule. Record the original command and process completion along with
all outputs. A result file or a partial progress log alone does not establish
successful completion. If an older report lacks part of this provenance, state
the gap rather than inferring it from a later run.

Training can resume existing state. Use a fresh `SUITE_BLOCK` for a new research
run, and preserve the source run's files. A repeated run is a new attempt, even
if it uses the same seeds. Retain failures and timeouts, distinguish development
and final cases, and report whether a comparison uses fresh or reused cases.
Some historical commands refer to a local `artifacts/lif-runtime/bin/python`;
that environment is not distributed with the repository.

The optional native backend is built by `node scripts/build-rate-native.mjs`.
It needs a C++17 compiler and Node API headers beside the Node installation.
Its ignored `artifacts/native-rate/build.json` records compiler flags, Node,
platform, architecture, source hash, and binary hash. Rebuilding on another
machine creates a new binary identity. Run the relevant native parity checks
before using it, and keep native results distinct from browser JavaScript
validation. Native parity, arithmetic audits, and physical trajectory replays
each check different properties; none alone demonstrates biological validity or
reliable completion across the mission suite.
