from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_PATTERNS = (
    "package.json",
    "apps/*/package.json",
    "services/*/package.json",
    "packages/*/package.json",
    "connectors/*/package.json",
    "skills/*/package.json",
)
DEPENDENCY_SECTIONS = ("dependencies", "devDependencies", "optionalDependencies")


def package_importer(path: Path, root: Path) -> str:
    parent = path.parent.relative_to(root).as_posix()
    return "." if parent == "." else parent


def expected_importers(root: Path) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    manifests: list[Path] = []
    for pattern in PACKAGE_PATTERNS:
        manifests.extend(root.glob(pattern))
    for manifest in sorted(set(manifests)):
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        dependencies: set[str] = set()
        for section in DEPENDENCY_SECTIONS:
            value = payload.get(section, {})
            if not isinstance(value, dict):
                raise ValueError(f"{manifest.relative_to(root).as_posix()}:{section} must be an object")
            dependencies.update(value)
        result[package_importer(manifest, root)] = dependencies
    return result


def parse_lock_importers(lock_text: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    active_importer: str | None = None
    active_section: str | None = None
    in_importers = False
    importer_re = re.compile(r"^  ([^ ].*):(?: \{\})?$")
    section_re = re.compile(r"^    (dependencies|devDependencies|optionalDependencies):(?: \{\})?$")
    dependency_re = re.compile(r"^      ([^ ].*):$")

    for line in lock_text.splitlines():
        if line == "importers:":
            in_importers = True
            continue
        if not in_importers:
            continue
        if line and not line.startswith(" "):
            break
        importer_match = importer_re.match(line)
        if importer_match:
            active_importer = importer_match.group(1).strip("'\"")
            result.setdefault(active_importer, set())
            active_section = None
            continue
        section_match = section_re.match(line)
        if section_match and active_importer is not None:
            active_section = section_match.group(1)
            continue
        dependency_match = dependency_re.match(line)
        if dependency_match and active_importer is not None and active_section in DEPENDENCY_SECTIONS:
            result[active_importer].add(dependency_match.group(1).strip("'\""))
            continue
        if line.startswith("    ") and not line.startswith("      "):
            active_section = None
    return result


def verify(root: Path) -> tuple[bool, str]:
    expected = expected_importers(root)
    lock_path = root / "pnpm-lock.yaml"
    actual = parse_lock_importers(lock_path.read_text(encoding="utf-8"))
    missing_importers = sorted(set(expected) - set(actual))
    extra_importers = sorted(set(actual) - set(expected))
    mismatches: list[str] = []
    for importer in sorted(set(expected) & set(actual)):
        missing = sorted(expected[importer] - actual[importer])
        extra = sorted(actual[importer] - expected[importer])
        if missing or extra:
            mismatches.append(
                f"{importer}:missing={','.join(missing) or '-'}:extra={','.join(extra) or '-'}"
            )
    dependency_count = sum(len(value) for value in expected.values())
    ok = not missing_importers and not extra_importers and not mismatches
    if ok:
        return True, (
            "OPENRILL_WORKSPACE_LOCK_ALIGNMENT_PASS "
            f"importers={len(expected)} dependencies={dependency_count}"
        )
    detail = [
        "OPENRILL_WORKSPACE_LOCK_ALIGNMENT_FAIL",
        f"expected_importers={len(expected)}",
        f"actual_importers={len(actual)}",
    ]
    if missing_importers:
        detail.append("missing_importers=" + ",".join(missing_importers))
    if extra_importers:
        detail.append("extra_importers=" + ",".join(extra_importers))
    if mismatches:
        detail.append("mismatches=" + ";".join(mismatches[:8]))
    return False, " ".join(detail)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify workspace manifests and pnpm lock importers are exact")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    ok, detail = verify(args.root.resolve())
    print(detail)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
