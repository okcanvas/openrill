from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GROUPS = ("apps", "services", "packages", "connectors", "skills")
RULES = json.loads((ROOT / "config/package-boundaries.json").read_text(encoding="utf-8"))["rules"]
UI_FRAMEWORK = json.loads((ROOT / "config/ui-framework.json").read_text(encoding="utf-8"))
UI_PACKAGES = set(RULES["uiPackages"])
UI_RUNTIME_PACKAGES = set(RULES["uiRuntimePackages"])
FORBIDDEN_PRODUCTS = tuple(RULES["forbiddenProductDependencies"])
IMPORT_PATTERNS = [
    re.compile(r'^\s*import\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["\']([^"\']+)["\']', re.MULTILINE),
    re.compile(r'^\s*export\s+[^;]*?\s+from\s+["\']([^"\']+)["\']', re.MULTILINE),
    re.compile(r'import\s*\(\s*["\']([^"\']+)["\']\s*\)'),
]


def package_dirs() -> list[Path]:
    result: list[Path] = []
    for group in GROUPS:
        base = ROOT / group
        if base.exists():
            result.extend(sorted(p for p in base.iterdir() if p.is_dir()))
    return result


def fail(message: str) -> None:
    raise SystemExit(f"OPENRILL_ARCHITECTURE_FAIL {message}")


def package_root(specifier: str) -> str:
    if specifier.startswith("@"):
        parts = specifier.split("/")
        return "/".join(parts[:2]) if len(parts) >= 2 else specifier
    return specifier.split("/", 1)[0]


def is_forbidden_product(specifier: str) -> bool:
    return any(specifier == token or specifier.startswith(token) for token in FORBIDDEN_PRODUCTS)


def is_ui_runtime(specifier: str) -> bool:
    return package_root(specifier) in UI_RUNTIME_PACKAGES


manifests: dict[str, tuple[Path, dict]] = {}
for directory in package_dirs():
    manifest_path = directory / "package.json"
    if not manifest_path.exists():
        fail(f"missing_package_json path={directory.relative_to(ROOT)}")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    for key in ("name", "version", "type", "exports", "engines"):
        if key not in data:
            fail(f"missing_manifest_field package={directory.relative_to(ROOT)} field={key}")
    name = data["name"]
    if name in manifests:
        fail(f"duplicate_package_name name={name}")
    manifests[name] = (directory, data)

workspace_names = set(manifests)
graph: dict[str, set[str]] = {name: set() for name in workspace_names}
for name, (directory, data) in manifests.items():
    dependencies: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        dependencies.update(data.get(key, {}))
    rel = directory.relative_to(ROOT).as_posix()
    for dep, specifier in dependencies.items():
        if dep.startswith("@openrill/"):
            if dep not in workspace_names:
                fail(f"unknown_workspace_dependency package={name} dependency={dep}")
            if specifier != "workspace:*":
                fail(f"workspace_dependency_not_pinned package={name} dependency={dep} specifier={specifier}")
            graph[name].add(dep)
        if is_forbidden_product(dep):
            fail(f"openclaw_product_dependency package={name} dependency={dep}")
        if rel.startswith("services/") and (dep in UI_PACKAGES or is_ui_runtime(dep)):
            fail(f"service_depends_on_ui package={name} dependency={dep}")

protocol_deps = graph.get("@openrill/protocol", set())
if protocol_deps:
    fail(f"protocol_not_leaf dependencies={sorted(protocol_deps)}")

for name, (directory, _) in manifests.items():
    rel = directory.relative_to(ROOT).as_posix()
    if rel.startswith("apps/"):
        for dep in graph[name]:
            dep_rel = manifests[dep][0].relative_to(ROOT).as_posix()
            if dep_rel.startswith("apps/"):
                fail(f"app_imports_app package={name} dependency={dep}")
    if rel.startswith("services/"):
        for dep in graph[name]:
            if dep in UI_PACKAGES:
                fail(f"service_imports_ui package={name} dependency={dep}")

visiting: set[str] = set()
visited: set[str] = set()


def visit(name: str, stack: list[str]) -> None:
    if name in visiting:
        start = stack.index(name)
        fail("workspace_cycle=" + "->".join(stack[start:] + [name]))
    if name in visited:
        return
    visiting.add(name)
    stack.append(name)
    for dep in sorted(graph[name]):
        visit(dep, stack)
    stack.pop()
    visiting.remove(name)
    visited.add(name)


for package_name in sorted(graph):
    visit(package_name, [])

source_files = 0
for name, (directory, _) in manifests.items():
    rel = directory.relative_to(ROOT).as_posix()
    for source in sorted((directory / "src").rglob("*")):
        if not source.is_file() or source.suffix not in {".ts", ".tsx", ".js", ".mjs"}:
            continue
        source_files += 1
        text = source.read_text(encoding="utf-8")
        specifiers = [match for pattern in IMPORT_PATTERNS for match in pattern.findall(text)]
        for specifier in specifiers:
            if is_forbidden_product(specifier):
                fail(f"openclaw_source_import path={source.relative_to(ROOT)} import={specifier}")
            if rel.startswith("apps/") and specifier.startswith("@openrill/"):
                target = manifests.get(specifier)
                if target and target[0].relative_to(ROOT).as_posix().startswith("apps/"):
                    fail(f"app_source_imports_app path={source.relative_to(ROOT)} import={specifier}")
            if rel.startswith("services/") and (specifier in UI_PACKAGES or is_ui_runtime(specifier)):
                fail(f"service_source_imports_ui path={source.relative_to(ROOT)} import={specifier}")

print(
    f"OPENRILL_ARCHITECTURE_PASS packages={len(manifests)} "
    f"edges={sum(map(len, graph.values()))} sources={source_files} ui_framework={UI_FRAMEWORK['selection']}"
)
