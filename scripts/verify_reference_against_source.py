from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = ROOT / "reference/openclaw/EVIDENCE_INDEX.json"
DEFAULT_REPORT = ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify recorded OpenClaw evidence against a separately extracted source tree."
    )
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--source-zip", type=Path)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_root = args.source_root.resolve()
    evidence = json.loads(args.index.read_text(encoding="utf-8"))
    results: list[dict[str, object]] = []

    for item in evidence:
        path = source_root / item["path"]
        path_exists = path.is_file()
        actual_excerpt = ""
        line_matches = False
        needle_matches = False
        if path_exists:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            line_number = int(item["line"])
            if 1 <= line_number <= len(lines):
                raw = lines[line_number - 1]
                actual_excerpt = raw.strip()
                expected_excerpt = str(item["excerpt"]).strip()
                line_matches = actual_excerpt == expected_excerpt
                needle_matches = item["needle"] in raw
        verified = path_exists and line_matches and needle_matches
        results.append(
            {
                "id": item["id"],
                "path": item["path"],
                "line": item["line"],
                "expectedExcerpt": item["excerpt"],
                "actualExcerpt": actual_excerpt,
                "pathExists": path_exists,
                "lineMatches": line_matches,
                "needleMatches": needle_matches,
                "verified": verified,
            }
        )

    source_sha = None
    if args.source_zip:
        source_sha = hashlib.sha256(args.source_zip.read_bytes()).hexdigest()

    report = {
        "sourceRoot": f"<external>/{source_root.name}",
        "sourceArchive": args.source_zip.name if args.source_zip else None,
        "sourceSha256": source_sha,
        "evidenceCount": len(results),
        "verifiedCount": sum(bool(item["verified"]) for item in results),
        "allVerified": all(bool(item["verified"]) for item in results),
        "results": results,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        "REFERENCE_EVIDENCE_VERIFICATION "
        f"verified={report['verifiedCount']}/{report['evidenceCount']} "
        f"state={'PASSED' if report['allVerified'] else 'FAILED'}"
    )
    return 0 if report["allVerified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
