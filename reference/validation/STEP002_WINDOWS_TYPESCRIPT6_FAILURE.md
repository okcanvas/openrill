# STEP002 Windows TypeScript 6 Build Failure Evidence

## Environment

- Windows
- Node.js `24.18.0`
- pnpm `11.15.1`
- OpenRill `0.2.0-step002`
- TypeScript `6.0.3`

## Command

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step002
```

## Observed boundary

The lockfile installation passed. The STEP002 live child-process Host test passed. The TypeScript build failed before acceptance closure because Node ambient declarations were not included.

Representative diagnostics:

```text
Cannot find name 'process'
Cannot find namespace 'NodeJS'
Cannot find name 'setImmediate'
Cannot find name 'node:fs/promises'
Cannot find name 'node:path'
Cannot find name 'node:http'
Cannot find name 'node:crypto'
```

## Source correlation

- root `package.json` already declared `@types/node@22.20.1`
- `tsconfig.base.json` had no `types`
- `tsconfig.node.json` had no `types`
- TypeScript was `6.0.3`
- Node-sensitive packages inherited `tsconfig.node.json`

## Conclusion

The failure was a compiler environment declaration defect, not a Host lifecycle runtime defect. STEP002A makes ambient type boundaries explicit and retains STEP002 behavior unchanged.
