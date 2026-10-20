/** Design tokens mirrored from styles/tokens.css for use in WebGL and canvas code. */
export const COLORS = {
  bg0: '#08090b',
  bg1: '#0e1014',
  surface: '#15181d',
  text: '#e8eaed',
  text2: '#9aa0a8',
  hairline: 'rgba(255,255,255,0.08)',
  amber: '#ff8a1f',
  amberSoft: '#ffb347',
  whiteHot: '#fff3d6',
  cyan: '#3fd0ff',
  violet: '#9d8cff',
  exhaust: '#a39a92',
  steel: '#8a9099',
} as const;

/** Stroke colour code used everywhere: intake = cyan, compression = violet, power = amber, exhaust = grey. */
export const STROKE_COLORS = {
  intake: COLORS.cyan,
  compression: COLORS.violet,
  power: COLORS.amber,
  exhaust: COLORS.exhaust,
} as const;

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
};
