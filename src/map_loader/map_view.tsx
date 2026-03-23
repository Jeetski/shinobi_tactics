import { useEffect, useMemo, useState } from 'react';
import { loadCollisionMask, type CollisionMask } from '../lib/collision_mask';
import type { LoadedStageScene } from './map_types';
import {
  default_projection_settings,
  flat_top_hex_to_world,
  get_depth_sort_value,
  get_perspective_scale,
  get_projected_hex_extents,
  project_world_to_screen,
} from '../projection';
import { build_character_layout, render_projected_character, render_projected_tile, TileRenderDefs } from '../rendering';
import { SpeechRenderer } from '../speech';
import './map_view.css';

type TileCoord = {
  q: number;
  r: number;
  s: number;
};

type MapViewProps = {
  scene: LoadedStageScene;
  active_speech_line?: {
    speaker: string;
    text: string;
  } | null;
  on_advance_speech?: () => void;
  highlighted_tiles?: Array<{
    q: number;
    r: number;
    s: number;
  }>;
};

const stage_padding_px = 18;
const frame_padding_px = 12;
const stroke_safe_padding = 50;

export function MapView({
  scene,
  active_speech_line = null,
  on_advance_speech,
  highlighted_tiles = [],
}: MapViewProps) {
  const [viewport_size, set_viewport_size] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [character_masks, set_character_masks] = useState<Record<string, CollisionMask>>({});
  const [hovered_tile, set_hovered_tile] = useState<TileCoord | null>(null);

  useEffect(() => {
    const update_viewport_size = () => {
      set_viewport_size({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', update_viewport_size);
    return () => window.removeEventListener('resize', update_viewport_size);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load_character_masks = async () => {
      const sprite_paths = Array.from(
        new Set(
          scene.characters.flatMap((character) => [
            character.defaults.sprite_front,
            character.defaults.sprite_back,
          ]),
        ),
      );

      const loaded_masks = await Promise.all(
        sprite_paths.map(async (sprite_path) => [sprite_path, await loadCollisionMask(sprite_path)] as const),
      );

      if (cancelled) {
        return;
      }

      set_character_masks(Object.fromEntries(loaded_masks));
    };

    void load_character_masks();

    return () => {
      cancelled = true;
    };
  }, [scene.characters]);

  const {
    renderables,
    view_box_x,
    view_box_y,
    view_box_width,
    view_box_height,
  } = useMemo(() => {
    const projected_hex_extents = get_projected_hex_extents(default_projection_settings);
    const projected_tiles = scene.map.tiles.map((tile) => {
      const is_highlighted = highlighted_tiles.some(
        (highlight) =>
          highlight.q === tile.coord.q &&
          highlight.r === tile.coord.r &&
          highlight.s === tile.coord.s,
      );
      const world_position = flat_top_hex_to_world(tile.coord, default_projection_settings.tile_radius);
      const screen_position = project_world_to_screen(world_position, default_projection_settings);

      return {
        ...tile,
        world_position,
        x: screen_position.x,
        y: screen_position.y,
        is_highlighted,
        is_hovered:
          hovered_tile?.q === tile.coord.q &&
          hovered_tile?.r === tile.coord.r &&
          hovered_tile?.s === tile.coord.s,
        depth: get_depth_sort_value(screen_position, world_position),
        render_kind: 'tile' as const,
      };
    });

    const projected_characters = scene.characters.map((character) => {
      const world_position = flat_top_hex_to_world(character.coord, default_projection_settings.tile_radius);
      const screen_position = project_world_to_screen(world_position, default_projection_settings);
      const sprite_path =
        character.facing === 'back' ? character.defaults.sprite_back : character.defaults.sprite_front;
      const sprite_mask = character_masks[sprite_path];
      const approximate_height =
        projected_hex_extents.max_y - projected_hex_extents.min_y;
      const perspective_scale = get_perspective_scale(screen_position.y, min_projected_y(scene), max_projected_y(scene), default_projection_settings);

      return {
        character,
        world_position,
        sprite_mask,
        speaker_key: character.defaults.id.split('/')[0],
        character_layout: build_character_layout(character, screen_position, perspective_scale, sprite_mask),
        x: screen_position.x,
        y: screen_position.y,
        depth: get_depth_sort_value(screen_position, world_position) + 500,
        top_extent: screen_position.y - approximate_height * (character.info.height_cm / 100) * character.scale * perspective_scale,
        bottom_extent: screen_position.y + approximate_height * 0.08,
        render_kind: 'character' as const,
      };
    });

    const min_x = Math.min(...projected_tiles.map((tile) => tile.x + projected_hex_extents.min_x));
    const max_x = Math.max(...projected_tiles.map((tile) => tile.x + projected_hex_extents.max_x));
    const min_y = Math.min(
      ...projected_tiles.map((tile) => tile.y + projected_hex_extents.min_y),
      ...projected_characters.map((character) => character.top_extent),
    );
    const max_y = Math.max(
      ...projected_tiles.map((tile) => tile.y + projected_hex_extents.max_y),
      ...projected_characters.map((character) => character.bottom_extent),
    );
    const y_span = Math.max(1, max_y - min_y);
    const renderables = [
      ...projected_tiles.map((tile) => ({
        ...tile,
        depth_ratio: (tile.y - min_y) / y_span,
      })),
      ...projected_characters,
    ]
      .map((renderable) => {
        if (renderable.render_kind === 'character') {
          return {
            ...renderable,
            perspective_scale: get_perspective_scale(renderable.y, min_y, max_y, default_projection_settings),
          };
        }

        return renderable;
      })
      .sort((left, right) => {
        if (left.render_kind !== right.render_kind) {
          return left.render_kind === 'tile' ? -1 : 1;
        }

        if (left.render_kind === 'tile' && right.render_kind === 'tile') {
          if (left.is_hovered !== right.is_hovered) {
            return left.is_hovered ? 1 : -1;
          }

          if (left.is_highlighted !== right.is_highlighted) {
            return left.is_highlighted ? 1 : -1;
          }
        }

        return left.depth - right.depth;
      });

    return {
      renderables,
      view_box_x: min_x - stroke_safe_padding,
      view_box_y: min_y - stroke_safe_padding,
      view_box_width: max_x - min_x + stroke_safe_padding * 2,
      view_box_height: max_y - min_y + stroke_safe_padding * 2,
    };
  }, [character_masks, highlighted_tiles, hovered_tile, scene]);

  const frame_width = viewport_size.width - stage_padding_px * 2;
  const frame_height = viewport_size.height - stage_padding_px * 2;
  const drawable_width = Math.max(0, frame_width - frame_padding_px * 2);
  const drawable_height = Math.max(0, frame_height - frame_padding_px * 2);
  const scale = Math.min(drawable_width / view_box_width, drawable_height / view_box_height);
  const svg_width = Math.floor(view_box_width * scale);
  const svg_height = Math.floor(view_box_height * scale);
  const active_speaker_name = active_speech_line
    ? {
        name:
          scene.characters.find(
            (character) => character.defaults.id.split('/')[0] === active_speech_line.speaker,
          )?.info.name ?? active_speech_line.speaker,
      }
    : null;

  return (
    <section className="map-view">
      <div
        className="map-view__frame"
        style={{
          width: `${svg_width + frame_padding_px * 2}px`,
          height: `${svg_height + frame_padding_px * 2}px`,
          padding: `${frame_padding_px}px`,
        }}
      >
        <svg
          className="map-view__svg"
          width={svg_width}
          height={svg_height}
          viewBox={`${view_box_x} ${view_box_y} ${view_box_width} ${view_box_height}`}
          role="img"
          aria-label={`${scene.map.id} hex map`}
        >
          <TileRenderDefs />

          {scene.map.tiles.map((tile) => (
            <polygon
              key={`hit:${tile.coord.q}:${tile.coord.r}:${tile.coord.s}`}
              points={get_tile_hit_points(tile.coord)}
              fill="transparent"
              stroke="none"
              pointerEvents="all"
              onMouseEnter={() => set_hovered_tile(tile.coord)}
              onMouseLeave={() => {
                set_hovered_tile((current) =>
                  current &&
                  current.q === tile.coord.q &&
                  current.r === tile.coord.r &&
                  current.s === tile.coord.s
                    ? null
                    : current,
                );
              }}
            />
          ))}

          <g filter="url(#platform-shadow-blur)">
            {renderables.map((renderable) => {
              if (renderable.render_kind !== 'tile') {
                return null;
              }

              return render_projected_tile({
                coord: renderable.coord,
                tile: renderable.tile,
                world_position: renderable.world_position,
                depth_ratio: renderable.depth_ratio,
                is_highlighted: renderable.is_highlighted,
                is_hovered: renderable.is_hovered,
              });
            })}
          </g>

          {renderables.map((renderable) => {
            if (renderable.render_kind === 'tile') {
              return render_projected_tile({
                coord: renderable.coord,
                tile: renderable.tile,
                world_position: renderable.world_position,
                depth_ratio: renderable.depth_ratio,
                is_highlighted: renderable.is_highlighted,
                is_hovered: renderable.is_hovered,
              });
            }

            return render_projected_character({
              character: renderable.character,
              world_position: renderable.world_position,
              perspective_scale: renderable.perspective_scale,
              sprite_mask: renderable.sprite_mask,
            });
          })}
        </svg>
        {active_speech_line && active_speaker_name && on_advance_speech ? (
          <div className="speech-layer">
            <SpeechRenderer
              speaker_name={active_speaker_name.name}
              text={active_speech_line.text}
              on_advance={on_advance_speech}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function min_projected_y(scene: LoadedStageScene) {
  return Math.min(
    ...scene.map.tiles.map((tile) => flat_top_hex_to_world(tile.coord, default_projection_settings.tile_radius).y),
  ) * default_projection_settings.vertical_scale;
}

function max_projected_y(scene: LoadedStageScene) {
  return Math.max(
    ...scene.map.tiles.map((tile) => flat_top_hex_to_world(tile.coord, default_projection_settings.tile_radius).y),
  ) * default_projection_settings.vertical_scale;
}

function get_tile_hit_points(coord: TileCoord) {
  const world_position = flat_top_hex_to_world(coord, default_projection_settings.tile_radius);

  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    const world_point = {
      x: world_position.x + default_projection_settings.tile_radius * Math.cos(angle),
      y: world_position.y + default_projection_settings.tile_radius * Math.sin(angle),
      z: world_position.z,
    };
    const screen_point = project_world_to_screen(world_point, default_projection_settings);
    return `${screen_point.x},${screen_point.y}`;
  }).join(' ');
}
