# ADR-0039 — Running Host attachment and Conversation execution

## Decision
CLI Conversation commands first inspect the profile Host. A READY Host is attached through the authenticated local WebSocket protocol. Only when no reachable Host exists may the CLI start an ephemeral Host.

The protocol owns a bounded `conversation.execute` operation that creates or continues a durable Conversation, waits for the new Run to become terminal, and returns the same bounded result shape used by first-run CLI execution.

## Ownership
- A CLI-created ephemeral Host is closed by the CLI.
- A pre-existing running Host is never stopped by `ask`, `conversation list`, or `conversation show`.
- Existing Conversation identity, workspace and model profile remain immutable during continuation.
- Prompt text remains stdin-only and API-key bytes remain in the configured secret provider.

## Rejected alternatives
- Starting a second Host and failing on the profile lock.
- Reading SQLite directly from the CLI while a Host is running.
- Polling internal database files for terminal status.
- Designing Connector abstractions before a real external adapter exists.
