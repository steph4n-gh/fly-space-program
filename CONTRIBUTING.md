# Contributing

Fly Space Program combines a browser application with experimental connectome
models and research reports. Small, focused changes are easiest to review. Explain
the behavior or scientific question your change addresses, and reuse the existing
scripts before introducing new tooling.

## Local setup

Use Git, Node.js 24 with npm, and Python 3. Clone the repository with its history;
`npm run check` compares the current physics with a historical Git revision.

```sh
git clone https://github.com/steph4n-gh/fly-space-program.git
cd fly-space-program
npm ci
npm start
```

Open
[localhost:4173](http://localhost:4173) in a desktop browser with WebGL 2.
`npm start` runs Python's HTTP server over the committed `dist/` directory;
there is no application build step. Wait for the complete graph to load before
testing automated flight. The first browser load transfers about 91 MB of graph
and anatomy assets.

Edit the browser application in `dist/` and offline tools in `scripts/`.
`dist/` is checked-in application source and assets, so include relevant changes
there in the pull request. Dependency changes should update both `package.json`
and `package-lock.json`. Keep original source data in ignored `data/` and local
training products in ignored `artifacts/`.

## Verification

Run the existing checks from the repository root:

```sh
npm run check
git diff --check
```

The checks exercise the complete graph, decision inspection, physics, sensors,
activation gain, and perception. They include neural calculations and reference
flight trajectories, so allow time and memory for the complete graph. CI runs this
same command on Node 24. A passing check does not reproduce every research
experiment or establish flight reliability.

For a browser change, also open the affected view and describe the interaction
you checked. Include a screenshot when appearance is part of the change. For
model, physics, data, or training changes, include the relevant focused checks
and explain any changed assumptions or outcome definitions. Record commands that
were not run and why; do not label an unexecuted experiment as passing.

## Research changes

Before running an experiment, record its hypothesis, source revision, runtime,
initial checkpoint, cases and seeds, controls, flight budget, and selection rule.
Use a fresh experiment directory: several trainers resume existing state.
Preserve every planned outcome, including failures and timeouts, and distinguish
training, model selection, and final evaluation. Keep a changed metric separate
from the physical success predicate.

Publish a concise report with source and checkpoint identities, complete case
counts, limitations, and links to available evidence. Large local archives are
not included automatically when the report enters Git. Identify missing archives
explicitly. See [Reproducibility](docs/reproducibility.md) for data verification,
historical runtimes, native builds, and the limits of exact reproduction.

## Pull requests and licensing

Describe the problem, resulting behavior, and validation in the pull request.
Keep unrelated changes separate. Bug reports should include a revision, steps,
and environment; research questions should identify the claim or evidence under
discussion. The issue templates provide short prompts for both.

Project code is source-available under [No Theo License 1.0](LICENSE). Read its
terms before using or contributing code. Preserve the separate MaleCNS data
attribution under CC BY 4.0 and the vendored
[Three.js MIT notice](dist/vendor/THREE-LICENSE.txt). Include provenance and the
applicable license for any additional third-party material.
