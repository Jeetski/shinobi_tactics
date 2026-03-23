export const grid_size = 4;

export type LayoutItemKey = 'brand' | 'paper' | 'scroll' | 'scroll_two' | 'arrow_up' | 'arrow_down';

export type LayoutPosition = {
  x: number;
  y: number;
};

export type LayoutPositions = Record<LayoutItemKey, LayoutPosition>;

export const default_layout_positions: LayoutPositions = {
  brand: { x: 50, y: 34 },
  paper: { x: 50.92, y: 57.44 },
  scroll: { x: 57.55, y: 61.07 },
  scroll_two: { x: 67.8, y: 60.63 },
  arrow_up: { x: 50.93, y: 49.5 },
  arrow_down: { x: 50.94, y: 72.4 },
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function snap_to_grid(value: number) {
  return Math.round(value / grid_size) * grid_size;
}

export async function copy_layout_css(layout_positions: LayoutPositions) {
  const css = build_layout_css(layout_positions);

  try {
    await navigator.clipboard.writeText(css);
    return true;
  } catch {
    window.console.info(css);
    return false;
  }
}

export function build_layout_css(layout_positions: LayoutPositions) {
  return [
    '.brand-item {',
    `  left: ${layout_positions.brand.x.toFixed(2)}%;`,
    `  top: ${layout_positions.brand.y.toFixed(2)}%;`,
    '}',
    '',
    '.paper-item {',
    `  left: ${layout_positions.paper.x.toFixed(2)}%;`,
    `  top: ${layout_positions.paper.y.toFixed(2)}%;`,
    '}',
    '',
    '.scroll-item {',
    `  left: ${layout_positions.scroll.x.toFixed(2)}%;`,
    `  top: ${layout_positions.scroll.y.toFixed(2)}%;`,
    '}',
    '',
    '.scroll-two-item {',
    `  left: ${layout_positions.scroll_two.x.toFixed(2)}%;`,
    `  top: ${layout_positions.scroll_two.y.toFixed(2)}%;`,
    '}',
    '',
    '.arrow-up-item {',
    `  left: ${layout_positions.arrow_up.x.toFixed(2)}%;`,
    `  top: ${layout_positions.arrow_up.y.toFixed(2)}%;`,
    '}',
    '',
    '.arrow-down-item {',
    `  left: ${layout_positions.arrow_down.x.toFixed(2)}%;`,
    `  top: ${layout_positions.arrow_down.y.toFixed(2)}%;`,
    '}',
  ].join('\n');
}
