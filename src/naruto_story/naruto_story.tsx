import { useEffect, useMemo, useState } from 'react';
import { load_stage_scene, MapView, type LoadedStageScene } from '../map_loader';
import type { CharacterFacing, HexCoord } from '../map_loader/map_types';
import { build_path_family_variant, key_hex, type PathFamily, type PathVariant } from '../movement';
import { SceneBackground } from '../rendering';
import { load_dialogue_script, use_speech_controller, type SpeechLine } from '../speech';
import { default_projection_settings, flat_top_hex_to_world, type WorldPoint } from '../projection';
import './naruto_story.css';

const naruto_character_id = 'naruto_spawn';
const move_wait_key = 'naruto_move_to_center_tile';
const route_wait_key = 'naruto_route_to_training_tile';
const wide_route_wait_key = 'naruto_wide_route_to_far_tile';
const run_wait_key = 'naruto_run_back_to_training_tile';
const jump_wait_key = 'naruto_jump_to_far_tile';
const teleport_wait_key = 'naruto_teleport_to_training_tile';
const path_families: PathFamily[] = ['short', 'wide'];
const short_family_variants: PathVariant[] = ['shortest', 'left', 'right'];
const wide_family_variants: PathVariant[] = ['left', 'right'];
const walk_hop_duration_ms = 300;
const run_hop_duration_ms = 150;
const jump_hop_duration_ms = 210;
const walk_hop_height_world = 0.42;
const run_hop_height_world = 0.24;
const jump_hop_height_world = 1.18;

type MoveInputType = 'click' | 'hold' | 'right_click' | 'right_hold';
type MoveSpeed = 'walk' | 'run' | 'jump' | 'teleport';

type MovementObjective = {
  target: HexCoord;
  use_path_variants: boolean;
  required_family?: PathFamily;
  required_variants?: PathVariant[];
  required_input?: MoveInputType;
  move_speed?: MoveSpeed;
};

const movement_objectives: Record<string, MovementObjective> = {
  [move_wait_key]: {
    target: { q: 0, r: 0, s: 0 },
    use_path_variants: false,
    required_input: 'click',
    move_speed: 'walk',
  },
  [route_wait_key]: {
    target: { q: 2, r: -1, s: -1 },
    use_path_variants: true,
    required_family: 'short',
    required_variants: ['left', 'right'],
    required_input: 'click',
    move_speed: 'walk',
  },
  [wide_route_wait_key]: {
    target: { q: -2, r: 1, s: 1 },
    use_path_variants: true,
    required_family: 'wide',
    required_variants: ['left', 'right'],
    required_input: 'click',
    move_speed: 'walk',
  },
  [run_wait_key]: {
    target: { q: 2, r: -1, s: -1 },
    use_path_variants: true,
    required_input: 'hold',
    move_speed: 'run',
  },
  [jump_wait_key]: {
    target: { q: -2, r: 1, s: 1 },
    use_path_variants: true,
    required_input: 'right_click',
    move_speed: 'jump',
  },
  [teleport_wait_key]: {
    target: { q: 2, r: -1, s: -1 },
    use_path_variants: true,
    required_input: 'right_hold',
    move_speed: 'teleport',
  },
};

