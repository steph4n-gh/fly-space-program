# Public-readiness review — 14 September 2026

The repository is ready for public review as an **experimental, source-available
research project**, within the scope checked below. No blocking issue was found
after correcting the restricted-demo label and the third-party source notice.
Repository and hosted-site access remain private; this review did not publish
either one.

The reviewed application and history were commit
`8b0633786286cae5ec9a481a0bdd17a9da8acab6`. The readiness changes are documentation
only; they do not alter application assets, model weights or frozen evidence.

| Check | Observed result |
| --- | --- |
| Fresh GitHub clone | Full history available; no local `data/` or `artifacts/` directory required to run the packaged app. |
| Installation | `npm ci` succeeded; npm audited two packages and reported zero vulnerabilities. |
| Project checks | All seven scripts in `npm run check` passed. Decision replay error was zero and the hidden-navigation check passed. |
| Local serving | `npm start` served the index, graph manifest and a graph archive with HTTP 200 and exact tracked-file matches. Archive decompression passed. The temporary server was stopped. |
| History secret scan | Gitleaks 8.30.1 scanned all 37 commits and approximately 35.67 MB, with full redaction and inline allow-comments disabled. No secrets were detected. |
| Documentation | Reviewed setup, contribution, research-boundary and source-attribution guidance; all 296 checked local file links resolved to tracked files. |
| Images | Tracked PNG/JPEG files contained no EXIF metadata. The three application screenshots were visually checked for unrelated desktop or account information. |
| Research provenance | The two bundled upstream source files exactly matched the publisher's archives; their CC BY 4.0 license and authors are now explicit. Frozen source hashes remain unchanged. |

The fresh-clone checks ran on macOS arm64 with Node 24.3.0, npm 11.4.2 and
Python 3.14.4. The repository's GitHub workflow separately runs its project
checks on Ubuntu with Node 24.

## Corrections made

- The README identifies the hosted simulator as restricted access and offers
  the local-running instructions alongside it.
- [Third-party notices](../THIRD_PARTY_NOTICES.md) and the
  [visual source-package notice](visual-export-context/README.md#third-party-source-attribution)
  credit the deposited source files, identify their license and archive members,
  and distinguish those terms from the project license.

## What public readers will see

Historical provenance retains original absolute file paths, including the
original operator's local username. These paths are not credentials and do not
make the files available remotely, but they identify the original machine's
directory layout. They were preserved because they are part of the recorded
experiment identities. Git author addresses use GitHub's `users.noreply.github.com`
domain. This review did not anonymize or rewrite history.

The [No Theo License](../LICENSE) remains intentional: this project is
source-available, not open source. Upstream material retains its own license.
Large raw research inputs and complete runtime archives are excluded from Git;
the [reproduction guide](reproducibility.md) describes what a clone contains.

The [status report](status-2026-09-14.md) continues to distinguish the released
60/80 landing result, development experiments, unresolved orbital and biological
questions, and unbuilt Fly Cube concepts. Public availability does not imply
completion of those research goals.

This was a release-hygiene and reproducibility review. The secret scan and
project checks do not establish the absence of every vulnerability, and this
review was not a comprehensive application penetration test or independent
validation of the scientific model.
