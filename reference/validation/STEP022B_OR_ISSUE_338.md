# OR-ISSUE-338 — Historical STEP022A governance reclaimed current source ownership

The STEP022A governance suite still asserted root version 0.22.0, exact Extension SDK dependencies, and STEP022A current headers in every root document. STEP022B adds the Connector dependency and owns current source identity.

STEP022A now validates its immutable marker contract, package script, design evidence, local acceptance evidence and the absence of direct durable-state authority. STEP022B alone validates current package and root identities.
