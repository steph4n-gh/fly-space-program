# Documentation

Fly Space Program aims to take simulated fly training as far as possible before building a physical interface. These guides separate the working simulator, its evidence, and the proposed Fly Cube.

## Choose a route

| I want to… | Read |
| --- | --- |
| Get the overview and try it | [Project README](../README.md) |
| See the application | [Screenshot gallery](screenshots.md) |
| Understand the research questions | [Science and hypotheses](science-and-hypotheses.md) |
| Ask the obvious and less-obvious questions | [Facts and FAQ](facts-and-faq.md) |
| Understand how inputs become commands | [Controller and provenance](controller-and-provenance.md) |
| Run checks or rebuild data | [Reproducibility](reproducibility.md) |
| Contribute code or an experiment | [Contributing](../CONTRIBUTING.md) |
| Understand the project's values | [Philosophy](../PHILOSOPHY.md) |
| Inspect the proposed little boxes | [Fly Cube](harness-concept.md) and [physical interface](physical-fly-interface.md) |

## Research record

These are evidence records, including unsuccessful experiments. A development result applies to its specified controller, inputs, cases and runtime; it is not automatically a new release or a claim about living flies.

| Area | Guide and evidence |
| --- | --- |
| Released embodied controller | [Suite training](suite-training.md), [60/80 landing report](../dist/assets/landing-report.json) |
| Ground mission development | [All-ground training](ground-all-training.md), [selection comparison](ground-all-selection.md), [failure diagnostic](ground-training-diagnostic.md), [contact-ranking experiment](ground-contact-comparison.md) |
| Orbital development | [Paired trajectory diagnostic](orbital-joint-paired.md), [completed 588-flight ranking comparison](orbital-progress-comparison.md), [proposal-locality experiment](orbital-local-comparison.md) |
| Biological questions | [Biology experiments](biology-experiments.md), [additional odor panel](additional-odor-tests.md), [odor calibration](odor-calibration-followup.md) |
| Visual model validation | [Visual response benchmark](visual-response-benchmark.md), [recurrent model](visual-recurrent-development.md), [external model comparison](cdm-response-comparison.md), [context identifiability](visual-context-identifiability.md) |
| Early controller history | [First landing lesson](landing-training.md), [controller and provenance](controller-and-provenance.md) |

Machine-readable JSON and CSV accompany these reports. Large raw source tables, frozen runtimes and complete local experiment archives are excluded from Git; their presence on a development machine does not mean a fresh clone contains them. The [reproduction guide](reproducibility.md) explains that boundary. Newer completion notes identify the historical pending states they supersede.

## Reading the evidence

- **Released:** the shipped checkpoint and its retained final tests.
- **Development:** a measured experiment informing the next research step; it may be negative or inconclusive.
- **Proposed:** a method, apparatus or future experiment that has not supplied the claimed evidence yet.
- **Illustrative:** screenshots and concept art, not benchmark data or hardware photographs.

See [licenses and source credit](../THIRD_PARTY_NOTICES.md) before reusing code, data or figures.
