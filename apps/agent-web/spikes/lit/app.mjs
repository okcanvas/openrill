import { LitElement, html } from "https://cdn.jsdelivr.net/gh/lit/dist@v3.3.3/core/lit-core.min.js";
import { applyNotice, createProjection, moveCardSelection, resolveApprovalLocally } from "../shared/workload.mjs";
import { viewDescriptor } from "../shared/dom-contract.mjs";

const fixture = await fetch("../shared/fixture.json", { cache: "no-store" }).then((response) => response.json());

class OpenRillLitFinalist extends LitElement {
  static properties = { projection: { state: true } };
  constructor() {
    super();
    this.projection = createProjection(fixture);
    for (const notice of fixture.notices) applyNotice(this.projection, notice);
  }
  createRenderRoot() { return this; }
  #decide(requestId, decision) {
    resolveApprovalLocally(this.projection, requestId, decision);
    this.projection = { ...this.projection };
  }
  async #navigate(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    moveCardSelection(this.projection, event.key === "ArrowDown" ? "next" : "previous");
    this.projection = { ...this.projection };
    await this.updateComplete;
    this.querySelector('[tabindex="0"]')?.focus();
  }
  #card(card) {
    return html`<article class="card" role=${card.role} tabindex=${card.tabIndex} aria-label=${card.ariaLabel} data-card-kind=${card.dataset.cardKind} @keydown=${this.#navigate}>
      <h2>${card.heading}</h2><p>${card.body}</p>
      ${card.actions?.length ? html`<div class="actions">${card.actions.map((decision) => html`<button type="button" @click=${() => this.#decide(card.id, decision)}>${decision}</button>`)}</div>` : null}
    </article>`;
  }
  render() {
    const descriptor = viewDescriptor(this.projection);
    return html`<div class="shell" data-framework="lit" data-fixture-id=${descriptor.fixtureId}>
      <header role="banner" aria-label="OpenRill Control UI"><h1>${descriptor.title}</h1></header>
      <main role="main" aria-label="Conversation">
        <div role="status" aria-label="Connection status" class="status">cursor=${descriptor.cursor} run=${descriptor.runStatus}</div>
        <section role="log" aria-label="Conversation transcript" class="transcript">${descriptor.cards.map((card) => this.#card(card))}</section>
      </main>
      <footer>Lit 3.3.3 · ${descriptor.cards.length} cards</footer>
    </div>`;
  }
}
customElements.define("openrill-lit-finalist", OpenRillLitFinalist);
