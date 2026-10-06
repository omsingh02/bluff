/**
 * Positions for `n` opponents along the top arc of the table, as percentages of the arc area
 * (x of its width, y of its height). 270° is straight up; fewer opponents get a tighter arc so
 * two seats don't end up in far corners.
 */
const SPAN_DEG = [0, 0, 70, 104, 124, 140, 150, 158];

export interface ArcPoint {
  x: number;
  y: number;
}

export function arcPositions(n: number): ArcPoint[] {
  if (n <= 0) return [];
  const cx = 50;
  const cy = 58;
  const rx = 42;
  const ry = 39;
  if (n === 1) return [{ x: cx, y: cy - ry }];
  const span = SPAN_DEG[Math.min(n, SPAN_DEG.length - 1)];
  const start = 270 - span / 2;
  return Array.from({ length: n }, (_, i) => {
    const theta = ((start + (i * span) / (n - 1)) * Math.PI) / 180;
    return { x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) };
  });
}
