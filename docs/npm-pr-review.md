# npm pull-request evidence gate

The draft `npm-pr-review.yml` follows [Tau-Gate's trusted Git-object PR review](https://github.com/steph4n-gh/tau-gate/blob/main/docs/pr-review.md).
The workflow runs on `pull_request_target` with a read-only token. It fetches
both commit objects, checks out only the base, and runs the base copy of
`tools/pr_review.py` and `tools/npm_evidence.py`. It never installs or executes
the fetched PR head. Its report and summary are kept as seven-day artifacts.

The helpers match Tau-Gate v4.2.1 at commit
`6c333b490747d79e51920a8d266bac22f0dcf777`:

- `tools/pr_review.py`: SHA256 `4faa71ba2db883a101fc8b7f416ffeb6723321f7f0a1cf02cd41e657fcff3ef9`
- `tools/npm_evidence.py`: SHA256 `d4f832c50baecd5fb37784a93a184c96aa61b0047e527da295571d904a2b2929`

For the checker, configure the trusted repository variables after these tools
and `tau-gate.approvals.json` reach `main`:

| Variable | Value |
| --- | --- |
| `TAU_GATE_ARCHIVE_URL` | `https://github.com/steph4n-gh/tau-gate/releases/download/v4.2.1/tau-gate-v4.2.1-linux-x86_64.tar.gz` |
| `TAU_GATE_ARCHIVE_SHA256` | `bb108bd1cb5e6d2f80849ab3e29ef5524ec1b7ea1e63417e15dd28b96ff2072e` |

The digest matches the release `SHA256SUMS`; the release attestation binds the
archive to the Tau-Gate release workflow and source commit above. The workflow
checks the digest before extracting the binary. Do not treat a checksum alone
as publisher authentication.

The current npm v3 lock has only Three.js. Original archive evidence for locked
Three.js 0.186.0 and the root manifest completed under Tau-Gate v4.2.1 with no
automatic install lifecycle candidate; the empty schema-2 approval file is
intentional. Later lifecycle candidates require separately reviewed fingerprints
in the **base** approval file. Root or workspace lifecycle candidates also
require a base source-tree approval file.

This draft does not establish an enforced check. After the trusted base and
variables are in place, verify that the repository Actions policy permits this
`pull_request_target` workflow. Test a normal PR and negative controls for a
missing lock and a head-side approval edit. Only then make `tau-gate` required,
with up-to-date checks, through a separately approved branch rule. Gate-file
changes intentionally fail the gate against the old base and need trusted
administrative review. An allowed evidence report is a bounded change review,
not a claim that a package is safe.
