#!/usr/bin/env python3
"""Review exact npm Git snapshots against approvals from the base commit."""

import argparse
from dataclasses import dataclass, field
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from npm_evidence import (
    EvidenceError, MAX_FILE, MAX_MANIFEST, collect_evidence, is_registry_path,
    json_bytes, load_lock, read_limited, safe_relative, sha256, strict_json,
)


@dataclass
class Snapshot:
    commit: str
    project: str
    files: dict = field(default_factory=dict)
    absent: list = field(default_factory=list)

    def report(self):
        return {"commit": self.commit, "project": self.project,
                "files": self.files, "absent": sorted(self.absent)}


class GitObjects:
    def __init__(self, repository):
        self.repository = Path(repository).resolve(strict=True)
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update(GIT_NO_REPLACE_OBJECTS="1", GIT_NO_LAZY_FETCH="1", GIT_OPTIONAL_LOCKS="0",
                        GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        self.repository = Path(self.run("rev-parse", "--show-toplevel").decode().strip())
        self.trees = {}
        self.commit_trees = {}
        self.source_content = {}
        self.source_trees = {}

    def run(self, *args):
        result = subprocess.run(["git", "--no-lazy-fetch", "--no-replace-objects", "--literal-pathspecs", "-C", str(self.repository), *args],
                                env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise EvidenceError("Git object lookup failed: " + result.stderr.decode("utf-8", "replace").strip())
        if len(result.stdout) > MAX_FILE:
            raise EvidenceError("Git object output exceeds 64 MiB")
        return result.stdout

    def commit(self, ref):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,255}", ref):
            raise EvidenceError("revision must be a commit hash or ordinary Git ref without revision operators")
        oid = self.run("rev-parse", "--verify", "--end-of-options", ref).decode().strip()
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", oid):
            raise EvidenceError("Git returned an invalid object ID")
        if self.run("cat-file", "-t", oid).strip() != b"commit":
            raise EvidenceError("revision must identify a commit object")
        return oid

    def tree(self, oid):
        if oid not in self.trees:
            if int(self.run("cat-file", "-s", oid).strip()) > 16 * 1024 * 1024:
                raise EvidenceError("Git tree exceeds 16 MiB")
            entries = {}
            for entry in self.run("ls-tree", "-z", oid).split(b"\0"):
                if not entry:
                    continue
                metadata, raw_name = entry.split(b"\t", 1)
                try:
                    name = raw_name.decode("utf-8")
                except UnicodeError as exc:
                    raise EvidenceError("non-UTF-8 Git tree name is outside the source profile") from exc
                mode, kind, child = metadata.decode("ascii").split()
                entries[name] = (mode, kind, child)
            self.trees[oid] = entries
        return self.trees[oid]

    def commit_tree(self, oid):
        if oid not in self.commit_trees:
            if int(self.run("cat-file", "-s", oid).strip()) > MAX_FILE:
                raise EvidenceError("Git commit exceeds 64 MiB")
            header = self.run("cat-file", "commit", oid).split(b"\n", 1)[0]
            if not re.fullmatch(rb"tree (?:[0-9a-f]{40}|[0-9a-f]{64})", header):
                raise EvidenceError("invalid Git commit tree header")
            self.commit_trees[oid] = header[5:].decode("ascii")
        return self.commit_trees[oid]

    def entry(self, commit, path, optional=False):
        parts = portable_path(path).split("/")
        tree = self.commit_tree(commit)
        for position, part in enumerate(parts):
            entries = self.tree(tree)
            aliases = [name for name in entries if name.rstrip(". ").casefold() == part.casefold() and name != part]
            if aliases:
                raise EvidenceError(f"case or filesystem alias of Git path {path!r}")
            if part not in entries:
                if optional and position == len(parts) - 1:
                    return None
                raise EvidenceError(f"missing Git path {path!r}")
            mode, kind, child = entries[part]
            if position < len(parts) - 1:
                if mode != "040000" or kind != "tree":
                    raise EvidenceError(f"source parent is not a Git directory: {path!r}")
                tree = child
            else:
                if mode not in ("100644", "100755") or kind != "blob":
                    raise EvidenceError(f"source must be a regular Git blob; symlink and gitlink modes are unsupported: {path!r}")
                return mode, child

    def source_directory(self, commit, directory):
        tree = self.commit_tree(commit)
        if directory:
            for part in portable_path(directory).split("/"):
                mode, kind, tree = self.tree(tree).get(part, (None, None, None))
                if mode != "040000" or kind != "tree":
                    raise EvidenceError(f"source directory is not a Git tree: {directory!r}")
        if any(not name.isascii() for name in self.tree(tree)):
            raise EvidenceError(f"source directory has non-ASCII names outside the portable profile: {directory!r}")

    def blob(self, commit, path, limit=MAX_FILE, optional=False):
        entry = self.entry(commit, path, optional)
        if entry is None:
            return None
        mode, oid = entry
        size = int(self.run("cat-file", "-s", oid).strip())
        if size > limit:
            raise EvidenceError(f"Git blob exceeds {limit} bytes: {path!r}")
        data = self.run("cat-file", "blob", oid)
        if len(data) != size:
            raise EvidenceError("Git blob size changed during capture")
        return data, {"git_oid": oid, "mode": mode, "size": size, "sha256": sha256(data)}

    def source_tree(self, commit, excluded):
        """Bind every tracked regular file, including paths and executable modes."""
        key = (commit, tuple(sorted(excluded)))
        if key in self.source_trees:
            return self.source_trees[key]
        digest = hashlib.sha256(b"tau-gate-source-tree-v1\0")
        total = 0
        count = 0
        gitlinks = 0
        for record in self.run("ls-tree", "-r", "-l", "-z", commit).split(b"\0"):
            if not record:
                continue
            metadata, path = record.split(b"\t", 1)
            mode, kind, oid, declared_size = metadata.split()
            if path in excluded:
                continue
            if kind == b"commit" and mode == b"160000":
                size, content = len(oid), hashlib.sha256(oid).digest()
                gitlinks += 1
            elif kind == b"blob" and mode in (b"100644", b"100755"):
                if oid not in self.source_content:
                    object_id = oid.decode("ascii")
                    size = int(declared_size)
                    if size > MAX_FILE:
                        raise EvidenceError("source tree exceeds 64 MiB per file")
                    data = self.run("cat-file", "blob", object_id)
                    if len(data) != size:
                        raise EvidenceError("Git blob size changed during source-tree capture")
                    self.source_content[oid] = (size, hashlib.sha256(data).digest())
                size, content = self.source_content[oid]
                if total + size > 512 * 1024 * 1024:
                    raise EvidenceError("source tree exceeds 512 MiB total")
                total += size
                count += 1
            else:
                raise EvidenceError(f"source tree contains an unsupported symlink or Git mode: {path!r}")
            digest.update(len(path).to_bytes(8, "big"))
            digest.update(path)
            digest.update(mode)
            digest.update(size.to_bytes(8, "big"))
            digest.update(content)
        self.source_trees[key] = {"sha256": digest.hexdigest(), "files": count, "bytes": total,
                                  "gitlinks": gitlinks}
        return self.source_trees[key]

    def tracked_entries(self, commit, paths, prefixes):
        found = {}
        for record in self.run("ls-tree", "-r", "-z", commit).split(b"\0"):
            if not record:
                continue
            metadata, path = record.split(b"\t", 1)
            if path in paths or any(path.startswith(prefix) for prefix in prefixes):
                mode, kind, oid = metadata.split()
                found[path] = (mode, kind, oid)
        return found


def portable_path(value):
    safe_relative(value)
    for part in value.split("/"):
        if (not re.fullmatch(r"[A-Za-z0-9._@+-]+", part) or part.endswith(".")
                or re.fullmatch(r"(?:con|prn|aux|nul|com[1-9]|lpt[1-9])", part.split(".", 1)[0], re.IGNORECASE)):
            raise EvidenceError(f"nonportable source path {value!r}")
    return value


def join_project(project, path):
    return project + "/" + path if project else path


def capture(git, snapshot, output):
    project_output = output / "project"
    project_output.mkdir(parents=True)

    def copy(path, limit=MAX_FILE, optional=False):
        full_path = join_project(snapshot.project, path)
        blob = git.blob(snapshot.commit, full_path, limit, optional)
        if blob is None:
            snapshot.absent.append(full_path)
            return
        data, metadata = blob
        destination = project_output / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        snapshot.files[full_path] = metadata

    copy("package-lock.json")
    _, lock = load_lock(project_output / "package-lock.json")
    for path, record in sorted(lock["packages"].items()):
        if record.get("link", False) or is_registry_path(path):
            continue
        if path:
            portable_path(path)
        directory = join_project(snapshot.project, path) if path else snapshot.project
        git.source_directory(snapshot.commit, directory)
        prefix = path + "/" if path else ""
        copy(prefix + "package.json", MAX_MANIFEST)
        copy(prefix + "binding.gyp", optional=True)
    return project_output


def markdown_text(value):
    return html.escape(str(value), quote=False).replace("\n", " ").replace("\r", " ").replace("`", "&#96;")


def introducer(change):
    route = change.get("after_introducer_path") or change.get("before_introducer_path")
    return " -> ".join(map(str, route)) if isinstance(route, list) else "unreachable or unavailable"


def summary(report):
    lines = [f"# Tau-Gate PR review: {report['outcome']}", ""]
    for label in ("base", "head"):
        if report[label] is not None:
            lines.append(f"{label.capitalize()} commit `{report[label]['commit']}`.")
    if report["policy"] is not None:
        policy = report["policy"]
        lines.extend(["", f"Approvals come from base `{policy['commit']}` at `{markdown_text(policy['path'])}`."])
    source = report.get("source_approval")
    if source is not None:
        lines.extend(["", f"Trusted gate and source-tree approval: {source['status']}."])
        for label in ("base", "head"):
            if label in source:
                lines.append(f"{label.capitalize()} tracked-tree SHA-256 `{source[label]['sha256']}` ({source[label]['files']} files, {source[label]['bytes']} bytes, {source[label]['gitlinks']} gitlinks).")
        if source.get("changed_trusted_paths"):
            lines.append("Head changes trusted gate files: " + ", ".join(f"`{markdown_text(path)}`" for path in source["changed_trusted_paths"]) + ". Use a trusted administrative update.")
        if source.get("unapproved_head_digest"):
            lines.append(f"Unapproved source tree digest `{source['unapproved_head_digest']}`.")
    core = report.get("core") or {}
    changes = core.get("execution_evidence_changes", [])
    packages = core.get("package_changes", [])
    lines.extend(["", f"{len(packages)} package changes. {len(changes)} execution evidence changes."])
    for change in packages[:30]:
        before = change.get("before") or {}
        after = change.get("after") or {}
        coordinate = lambda item: str(item.get("name", "?")) + "@" + str(item.get("version", "?"))
        fields = change.get("changed_fields") or [change["change"]]
        text = f"- Package `{markdown_text(change['path'] or '<root>')}` changed {', '.join(fields)}. `{markdown_text(coordinate(before))}` to `{markdown_text(coordinate(after))}`. Introducer `{markdown_text(introducer(change))}`."
        for field in ("source", "integrity"):
            if field in fields:
                text += f" {field.capitalize()} `{markdown_text(before.get(field))}` to `{markdown_text(after.get(field))}`."
        lines.append(text)
    for change in changes[:30]:
        before = change.get("before") or {}
        after = change.get("after") or {}
        a = before.get("facts") or {}
        b = after.get("facts") or {}
        fields = [key for key in ("kind", "artifact_sha512", "manifest_sha256", "lifecycle", "binding_gyp_sha256", "implicit_node_gyp", "binary_entrypoints") if a.get(key) != b.get(key)]
        path = markdown_text(change["path"] or "<root>")
        lines.append(f"- Execution `{path}` changed {', '.join(fields) or 'qualification or fingerprint'}. Introducer `{markdown_text(introducer(change))}`.")
    if len(packages) > 30 or len(changes) > 30:
        lines.append("- Change lists show the first 30 entries each. Read `report.json` for every change.")
    policy = core.get("policy", {})
    for candidate in policy.get("unapproved_execution_candidates", []):
        lines.append(f"- Unapproved `{markdown_text(candidate['path'] or '<root>')}` fingerprint `{candidate['fingerprint']}`.")
    reasons = list(report["errors"])
    for label in ("base", "head"):
        snapshot = core.get(label, {})
        for issue in snapshot.get("issues", []):
            reasons.append({"stage": label, "message": issue})
        for evidence in snapshot.get("execution_evidence") or []:
            if evidence.get("state") != "qualified":
                reasons.append({"stage": label, "message": {"path": evidence.get("path"), "state": evidence.get("state"), "reason": evidence.get("reason")}})
    for issue in policy.get("issues", []):
        reasons.append({"stage": "policy", "message": issue})
    if "error" in core:
        reasons.append({"stage": "core", "message": core["error"]})
    if "review_input_issue" in policy:
        reasons.append({"stage": "policy", "message": policy["review_input_issue"]})
    if reasons:
        lines.extend(["", "Incomplete input reasons:"])
        for reason in reasons:
            text = reason["message"] if isinstance(reason["message"], str) else json.dumps(reason["message"], sort_keys=True)
            lines.append(f"- {reason['stage']}: {markdown_text(text)}")
    lines.extend(["", "Artifact integrity binds bytes to the lock. Source snapshots retain caller trust. This report does not prove scripts safe or predict host installation selection.", ""])
    return "\n".join(lines)


def prepare_output(path, repository, cache):
    path = Path(path).absolute()
    if path.is_symlink():
        raise EvidenceError("output directory must not be a symlink")
    resolved = path.resolve()
    protected = [repository]
    if cache is not None:
        protected.append(Path(cache).resolve())
    if any(resolved.is_relative_to(root) or root.is_relative_to(resolved) for root in protected):
        raise EvidenceError("output must be separate from the repository and archive cache")
    if resolved.exists() and (not resolved.is_dir() or any(resolved.iterdir())):
        raise EvidenceError("output directory must be new or empty")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def review(args):
    report = {"schema_version": 1, "outcome": "incomplete", "exit_code": 2,
              "base": None, "head": None, "policy": None, "source_approval": None, "core": None, "errors": []}
    output = None
    replacements = []
    stage = "inputs"
    snapshots = {}
    try:
        git = GitObjects(args.repo)
        output = prepare_output(args.output, git.repository, args.archive_cache)
        replacements = [(str(output), "<output>"), (str(git.repository), "<repo>")]
        if args.archive_cache is not None:
            replacements.append((str(args.archive_cache.resolve()), "<archive-cache>"))
        project = "" if args.project == "." else portable_path(args.project)
        approval_path = portable_path(args.approvals)
        source_approval_path = portable_path(args.source_approvals)
        if approval_path == source_approval_path:
            raise EvidenceError("approval paths must be distinct")
        binary = args.tau_gate.resolve(strict=True)
        report["trusted_tools"] = {
            "tau_gate_sha256": sha256(read_limited(binary)),
            "pr_review_sha256": sha256(read_limited(Path(__file__))),
            "npm_evidence_sha256": sha256(read_limited(Path(__file__).with_name("npm_evidence.py"))),
        }
        for label in ("base", "head"):
            stage = label + "_revision"
            snapshots[label] = Snapshot(git.commit(getattr(args, label)), project)
            report[label] = snapshots[label].report()
        for label, snapshot in snapshots.items():
            stage = label + "_capture"
            source = capture(git, snapshot, output / label)
            stage = label + "_evidence"
            collect_evidence(source / "package-lock.json", source, output / label / "evidence", args.archive_cache)
        stage = "base_policy"
        data, metadata = git.blob(snapshots["base"].commit, approval_path)
        (output / "base" / "approvals.json").write_bytes(data)
        report["policy"] = {"origin": "base", "commit": snapshots["base"].commit,
                            "path": approval_path, **metadata}
        stage = "core_review"
        command = [str(binary), "review", "--base", "base/project/package-lock.json",
                   "--head", "head/project/package-lock.json", "--base-manifest", "base/project/package.json",
                   "--head-manifest", "head/project/package.json", "--base-evidence", "base/evidence/index.json",
                   "--head-evidence", "head/evidence/index.json", "--approvals", "base/approvals.json", "--enforce", "--json"]
        result = subprocess.run(command, cwd=output, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if len(result.stdout) > MAX_FILE:
            raise EvidenceError("core report exceeds 64 MiB")
        core = strict_json(result.stdout)
        if not isinstance(core, dict):
            raise EvidenceError("core report must be a JSON object")
        report["core"] = core
        outcome = core.get("policy", {}).get("outcome", "incomplete")
        if outcome not in ("allowed", "blocked", "incomplete") or result.returncode != {"allowed": 0, "blocked": 1, "incomplete": 2}[outcome]:
            raise EvidenceError(f"core outcome or exit code is inconsistent: {result.returncode}")
        source_required = any(
            item.get("candidate") and (item.get("facts") or {}).get("kind") == "source_project"
            for label in ("base", "head")
            for item in core.get(label, {}).get("execution_evidence", []))
        excluded = {path.encode("utf-8") for path in (approval_path, source_approval_path)}
        protected_prefixes = (b"tools/", b".github/workflows/")
        stage = "policy_changes"
        base_entries = git.tracked_entries(snapshots["base"].commit, excluded, protected_prefixes)
        head_entries = git.tracked_entries(snapshots["head"].commit, excluded, protected_prefixes)
        changed_paths = sorted(path.decode("utf-8") for path in base_entries.keys() | head_entries.keys()
                               if base_entries.get(path) != head_entries.get(path))
        if source_required or changed_paths:
            source = {"status": "incomplete", "required": source_required,
                      "origin": "base", "commit": snapshots["base"].commit,
                      "path": source_approval_path, "excluded_paths": sorted((approval_path, source_approval_path)),
                      "changed_trusted_paths": changed_paths}
            report["source_approval"] = source
        if source_required:
            for label in ("base", "head"):
                stage = label + "_source_tree"
                source[label] = git.source_tree(snapshots[label].commit, excluded)
            stage = "source_policy"
            data, metadata = git.blob(snapshots["base"].commit, source_approval_path, MAX_MANIFEST)
            source["policy_sha256"] = metadata["sha256"]
            policy = strict_json(data)
            if (not isinstance(policy, dict) or set(policy) != {"schema_version", "digests"}
                    or type(policy["schema_version"]) is not int or policy["schema_version"] != 1
                    or not isinstance(policy["digests"], list)
                    or any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value)
                           for value in policy["digests"])
                    or len(set(policy["digests"])) != len(policy["digests"])):
                raise EvidenceError("source approval file must contain schema_version 1 and unique lowercase SHA-256 digests")
            source["matched"] = source["head"]["sha256"] in policy["digests"]
            if changed_paths or not source["matched"]:
                source["status"] = "blocked"
                if not source["matched"]:
                    source["unapproved_head_digest"] = source["head"]["sha256"]
                if outcome == "allowed":
                    outcome = "blocked"
            else:
                source["status"] = "allowed"
        elif changed_paths:
            source["status"] = "blocked"
            if outcome == "allowed":
                outcome = "blocked"
        report.update(outcome=outcome, exit_code={"allowed": 0, "blocked": 1, "incomplete": 2}[outcome])
    except (EvidenceError, OSError, ValueError) as exc:
        message = str(exc)
        for original, replacement in replacements:
            message = message.replace(original, replacement)
        report["errors"].append({"stage": stage, "message": message})
    for label, snapshot in snapshots.items():
        report[label] = snapshot.report()
    if output is not None:
        (output / "report.json").write_bytes(json_bytes(report))
        (output / "summary.md").write_text(summary(report), encoding="utf-8")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--project", default=".", help="portable repository-relative npm project directory")
    parser.add_argument("--approvals", default="tau-gate.approvals.json", help="repository-relative approval file read from base only")
    parser.add_argument("--source-approvals", default="tau-gate.source-approvals.json", help="repository-relative source-tree approval file read from base only")
    parser.add_argument("--tau-gate", type=Path, required=True, help="caller-trusted executable")
    parser.add_argument("--archive-cache", type=Path, help="offline SHA512-hex.tgz cache; omission permits constrained downloads")
    parser.add_argument("--output", type=Path, required=True, help="new or empty directory outside repository and cache")
    args = parser.parse_args(argv)
    report = review(args)
    print(json.dumps(report, sort_keys=True, ensure_ascii=False))
    return report["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
