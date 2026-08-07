# Post-Acceptance Closure Governance

1. An externally executed ZIP and SHA remain immutable evidence, regardless of whether the full
   aggregate passed or failed.
2. Successful Product evidence inside a failed aggregate is retained when the failing dimension
   is independently owned and directly identified.
3. Product Core, Required Integration, Optional UI, Harness, and Package status are promoted
   independently.
4. Known failures remain visible in the accepted-baseline record and handoff; they are never
   rewritten as PASS.
5. The next STEP starts from the exact source artifact and merges closure state into a new
   versioned source tree.
6. A documentation-only mutation of the evidence ZIP is never represented as the externally
   executed artifact.

## Current accepted Product authority

```text
step=STEP014_PRODUCT_CORE_ACCEPTED
artifact=openrill-step014dr8-vue-runtime-materialization-browser-bootstrap-evidence-closure-v1.zip
sha256=484c231d4998d9dc58c298624671cf7a084348567ab2779c5a4bce6f04f05054
windows_aggregate=357/358
product_core=ACCEPTED
optional_ui=KNOWN_ISSUE_OR_ISSUE_190
harness=KNOWN_ISSUE_OR_ISSUE_191
```
