# OR-ISSUE-219 — Memory Tool Fixture Used Nonexistent Provenance

The first focused memory-tool test passed synthetic `conversation-1` and `run-1` provenance into `memory.remember`. State foreign keys correctly rejected the write. This was a Harness fixture defect, not a Product defect.

Correction: create a real durable Conversation and Run through `ConversationService`, then execute the tool with those identifiers. The test now proves both FK fail-closed behavior and valid provenance persistence.
