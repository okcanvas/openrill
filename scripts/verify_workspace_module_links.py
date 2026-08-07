from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_PATTERNS = (
    "apps/*/package.json",
    "services/*/package.json",
    "packages/*/package.json",
    "connectors/*/package.json",
    "skills/*/package.json",
)
DEPENDENCY_GROUPS = ("dependencies", "devDependencies", "optionalDependencies")


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def module_path(base: Path, package_name: str) -> Path:
    parts = package_name.split("/")
    return base / "node_modules" / Path(*parts)


def workspace_packages(root: Path) -> tuple[dict[str, Path], list[tuple[Path, dict[str, object]]]]:
    manifests: list[Path] = [root / "package.json"]
    for pattern in WORKSPACE_PATTERNS:
        manifests.extend(root.glob(pattern))
    packages: dict[str, Path] = {}
    loaded: list[tuple[Path, dict[str, object]]] = []
    for manifest in sorted(set(manifests)):
        if not manifest.is_file():
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        name = data.get("name")
        if isinstance(name, str) and name:
            packages[name] = manifest.parent.resolve()
        loaded.append((manifest.parent.resolve(), data))
    return packages, loaded


def visible_candidates(importer: Path, root: Path, package_name: str) -> list[Path]:
    candidates: list[Path] = []
    current = importer
    while True:
        candidates.append(module_path(current, package_name))
        if current == root:
            break
        if not is_within(current, root):
            break
        parent = current.parent
        if parent == current:
            break
        current = parent
    return candidates


def resolve_visible_link(importer: Path, root: Path, package_name: str) -> tuple[Path | None, str | None]:
    for candidate in visible_candidates(importer, root, package_name):
        if not candidate.exists() and not candidate.is_symlink():
            continue
        try:
            return candidate.resolve(strict=True), candidate.relative_to(root).as_posix()
        except OSError as error:
            return None, f"{candidate.relative_to(root).as_posix()}:unresolved:{type(error).__name__}"
    return None, None


def verify(root: Path) -> tuple[bool, str]:
    root = root.resolve()
    packages, manifests = workspace_packages(root)
    failures: list[str] = []
    edge_count = 0

    for importer, data in manifests:
        importer_name = str(data.get("name") or importer.relative_to(root).as_posix())
        dependencies: dict[str, object] = {}
        for group in DEPENDENCY_GROUPS:
            group_value = data.get(group, {})
            if isinstance(group_value, dict):
                dependencies.update(group_value)
        for dependency in sorted(name for name in dependencies if name in packages):
            edge_count += 1
            target, location = resolve_visible_link(importer, root, dependency)
            label = f"{importer_name}->{dependency}"
            if target is None:
                failures.append(f"{label}:missing" if location is None else f"{label}:{location}")
                continue
            expected = packages[dependency]
            if not is_within(target, root):
                failures.append(f"{label}:outside_root")
            elif target != expected:
                failures.append(f"{label}:wrong_target")

    scope_dirs: set[Path] = set()
    for importer, _ in manifests:
        scope = importer / "node_modules" / "@openrill"
        if scope.is_dir():
            scope_dirs.add(scope)
    root_scope = root / "node_modules" / "@openrill"
    if root_scope.is_dir():
        scope_dirs.add(root_scope)

    materialized = 0
    for scope in sorted(scope_dirs):
        for entry in sorted(scope.iterdir(), key=lambda item: item.name):
            materialized += 1
            package_name = f"@openrill/{entry.name}"
            try:
                target = entry.resolve(strict=True)
            except OSError as error:
                failures.append(f"{scope.relative_to(root).as_posix()}/{entry.name}:unresolved:{type(error).__name__}")
                continue
            if not is_within(target, root):
                failures.append(f"{package_name}:outside_root")
                continue
            expected = packages.get(package_name)
            if expected is not None and target != expected:
                failures.append(f"{package_name}:wrong_target")

    if edge_count == 0:
        failures.append("workspace_edges:zero")
    if failures:
        return False, (
            "OPENRILL_WORKSPACE_MODULE_LINKS_FAIL "
            f"edges={edge_count} scopes={len(scope_dirs)} materialized={materialized} "
            f"failures={','.join(failures[:8])}"
        )
    root_scope_state = "present" if root_scope.is_dir() else "absent"
    return True, (
        "OPENRILL_WORKSPACE_MODULE_LINKS_PASS "
        f"edges={edge_count} scopes={len(scope_dirs)} materialized={materialized} "
        f"root_scope={root_scope_state} root_owned=true"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify every declared @openrill workspace dependency resolves to the current source root"
    )
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    ok, detail = verify(args.root)
    print(detail)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
