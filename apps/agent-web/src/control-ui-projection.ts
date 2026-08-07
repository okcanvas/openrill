export interface ControlUiFixtureSnapshot {
  readonly conversation: Readonly<Record<string, unknown>>;
  readonly run: Readonly<Record<string, unknown>>;
  readonly cards: readonly ControlUiCard[];
}

export interface ControlUiFixture {
  readonly fixtureId: string;
  readonly initialCursor: number;
  readonly snapshot: ControlUiFixtureSnapshot;
}

export interface ControlUiNotice {
  readonly sequence: number;
  readonly notice: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export type ControlUiCardKind = "text" | "tool" | "approval" | "artifact" | "unknown";

export interface ControlUiCard {
  readonly kind: ControlUiCardKind;
  readonly id?: string;
  readonly runId?: string;
  readonly title?: string;
  readonly text?: string;
  readonly status?: string;
  readonly actions?: readonly string[];
  readonly raw?: unknown;
}

export interface ControlUiProjection {
  fixtureId: string;
  cursor: number;
  resyncRequired: boolean;
  conversation: Record<string, unknown>;
  run: Record<string, unknown>;
  cards: ControlUiCard[];
  selectedCardIndex: number;
}

export type ControlUiNoticeOutcome =
  | { readonly outcome: "APPLIED"; readonly state: ControlUiProjection }
  | { readonly outcome: "DUPLICATE"; readonly state: ControlUiProjection }
  | { readonly outcome: "GAP"; readonly expected: number; readonly received: number; readonly state: ControlUiProjection };

function cloneProjectionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneProjectionValue(item));
  if (value !== null && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Readonly<Record<string, unknown>>)) {
      clone[key] = cloneProjectionValue(item);
    }
    return clone;
  }
  return value;
}

