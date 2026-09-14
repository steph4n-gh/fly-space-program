# Licenses, attribution and provenance

## Project-authored code and documentation

The current project license is [No Theo License v1.0](LICENSE), adopted from [maria-rcks/no-theo-license](https://github.com/maria-rcks/no-theo-license) at commit [`6c5af24964869a03daa31dff4ab8ae95b03adf33`](https://github.com/maria-rcks/no-theo-license/tree/6c5af24964869a03daa31dff4ab8ae95b03adf33). Only the year and copyright-holder placeholders were substituted. The [machine-readable provenance](docs/license-provenance.json) records source and result hashes.

It is MIT-derived but **not MIT and not an open-source license**: it excludes Theo Browne. Upstream describes it as a joke license; this project makes no claim that the exclusion has been legally tested. Earlier revisions preserve their original license notices. This change does not rewrite third-party terms or remove permissions already granted under an earlier license.

## Anatomical data

The derived [MaleCNS v1.0](https://male-cns.janelia.org/) data is separately licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Credit: **HHMI Janelia FlyEM, University of Cambridge, MRC Laboratory of Molecular Biology, and Google Research**, with the authors and collaborators credited by the MaleCNS project.

The application retains annotated non-glial cells and measured contacts between retained cells, converts connections into compressed arrays, derives annotated sensory/output maps, assigns a simplified transmitter-polarity rule, and samples measured anatomical coordinates for visualization. Export and modeling choices are described in [controller and provenance](docs/controller-and-provenance.md). They are project transformations, not claims made by the data authors. Original URLs, byte counts and SHA-256 hashes are in [the source lock](scripts/source-lock.json).

The No Theo exclusion does **not** relicense the underlying CC BY 4.0 data.

## Third-party software and fonts

| Component | Terms and source |
| --- | --- |
| Three.js | MIT. The bundled copy retains [its original license](dist/vendor/THREE-LICENSE.txt). The npm version is pinned by [package-lock.json](package-lock.json). |
| Barlow Condensed | Loaded through Google Fonts; upstream [Barlow project and OFL](https://github.com/jpt/barlow). |
| DM Sans | Loaded through Google Fonts; upstream [DM Sans project](https://github.com/googlefonts/dm-fonts). |
| IBM Plex Mono | Loaded through Google Fonts; upstream [IBM Plex project and OFL](https://github.com/IBM/plex). |

Research exports and external study material retain the attribution and terms documented alongside them, including the [visual-model export record](docs/visual-export-context/README.md). Inclusion in an experiment or document does not transfer ownership of an external paper, dataset, figure or implementation.

## Screenshots and concept art

[Simulator screenshots](docs/screenshots.md) are captures of this application. [Fly Cube images](docs/harness-concept.md) are AI-generated design mockups, with prompts and provenance retained alongside them. Neither depicts a tested physical Fly Cube. No association with or endorsement by Omarchy, SpaceX, or a research institution is implied.
