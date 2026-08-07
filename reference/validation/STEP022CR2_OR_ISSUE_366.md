# OR-ISSUE-366 — Separate Testbed root required an invented OpenRill directory

The prior Testbed artifact was packaged as an independent root and required `-OpenRillRoot`. Operator reality was one working root: `D:\NODE_AGENTS\okcanvas-openrill`. The instruction therefore invented a directory instead of deriving the real root.

Correction: Testbed assets live under `testbeds/mattermost/`; the runner derives OpenRill root from its own location and accepts no external root argument.
