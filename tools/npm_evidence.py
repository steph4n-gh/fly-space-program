#!/usr/bin/env python3
"""Acquire exact npm v3 artifacts, or independently validate a locator bundle."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tarfile
import urllib.parse
import urllib.request
import zlib


MAX_FILE = 64 * 1024 * 1024
MAX_MANIFEST = 1024 * 1024
MAX_NPM_RECORDS = 10_000
MAX_NPM_REFERENCES = 50_000
ROOT_EVENTS = ("preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare")
DEPENDENCY_EVENTS = ("preinstall", "install", "postinstall")


class EvidenceError(ValueError):
    pass


class WorkBudget:
    def __init__(self, read=2 * 1024 ** 3, expanded=4 * 1024 ** 3, headers=250_000):
        self.read_remaining = read
        self.expanded_remaining = expanded
        self.headers_remaining = headers
        self.exhausted = None

    def charge(self, field, count, reason):
        if self.exhausted is not None:
            raise EvidenceError(self.exhausted)
        if count > getattr(self, field):
            self.exhausted = reason
            setattr(self, field, 0)
            raise EvidenceError(reason)
        setattr(self, field, getattr(self, field) - count)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode()


def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise EvidenceError(f"duplicate JSON key {key!r}")
            result[key] = value
        return result

    try:
        return json.loads(data, object_pairs_hook=pairs, parse_constant=lambda value: (_ for _ in ()).throw(EvidenceError(f"invalid JSON constant {value}")))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise EvidenceError(f"invalid JSON: {exc}") from exc


def read_limited(path, limit=MAX_FILE, *, budget=None):
    path = Path(path)
    if budget is not None and budget.exhausted is not None:
        raise EvidenceError(budget.exhausted)
    bound = min(limit, budget.read_remaining) if budget is not None else limit
    try:
        with path.open("rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise EvidenceError(f"not a regular file: {path}")
            data = stream.read(bound + 1)
    except OSError as exc:
        raise EvidenceError(f"cannot read {path}: {exc}") from exc
    if budget is not None:
        budget.charge("read_remaining", len(data), "snapshot evidence reads exceed 2 GiB")
    if len(data) > limit:
        raise EvidenceError(f"file exceeds {limit} bytes: {path}")
    return data


def safe_relative(value, allow_empty=False):
    if not isinstance(value, str) or (not value and not allow_empty):
        raise EvidenceError("path must be a nonempty string")
    if not value and allow_empty:
        return PurePosixPath(".")
    if "\\" in value or any(ord(c) < 32 for c in value):
        raise EvidenceError(f"unsafe path {value!r}")
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts) or value.startswith("/"):
        raise EvidenceError(f"unsafe path {value!r}")
    return PurePosixPath(value)


def confined_file(root, relative):
    relative = safe_relative(relative)
    root = Path(root).resolve()
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise EvidenceError(f"symlink in input path: {current}")
    if not current.resolve().is_relative_to(root):
        raise EvidenceError("path escapes input directory")
    return current


def sri_digest(integrity):
    if not isinstance(integrity, str) or not re.fullmatch(r"sha512-[A-Za-z0-9+/]{86}==", integrity):
        raise EvidenceError("requires one canonical SHA512 SRI token")
    try:
        digest = base64.b64decode(integrity[7:], validate=True)
    except ValueError as exc:
        raise EvidenceError("invalid SHA512 SRI base64") from exc
    if len(digest) != 64 or base64.b64encode(digest).decode() != integrity[7:]:
        raise EvidenceError("invalid SHA512 SRI digest")
    return digest


def archive_source(url):
    if not isinstance(url, str) or any(ord(c) <= 32 or ord(c) >= 127 for c in url) or any(c in url for c in "\\%?#"):
        raise EvidenceError("unsupported artifact source; requires a plain HTTP(S) archive URL")
    if not url.startswith(("http://", "https://")):
        raise EvidenceError("unsupported artifact source; requires a plain HTTP(S) archive URL")
    try:
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise EvidenceError("unsupported artifact source; invalid archive URL") from exc
    authority = parsed.netloc
    host = parsed.hostname
    if not host or not re.fullmatch(r"[A-Za-z0-9.-]+(?::[0-9]+)?", authority) or port == 0 or any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?", label) for label in host.split(".")):
        raise EvidenceError("unsupported artifact source; invalid archive host")
    git_hosts = ("github.com", "gist.github.com", "gitlab.com", "bitbucket.org", "git.sr.ht")
    if any(host == git_host or host.endswith("." + git_host) for git_host in git_hosts) or not parsed.path.endswith((".tgz", ".tar.gz")):
        raise EvidenceError("unsupported artifact source; Git and directory sources are outside the archive profile")
    if not re.fullmatch(r"/[A-Za-z0-9/._@+-]+", parsed.path) or any(part in ("", ".", "..") for part in parsed.path[1:].split("/")):
        raise EvidenceError("unsupported artifact source; invalid archive path")
    return parsed


def tar_text(field):
    text, _, tail = field.partition(b"\0")
    if any(tail):
        raise EvidenceError("ambiguous tar text field")
    try:
        return text.decode("utf-8")
    except UnicodeError as exc:
        raise EvidenceError("non-UTF8 tar path") from exc


def archive_facts(archive, integrity, *, budget=None):
    if budget is not None and budget.exhausted is not None:
        raise EvidenceError(budget.exhausted)
    if len(archive) > MAX_FILE:
        raise EvidenceError("archive exceeds compressed limit")
    if hashlib.sha512(archive).digest() != sri_digest(integrity):
        raise EvidenceError("archive SHA512 SRI mismatch")
    try:
        decoder = zlib.decompressobj(31)
        tar_data = decoder.decompress(archive, MAX_FILE + 1)
        if budget is not None:
            budget.charge("expanded_remaining", len(tar_data), "snapshot expanded evidence exceeds 4 GiB")
        if len(tar_data) > MAX_FILE or decoder.unconsumed_tail:
            raise EvidenceError("archive exceeds decompressed limit")
        if not decoder.eof or decoder.unused_data:
            raise EvidenceError("truncated gzip, multiple members, or trailing bytes")
    except zlib.error as exc:
        if budget is not None:
            budget.charge("expanded_remaining", MAX_FILE + 1, "snapshot expanded evidence exceeds 4 GiB")
        raise EvidenceError(f"invalid gzip: {exc}") from exc
    except (OSError, EOFError) as exc:
        raise EvidenceError(f"invalid gzip: {exc}") from exc
    offset = 0
    seen = {}
    entry_count = 0
    root_name = None
    manifest_bytes = None
    binding_hash = None
    while offset + 512 <= len(tar_data):
        header = tar_data[offset:offset + 512]
        if not any(header):
            if len(tar_data) - offset < 1024 or any(tar_data[offset:]):
                raise EvidenceError("invalid tar terminator")
            break
        if entry_count == 10_000:
            raise EvidenceError("tar exceeds 10000 entries")
        entry_count += 1
        if budget is not None:
            budget.charge("headers_remaining", 1, "snapshot tar processing exceeds 250000 headers")
        if header[257:265] != b"ustar\0" + b"00":
            raise EvidenceError("unsupported tar format; requires ustar")
        if any(header[157:257]) or any(header[500:]):
            raise EvidenceError("unsupported tar link or reserved metadata")
        for start, width in ((100, 8), (108, 8), (116, 8), (124, 12), (136, 12), (148, 8), (329, 8), (337, 8)):
            numeric = header[start:start + width].strip(b" \0")
            if any(byte < ord("0") or byte > ord("7") for byte in numeric):
                raise EvidenceError("unsupported tar numeric encoding; requires octal")
        try:
            info = tarfile.TarInfo.frombuf(header, "utf-8", "strict")
        except (tarfile.TarError, UnicodeError) as exc:
            raise EvidenceError(f"invalid tar header: {exc}") from exc
        if info is None or info.type not in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE):
            raise EvidenceError("unsupported tar entry type")
        if info.devmajor or info.devminor:
            raise EvidenceError("tar regular entry has device metadata")
        prefix_field = header[345:500]
        try:
            prefix = tar_text(prefix_field)
        except EvidenceError:
            if (any(header[345:476])
                    or not all(re.fullmatch(rb"[0-7]{11}\0", field)
                               for field in (header[476:488], header[488:500]))):
                raise
            prefix = ""
        raw_name = tar_text(header[:100])
        joined = f"{prefix}/{raw_name}" if prefix else raw_name
        name = joined.removesuffix("/") if info.isdir() else joined
        raw_parts = name.split("/")
        dot_alias = len(raw_parts) >= 3 and raw_parts[1] == "."
        if dot_alias:
            if raw_parts.count(".") != 1:
                raise EvidenceError("unsupported dot tar path")
            name = "/".join((raw_parts[0], *raw_parts[2:]))
        safe_relative(name)
        parts = name.split("/")
        if any(part.endswith((".", " ")) or any(not (32 <= ord(char) <= 126) or char in '\\:*?"<>|' for char in part)
               or re.fullmatch(r"(?:con|prn|aux|nul|com[1-9]|lpt[1-9])", part.split(".", 1)[0], re.IGNORECASE)
               for part in parts):
            raise EvidenceError("nonportable tar path")
        member_root = parts[0]
        if root_name is not None and member_root != root_name:
            raise EvidenceError("tar contains inconsistent archive roots")
        root_name = member_root
        relative = "/".join(parts[1:])
        if not relative and not info.isdir():
            raise EvidenceError("tar root is not a directory")
        canonical = name.lower()
        if relative.lower() in ("package.json", "binding.gyp") and relative not in ("package.json", "binding.gyp"):
            raise EvidenceError("noncanonical lifecycle input path")
        if info.isdir() and relative in ("package.json", "binding.gyp"):
            raise EvidenceError("evidence path is not a regular tar file")
        if dot_alias and (info.isdir() or relative in ("package.json", "binding.gyp")):
            raise EvidenceError("dot aliases of directories or lifecycle evidence are unsupported")
        if any(seen.get("/".join(parts[:n]).lower(), {}).get("kind") == "file" for n in range(1, len(parts))) or (not info.isdir() and any(path.startswith(canonical + "/") for path in seen)):
            raise EvidenceError("tar file and parent path conflict")
        if info.size < 0 or info.size > MAX_FILE or (info.isdir() and info.size) or offset + 512 + info.size > len(tar_data):
            raise EvidenceError("invalid tar size")
        start = offset + 512
        end = start + info.size
        padded_end = start + ((info.size + 511) // 512) * 512
        if padded_end > len(tar_data) or any(tar_data[end:padded_end]):
            raise EvidenceError("invalid tar padding")
        previous = seen.get(canonical)
        if previous is not None:
            if (previous["name"] != name or previous["kind"] != "file" or info.isdir()
                    or previous["paired"] or previous["dot_alias"] == dot_alias):
                raise EvidenceError("duplicate tar path or excessive entry count")
            if (previous["before"] != header[100:148] or previous["after"] != header[156:512]
                    or tar_data[previous["start"]:previous["end"]] != tar_data[start:end]):
                raise EvidenceError("conflicting dot-alias tar path")
            previous["paired"] = True
        else:
            seen[canonical] = {"name": name, "kind": "directory" if info.isdir() else "file",
                               "start": start, "end": end, "before": header[100:148], "after": header[156:512],
                               "dot_alias": dot_alias, "paired": False}
        if relative == "package.json":
            if info.size > MAX_MANIFEST:
                raise EvidenceError("invalid archived package.json")
            manifest_bytes = tar_data[start:end]
        elif relative == "binding.gyp":
            binding_hash = sha256(tar_data[start:end])
        offset = padded_end
    else:
        raise EvidenceError("missing tar terminator")
    if any(item["dot_alias"] and not item["paired"] for item in seen.values()):
        raise EvidenceError("unpaired dot-alias tar path")
    if manifest_bytes is None:
        raise EvidenceError("tar is missing package.json")
    manifest = strict_json(manifest_bytes)
    if not isinstance(manifest, dict):
        raise EvidenceError("manifest must be an object")
    return manifest_bytes, manifest, binding_hash is not None, binding_hash


def manifest_facts(data, binding_gyp, source_project=False, binding_hash=None):
    manifest = strict_json(data)
    if not isinstance(manifest, dict):
        raise EvidenceError("manifest must be an object")
    scripts = manifest.get("scripts", {})
    if not isinstance(scripts, dict) or any(not isinstance(v, str) for v in scripts.values()):
        raise EvidenceError("invalid scripts map")
    events = ROOT_EVENTS if source_project == "root" else DEPENDENCY_EVENTS + (("prepare",) if source_project == "workspace" else ())
    lifecycle = {event: sha256(scripts[event].encode()) for event in events if event in scripts}
    return {"name": manifest.get("name"), "version": manifest.get("version"), "manifest_sha256": sha256(data), "lifecycle": lifecycle, "binding_gyp": binding_gyp, "binding_gyp_sha256": binding_hash, "gypfile_false": manifest.get("gypfile") is False, "implicit_node_gyp": binding_gyp and manifest.get("gypfile") is not False and not any(scripts.get(event) for event in ("preinstall", "install"))}


def load_lock(lock_path):
    data = read_limited(lock_path)
    lock = strict_json(data)
    if not isinstance(lock, dict) or lock.get("lockfileVersion") != 3 or not isinstance(lock.get("packages"), dict):
        raise EvidenceError("requires an npm v3 packages lockfile")
    if len(lock["packages"]) > MAX_NPM_RECORDS:
        raise EvidenceError("npm snapshot exceeds 10000 package records")
    references = 0
    for path, record in lock["packages"].items():
        safe_relative(path, allow_empty=True)
        if not isinstance(record, dict):
            raise EvidenceError("invalid lock package record")
        for flag in ("link", "hasInstallScript"):
            if flag in record and type(record[flag]) is not bool:
                raise EvidenceError(f"lock {flag} must be a boolean")
        for kind in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            if kind in record:
                if not isinstance(record[kind], dict):
                    raise EvidenceError("invalid dependency map")
                references += len(record[kind])
                if references > MAX_NPM_REFERENCES:
                    raise EvidenceError("npm snapshot exceeds 50000 dependency references")
    if "" not in lock["packages"]:
        raise EvidenceError("missing root lock record")
    return data, lock


def is_registry_path(path):
    return path.startswith("node_modules/") or "/node_modules/" in path


def expected_name(path, record):
    if isinstance(record.get("name"), str):
        return record["name"]
    return path.rsplit("node_modules/", 1)[-1]


def check_identity(path, record, manifest):
    if not isinstance(manifest, dict):
        raise EvidenceError("manifest must be an object")
    expected = record.get("name") if not is_registry_path(path) else expected_name(path, record)
    if expected is not None and manifest.get("name") != expected:
        raise EvidenceError(f"manifest name does not match lock instance {path!r}")
    if manifest.get("version") != record.get("version"):
        raise EvidenceError(f"manifest version does not match lock instance {path!r}")
    if not is_registry_path(path):
        for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            if manifest.get(key, {}) != record.get(key, {}):
                raise EvidenceError(f"project manifest {key} does not match lock instance {path!r}")


def validate_bundle(lock_path, index_path, root_manifest=None):
    lock_bytes, lock = load_lock(lock_path)
    index = strict_json(read_limited(index_path))
    if not isinstance(index, dict) or set(index) != {"schema_version", "lock_sha256", "packages"} or type(index.get("schema_version")) is not int or index["schema_version"] != 1:
        raise EvidenceError("unsupported locator index schema")
    if index["lock_sha256"] != sha256(lock_bytes):
        raise EvidenceError("index lock hash mismatch")
    if not isinstance(index["packages"], list):
        raise EvidenceError("packages index must be an array")
    if len(index["packages"]) > MAX_NPM_RECORDS:
        raise EvidenceError("locator index exceeds 10000 package records")
    expected = {path: record for path, record in lock["packages"].items() if not record.get("link", False)}
    seen = set()
    results = []
    budget = WorkBudget()
    for item in index["packages"]:
        if not isinstance(item, dict) or set(item) not in ({"path", "artifact"}, {"path", "project_manifest"}):
            raise EvidenceError("locator entry requires path and one supported evidence source")
        path = item["path"]
        if not isinstance(path, str) or path in seen or path not in expected:
            raise EvidenceError("duplicate or unknown index instance")
        seen.add(path)
        record = expected[path]
        if "artifact" in item:
            if not is_registry_path(path):
                raise EvidenceError("project instance cannot use registry artifact evidence")
            archive_source(record.get("resolved"))
            archive = read_limited(confined_file(Path(index_path).parent, item["artifact"]), budget=budget)
            data, manifest, binding_gyp, binding_hash = archive_facts(archive, record.get("integrity"), budget=budget)
            facts = manifest_facts(data, binding_gyp, binding_hash=binding_hash)
            facts.update({"kind": "artifact", "artifact_sha256": sha256(archive), "artifact_sha512": hashlib.sha512(archive).hexdigest(), "source": record.get("resolved"), "integrity": record.get("integrity")})
            expected_marker = facts["implicit_node_gyp"] or any(manifest.get("scripts", {}).get(event) for event in DEPENDENCY_EVENTS)
            facts["locked_install_marker"] = record.get("hasInstallScript")
            facts["marker_conflict"] = record.get("hasInstallScript") is False and bool(expected_marker)
        else:
            if is_registry_path(path):
                raise EvidenceError("supplied manifest cannot establish registry artifact binding")
            source_path = confined_file(Path(index_path).parent, item["project_manifest"])
            data = read_limited(source_path, MAX_MANIFEST, budget=budget)
            if path == "" and root_manifest is not None and data != read_limited(root_manifest, MAX_MANIFEST, budget=budget):
                raise EvidenceError("index root manifest differs from supplied root input")
            binding_path = source_path.parent / "binding.gyp"
            if binding_path.is_symlink():
                raise EvidenceError("symlink binding.gyp source")
            binding_gyp = binding_path.exists()
            binding_hash = sha256(read_limited(binding_path, budget=budget)) if binding_gyp else None
            manifest = strict_json(data)
            facts = manifest_facts(data, binding_gyp, "root" if path == "" else "workspace", binding_hash)
            facts["kind"] = "source_project"
        check_identity(path, record, manifest)
        facts["path"] = path
        results.append(facts)
    if seen != set(expected):
        raise EvidenceError(f"missing evidence instances: {sorted(set(expected) - seen)}")
    return sorted(results, key=lambda item: item["path"])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise EvidenceError("artifact redirects are unsupported; use an offline cache")


def fetch_archive(url, allow_loopback=False, *, budget=None):
    if budget is not None and budget.exhausted is not None:
        raise EvidenceError(budget.exhausted)
    parsed = archive_source(url)
    if parsed.username is not None or parsed.password is not None or parsed.fragment or not parsed.hostname:
        raise EvidenceError("credentials, fragments, or missing host in artifact URL")
    loopback = parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and allow_loopback
    try:
        port = parsed.port
    except ValueError as exc:
        raise EvidenceError("invalid artifact URL port") from exc
    if not loopback and (parsed.scheme != "https" or parsed.hostname != "registry.npmjs.org" or port not in (None, 443)):
        raise EvidenceError("download requires HTTPS registry.npmjs.org on port 443; supply custom-registry archives through the offline cache")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(urllib.request.Request(url, headers={"User-Agent": "tau-gate-evidence/1", "Accept-Encoding": "identity"}), timeout=30) as response:
            if response.status != 200:
                raise EvidenceError("artifact response must have status 200")
            bound = min(MAX_FILE, budget.read_remaining) if budget is not None else MAX_FILE
            data = response.read(bound + 1)
    except (OSError, ValueError) as exc:
        raise EvidenceError(f"artifact acquisition failed: {exc}") from exc
    if budget is not None:
        budget.charge("read_remaining", len(data), "snapshot evidence reads exceed 2 GiB")
    if len(data) > MAX_FILE:
        raise EvidenceError("artifact response exceeds compressed limit")
    return data


def collect_evidence(lock_path, project_dir, output_dir, archive_cache=None, *, allow_loopback=False):
    """Copy source inputs and original archives. No package manager is invoked."""
    lock_bytes, lock = load_lock(lock_path)
    output = Path(output_dir)
    if output.exists() and any(output.iterdir()):
        raise EvidenceError("evidence output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    archives = set()
    budget = WorkBudget()
    for path, record in sorted(lock["packages"].items()):
        if record.get("link", False):
            continue
        if is_registry_path(path):
            archive_source(record.get("resolved"))
            digest = sri_digest(record.get("integrity"))
            cache_name = digest.hex() + ".tgz"
            if archive_cache is not None:
                archive = read_limited(confined_file(archive_cache, cache_name), budget=budget)
            else:
                archive = fetch_archive(record.get("resolved"), allow_loopback=allow_loopback, budget=budget)
            data, manifest, _, _ = archive_facts(archive, record.get("integrity"), budget=budget)
            check_identity(path, record, manifest)
            relative = "artifacts/" + sha256(archive) + ".tgz"
            if relative not in archives:
                destination = output / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive)
                archives.add(relative)
            entries.append({"path": path, "artifact": relative})
        else:
            relative_source = (path + "/" if path else "") + "package.json"
            source = confined_file(project_dir, relative_source)
            data = read_limited(source, MAX_MANIFEST, budget=budget)
            check_identity(path, record, strict_json(data))
            relative = "projects/" + (path + "/" if path else "") + "package.json"
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            binding = source.parent / "binding.gyp"
            if binding.is_symlink():
                raise EvidenceError("symlink binding.gyp source")
            if binding.exists():
                (destination.parent / "binding.gyp").write_bytes(read_limited(binding, budget=budget))
            entries.append({"path": path, "project_manifest": relative})
    index_path = output / "index.json"
    index_path.write_bytes(json_bytes({"schema_version": 1, "lock_sha256": sha256(lock_bytes), "packages": entries}))
    validate_bundle(lock_path, index_path, confined_file(project_dir, "package.json"))
    return index_path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    collect = commands.add_parser("collect", help="explicitly acquire locked archives and copy source manifests")
    collect.add_argument("--lock", type=Path, required=True)
    collect.add_argument("--project", type=Path, required=True, help="trusted source snapshot root")
    collect.add_argument("--output", type=Path, required=True, help="empty output directory")
    collect.add_argument("--archive-cache", type=Path, help="offline directory of SHA512-hex.tgz files")
    validate = commands.add_parser("validate", help="independently validate an existing bundle without network access")
    validate.add_argument("--lock", type=Path, required=True)
    validate.add_argument("--index", type=Path, required=True)
    validate.add_argument("--manifest", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "collect":
            index = collect_evidence(args.lock, args.project, args.output, args.archive_cache)
            print(json.dumps({"status": "collected", "index": str(index)}))
        else:
            print(json.dumps({"status": "validated", "packages": validate_bundle(args.lock, args.index, args.manifest)}, sort_keys=True))
        return 0
    except (EvidenceError, OSError) as exc:
        print(json.dumps({"status": "incomplete", "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
