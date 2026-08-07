const CLOSED_KINDS = new Set(["text", "tool", "approval", "artifact", "unknown"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProjection(fixture) {
  return {
    fixtureId: fixture.fixtureId,
    cursor: fixture.initialCursor,
    resyncRequired: false,
    conversation: clone(fixture.snapshot.conversation),
    run: clone(fixture.snapshot.run),
    cards: clone(fixture.snapshot.cards),
    selectedCardIndex: -1,
  };
}

function appendTextCard(state, payload) {
  const last = state.cards.at(-1);
  if (last?.kind === "text" && last.runId === payload.runId) {
    last.text += payload.text;
    return;
  }
  state.cards.push({ kind: "text", runId: payload.runId, text: payload.text });
}

function eventCard(payload) {
  switch (payload.eventType) {
    case "model.text.delta":
      return null;
    case "tool.started":
      return {
        kind: "tool",
        id: payload.toolCallId,
        title: payload.toolName,
        status: "RUNNING",
      };
    case "artifact.created":
      return {
        kind: "artifact",
        id: payload.artifactId,
        title: payload.label,
        status: payload.kind,
      };
    default:
      return {
        kind: "unknown",
        id: `${payload.runId}:${payload.eventType}`,
        title: payload.eventType,
        status: "UNRECOGNIZED",
        raw: clone(payload),
      };
  }
}

export function applyNotice(state, notice) {
  if (notice.sequence <= state.cursor) return { outcome: "DUPLICATE", state };
  if (notice.sequence !== state.cursor + 1) {
    state.resyncRequired = true;
    return { outcome: "GAP", expected: state.cursor + 1, received: notice.sequence, state };
  }

  const payload = notice.payload ?? {};
  if (notice.notice === "conversation.updated") {
    state.conversation = { ...state.conversation, ...clone(payload) };
  } else if (notice.notice === "run.updated") {
    state.run = { ...state.run, ...clone(payload) };
  } else if (notice.notice === "approval.updated") {
    state.cards.push({
      kind: "approval",
      id: payload.requestId,
      title: payload.summary ?? "Approval required",
      status: payload.status,
      actions: payload.status === "PENDING" ? ["allow_once", "allow_for_conversation", "deny"] : [],
    });
  } else if (notice.notice === "run.event") {
    if (payload.eventType === "model.text.delta") appendTextCard(state, payload);
    else state.cards.push(eventCard(payload));
  } else {
    state.cards.push({
      kind: "unknown",
      id: `notice:${notice.sequence}`,
      title: notice.notice,
      status: "UNRECOGNIZED",
      raw: clone(notice),
    });
  }

  state.cursor = notice.sequence;
  state.resyncRequired = false;
  return { outcome: "APPLIED", state };
}

export function applySnapshot(state, fixture, cursor = fixture.initialCursor) {
  const fresh = createProjection(fixture);
  state.fixtureId = fresh.fixtureId;
  state.cursor = cursor;
  state.resyncRequired = false;
  state.conversation = fresh.conversation;
  state.run = fresh.run;
  state.cards = fresh.cards;
  state.selectedCardIndex = -1;
  return state;
}

export function replayFixture(fixture) {
  const state = createProjection(fixture);
  const outcomes = fixture.notices.map((notice) => applyNotice(state, notice).outcome);
  return { state, outcomes };
}

export function reconnectPlan(state) {
  return {
    cursor: state.cursor,
    strategy: state.resyncRequired ? "SNAPSHOT_RESYNC" : "CURSOR_RESUME",
  };
}

export function createLongTranscript(count = 10000) {
  if (!Number.isInteger(count) || count < 1 || count > 100000) throw new Error("invalid transcript count");
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${String(index + 1).padStart(6, "0")}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text: `Transcript row ${index + 1}`,
  }));
}

export function virtualWindow(items, input) {
  const rowHeight = Math.max(1, Math.floor(input.rowHeight));
  const viewportHeight = Math.max(rowHeight, Math.floor(input.viewportHeight));
  const overscan = Math.max(0, Math.floor(input.overscan));
  const scrollTop = Math.max(0, Math.floor(input.scrollTop));
  const visibleStart = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(items.length, visibleStart + visibleCount + overscan);
  return {
    total: items.length,
    totalHeight: items.length * rowHeight,
    start,
    end,
    offsetTop: start * rowHeight,
    items: items.slice(start, end),
  };
}

export function moveCardSelection(state, direction) {
  if (!state.cards.length) {
    state.selectedCardIndex = -1;
    return -1;
  }
  const delta = direction === "next" ? 1 : direction === "previous" ? -1 : 0;
  if (delta === 0) throw new Error("invalid navigation direction");
  const current = state.selectedCardIndex < 0 ? (delta > 0 ? -1 : 0) : state.selectedCardIndex;
  state.selectedCardIndex = (current + delta + state.cards.length) % state.cards.length;
  return state.selectedCardIndex;
}

export function validateProjection(state) {
  if (!Number.isSafeInteger(state.cursor) || state.cursor < 0) throw new Error("invalid projection cursor");
  if (!Array.isArray(state.cards)) throw new Error("cards must be an array");
  for (const card of state.cards) {
    if (!CLOSED_KINDS.has(card.kind)) throw new Error(`invalid card kind: ${card.kind}`);
  }
  return true;
}

export function resolveApprovalLocally(state, requestId, decision) {
  const card = state.cards.find((item) => item.kind === "approval" && item.id === requestId);
  if (!card) throw new Error("approval card not found");
  if (card.status !== "PENDING") throw new Error("approval is not pending");
  if (!new Set(["allow_once", "allow_for_conversation", "deny"]).has(decision)) throw new Error("invalid approval decision");
  card.status = decision === "deny" ? "DENIED" : "APPROVED";
  card.decision = decision;
  card.actions = [];
  return card;
}
