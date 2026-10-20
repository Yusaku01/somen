import { parseDocument, type FlowDocument } from './model.js';
import { connectionPath, rankItems, type Box } from './layout.js';
import { styles } from './styles.js';
import { defineContentElements } from './content-elements.js';

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
  label: HTMLElement;
  labelPosition: number;
}

/** Call in a browser, or import /register. Safe to import on an SSR server. */
export function defineFlowElements(registry?: CustomElementRegistry): void {
  if (typeof HTMLElement === 'undefined') return;
  registry ??= customElements;
  if (registry.get('flow-diagram')) return;
  defineContentElements(registry);

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
    private groups = new Map<string, HTMLElement>();
    private directions = new Map<Element, boolean>();
    private ranks = new Map<Element, number>();
    private resize?: ResizeObserver;
    private mutations?: MutationObserver;
    private media?: MediaQueryList;
    private frame = 0;
    private pendingSync = false;
    private initialized = false;
    private requestedPlaying = false;
    private overflowed = false;
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
          <p class="hint" id="scroll-hint" part="scroll-hint" hidden><slot name="scroll-hint">↔ Scroll to see the full diagram</slot></p>
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
      this.mutations = new MutationObserver((records) => {
        if (
          records.some(
            (record) =>
              record.type !== 'attributes' || !['style', 'class'].includes(record.attributeName!),
          )
        )
          this.queueSync();
        else this.queueLayout();
      });
      this.mutations.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'name',
          'from',
          'to',
          'label',
          'color',
          'shape',
          'duration',
          'layout',
          'label-position',
          'style',
          'class',
        ],
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
      const collect = (parent: Element): Element[] =>
        [...parent.children].flatMap((child) =>
          child.localName === 'flow-group'
            ? [child, ...collect(child)]
            : ['flow-node', 'flow-connection'].includes(child.localName)
              ? [child]
              : [],
        );
      const children = collect(this);
      const groups = children.filter((child) => child.localName === 'flow-group');
      const nodes = children.filter((child) => child.localName === 'flow-node');
      const connections = children.filter((child) => child.localName === 'flow-connection');
      const endpoint = (edge: Element, side: 'from' | 'to') => {
        if (edge.hasAttribute(side)) return edge.getAttribute(side);
        const peers = [...edge.parentElement!.children];
        const index = peers.indexOf(edge);
        const siblings = side === 'from' ? peers.slice(0, index).reverse() : peers.slice(index + 1);
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
        groups: groups.map((group) => ({
          id: group.getAttribute('name'),
          label:
            group.getAttribute('label') ??
            group.querySelector(':scope > [slot=label]')?.textContent?.trim(),
          parent:
            group.parentElement === this ? undefined : group.parentElement?.getAttribute('name'),
          layout: group.getAttribute('layout') ?? undefined,
        })),
        nodes: nodes.map((node) => ({
          id: node.getAttribute('name'),
          label: node.getAttribute('label') ?? node.textContent?.trim(),
          group: node.parentElement === this ? undefined : node.parentElement?.getAttribute('name'),
          shape: node.getAttribute('shape') ?? undefined,
        })),
        connections: connections.map((edge, i) => ({
          id: edge.getAttribute('name') ?? `connection-${i + 1}`,
          from: endpoint(edge, 'from'),
          to: endpoint(edge, 'to'),
          label: edge.getAttribute('label') ?? edge.textContent?.trim() ?? '',
          labelPosition: edge.hasAttribute('label-position')
            ? Number(edge.getAttribute('label-position'))
            : undefined,
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
        this.stage.hidden = true;
        this.view.tabIndex = -1;
        this.hint.hidden = true;
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
      this.stage.hidden = false;
      this.ranks.clear();
      this.directions.clear();
      this.caption.textContent = this.model.label;
      this.nodes = new Map(
        [...this.querySelectorAll('flow-node')]
          .filter((node) => node.closest('flow-diagram') === this)
          .map((node) => [node.getAttribute('name')!, node as HTMLElement]),
      );
      this.groups = new Map(
        [...this.querySelectorAll<HTMLElement>('flow-group')]
          .filter((group) => group.closest('flow-diagram') === this)
          .map((group) => [group.getAttribute('name')!, group]),
      );
      this.resize?.disconnect();
      this.resize?.observe(this);
      this.resize?.observe(this.stage);
      this.nodes.forEach((node) => this.resize?.observe(node));
      this.groups.forEach((group) => this.resize?.observe(group));
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
      const connections = [...this.querySelectorAll<HTMLElement>('flow-connection')].filter(
        (edge) => edge.closest('flow-diagram') === this,
      );
      this.model.connections.forEach((edge, index) => {
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
          label: connections[index]!,
          labelPosition: edge.labelPosition ?? 0.5,
        });
        const item = document.createElement('li');
        item.setAttribute('part', 'legend-item');
        const mark = document.createElement('span');
        mark.setAttribute('part', 'legend-mark');
        const label = document.createElement('span');
        label.setAttribute('part', 'legend-label');
        label.textContent = edge.label ?? '';
        mark.className = 'mark';
        mark.dataset.shape = edge.shape;
        mark.style.backgroundColor = edge.color!;
        mark.setAttribute('aria-hidden', 'true');
        item.append(mark, label);
        if (edge.label) this.legend.append(item);
        const summary = document.createElement('li');
        summary.textContent = `${this.model!.nodes.find((node) => node.id === edge.from)!.label} → ${this.model!.nodes.find((node) => node.id === edge.to)!.label}${edge.label ? `: ${edge.label}` : ''}`;
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
      const horizontalWidth = this.arrange(this, false, false);
      const vertical =
        this.model.layout === 'vertical' ||
        (this.model.layout === 'auto' && this.view.clientWidth < horizontalWidth);
      this.stage.dataset.layout = vertical ? 'vertical' : 'horizontal';
      const needed = this.arrange(this, vertical, true);
      this.setStyle(this.stage, 'min-width', `${needed}px`);
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
          shape: node.getAttribute('shape') === 'decision' ? 'decision' : 'rect',
        });
      });
      let changed = false;
      this.rails.forEach((rail) => {
        const from = this.nodes.get(rail.from)!;
        const to = this.nodes.get(rail.to)!;
        let container = from.parentElement!;
        while (container !== this && !container.contains(to)) container = container.parentElement!;
        const direction = this.directions.get(container) ?? vertical;
        const peer = (node: Element) => {
          while (node.parentElement !== container) node = node.parentElement!;
          return node;
        };
        const detour = Math.abs(this.ranks.get(peer(from))! - this.ranks.get(peer(to))!) > 1;
        const d = connectionPath(
          boxes.get(rail.from)!,
          boxes.get(rail.to)!,
          direction,
          rail.lane,
          detour,
        );
        if (rail.path.getAttribute('d') !== d) {
          changed = true;
          rail.path.setAttribute('d', d);
          rail.motions.forEach((motion) => motion.setAttribute('path', d));
        }
        const point = rail.path.getPointAtLength(rail.path.getTotalLength() * rail.labelPosition);
        // Labels need more room than the rails: keep paired directions readable
        // without moving the connection anchors outside their nodes.
        const peers = this.labelPeers(rail);
        const labelSize = Math.max(
          0,
          ...peers.map((candidate) => {
            const box = candidate.label.getBoundingClientRect();
            return direction ? box.width : box.height;
          }),
        );
        const labelLane = peers.indexOf(rail) - (peers.length - 1) / 2;
        const labelSpan = peers.length * (labelSize + 8) - 8;
        const labelOffset =
          labelLane * (labelSize + 8) +
          (detour ? (direction ? -rail.lane / 3 : rail.lane / 3) : -rail.lane) -
          (detour && !direction && peers.length > 1 ? labelSpan / 2 + 8 : 0);
        this.setStyle(rail.label, '--_flow-label-x', direction ? `${labelOffset}px` : '0px');
        this.setStyle(rail.label, '--_flow-label-y', direction ? '0px' : `${labelOffset}px`);
        // offsetParent skips shadow ancestors in some browsers. Measure the actual
        // containing-block origin instead, excluding the label's CSS translation.
        const labelRect = rail.label.getBoundingClientRect();
        const transform = new DOMMatrixReadOnly(getComputedStyle(rail.label).transform);
        const left =
          (parseFloat(rail.label.style.left) || 0) +
          point.x +
          rect.left -
          labelRect.left +
          transform.e;
        const top =
          (parseFloat(rail.label.style.top) || 0) +
          point.y +
          rect.top -
          labelRect.top +
          transform.f;
        this.setStyle(rail.label, 'left', `${Math.round(left * 64) / 64}px`);
        this.setStyle(rail.label, 'top', `${Math.round(top * 64) / 64}px`);
      });
      // SMIL can retain a cached transform when its path changes while paused.
      // Sample the same time again rather than restarting the animation.
      if (changed) this.svg.setCurrentTime(this.svg.getCurrentTime());
      this.svg.setAttribute('data-ready', '');
      const overflowing = this.view.scrollWidth > this.view.clientWidth + 1;
      // Vertical branches open at their central question; horizontal flows open
      // at the leading edge. Subsequent layouts preserve the reader's scroll.
      if (overflowing && !this.overflowed)
        this.view.scrollLeft = vertical ? (this.view.scrollWidth - this.view.clientWidth) / 2 : 0;
      this.overflowed = overflowing;
      this.view.tabIndex = overflowing ? 0 : -1;
      this.view.setAttribute('aria-label', this.model.label);
      if (overflowing) {
        this.view.setAttribute('role', 'region');
        this.view.setAttribute('aria-describedby', 'scroll-hint');
      } else {
        this.view.removeAttribute('role');
        this.view.removeAttribute('aria-describedby');
      }
      this.hint.hidden = !overflowing;
    }

    private setStyle(element: HTMLElement, name: string, value: string) {
      if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
    }

    private labelPeers(rail: Rail) {
      return this.rails.filter(
        (candidate) =>
          ((candidate.from === rail.from && candidate.to === rail.to) ||
            (candidate.from === rail.to && candidate.to === rail.from)) &&
          candidate.label.getBoundingClientRect().height > 0,
      );
    }

    /** Contract groups into items, then measure and place each container recursively. */
    private arrange(
      container: HTMLElement,
      inheritedVertical: boolean,
      apply: boolean,
      allowShrink = true,
    ): number {
      const vertical =
        container === this
          ? inheritedVertical
          : container.getAttribute('layout') === 'vertical'
            ? true
            : container.getAttribute('layout') === 'horizontal'
              ? false
              : inheritedVertical;
      const grid =
        container === this
          ? this.root.querySelector<HTMLElement>('.nodes')!
          : container.shadowRoot!.querySelector<HTMLElement>('.items')!;
      const items = [...container.children].filter((child) =>
        ['flow-node', 'flow-group'].includes(child.localName),
      ) as HTMLElement[];
      const ids = items.map((item) => item.getAttribute('name')!);
      const project = (id: string) => {
        let item: Element = this.nodes.get(id)!;
        while (item.parentElement && item.parentElement !== container) item = item.parentElement;
        return item.parentElement === container ? item.getAttribute('name')! : '';
      };
      const edges = this.model!.connections.map((edge) => ({
        from: project(edge.from),
        to: project(edge.to),
      })).filter((edge) => edge.from && edge.to && edge.from !== edge.to);
      const layers = edges.length ? rankItems(ids, edges) : ids.map((id) => [id]);
      const rails = this.rails.filter((rail) => {
        const from = project(rail.from),
          to = project(rail.to);
        return from && to && from !== to;
      });
      rails.forEach((rail) => {
        const count = Math.max(1, this.labelPeers(rail).length);
        this.setStyle(
          rail.label,
          '--_flow-label-width',
          vertical ? `calc((100% - ${(count - 1) * 8}px) / ${count})` : '100%',
        );
      });
      this.setStyle(grid, '--_flow-label-column-gap', '0px');
      this.setStyle(grid, '--_flow-label-row-gap', '0px');
      this.setStyle(grid, 'padding-top', '');
      const style = getComputedStyle(grid);
      const labelGap = Math.max(
        0,
        ...rails.map((rail) => {
          const box = rail.label.getBoundingClientRect();
          return (vertical ? box.height : box.width) + 16;
        }),
      );
      // Labels fan out farther than the bounded rail lanes. Reserve their full
      // stack in every cross-axis track and between neighboring branches.
      const labelSpan = vertical
        ? 0
        : Math.max(
            0,
            ...rails.map((rail) => {
              const peers = this.labelPeers(rail);
              if (peers.length < 2) return 0;
              const height = Math.max(
                ...peers.map((peer) => peer.label.getBoundingClientRect().height),
              );
              return peers.length * (height + 8) - 8;
            }),
          );
      const gap = Math.max(parseFloat(style.columnGap) || 56, vertical ? 0 : labelGap);
      const rowGap = Math.max(parseFloat(style.rowGap) || 56, vertical ? labelGap : labelSpan);
      const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);
      const cross = Math.max(1, ...layers.map((layer) => layer.length));
      const shrink = allowShrink && vertical && cross === 1;
      const widths = new Map(
        items.map((item) => [
          item.getAttribute('name')!,
          item.localName === 'flow-group'
            ? this.arrange(item, vertical, apply, shrink)
            : shrink
              ? parseFloat(getComputedStyle(item).minInlineSize) || 0
              : parseFloat(getComputedStyle(item).maxInlineSize) || 184,
        ]),
      );
      const columns = Array.from({ length: vertical ? cross : layers.length }, () => 0);
      layers.forEach((layer, rank) =>
        layer.forEach((id, index) => {
          const start = Math.floor((index * cross) / layer.length);
          const span = Math.floor(((index + 1) * cross) / layer.length) - start;
          if (vertical) {
            for (let col = start; col < start + span; col++)
              columns[col] = Math.max(columns[col]!, (widths.get(id)! - gap * (span - 1)) / span);
          } else columns[rank] = Math.max(columns[rank]!, widths.get(id)!);
          if (apply) {
            const item = items.find((candidate) => candidate.getAttribute('name') === id)!;
            this.ranks.set(item, rank);
            this.setStyle(
              item,
              '--_flow-column',
              vertical ? `${start + 1} / span ${span}` : `${rank + 1}`,
            );
            this.setStyle(
              item,
              '--_flow-row',
              vertical ? `${rank + 1}` : `${start + 1} / span ${span}`,
            );
          }
        }),
      );
      if (apply) {
        // Long connections detour above their nodes, outside the row track.
        const detours =
          !vertical &&
          rails.some(
            (rail) =>
              Math.abs(
                layers.findIndex((layer) => layer.includes(project(rail.from))) -
                  layers.findIndex((layer) => layer.includes(project(rail.to))),
              ) > 1,
          );
        if (detours && labelSpan)
          this.setStyle(
            grid,
            'padding-top',
            `${Math.max(parseFloat(style.paddingTop), labelSpan + 32)}px`,
          );
        this.directions.set(container, vertical);
        this.setStyle(grid, '--_flow-label-column-gap', `${gap}px`);
        this.setStyle(grid, '--_flow-label-row-gap', `${rowGap}px`);
        this.setStyle(
          grid,
          'grid-template-columns',
          columns.map((width) => `minmax(${width}px,1fr)`).join(' '),
        );
        this.setStyle(
          grid,
          'grid-template-rows',
          `repeat(${vertical ? layers.length : cross},minmax(${labelSpan}px,auto))`,
        );
      }
      const border = getComputedStyle(container);
      return (
        columns.reduce((sum, width) => sum + width, 0) +
        Math.max(0, columns.length - 1) * gap +
        padding +
        (container === this
          ? 0
          : parseFloat(border.borderLeftWidth) + parseFloat(border.borderRightWidth))
      );
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
        (!this.legend.children.length && !this.querySelector('[slot=legend]'));
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
  registry.define('flow-diagram', Diagram);
}

declare global {
  interface HTMLElementTagNameMap {
    'flow-diagram': FlowDiagramElement;
  }
}
