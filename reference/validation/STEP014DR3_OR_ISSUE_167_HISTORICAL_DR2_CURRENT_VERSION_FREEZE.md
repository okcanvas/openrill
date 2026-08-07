# OR-ISSUE-167 — Historical STEP014DR2 current-version freeze

A retained DR2 boundary test correctly preserved DR2 entrypoints but also required the mutable root package to remain `0.14.5-step014dr2`. The correction preserves the immutable DR2 plan/version and scripts while current exact identity remains owned by the active release verifier and acceptance.