export function NarutoStory() {
  const [stage_scene, set_stage_scene] = useState<LoadedStageScene | null>(null);
  const [dialogue_lines, set_dialogue_lines] = useState<SpeechLine[]>([]);
  const [naruto_coord_override, set_naruto_coord_override] = useState<HexCoord | null>(null);
  const [naruto_world_override, set_naruto_world_override] = useState<WorldPoint | null>(null);
  const [naruto_facing_override, set_naruto_facing_override] = useState<CharacterFacing | null>(null);
  const [hovered_destination_tile, set_hovered_destination_tile] = useState<HexCoord | null>(null);
  const [active_path_family, set_active_path_family] = useState<PathFamily>('short');
  const [active_path_variant, set_active_path_variant] = useState<PathVariant>('shortest');
  const [is_moving_naruto, set_is_moving_naruto] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [scene_audio] = useState(() => new Audio());
  const { speech_state, advance, fulfill_wait } = use_speech_controller(dialogue_lines);

  useEffect(() => {
    let cancelled = false;

    const load_scene = async () => {
      try {
        const map = await load_stage_scene('/resources/stages/academy/yard/naruto_story/level_1');
        if (!cancelled) {
          set_stage_scene(map);
        }
      } catch (error) {
        if (!cancelled) {
          set_error_message(error instanceof Error ? error.message : 'Failed to load stage map.');
        }
      }
    };

    void load_scene();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load_dialogue = async () => {
      if (!stage_scene?.dialogue_path) {
        set_dialogue_lines([]);
        return;
      }

      try {
        const lines = await load_dialogue_script(stage_scene.dialogue_path);
        if (!cancelled) {
          set_dialogue_lines(lines);
        }
      } catch (error) {
        if (!cancelled) {
          set_error_message(error instanceof Error ? error.message : 'Failed to load scene dialogue.');
        }
      }
    };

    void load_dialogue();

    return () => {
      cancelled = true;
    };
  }, [stage_scene?.dialogue_path]);

  useEffect(() => {
    if (!stage_scene?.music_path) {
      return;
    }

    const try_play = async () => {
      try {
        await scene_audio.play();
      } catch {
        // Ignore autoplay failures. User interaction from the menu usually unlocks playback.
      }
    };

    scene_audio.src = stage_scene.music_path;
    scene_audio.loop = true;
    scene_audio.volume = 0.42;
    scene_audio.load();
    void try_play();

    const unlock_playback = async () => {
      try {
        await scene_audio.play();
      } catch {
        // Ignore repeated blocked attempts.
      }
    };

    window.addEventListener('pointerdown', unlock_playback, { passive: true });
    window.addEventListener('keydown', unlock_playback);

    return () => {
      scene_audio.pause();
      scene_audio.currentTime = 0;
      window.removeEventListener('pointerdown', unlock_playback);
      window.removeEventListener('keydown', unlock_playback);
    };
  }, [scene_audio, stage_scene?.music_path]);

  const active_objective = speech_state.wait_key
    ? movement_objectives[speech_state.wait_key] ?? null
    : null;
  const show_path_preview =
    Boolean(active_objective) &&
    !speech_state.is_wait_satisfied;

  useEffect(() => {
    set_hovered_destination_tile(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
  }, [speech_state.wait_key]);

  const rendered_scene = useMemo(() => {
    if (!stage_scene) {
      return null;
    }

    return {
      ...stage_scene,
      characters: stage_scene.characters.map((character) => {
        if (character.id !== naruto_character_id || !naruto_coord_override) {
          return naruto_facing_override && character.id === naruto_character_id
            ? {
                ...character,
                facing: naruto_facing_override,
              }
            : character;
        }

        return {
          ...character,
          coord: naruto_coord_override,
          facing: naruto_facing_override ?? character.facing,
        };
      }),
    };
  }, [naruto_coord_override, naruto_facing_override, stage_scene]);

  const character_world_overrides = useMemo(() => {
    if (!naruto_world_override) {
      return {} as Record<string, WorldPoint>;
    }

    return {
      [naruto_character_id]: naruto_world_override,
    } as Record<string, WorldPoint>;
  }, [naruto_world_override]);

  const naruto_current_coord = useMemo(() => {
    if (!stage_scene) {
      return null;
    }

    const naruto = stage_scene.characters.find((character) => character.id === naruto_character_id);
    if (!naruto) {
      return null;
    }

    return naruto_coord_override ?? naruto.coord;
  }, [naruto_coord_override, stage_scene]);

  const active_preview_path = useMemo(() => {
    if (!stage_scene || !naruto_current_coord || !active_objective || !hovered_destination_tile) {
      return null;
    }

    const matches_target =
      hovered_destination_tile.q === active_objective.target.q &&
      hovered_destination_tile.r === active_objective.target.r &&
      hovered_destination_tile.s === active_objective.target.s;

    if (!matches_target) {
      return null;
    }

    return build_path_family_variant({
      start: naruto_current_coord,
      goal: hovered_destination_tile,
      tiles: stage_scene.map.tiles,
      family: active_objective.use_path_variants ? active_path_family : 'short',
      variant: active_objective.use_path_variants ? active_path_variant : 'shortest',
    });
  }, [active_objective, active_path_family, active_path_variant, hovered_destination_tile, naruto_current_coord, stage_scene]);

  const highlighted_tiles = useMemo(() => {
    if (!active_objective || speech_state.is_wait_satisfied) {
      return [];
    }

    return [active_objective.target];
  }, [active_objective, speech_state.is_wait_satisfied]);

  const hop_along_path = (path: HexCoord[], wait_key_to_fulfill: string, move_speed: MoveSpeed) => {
    if (!stage_scene || path.length < 2) {
      return;
    }

    set_is_moving_naruto(true);
    const segment_duration_ms =
      move_speed === 'run'
        ? run_hop_duration_ms
        : move_speed === 'jump'
          ? jump_hop_duration_ms
          : walk_hop_duration_ms;
    const hop_height_world =
      move_speed === 'run'
        ? run_hop_height_world
        : move_speed === 'jump'
          ? jump_hop_height_world
          : walk_hop_height_world;

    const step_through = (segment_index: number) => {
      const from_coord = path[segment_index];
      const to_coord = path[segment_index + 1];
      if (!from_coord || !to_coord) {
        set_naruto_world_override(null);
        set_naruto_coord_override(path[path.length - 1] ?? null);
        set_is_moving_naruto(false);
        fulfill_wait(wait_key_to_fulfill);
        return;
      }

      const from_world = flat_top_hex_to_world(from_coord, default_projection_settings.tile_radius);
      const to_world = flat_top_hex_to_world(to_coord, default_projection_settings.tile_radius);
      const step_facing = get_facing_for_step(from_coord, to_coord);
      const start_time = window.performance.now();

      set_naruto_facing_override(step_facing);

      const animate_step = (now: number) => {
        const raw_progress = (now - start_time) / segment_duration_ms;
        const progress = Math.min(1, Math.max(0, raw_progress));
        const hop_arc = Math.sin(progress * Math.PI) * hop_height_world;

        set_naruto_world_override({
          x: from_world.x + (to_world.x - from_world.x) * progress,
          y: from_world.y + (to_world.y - from_world.y) * progress,
          z: from_world.z + (to_world.z - from_world.z) * progress + hop_arc,
        });

        if (progress < 1) {
          window.requestAnimationFrame(animate_step);
          return;
        }

        set_naruto_world_override(null);
        set_naruto_coord_override(to_coord);

        if (segment_index + 1 >= path.length - 1) {
          set_is_moving_naruto(false);
          fulfill_wait(wait_key_to_fulfill);
          return;
        }

        step_through(segment_index + 1);
      };

      window.requestAnimationFrame(animate_step);
    };

    step_through(0);
  };

  const teleport_to_coord = (coord: HexCoord, wait_key_to_fulfill: string) => {
    if (!stage_scene) {
      return;
    }

    if (!naruto_current_coord) {
      return;
    }

    set_is_moving_naruto(true);
    set_naruto_facing_override(get_facing_for_step(naruto_current_coord, coord));
    set_naruto_world_override(null);
    set_naruto_coord_override(coord);

    window.setTimeout(() => {
      set_is_moving_naruto(false);
      fulfill_wait(wait_key_to_fulfill);
    }, 80);
  };

  const clear_path_preview_selection = () => {
    set_hovered_destination_tile(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
  };

  const attempt_move = (coord: HexCoord, input_type: MoveInputType) => {
    if (!stage_scene || !active_objective || speech_state.is_wait_satisfied || is_moving_naruto || !naruto_current_coord) {
      return;
    }

    const is_target_tile =
      coord.q === active_objective.target.q &&
      coord.r === active_objective.target.r &&
      coord.s === active_objective.target.s;

    if (!is_target_tile) {
      return;
    }

    const input_matches = (active_objective.required_input ?? 'click') === input_type;
    if (!input_matches) {
      return;
    }

    if (input_type === 'right_click' && active_objective.move_speed === 'jump') {
      clear_path_preview_selection();
      hop_along_path(
        [naruto_current_coord, active_objective.target],
        speech_state.wait_key ?? jump_wait_key,
        'jump',
      );
      return;
    }

    if (input_type === 'right_hold' && active_objective.move_speed === 'teleport') {
      clear_path_preview_selection();
      teleport_to_coord(
        active_objective.target,
        speech_state.wait_key ?? teleport_wait_key,
      );
      return;
    }

    if (active_objective.use_path_variants) {
      if (!active_preview_path || active_preview_path.length < 2) {
        return;
      }

      const family_matches = active_objective.required_family
        ? active_path_family === active_objective.required_family
        : true;
      const variant_matches = active_objective.required_variants
        ? active_objective.required_variants.includes(active_path_variant)
        : true;

      if (!family_matches || !variant_matches) {
        return;
      }

      clear_path_preview_selection();
      hop_along_path(
        active_preview_path,
        speech_state.wait_key ?? route_wait_key,
        active_objective.move_speed ?? 'walk',
      );
      return;
    }

    clear_path_preview_selection();
    hop_along_path(
      [naruto_current_coord, active_objective.target],
      speech_state.wait_key ?? move_wait_key,
      active_objective.move_speed ?? 'walk',
    );
  };

  const handle_tile_click = (coord: HexCoord) => {
    attempt_move(coord, 'click');
  };

  const handle_tile_hold = (coord: HexCoord) => {
    attempt_move(coord, 'hold');
  };

  const handle_tile_right_click = (coord: HexCoord) => {
    attempt_move(coord, 'right_click');
  };

  const handle_tile_right_hold = (coord: HexCoord) => {
    attempt_move(coord, 'right_hold');
  };

  const handle_tile_hover = (coord: HexCoord | null) => {
    if (!show_path_preview) {
      set_hovered_destination_tile(null);
      return;
    }

    if (
      coord &&
      hovered_destination_tile &&
      key_hex(coord) !== key_hex(hovered_destination_tile)
    ) {
      set_active_path_family('short');
      set_active_path_variant('shortest');
    }

    if (!coord) {
      set_active_path_family('short');
      set_active_path_variant('shortest');
    }

    set_hovered_destination_tile(coord);
  };

  const handle_tile_wheel = (coord: HexCoord, delta_y: number) => {
    if (!show_path_preview || !active_objective?.use_path_variants) {
      return;
    }

    const is_target_tile =
      coord.q === active_objective.target.q &&
      coord.r === active_objective.target.r &&
      coord.s === active_objective.target.s;

    if (!is_target_tile) {
      return;
    }

    set_active_path_variant((current) => {
      const available_variants =
        active_path_family === 'wide' ? wide_family_variants : short_family_variants;
      const safe_current = available_variants.includes(current)
        ? current
        : available_variants[0];
      const current_index = available_variants.indexOf(safe_current);
      const next_index =
        delta_y > 0
          ? (current_index + 1) % available_variants.length
          : (current_index - 1 + available_variants.length) % available_variants.length;
      return available_variants[next_index];
    });
  };

  const handle_tile_middle_click = (coord: HexCoord) => {
    if (!show_path_preview || !active_objective?.use_path_variants) {
      return;
    }

    const is_target_tile =
      coord.q === active_objective.target.q &&
      coord.r === active_objective.target.r &&
      coord.s === active_objective.target.s;

    if (!is_target_tile) {
      return;
    }

    set_active_path_family((current) => {
      const current_index = path_families.indexOf(current);
      const next_family = path_families[(current_index + 1) % path_families.length];
      set_active_path_variant((current_variant) => {
        if (next_family === 'wide') {
          return current_variant === 'shortest' ? 'left' : current_variant;
        }

        return current_variant;
      });
      return next_family;
    });
  };

  return (
    <main className="naruto-story">
      {rendered_scene ? <SceneBackground preset={rendered_scene.background_preset} /> : null}
      <div className="naruto-story__content">
        {error_message ? <p className="naruto-story__status">{error_message}</p> : null}
        {!error_message && !stage_scene ? <p className="naruto-story__status">Loading academy yard...</p> : null}
        {rendered_scene ? (
          <MapView
            scene={rendered_scene}
            active_speech_line={
              speech_state.active_line
                ? {
                    speaker: speech_state.active_line.speaker,
                    text: speech_state.visible_text,
                  }
                : null
            }
            on_advance_speech={advance}
            highlighted_tiles={highlighted_tiles}
            on_tile_click={handle_tile_click}
            on_tile_hold={handle_tile_hold}
            on_tile_right_click={handle_tile_right_click}
            on_tile_right_hold={handle_tile_right_hold}
            on_tile_hover={handle_tile_hover}
            on_tile_wheel={handle_tile_wheel}
            on_tile_middle_click={handle_tile_middle_click}
            character_world_overrides={character_world_overrides}
            character_facing_overrides={
              naruto_facing_override
                ? { [naruto_character_id]: naruto_facing_override }
                : {}
            }
            path_preview={
              active_preview_path
                ? {
                    path: active_preview_path,
                    family: active_path_family,
                  }
                : null
            }
          />
        ) : null}
      </div>
    </main>
  );
}

function get_facing_for_step(from: HexCoord, to: HexCoord): CharacterFacing {
  const from_world = flat_top_hex_to_world(from, default_projection_settings.tile_radius);
  const to_world = flat_top_hex_to_world(to, default_projection_settings.tile_radius);
  const delta_x = to_world.x - from_world.x;
  const delta_y = to_world.y - from_world.y;

  if (Math.abs(delta_x) >= Math.abs(delta_y)) {
    return delta_x >= 0 ? 'right' : 'left';
  }

  return delta_y >= 0 ? 'front' : 'back';
}
