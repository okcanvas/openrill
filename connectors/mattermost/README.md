# @openrill/connector-mattermost

STEP022C real Mattermost connector vertical slice over the STEP022B durable Connector runtime.

Implemented boundary:

- one bot account per configured Extension instance;
- Bearer-token REST preflight through `GET /api/v4/users/me`;
- Mattermost WebSocket authentication challenge and reconnect loop;
- `posted` event persistence before processing;
- direct messages, channel mentions, and thread routing;
- durable Run output projection to Mattermost posts;
- REST post receipt capture;
- bounded response bodies, request deadlines, URL/path validation, and private-network opt-in;
- lifecycle abort, duplicate event suppression, and uncertain-delivery isolation inherited from `@openrill/connectors`.

Not included in this step: files, reactions, slash commands, multi-account policy, streaming drafts, marketplace installation, or additional channels.
