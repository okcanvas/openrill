# OR-ISSUE-340 — Fresh verification entered the extraction root before creating it

The first Fresh ZIP verification tool call set `/mnt/data/step022b_fresh` as its process workdir while the same command was supposed to create that directory. Process startup failed with `ENOENT` before any ZIP operation executed.

Fresh validation now uses two ordered invocations: create and extract from the existing source workdir, then run source gates from the established Fresh root.
