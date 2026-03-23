import {
  default_projection_settings,
  project_world_to_screen,
} from '../projection';
import type { CollisionMask } from '../lib/collision_mask';
import type { LoadedCharacter } from '../map_loader/map_types';
import type { WorldPoint } from '../projection';
import { build_character_layout } from '../entities/character_layout';

type RenderableCharacter = {
  character: LoadedCharacter;
  world_position: WorldPoint;
  perspective_scale: number;
  sprite_mask?: CollisionMask;
};

export function render_projected_character({
  character,
  world_position,
  perspective_scale,
  sprite_mask,
}: RenderableCharacter) {
  const screen_position = project_world_to_screen(world_position, default_projection_settings);
  const sprite_path =
    character.facing === 'back' ? character.defaults.sprite_back : character.defaults.sprite_front;
  const layout = build_character_layout(character, screen_position, perspective_scale, sprite_mask);

  return (
    <g key={character.id} pointerEvents="none">
      <ellipse
        cx={layout.feet_x}
        cy={layout.shadow_y}
        rx={layout.shadow_width / 2}
        ry={layout.shadow_height / 2}
        fill="rgba(0, 0, 0, 0.34)"
        filter="url(#tile-shadow-blur)"
      />
      <image
        href={sprite_path}
        x={layout.sprite_x}
        y={layout.sprite_y}
        width={layout.sprite_width}
        height={layout.sprite_height}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}

export { build_character_layout };
