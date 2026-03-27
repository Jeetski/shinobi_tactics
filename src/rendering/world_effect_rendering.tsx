import { default_projection_settings, get_projected_hex_extents, project_world_to_screen } from '../projection';
import type { WorldPoint } from '../projection';

export type WorldEffectRenderable = {
  id: string;
  kind: 'chakra_burst' | 'smoke_puff';
  world_position: WorldPoint;
  size_m: number;
  created_at_ms: number;
  duration_ms: number;
};

const projected_hex_extents = get_projected_hex_extents(default_projection_settings);
const projected_tile_height = projected_hex_extents.max_y - projected_hex_extents.min_y;

export function render_projected_world_effect(
  effect: WorldEffectRenderable,
  perspective_scale: number,
  now_ms: number,
) {
  const screen_position = project_world_to_screen(effect.world_position, default_projection_settings);
  const progress = Math.min(
    1,
    Math.max(0, (now_ms - effect.created_at_ms) / Math.max(1, effect.duration_ms)),
  );
  const fade_in = Math.min(1, progress / 0.14);
  const fade_out = progress <= 0.66 ? 1 : Math.max(0, 1 - (progress - 0.66) / 0.34);
  const opacity = fade_in * fade_out;
  const scale = 0.45 + progress * 0.95;
  const size_px = projected_tile_height * effect.size_m * perspective_scale * scale;

  if (effect.kind === 'chakra_burst') {
    const outer_radius = size_px * 0.46;
    const mid_radius = size_px * 0.32;
    const inner_radius = size_px * 0.16;
    const streak_inner = size_px * 0.2;
    const streak_outer = size_px * 0.62;

    return (
      <g
        key={effect.id}
        transform={`translate(${screen_position.x} ${screen_position.y})`}
        pointerEvents="none"
        opacity={opacity}
      >
        <circle r={outer_radius} fill="rgb(70, 168, 255)" fillOpacity="0.12" />
        <circle
          r={mid_radius}
          fill="rgb(88, 184, 255)"
          fillOpacity="0.18"
          stroke="rgb(164, 235, 255)"
          strokeOpacity="0.96"
          strokeWidth={Math.max(3, size_px * 0.04)}
        />
        <circle r={inner_radius} fill="rgb(120, 214, 255)" fillOpacity="0.3" />
        {Array.from({ length: 8 }, (_, index) => (
          <path
            key={`${effect.id}:streak:${index}`}
            d={`M 0 ${-streak_inner} L 0 ${-streak_outer}`}
            transform={`rotate(${index * 45})`}
            stroke="rgb(150, 232, 255)"
            strokeWidth={Math.max(2.4, size_px * 0.026)}
            strokeLinecap="round"
            opacity="0.96"
          />
        ))}
      </g>
    );
  }

  const puff_radius = size_px * 0.18;
  const smoke_circles = [
    { x: 0, y: -size_px * 0.08, r: puff_radius * 1.35, opacity: 0.96 },
    { x: -size_px * 0.2, y: size_px * 0.03, r: puff_radius * 1.08, opacity: 0.84 },
    { x: size_px * 0.22, y: 0, r: puff_radius * 1.12, opacity: 0.86 },
    { x: -size_px * 0.1, y: -size_px * 0.2, r: puff_radius, opacity: 0.76 },
    { x: size_px * 0.1, y: -size_px * 0.22, r: puff_radius * 0.92, opacity: 0.72 },
  ];

  return (
      <g
        key={effect.id}
        transform={`translate(${screen_position.x} ${screen_position.y})`}
        pointerEvents="none"
        opacity={opacity}
      >
      {smoke_circles.map((circle, index) => (
        <circle
          key={`${effect.id}:smoke:${index}`}
          cx={circle.x}
          cy={circle.y}
          r={circle.r}
          fill="rgb(255, 255, 255)"
          fillOpacity={circle.opacity}
        />
      ))}
    </g>
  );
}
