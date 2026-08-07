# OR-ISSUE-349 — Extension-controlled status and doctor objects could expose arbitrary fields

## Observed problem

Passing adapter diagnostics through directly allowed a Connector to add base URLs, tokens, exception details, or other undeclared fields.

## Correction

ConnectorAdapterRegistry reconstructs a closed public status and doctor result field by field and rejects invalid values.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
