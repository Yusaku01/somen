export type Layout = 'auto' | 'horizontal' | 'vertical';
export type ParticleShape = 'circle' | 'square' | 'diamond';
export interface FlowAppearance {
  variant?: 'panel' | 'plain';
  caption?: boolean;
  legend?: boolean;
  controls?: boolean;
  buttonText?: boolean;
}
export interface FlowNode {
  id: string;
  label: string;
}
export interface FlowConnection {
  id: string;
  from: string;
  to: string;
  label: string;
  color?: string;
  shape?: ParticleShape;
  duration?: number;
}
/** Portable authoring format. Coordinates are deliberately not part of this format. */
export interface FlowDocument {
  version: 1;
  label: string;
  layout?: Layout;
  autoplay?: boolean;
  appearance?: FlowAppearance;
  nodes: FlowNode[];
  connections: FlowConnection[];
}

const identifier = /^[a-zA-Z][\w-]*$/;
const color = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class FlowValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'FlowValidationError';
  }
}

/** Shared by the browser and CLI. Rejects dangling edges and ambiguous identifiers. */
export function parseDocument(input: unknown): FlowDocument {
  if (!record(input)) throw new FlowValidationError(['The diagram must be an object.']);
  const issues: string[] = [];
  if (input.version !== 1) issues.push('version must be 1.');
  if (!nonempty(input.label)) issues.push('label is required.');
  if (
    input.layout !== undefined &&
    (typeof input.layout !== 'string' || !['auto', 'horizontal', 'vertical'].includes(input.layout))
  )
    issues.push('layout must be auto, horizontal or vertical.');
  if (input.autoplay !== undefined && typeof input.autoplay !== 'boolean')
    issues.push('autoplay must be a boolean.');
  const appearance = record(input.appearance) ? input.appearance : {};
  if (input.appearance !== undefined && !record(input.appearance))
    issues.push('appearance must be an object.');
  if (
    appearance.variant !== undefined &&
    !['panel', 'plain'].includes(appearance.variant as string)
  )
    issues.push('appearance.variant must be panel or plain.');
  for (const key of ['caption', 'legend', 'controls', 'buttonText']) {
    if (appearance[key] !== undefined && typeof appearance[key] !== 'boolean')
      issues.push(`appearance.${key} must be a boolean.`);
  }
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const connections = Array.isArray(input.connections) ? input.connections : [];
  if (!nodes.length || nodes.length > 100) issues.push('Use between 1 and 100 nodes.');
  if (!Array.isArray(input.connections) || connections.length > 300)
    issues.push('connections must be an array with at most 300 entries.');
  const ids = new Set<string>();
  nodes.forEach((node, index) => {
    if (!record(node)) {
      issues.push(`nodes[${index}] must be an object.`);
      return;
    }
    if (typeof node.id !== 'string' || !identifier.test(node.id))
      issues.push(`nodes[${index}].id must start with a letter and use letters, numbers, _ or -.`);
    else if (ids.has(node.id)) issues.push(`Duplicate node id: ${node.id}.`);
    else ids.add(node.id);
    if (!nonempty(node.label)) issues.push(`nodes[${index}].label is required.`);
  });
  const edgeIds = new Set<string>();
  connections.forEach((edge, index) => {
    const at = `connections[${index}]`;
    if (!record(edge)) {
      issues.push(`${at} must be an object.`);
      return;
    }
    if (typeof edge.id !== 'string' || !identifier.test(edge.id))
      issues.push(`${at}.id is invalid.`);
    else if (edgeIds.has(edge.id)) issues.push(`Duplicate connection id: ${edge.id}.`);
    else edgeIds.add(edge.id);
    if (typeof edge.from !== 'string' || !ids.has(edge.from))
      issues.push(`${at}.from refers to a missing node.`);
    if (typeof edge.to !== 'string' || !ids.has(edge.to))
      issues.push(`${at}.to refers to a missing node.`);
    if (edge.from === edge.to) issues.push(`${at}: self connections are not supported yet.`);
    if (!nonempty(edge.label)) issues.push(`${at}.label is required.`);
    if (edge.color !== undefined && (typeof edge.color !== 'string' || !color.test(edge.color)))
      issues.push(`${at}.color must be a #RGB or #RRGGBB color.`);
    if (
      edge.shape !== undefined &&
      (typeof edge.shape !== 'string' || !['circle', 'square', 'diamond'].includes(edge.shape))
    )
      issues.push(`${at}.shape is invalid.`);
    if (
      edge.duration !== undefined &&
      (typeof edge.duration !== 'number' ||
        !Number.isFinite(edge.duration) ||
        edge.duration < 0.5 ||
        edge.duration > 120)
    )
      issues.push(`${at}.duration must be between 0.5 and 120 seconds.`);
  });
  if (issues.length) throw new FlowValidationError(issues);
  // Copy only supported fields. Serialized user data never becomes executable markup.
  return {
    version: 1,
    label: String(input.label),
    layout: (input.layout ?? 'auto') as Layout,
    autoplay: input.autoplay === true,
    appearance: {
      variant: (appearance.variant ?? 'panel') as 'panel' | 'plain',
      caption: appearance.caption !== false,
      legend: appearance.legend !== false,
      controls: appearance.controls !== false,
      buttonText: appearance.buttonText !== false,
    },
    nodes: nodes.map((node) => ({ id: node.id, label: node.label })),
    connections: connections.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      color: edge.color ?? '#70a0ff',
      shape: edge.shape ?? 'circle',
      duration: edge.duration ?? 4,
    })),
  };
}

