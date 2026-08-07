# Mattermost Testbed External Source Verification

Verified on 2026-08-07 before packaging STEP022CR2.

## Official Mattermost deployment documentation

- https://docs.mattermost.com/deployment-guide/server/containers/install-docker.html
- The official documentation states Docker deployment is supported on Linux for production and Windows/macOS Docker is for testing/development.
- Official supported image family: `mattermost/mattermost-team-edition`.

## Official Mattermost release archive

- https://docs.mattermost.com/product-overview/version-archive.html
- Mattermost Team Edition `11.7.7` is present in the published version archive.

## Official Docker Hub repository

- https://hub.docker.com/r/mattermost/mattermost-team-edition/tags
- Exact tag `11.7.7` was visible and published by `matterbuild` when checked.
- The Testbed pins this exact tag and never uses `latest`.

## First-user bootstrap contract

- https://docs.mattermost.com/end-user-guide/collaborate/learn-about-roles.html
- Mattermost documents that the first user added to a newly installed system receives the System Admin role. The Testbed deliberately creates/logs in the admin user before the second user and then creates the team/channel through authenticated REST.

## Scope

This evidence validates the external bootstrap assumptions only. It is not STEP022C Live evidence. Real Windows Docker + REST + WebSocket execution remains required before Product promotion.
