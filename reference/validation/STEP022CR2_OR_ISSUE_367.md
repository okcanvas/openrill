# OR-ISSUE-367 — PowerShell-only launch syntax was given to a CMD prompt

The operator prompt was `D:\...>` (CMD), but the launch guidance used PowerShell backtick continuation. CMD split the following `-OpenRillRoot` line into a separate command.

Correction: the root package provides `start-and-run-step022c-live.cmd` as a native CMD entrypoint and a separate zero-argument PowerShell wrapper.
