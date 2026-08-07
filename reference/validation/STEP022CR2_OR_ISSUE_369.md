# OR-ISSUE-369 — Product ZIP alone was not sufficient to execute the required real Live gate

STEP022C documentation required a real Mattermost environment, but the generated local Testbed was delivered as a separate ZIP. A continuation using only the Product ZIP therefore lacked the bootstrap asset required by the next acceptance action.

Correction: the full source ZIP contains the Testbed, root wrappers, operations documentation, regression tests, and the original STEP022C Live harness together.
