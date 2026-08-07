# OR-ISSUE-157 — Immutable release archive inside source root invalidated exact manifest

## Actual Windows symptom

`package-manifest-initial` and `package-manifest-final` both failed with one extra path:

```text
openrill-step013cr2-sqlite-null-prototype-live-assertion-alignment-v1.zip
```

## Code-confirmed cause

The package manifest intentionally inventories every source-root file except the fixed runtime/build exclusions. A prior immutable release ZIP was copied into the source root after the candidate manifest was generated. Ignoring arbitrary ZIPs would weaken exact package identity and could hide untracked source bundles.

## Correction

STEP014DR1 adds `check_source_root_boundary.py` before manifest verification. It rejects root-level `openrill-step*.zip` and checksum companions with the actionable instruction `move_archives_outside_source_root`. It does not delete, relocate, or exclude user files automatically.

## Recurrence gate

Unit fixtures prove a clean root passes, a release ZIP fails, and unrelated source files are not rejected. Package generation and verification retain exact file accounting with no ZIP exemption.