export function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

/** Produces the exact same public HTML API that a developer can write by hand. */
export function toMarkup(input: FlowDocument): string {
  const doc = parseDocument(input);
  const e = escapeHTML;
  const appearance = doc.appearance!;
  const attrs = [
    appearance.variant === 'plain' ? ' variant="plain"' : '',
    ...(['caption', 'legend', 'controls'] as const).map((key) =>
      appearance[key] === false ? ` ${key}="hidden"` : '',
    ),
    appearance.buttonText === false ? ' button-text="hidden"' : '',
  ].join('');
  // Place outgoing connections after their source. Only omit endpoints when both
  // match the surrounding nodes; explicit names keep branches and reverse edges clear.
  const content = doc.nodes.flatMap((node, index) => [
    `  <flow-node name="${e(node.id)}">${e(node.label)}</flow-node>`,
    ...doc.connections
      .filter((edge) => edge.from === node.id)
      .map((edge) => {
        const endpoints =
          edge.to === doc.nodes[index + 1]?.id ? '' : ` from="${e(edge.from)}" to="${e(edge.to)}"`;
        return `  <flow-connection name="${e(edge.id)}"${endpoints} label="${e(edge.label)}" color="${edge.color}" shape="${edge.shape}" duration="${edge.duration}"></flow-connection>`;
      }),
  ]);
  return [
    `<flow-diagram label="${e(doc.label)}" layout="${doc.layout}"${doc.autoplay ? ' autoplay' : ''}${attrs}>`,
    ...content,
    '</flow-diagram>',
  ].join('\n');
}

export const exampleDocument: FlowDocument = {
  version: 1,
  label: 'クライアントとサーバーの通信',
  layout: 'auto',
  autoplay: true,
  nodes: [
    { id: 'client', label: 'クライアント' },
    { id: 'server', label: 'サーバー' },
  ],
  connections: [
    {
      id: 'request',
      from: 'client',
      to: 'server',
      label: 'リクエスト',
      color: '#70a0ff',
      shape: 'square',
      duration: 4,
    },
    {
      id: 'response',
      from: 'server',
      to: 'client',
      label: 'レスポンス',
      color: '#9ae8c5',
      shape: 'circle',
      duration: 4,
    },
  ],
};
