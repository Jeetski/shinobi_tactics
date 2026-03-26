import {
  default_projection_settings,
  project_world_to_screen,
} from '../projection';
import type { CollisionMask } from '../lib/collision_mask';
import type { LoadedStageProp } from '../map_loader/map_types';
import type { WorldPoint } from '../projection';
import { build_prop_layout } from '../entities/prop_layout';

type RenderableProp = {
  prop: LoadedStageProp;
  world_position: WorldPoint;
  perspective_scale: number;
  sprite_mask?: CollisionMask;
};

export function render_projected_prop({
  prop,
  world_position,
  perspective_scale,
  sprite_mask,
}: RenderableProp) {
  const screen_position = project_world_to_screen(world_position, default_projection_settings);
  const layout = build_prop_layout(prop, screen_position, perspective_scale, sprite_mask);

  return (
    <g key={prop.id} pointerEvents="none">
      <ellipse
        cx={layout.anchor_x}
        cy={layout.shadow_y}
        rx={layout.shadow_width / 2}
        ry={layout.shadow_height / 2}
        fill="rgba(0, 0, 0, 0.34)"
        filter="url(#tile-shadow-blur)"
      />
      <image
        href={prop.sprite}
        x={layout.sprite_x}
        y={layout.sprite_y}
        width={layout.sprite_width}
        height={layout.sprite_height}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}
