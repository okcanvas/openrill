# STEP006 Windows Default Text Decoding Failure

## Environment

- Windows
- Python `3.12`
- Node.js `24.18.0`
- pnpm `11.15.1`
- command: `pnpm acceptance:step006`

## Observed result

The acceptance runner stopped before running the STEP006 build, unit and live regression gates:

```text
UnicodeDecodeError: 'cp949' codec can't decode byte 0xed in position 73: illegal multibyte sequence
```

The failing call was:

```python
json.loads((ROOT / "reference/openclaw/EVIDENCE_INDEX.json").read_text())
```

## Verified file content

`EVIDENCE_INDEX.json` is valid UTF-8. Byte `0xed` at position 73 begins the Korean statement:

```text
패키지 이름은 openclaw이다.
```

The same file parses successfully with explicit UTF-8 and contains 104 evidence records.

## Code cause

`Path.read_text()` was called without `encoding`. Python therefore selected the Windows locale encoding cp949. The repository contract is UTF-8, so locale-based decoding was incorrect.

## Resolution

STEP006A makes all STEP006 repository text reads and report writes explicitly UTF-8 and adds an AST-based repository-wide gate that rejects implicit `Path.read_text`/`Path.write_text` calls in active Python scripts.
