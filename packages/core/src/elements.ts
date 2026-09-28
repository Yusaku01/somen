import { parseDocument, type FlowDocument } from './model.js';
import { connectionPath, type Box } from './layout.js';
import { styles } from './styles.js';

export interface FlowDiagramElement extends HTMLElement {
  readonly paused: boolean;
  play(): void;
  pause(): void;
  toJSON(): FlowDocument;
}

const svgNS = 'http://www.w3.org/2000/svg';
let sequence = 0;
function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}
interface Rail {
  from: string;
  to: string;
  lane: number;
  path: SVGPathElement;
  motions: SVGAnimateMotionElement[];
}

/** Call in a browser, or import /register. Safe to import on an SSR server. */
export function defineFlowElements(registry?: CustomElementRegistry): void {
  if (typeof HTMLElement === 'undefined') return;
  registry ??= customElements;
  if (registry.get('flow-diagram')) return;

  class Diagram extends HTMLElement implements FlowDiagramElement {
    static observedAttributes = [
      'label',
      'layout',
      'autoplay',
      'button-text',
      'caption',
      'legend',
      'controls',
      'variant',
    ];
    private root: ShadowRoot;
    private svg: SVGSVGElement;
    private stage: HTMLElement;
    private view: HTMLElement;
    private caption: HTMLElement;
    private control: HTMLButtonElement;
    private icon: HTMLElement;
    private playSlot: HTMLSlotElement;
    private pauseSlot: HTMLSlotElement;
    private legend: HTMLUListElement;
    private summary: HTMLUListElement;
    private error: HTMLElement;
    private hint: HTMLElement;
    private model: FlowDocument | undefined;
    private nodes = new Map<string, HTMLElement>();
    private rails: Rail[] = [];
    private resize?: ResizeObserver;
    private mutations?: MutationObserver;
    private media?: MediaQueryList;
    private frame = 0;
    private pendingSync = false;
    private initialized = false;
    private requestedPlaying = false;
    private uid = `svg-flow-${++sequence}`;

    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.root.innerHTML = `<style>${styles}</style>
        <figure part="panel" aria-labelledby="caption">
          <figcaption class="toolbar" part="toolbar">
            <span class="caption" id="caption" part="caption"><slot name="caption"><span data-caption></span></slot></span>
            <button type="button" part="control" hidden><span data-icon aria-hidden="true"></span><span data-button-text><slot name="pause-label">Pause</slot><slot name="play-label">Play</slot></span></button>
          </figcaption>
          <p class="error" part="error" hidden></p>
          <div class="legend" part="legend"><slot name="legend"><ul></ul></slot></div>
          <div class="viewport" part="viewport"><div class="stage" part="stage">
            <svg aria-hidden="true" focusable="false"></svg>
            <div class="nodes" part="nodes"><slot></slot></div>
          </div></div>
          <p class="hint" hidden>↔</p>
          <ul class="sr-only" data-summary></ul>
        </figure>`;
      const q = <T extends Element>(selector: string) => this.root.querySelector<T>(selector)!;
      this.svg = q('svg');
      this.stage = q('.stage');
      this.view = q('.viewport');
      this.caption = q('[data-caption]');
      this.control = q('button');
      this.icon = q('[data-icon]');
      this.playSlot = q('slot[name=play-label]');
      this.pauseSlot = q('slot[name=pause-label]');
      this.legend = q('.legend ul');
      this.summary = q('[data-summary]');
      this.error = q('.error');
      this.hint = q('.hint');
      this.control.addEventListener('click', () => (this.paused ? this.play() : this.pause()));
      this.root.addEventListener('slotchange', () => this.queueSync());
    }

    connectedCallback() {
      if (this.resize) return;
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      if (this.media.matches) this.requestedPlaying = false;
      if (!this.initialized) {
        this.requestedPlaying = this.hasAttribute('autoplay') && !this.media.matches;
        this.initialized = true;
      }
      this.media.addEventListener('change', this.onMotionPreference);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.resize = new ResizeObserver(() => this.queueLayout());
      this.mutations = new MutationObserver(() => this.queueSync());
      this.mutations.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['name', 'from', 'to', 'label', 'color', 'shape', 'duration'],
      });
      this.queueSync();
    }

    disconnectedCallback() {
      this.resize?.disconnect();
      this.resize = undefined;
      this.mutations?.disconnect();
      this.mutations = undefined;
      this.media?.removeEventListener('change', this.onMotionPreference);
      document.removeEventListener('visibilitychange', this.onVisibility);
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.svg.pauseAnimations();
    }

    attributeChangedCallback(name: string, before: string | null, after: string | null) {
      if (before === after || !this.isConnected) return;
      if (['button-text', 'caption', 'legend', 'controls', 'variant'].includes(name)) {
        this.applyPresentation();
        this.queueLayout();
        return;
      }
      if (name === 'autoplay') this.requestedPlaying = after !== null && !this.media?.matches;
      this.queueSync();
    }

    get paused() {
      return !this.requestedPlaying;
    }
    play() {
      this.requestedPlaying = true;
      this.applyPlayback();
    }
    pause() {
      this.requestedPlaying = false;
      this.applyPlayback();
    }
    toJSON() {
      return this.readDocument();
    }

    private onVisibility = () => this.applyPlayback();
    private onMotionPreference = () => {
      if (this.media?.matches) this.requestedPlaying = false;
      this.applyPlayback();
    };

    private queueSync() {
      if (this.pendingSync) return;
      this.pendingSync = true;
      queueMicrotask(() => {
        this.pendingSync = false;
        if (this.isConnected) this.sync();
      });
    }

    private readDocument(): FlowDocument {
      const children = [...this.children];
      const nodes = children.filter((child) => child.localName === 'flow-node');
      const connections = children.filter((child) => child.localName === 'flow-connection');
      const endpoint = (edge: Element, side: 'from' | 'to') => {
        if (edge.hasAttribute(side)) return edge.getAttribute(side);
        const index = children.indexOf(edge);
        const siblings =
          side === 'from' ? children.slice(0, index).reverse() : children.slice(index + 1);
        return siblings.find((child) => child.localName === 'flow-node')?.getAttribute('name');
      };
      return parseDocument({
        version: 1,
        label:
          this.getAttribute('label') ??
          this.querySelector('[slot=caption]')?.textContent?.trim() ??
          '',
        layout: this.getAttribute('layout') ?? 'auto',
        autoplay: this.hasAttribute('autoplay'),
        appearance: {
          variant: this.getAttribute('variant') ?? 'panel',
          caption: this.getAttribute('caption') !== 'hidden',
          legend: this.getAttribute('legend') !== 'hidden',
          controls: this.getAttribute('controls') !== 'hidden',
          buttonText: this.getAttribute('button-text') !== 'hidden',
        },
        nodes: nodes.map((node) => ({
          id: node.getAttribute('name'),
          label: node.textContent?.trim(),
        })),
        connections: connections.map((edge, i) => ({
          id: edge.getAttribute('name') ?? `connection-${i + 1}`,
          from: endpoint(edge, 'from'),
          to: endpoint(edge, 'to'),
          label: edge.getAttribute('label'),
          color: edge.getAttribute('color') ?? undefined,
          shape: edge.getAttribute('shape') ?? undefined,
          duration: edge.hasAttribute('duration')
            ? Number(edge.getAttribute('duration'))
            : undefined,
        })),
      });
    }

    private sync() {
      try {
        this.model = this.readDocument();
      } catch (error) {
        this.model = undefined;
        this.error.textContent = error instanceof Error ? error.message : String(error);
        this.error.hidden = false;
        this.control.hidden = true;
        this.svg.replaceChildren();
        this.rails = [];
        this.legend.replaceChildren();
        this.summary.replaceChildren();
        this.dispatchEvent(
          new CustomEvent('flow-error', { detail: error, bubbles: true, composed: true }),
        );
        return;
      }
      this.error.hidden = true;
      this.caption.textContent = this.model.label;
      this.nodes = new Map(
        [...this.children]
          .filter((child) => child.localName === 'flow-node')
          .map((node) => [node.getAttribute('name')!, node as HTMLElement]),
      );
      this.resize?.disconnect();
      this.resize?.observe(this);
      this.resize?.observe(this.stage);
      this.nodes.forEach((node) => this.resize?.observe(node));
      const clock = this.svg.getCurrentTime();
      this.svg.replaceChildren();
      this.rails = [];
      this.legend.replaceChildren();
      this.summary.replaceChildren();
      this.svg.removeAttribute('data-ready');
      const defs = svgElement('defs');
      this.svg.append(defs);
      const pairs = new Map<string, string[]>();
      this.model.connections.forEach((edge) => {
        const pair = [edge.from, edge.to].sort().join('|');
        pairs.set(pair, [...(pairs.get(pair) ?? []), edge.id]);
      });
      this.model.connections.forEach((edge) => {
        const markerId = `${this.uid}-${edge.id}`;
        const marker = svgElement('marker', {
          id: markerId,
          viewBox: '0 0 10 10',
          refX: '9',
          refY: '5',
          markerWidth: '5',
          markerHeight: '5',
          orient: 'auto',
        });
        marker.append(svgElement('path', { d: 'M0 1 L9 5 L0 9 Z', class: 'arrow' }));
        defs.append(marker);
        const path = svgElement('path', {
          class: 'rail',
          fill: 'none',
          'marker-end': `url(#${markerId})`,
          part: 'rail',
        });
        this.svg.append(path);
        const motions: SVGAnimateMotionElement[] = [];
        for (let i = 0; i < 2; i++) {
          const particle = svgElement('g', {
            class: 'particle',
            fill: edge.color!,
            part: 'particle',
          });
          particle.append(
            edge.shape === 'circle'
              ? svgElement('circle', { r: '4' })
              : svgElement('rect', {
                  x: '-4',
                  y: '-4',
                  width: '8',
                  height: '8',
                  rx: '1',
                  ...(edge.shape === 'diamond' ? { transform: 'rotate(45)' } : {}),
                }),
          );
          const motion = svgElement('animateMotion', {
            dur: `${edge.duration}s`,
            begin: `${(-i * edge.duration!) / 2}s`,
            calcMode: 'linear',
            repeatCount: 'indefinite',
          });
          particle.append(motion);
          this.svg.append(particle);
          motions.push(motion);
        }
        const siblings = pairs.get([edge.from, edge.to].sort().join('|'))!;
        this.rails.push({
          from: edge.from,
          to: edge.to,
          lane: Math.max(
            -18,
            Math.min(18, (siblings.indexOf(edge.id) - (siblings.length - 1) / 2) * 14),
          ),
          path,
          motions,
        });
        const item = document.createElement('li');
        item.setAttribute('part', 'legend-item');
        const mark = document.createElement('span');
        mark.setAttribute('part', 'legend-mark');
        const label = document.createElement('span');
        label.setAttribute('part', 'legend-label');
        label.textContent = edge.label;
        mark.className = 'mark';
        mark.dataset.shape = edge.shape;
        mark.style.backgroundColor = edge.color!;
        mark.setAttribute('aria-hidden', 'true');
        item.append(mark, label);
        this.legend.append(item);
        const summary = document.createElement('li');
        summary.textContent = `${this.model!.nodes.find((node) => node.id === edge.from)!.label} → ${this.model!.nodes.find((node) => node.id === edge.to)!.label}: ${edge.label}`;
        this.summary.append(summary);
      });
      this.svg.setCurrentTime(clock);
      this.applyPresentation();
      this.applyPlayback();
      this.queueLayout();
    }

    private queueLayout() {
      if (this.frame || !this.isConnected) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.layout();
      });
    }

    private layout() {
      if (!this.model || !this.isConnected) return;
      const nodeStyle = getComputedStyle(this.root.querySelector('.nodes')!);
      const gap = parseFloat(nodeStyle.columnGap) || 56;
      const padding =
        parseFloat(nodeStyle.paddingInlineStart) + parseFloat(nodeStyle.paddingInlineEnd);
      const nodeWidths = [...this.nodes.values()].map((node) => {
        const maxWidth = getComputedStyle(node).maxInlineSize;
        return maxWidth.endsWith('px') ? Number.parseFloat(maxWidth) : 184;
      });
      const needed =
        nodeWidths.reduce((sum, width) => sum + width, 0) +
        Math.max(0, this.nodes.size - 1) * gap +
        padding;
      const vertical =
        this.model.layout === 'vertical' ||
        (this.model.layout === 'auto' && this.clientWidth < needed);
      this.stage.dataset.layout = vertical ? 'vertical' : 'horizontal';
      // Explicit horizontal diagrams scroll, while automatic diagrams reflow to one column.
      this.stage.style.minWidth = this.model.layout === 'horizontal' ? `${needed}px` : '';
      const rect = this.stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      const boxes = new Map<string, Box>();
      this.nodes.forEach((node, name) => {
        const box = node.getBoundingClientRect();
        boxes.set(name, {
          x: box.left - rect.left,
          y: box.top - rect.top,
          width: box.width,
          height: box.height,
        });
      });
      let changed = false;
      this.rails.forEach((rail) => {
        const order = [...this.nodes.keys()];
        const detour = Math.abs(order.indexOf(rail.from) - order.indexOf(rail.to)) > 1;
        const d = connectionPath(
          boxes.get(rail.from)!,
          boxes.get(rail.to)!,
          vertical,
          rail.lane,
          detour,
        );
        if (rail.path.getAttribute('d') !== d) {
          changed = true;
          rail.path.setAttribute('d', d);
          rail.motions.forEach((motion) => motion.setAttribute('path', d));
        }
      });
      // SMIL can retain a cached transform when its path changes while paused.
      // Sample the same time again rather than restarting the animation.
      if (changed) this.svg.setCurrentTime(this.svg.getCurrentTime());
      this.svg.setAttribute('data-ready', '');
      const overflowing = this.view.scrollWidth > this.view.clientWidth + 1;
      this.view.tabIndex = overflowing ? 0 : -1;
      this.hint.hidden = !overflowing;
    }

    private slotText(slot: HTMLSlotElement) {
      const nodes = slot.assignedNodes({ flatten: true });
      return (
        nodes
          .map((node) => node.textContent ?? '')
          .join('')
          .trim() ||
        slot.textContent ||
        ''
      );
    }
    private applyPresentation() {
      const captionHidden = this.getAttribute('caption') === 'hidden';
      const figure = this.root.querySelector('figure')!;
      (this.root.querySelector('.caption') as HTMLElement).hidden = captionHidden;
      // Keep a name for the figure even when its visible caption is removed.
      if (captionHidden) {
        figure.removeAttribute('aria-labelledby');
        figure.setAttribute('aria-label', this.model?.label ?? this.getAttribute('label') ?? '');
      } else {
        figure.removeAttribute('aria-label');
        figure.setAttribute('aria-labelledby', 'caption');
      }
      this.control.hidden = !this.rails.length || this.getAttribute('controls') === 'hidden';
      (this.root.querySelector('.toolbar') as HTMLElement).hidden =
        captionHidden && this.control.hidden;
      (this.root.querySelector('.legend') as HTMLElement).hidden =
        this.getAttribute('legend') === 'hidden' ||
        (!this.rails.length && !this.querySelector('[slot=legend]'));
      (this.root.querySelector('[data-button-text]') as HTMLElement).hidden =
        this.getAttribute('button-text') === 'hidden';
    }
    private applyPlayback() {
      const playing = this.requestedPlaying && !document.hidden && this.isConnected;
      if (playing) this.svg.unpauseAnimations();
      else this.svg.pauseAnimations();
      this.svg.toggleAttribute('data-static', !!this.media?.matches && !this.requestedPlaying);
      this.icon.textContent = this.requestedPlaying ? 'Ⅱ' : '▶';
      this.pauseSlot.hidden = !this.requestedPlaying;
      this.playSlot.hidden = this.requestedPlaying;
      (this.root.querySelector('[data-button-text]') as HTMLElement).hidden =
        this.getAttribute('button-text') === 'hidden';
      const action = this.slotText(this.requestedPlaying ? this.pauseSlot : this.playSlot);
      this.control.setAttribute('aria-label', `${action}: ${this.model?.label ?? ''}`);
      this.dispatchEvent(
        new CustomEvent('flow-playback', {
          detail: { paused: this.paused },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
  if (!registry.get('flow-node')) registry.define('flow-node', class extends HTMLElement {});
  if (!registry.get('flow-connection'))
    registry.define('flow-connection', class extends HTMLElement {});
  registry.define('flow-diagram', Diagram);
}

declare global {
  interface HTMLElementTagNameMap {
    'flow-diagram': FlowDiagramElement;
  }
}
