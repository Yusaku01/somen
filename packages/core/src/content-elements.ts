import { nodeStyles, groupStyles, connectionStyles } from './styles.js';

/** Each content element owns its defaults, including when nested inside a group. */
export function defineContentElements(registry: CustomElementRegistry): void {
  if (!registry.get('flow-node')) {
    const template = document.createElement('template');
    template.innerHTML = `<style>${nodeStyles}</style>
      <div class="surface" part="surface">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><polygon part="shape" points="50,1 99,50 50,99 1,50" /></svg>
        <div class="content" part="content"><slot></slot><span data-fallback></span></div>
      </div>`;
    registry.define(
      'flow-node',
      class extends HTMLElement {
        static observedAttributes = ['label'];
        private mutations?: MutationObserver;
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
          this.shadowRoot!.addEventListener('slotchange', () => this.updateLabel());
        }
        connectedCallback() {
          this.updateLabel();
          this.mutations = new MutationObserver(() => this.updateLabel());
          this.mutations.observe(this, { childList: true, characterData: true, subtree: true });
        }
        disconnectedCallback() {
          this.mutations?.disconnect();
        }
        attributeChangedCallback() {
          this.updateLabel();
        }
        private updateLabel() {
          const hasContent = !!this.textContent?.trim() || this.children.length > 0;
          this.shadowRoot!.querySelector('slot')!.hidden = !hasContent;
          const fallback = this.shadowRoot!.querySelector<HTMLElement>('[data-fallback]')!;
          fallback.textContent = this.getAttribute('label') ?? '';
          fallback.hidden = hasContent;
        }
      },
    );
  }
  if (!registry.get('flow-group')) {
    const template = document.createElement('template');
    template.innerHTML = `<style>${groupStyles}</style>
      <section part="surface" aria-labelledby="label">
        <div id="label" part="label"><slot name="label"><span></span></slot></div>
        <div class="items" part="content"><slot></slot></div>
      </section>`;
    registry.define(
      'flow-group',
      class extends HTMLElement {
        static observedAttributes = ['label'];
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
        }
        connectedCallback() {
          this.attributeChangedCallback();
        }
        attributeChangedCallback() {
          this.shadowRoot!.querySelector('span')!.textContent = this.getAttribute('label') ?? '';
        }
      },
    );
  }
  if (!registry.get('flow-connection')) {
    const template = document.createElement('template');
    template.innerHTML = `<style>${connectionStyles}</style><span part="label"><slot></slot><span data-fallback></span></span>`;
    registry.define(
      'flow-connection',
      class extends HTMLElement {
        static observedAttributes = ['label'];
        private mutations?: MutationObserver;
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
          this.shadowRoot!.addEventListener('slotchange', () => this.updateLabel());
        }
        connectedCallback() {
          this.updateLabel();
          this.mutations = new MutationObserver(() => this.updateLabel());
          this.mutations.observe(this, { childList: true, characterData: true, subtree: true });
        }
        disconnectedCallback() {
          this.mutations?.disconnect();
        }
        attributeChangedCallback() {
          this.updateLabel();
        }
        private updateLabel() {
          const slot = this.shadowRoot!.querySelector('slot')!;
          const label = this.getAttribute('label') ?? '';
          const hasContent = !!this.textContent?.trim() || this.children.length > 0;
          const fallback = this.shadowRoot!.querySelector<HTMLElement>('[data-fallback]')!;
          fallback.textContent = label;
          fallback.hidden = hasContent;
          slot.hidden = !hasContent;
          this.shadowRoot!.querySelector('span')!.hidden = !hasContent && !label.trim();
        }
      },
    );
  }
}
