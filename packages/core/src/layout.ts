export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: 'rect' | 'decision';
}

/** Layer a small directed graph. Cycles stay in author order inside one component. */
export function rankItems(ids: string[], edges: { from: string; to: string }[]): string[][] {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    if (edge.from !== edge.to && adjacency.has(edge.from) && adjacency.has(edge.to))
      adjacency.get(edge.from)!.push(edge.to);
  }
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const components: string[][] = [];
  const visit = (id: string) => {
    indices.set(id, indices.size);
    low.set(id, indices.get(id)!);
    stack.push(id);
    active.add(id);
    for (const next of adjacency.get(id)!) {
      if (!indices.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (active.has(next)) low.set(id, Math.min(low.get(id)!, indices.get(next)!));
    }
    if (low.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      active.delete(member);
      component.push(member);
    } while (member !== id);
    components.push(ids.filter((candidate) => component.includes(candidate)));
  };
  ids.forEach((id) => {
    if (!indices.has(id)) visit(id);
  });
  const owner = new Map(components.flatMap((members, i) => members.map((id) => [id, i] as const)));
  const ranks = components.map(() => 0);
  // Tarjan emits targets before sources; process in reverse topological order.
  for (let i = components.length - 1; i >= 0; i--) {
    components[i]!.forEach((id) =>
      adjacency.get(id)!.forEach((next) => {
        const target = owner.get(next)!;
        if (target !== i)
          ranks[target] = Math.max(ranks[target]!, ranks[i]! + components[i]!.length);
      }),
    );
  }
  const layers: string[][] = [];
  ids.forEach((id) => {
    const component = owner.get(id)!;
    const rank = ranks[component]! + components[component]!.indexOf(id);
    (layers[rank] ??= []).push(id);
  });
  return layers.filter((layer) => layer.length);
}

/** Routes between measured HTML boxes; no browser dependency and no author coordinates. */
export function connectionPath(
  from: Box,
  to: Box,
  vertical: boolean,
  lane = 0,
  detour = false,
): string {
  if (detour) {
    if (vertical) {
      const x = Math.max(from.x + from.width, to.x + to.width) + 16 + lane / 3;
      const y1 = from.y + from.height / 2,
        y2 = to.y + to.height / 2;
      return `M${from.x + from.width} ${y1} H${x} V${y2} H${to.x + to.width}`;
    }
    const y = Math.min(from.y, to.y) - 16 - lane / 3;
    const x1 = from.x + from.width / 2,
      x2 = to.x + to.width / 2;
    return `M${x1} ${from.y} V${y} H${x2} V${to.y}`;
  }
  if (vertical) {
    const forward = to.y > from.y;
    const x1 = from.x + from.width / 2 + lane;
    const x2 = to.x + to.width / 2 + lane;
    const inset1 = from.shape === 'decision' ? (Math.abs(lane) * from.height) / from.width : 0;
    const inset2 = to.shape === 'decision' ? (Math.abs(lane) * to.height) / to.width : 0;
    const y1 = from.y + (forward ? from.height - inset1 : inset1);
    const y2 = to.y + (forward ? inset2 : to.height - inset2);
    const mid = (y1 + y2) / 2;
    return `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
  }
  const forward = to.x > from.x;
  const inset1 = from.shape === 'decision' ? (Math.abs(lane) * from.width) / from.height : 0;
  const inset2 = to.shape === 'decision' ? (Math.abs(lane) * to.width) / to.height : 0;
  const x1 = from.x + (forward ? from.width - inset1 : inset1);
  const x2 = to.x + (forward ? inset2 : to.width - inset2);
  const y1 = from.y + from.height / 2 + lane;
  const y2 = to.y + to.height / 2 + lane;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}
