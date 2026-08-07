# OR-ISSUE-406 — Git ignore policy covered `.env` but not the broader local-secret filename family

- Corrective: `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`
- Product: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`, version `0.25.0-step023a`, schema 26
- Classification: source publication / credential hygiene
- Finding: root `.gitignore` ignored `.env` but not `.env.local`, `.env.development`, `.env.production.local`, private-key or certificate filename shapes even though historical acceptance scanners explicitly treat those files as protected.
- Correction: ignore `.env.*`, `*.pem`, `*.key`, `*.p12`, and `*.pfx`, while unignoring `**/.env.example` and `**/.env.*.example` templates.
- Product impact: none. Runtime Secret reference semantics remain unchanged.
- Recurrence rule: source-publication ignore rules and credential-scan filename policy must cover the same local-secret family; example templates require explicit allow rules.
