# OR-ISSUE-368 — Testbed claimed a stale Mattermost image as current ESR

The prior support package pinned `11.7.0` and described it as the current ESR without rechecking the current published artifacts.

Correction: the integrated Testbed pins the exact Docker tag `mattermost/mattermost-team-edition:11.7.7`, verified available in the official Docker Hub repository and present in Mattermost's version archive at the time of this correction. The source does not use `latest`.
