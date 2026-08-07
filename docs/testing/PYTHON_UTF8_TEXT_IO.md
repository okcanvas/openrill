# Python UTF-8 Text IO

OpenRill source, documentation, configuration examples and validation evidence are UTF-8.

## Required

```python
text = path.read_text(encoding="utf-8")
path.write_text(text, encoding="utf-8")
```

JSON parsing must first read UTF-8 text explicitly:

```python
payload = json.loads(path.read_text(encoding="utf-8"))
```

## Binary and child-process boundaries

Use `read_bytes`/`write_bytes` for binary content. Child-process diagnostics use `scripts/subprocess_utf8.py`, which captures bytes and decodes UTF-8 with replacement so a malformed diagnostic cannot crash the acceptance runner.

Replacement decoding is not permitted when parsing repository source or contracts because corruption must fail closed.

## Enforcement

`STEP006A_WINDOWS_UTF8_TEXT_IO` parses active `scripts/*.py` files with Python AST and rejects any `Path.read_text` or `Path.write_text` call without an explicit `encoding` keyword.
