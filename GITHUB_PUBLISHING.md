# GitHub Publishing Guide

```text
CORRECTIVE=STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE
PRODUCT_STEP=STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE
PRODUCT_VERSION=0.25.0-step023a
STATE_SCHEMA=26
PRODUCT_RUNTIME_MODIFICATIONS=0
GITHUB_READY=YES_WITH_VISIBILITY_DECISION
DEFAULT_VISIBILITY=PRIVATE_UNTIL_OPENRILL_LICENSE_IS_SELECTED
LFS_REQUIRED=NO
```

## Why this corrective exists

The STEP023A source package is already a complete repository candidate, but Git transport adds two boundaries that the ZIP package did not own:

1. root `*.cmd` files have an executable CRLF byte contract and must survive clone/checkout independent of a contributor's local `core.autocrlf` setting;
2. local secret/config files must not become tracked simply because their name is `.env.local`, `.env.development`, or a key/certificate filename.

`/.gitattributes` now preserves repository bytes by default and owns CRLF checkout only for the four root CMD entrypoints. `/.gitignore` now blocks `.env`, `.env.*`, private-key/certificate shapes and runtime state while explicitly retaining `**/.env.example` templates.

## Current publication audit

- Source files in the uploaded STEP023A tree before this corrective: 1,883 including `PACKAGE_MANIFEST.json`.
- Largest file before this corrective: `PACKAGE_MANIFEST.json`, 337,755 bytes.
- No source file requires Git LFS.
- No `.git` history is packaged.
- No real `OPENAI_API_KEY`, GitHub token, AWS access key or private-key block was found by the publication scan. Test literals such as `sk-flow-*`, `private-token`, `actual-secret-value`, and the localhost Mattermost passwords are synthetic/fixture values used by validation.
- `testbeds/mattermost/.env.example` contains intentionally local-only example credentials and remains tracked as an example file.

## License boundary

There is currently **no root `LICENSE` file that licenses OpenRill itself**. `NOTICE.md` records that the referenced OpenClaw source declares MIT; that statement does not automatically license OpenRill.

Therefore:

- a private GitHub repository can be created immediately;
- a public repository can technically be published without adding a license, but it must not be described as open-source licensed;
- if the intent is public reuse/contribution, choose the OpenRill license explicitly and add a root `LICENSE` before calling the project open source.

No license is guessed or inserted by this corrective.

## Recommended first push

Create a **new empty GitHub repository**. Do not pre-create a README, `.gitignore`, or license on GitHub because this source already owns those files and an unrelated initial commit would force an unnecessary merge.

From the extracted OpenRill root:

```powershell
git init
git branch -M main

git add --all
git status --short

git check-attr eol -- start-and-run-step022c-live.cmd
git ls-files --eol start-and-run-step022c-live.cmd

git commit -m "STEP023AR1 GitHub publishing baseline"
git remote add origin https://github.com/<OWNER>/<REPOSITORY>.git
git push -u origin main
```

Expected line-ending contract after `git add --all`:

```text
start-and-run-step022c-live.cmd: eol: crlf
```

The exact `git ls-files --eol` prefix can differ by platform/index normalization, but the worktree side must report `w/crlf` for root CMD files.

Before committing a machine that has local credentials, also verify:

```powershell
git status --ignored --short
git check-ignore -v --no-index .env.local
git check-ignore -v --no-index testbeds/mattermost/.env
```

Both local environment paths must be ignored. `testbeds/mattermost/.env.example` must remain addable/tracked.

## Validate a Fresh clone before promotion

A source ZIP and a Git clone intentionally do not contain `node_modules`. Before running the full STEP023A aggregate on a Fresh clone, materialize the pinned dependency graph first:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm acceptance:step023a
```

On the actual Windows promotion machine, the stronger gate remains:

```powershell
pnpm acceptance:step023a:live
```

Do not classify `workspace-module-links` as a Product failure when it is run before the frozen install; that verifier is specifically checking links created by dependency materialization.

## Optional GitHub CLI path

After the local commit exists, GitHub CLI can create and push the repository in one command. Choose visibility intentionally:

```powershell
gh repo create openrill --private --source=. --remote=origin --push
```

For a public repository, replace `--private` with `--public` only after making the license decision described above.

## Do not upload the source tree through the browser

The repository contains far more than a small manual file batch. Use Git/CLI so the complete tree, executable scripts, line-ending attributes and future history are transported as one repository rather than as repeated browser uploads.

## Release artifact strategy

The repository should contain source files, tests, documentation and deterministic package scripts. Generated STEP ZIPs should normally be attached to a GitHub Release rather than committed into the repository. The existing `.gitignore`/packaging boundaries already exclude generated runtime/build directories.

## Continuation

Read in this order when continuing from the GitHub-ready ZIP:

1. `HANDOFF.md`
2. `GITHUB_PUBLISHING.md`
3. `reference/validation/STEP023AR1_GITHUB_PUBLISHING_READINESS_AUDIT.md`
4. `reference/validation/STEP023AR1_OR_ISSUE_405.md` through `STEP023AR1_OR_ISSUE_410.md`
5. `docs/plans/STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE.md`
6. `reference/validation/STEP023A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`

STEP023A Product runtime semantics, schema 26, accepted Product baseline, and the deferred Mattermost live state are unchanged by this publishing corrective.
