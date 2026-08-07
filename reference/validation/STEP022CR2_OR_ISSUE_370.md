# OR-ISSUE-370 — New Testbed regression test assumed caller cwd was the repository root

The first integrated regression run passed Product/Testbed behavior tests but four file-inspection assertions resolved `/testbeds/...` and `/start-and-run...` because the test used `resolve()` against an arbitrary caller cwd.

Correction: the test derives repository root from `import.meta.url`. The regression is executed from an external cwd to prove it is location-independent.
