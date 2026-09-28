export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
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
    const y1 = from.y + (forward ? from.height : 0);
    const y2 = to.y + (forward ? 0 : to.height);
    const mid = (y1 + y2) / 2;
    return `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
  }
  const forward = to.x > from.x;
  const x1 = from.x + (forward ? from.width : 0);
  const x2 = to.x + (forward ? 0 : to.width);
  const y1 = from.y + from.height / 2 + lane;
  const y2 = to.y + to.height / 2 + lane;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}