function cloneRecord(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return cloneProjectionValue(value) as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

export function createControlUiProjection(fixture: ControlUiFixture): ControlUiProjection {
  return {
    fixtureId: fixture.fixtureId,
    cursor: fixture.initialCursor,
    resyncRequired: false,
    conversation: cloneRecord(fixture.snapshot.conversation),
    run: cloneRecord(fixture.snapshot.run),
    cards: cloneProjectionValue(fixture.snapshot.cards) as ControlUiCard[],
    selectedCardIndex: -1,
  };
}

function appendText(state: ControlUiProjection, payload: Readonly<Record<string, unknown>>): void {
  const text = requiredString(payload.text, "");
  const runId = optionalString(payload.runId);
  const last = state.cards.at(-1);
  if (last?.kind === "text" && last.runId === runId) {
    state.cards[state.cards.length - 1] = { ...last, text: `${last.text ?? ""}${text}` };
    return;
  }
  state.cards.push({ kind: "text", ...(runId ? { runId } : {}), text });
}

function eventCard(payload: Readonly<Record<string, unknown>>): ControlUiCard {
  const eventType = requiredString(payload.type, requiredString(payload.eventType, "unknown.event"));
  const data = payload.data !== null && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Readonly<Record<string, unknown>>
    : payload;
  if (eventType === "tool.started" || eventType === "tool.completed") {
    return {
      kind: "tool",
      id: requiredString(data.toolCallId, "unknown-tool-call"),
      title: requiredString(data.toolName, "unknown-tool"),
      status: eventType === "tool.completed" ? (data.isError === true ? "FAILED" : "COMPLETED") : "RUNNING",
    };
  }
  if (eventType === "artifact.created") {
    return {
      kind: "artifact",
      id: requiredString(data.artifactId, "unknown-artifact"),
      title: requiredString(data.label, "Artifact"),
      status: requiredString(data.kind, "UNKNOWN"),
    };
  }
  if (eventType === "approval.requested") {
    return {
      kind: "approval",
      id: requiredString(data.requestId, "unknown-approval"),
      ...(optionalString(payload.runId) ? { runId: optionalString(payload.runId)! } : {}),
      title: requiredString(data.summary, "Approval required"),
      status: requiredString(data.status, "PENDING"),
      actions: ["allow_once", "allow_for_conversation", "deny"],
    };
  }
  return {
    kind: "unknown",
    id: `${requiredString(payload.runId, "unknown-run")}:${eventType}`,
    title: eventType,
    status: "UNRECOGNIZED",
    raw: cloneProjectionValue(payload),
  };
}

export function applyControlUiNotice(state: ControlUiProjection, notice: ControlUiNotice): ControlUiNoticeOutcome {
  if (notice.sequence <= state.cursor) return { outcome: "DUPLICATE", state };
  if (notice.sequence !== state.cursor + 1) {
    state.resyncRequired = true;
    return { outcome: "GAP", expected: state.cursor + 1, received: notice.sequence, state };
  }

  const payload = notice.payload ?? {};
  if (notice.notice === "conversation.updated") {
    state.conversation = { ...state.conversation, ...cloneRecord(payload) };
  } else if (notice.notice === "run.updated") {
    state.run = { ...state.run, ...cloneRecord(payload) };
  } else if (notice.notice === "approval.updated") {
    const status = requiredString(payload.status, "UNKNOWN");
    state.cards.push({
      kind: "approval",
      id: requiredString(payload.requestId, "unknown-approval"),
      title: requiredString(payload.summary, "Approval required"),
      status,
      actions: status === "PENDING" ? ["allow_once", "allow_for_conversation", "deny"] : [],
    });
  } else if (notice.notice === "artifact.created") {
    state.cards.push({
      kind: "artifact",
      id: requiredString(payload.artifactId, "unknown-artifact"),
      ...(optionalString(payload.runId) ? { runId: optionalString(payload.runId)! } : {}),
      title: requiredString(payload.relativePath, requiredString(payload.operation, "Artifact")),
      status: requiredString(payload.kind, "UNKNOWN"),
    });
  } else if (notice.notice === "run.event") {
    const data = payload.data !== null && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? payload.data as Readonly<Record<string, unknown>>
      : payload;
    const eventType = requiredString(payload.type, requiredString(payload.eventType, "unknown.event"));
    if (eventType === "model.text_delta" || eventType === "model.text.delta") {
      appendText(state, { runId: payload.runId, text: data.delta ?? data.text });
    } else state.cards.push(eventCard(payload));
  } else {
    state.cards.push({
      kind: "unknown",
      id: `notice:${notice.sequence}`,
      title: notice.notice,
      status: "UNRECOGNIZED",
      raw: cloneProjectionValue(notice),
    });
  }
  state.cursor = notice.sequence;
  state.resyncRequired = false;
  return { outcome: "APPLIED", state };
}

export function applyControlUiSnapshot(state: ControlUiProjection, fixture: ControlUiFixture, cursor = fixture.initialCursor): ControlUiProjection {
  const replacement = createControlUiProjection(fixture);
  state.fixtureId = replacement.fixtureId;
  state.cursor = cursor;
  state.resyncRequired = false;
  state.conversation = replacement.conversation;
  state.run = replacement.run;
  state.cards = replacement.cards;
  state.selectedCardIndex = -1;
  return state;
}

export function getControlUiReconnectPlan(state: ControlUiProjection): { readonly cursor: number; readonly strategy: "CURSOR_RESUME" | "SNAPSHOT_RESYNC" } {
  return { cursor: state.cursor, strategy: state.resyncRequired ? "SNAPSHOT_RESYNC" : "CURSOR_RESUME" };
}

export function moveControlUiCardSelection(state: ControlUiProjection, direction: "next" | "previous"): number {
  if (state.cards.length === 0) {
    state.selectedCardIndex = -1;
    return -1;
  }
  const delta = direction === "next" ? 1 : -1;
  const current = state.selectedCardIndex < 0 ? (delta > 0 ? -1 : 0) : state.selectedCardIndex;
  state.selectedCardIndex = (current + delta + state.cards.length) % state.cards.length;
  return state.selectedCardIndex;
}
