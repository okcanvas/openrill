import { createApp, h, nextTick, ref } from "https://cdn.jsdelivr.net/npm/vue@3.5.40/dist/vue.runtime.esm-browser.prod.js";
import { applyNotice, createProjection, moveCardSelection, resolveApprovalLocally } from "../shared/workload.mjs";
import { viewDescriptor } from "../shared/dom-contract.mjs";

const fixture = await fetch("../shared/fixture.json", { cache: "no-store" }).then((response) => response.json());
const projection = ref(createProjection(fixture));

function cardNode(card, index) {
  const actions = (card.actions ?? []).map((decision) => h("button", {
    type: "button",
    onClick: () => { resolveApprovalLocally(projection.value, card.id, decision); projection.value = { ...projection.value }; },
  }, decision));
  return h("article", {
    class: "card",
    role: card.role,
    tabindex: card.tabIndex,
    "aria-label": card.ariaLabel,
    "data-card-kind": card.dataset.cardKind,
    onKeydown: async (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      moveCardSelection(projection.value, event.key === "ArrowDown" ? "next" : "previous");
      projection.value = { ...projection.value };
      await nextTick();
      document.querySelector('[tabindex="0"]')?.focus();
    },
  }, [h("h2", card.heading), h("p", card.body), actions.length ? h("div", { class: "actions" }, actions) : null]);
}

createApp({
  name: "OpenRillVueFinalist",
  setup() {
    for (const notice of fixture.notices) applyNotice(projection.value, notice);
    return () => {
      const descriptor = viewDescriptor(projection.value);
      return h("div", { class: "shell", "data-framework": "vue", "data-fixture-id": descriptor.fixtureId }, [
        h("header", { role: "banner", "aria-label": "OpenRill Control UI" }, [h("h1", descriptor.title)]),
        h("main", { role: "main", "aria-label": "Conversation" }, [
          h("div", { role: "status", "aria-label": "Connection status", class: "status" }, `cursor=${descriptor.cursor} run=${descriptor.runStatus}`),
          h("section", { role: "log", "aria-label": "Conversation transcript", class: "transcript" }, descriptor.cards.map(cardNode)),
        ]),
        h("footer", `Vue 3.5.40 · ${descriptor.cards.length} cards`),
      ]);
    };
  },
}).mount("#app");
