export const REQUIRED_LANDMARKS = Object.freeze([
  { role: "banner", name: "OpenRill Control UI" },
  { role: "main", name: "Conversation" },
  { role: "log", name: "Conversation transcript" },
  { role: "status", name: "Connection status" },
]);

export function cardDescriptor(card, selected = false) {
  const base = {
    tag: "article",
    role: "listitem",
    tabIndex: selected ? 0 : -1,
    ariaLabel: `${card.kind}: ${card.title ?? card.text ?? card.id ?? "item"}`,
    dataset: { cardKind: card.kind },
  };
  if (card.kind === "text") return { ...base, heading: "Assistant", body: card.text };
  if (card.kind === "approval") return { ...base, heading: "Approval", body: card.title, actions: card.actions ?? [] };
  if (card.kind === "artifact") return { ...base, heading: "Artifact", body: card.title, link: `artifact:${card.id}` };
  if (card.kind === "tool") return { ...base, heading: "Tool", body: card.title, status: card.status };
  return { ...base, heading: "Unsupported event", body: card.title, status: card.status };
}

export function viewDescriptor(state) {
  return {
    fixtureId: state.fixtureId,
    cursor: state.cursor,
    resyncRequired: state.resyncRequired,
    title: state.conversation.title,
    runStatus: state.run.status,
    cards: state.cards.map((card, index) => cardDescriptor(card, index === state.selectedCardIndex)),
    landmarks: REQUIRED_LANDMARKS,
  };
}

export function assertAccessibleDescriptor(descriptor) {
  const roles = new Set(descriptor.landmarks.map((item) => item.role));
  for (const required of ["banner", "main", "log", "status"]) {
    if (!roles.has(required)) throw new Error(`missing landmark: ${required}`);
  }
  for (const card of descriptor.cards) {
    if (!card.ariaLabel || card.tabIndex < -1 || card.tabIndex > 0) throw new Error("invalid card accessibility contract");
  }
  return true;
}
