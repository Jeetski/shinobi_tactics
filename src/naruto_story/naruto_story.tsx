import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { InventoryBar } from '../hud/inventory_bar';
import { UnitStatusPanel } from '../hud/unit_status_panel';
import { play_beep, useMusicController } from '../audio';
import { load_stage_scene, MapView, type LoadedStageScene } from '../map_loader';
import type { CharacterFacing, HexCoord, LoadedStageProp } from '../map_loader/map_types';
import { build_path_family_variant, build_shortest_path, key_hex, type PathFamily, type PathVariant } from '../movement';
import { SceneBackground } from '../rendering';
import { load_dialogue_script, use_speech_controller, type SpeechLine } from '../speech';
import { default_projection_settings, flat_top_hex_to_world, type WorldPoint } from '../projection';
import './naruto_story.css';

const naruto_character_id = 'naruto_spawn';
const iruka_character_id = 'iruka_spawn';
const move_wait_key = 'naruto_move_to_center_tile';
const route_wait_key = 'naruto_route_to_training_tile';
const wide_route_wait_key = 'naruto_wide_route_to_far_tile';
const run_wait_key = 'naruto_run_back_to_training_tile';
const jump_wait_key = 'naruto_jump_to_far_tile';
const teleport_wait_key = 'naruto_teleport_to_training_tile';
const iruka_move_wait_key = 'iruka_move_out_of_the_way';
const throw_position_wait_key = 'naruto_move_to_throw_position';
const throw_wait_key = 'naruto_throw_shuriken_straight';
const throw_short_arc_wait_key = 'naruto_throw_shuriken_short_arc';
const throw_wide_arc_wait_key = 'naruto_throw_shuriken_wide_arc';
const challenge_wait_key = 'naruto_shuriken_challenge';
const iruka_side_coord: HexCoord = { q: 3, r: -1, s: -2 };
const path_families: PathFamily[] = ['short', 'wide'];
const short_family_variants: PathVariant[] = ['shortest', 'left', 'right'];
const wide_family_variants: PathVariant[] = ['left', 'right'];
const walk_hop_duration_ms = 300;
const run_hop_duration_ms = 150;
const jump_hop_duration_ms = 210;
const walk_hop_height_world = 0.42;
const run_hop_height_world = 0.24;
const jump_hop_height_world = 1.18;
const shuriken_icon_path = '/resources/weapons/shuriken.png';
const shuriken_stuck_icon_paths = [
  '/resources/weapons/shuriken_stuck_1.png',
  '/resources/weapons/shuriken_stuck_2.png',
] as const;
const shuriken_projectile_size_m = 0.12;
const challenge_round_count = 7;
const challenge_duration_ms = 30_000;
const challenge_countdown_ms = 4_000;
const challenge_now_tick_ms = 90;
const dance_music_path = '/resources/music/dance.mp3';
const success_music_path = '/resources/music/ill_do_it_right.mp3';

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

type ThrowObjective = {
  target_prop_id: string;
  required_item: 'shuriken';
  use_path_variants?: boolean;
  required_family?: PathFamily;
  required_variants?: PathVariant[];
};

type ActiveProjectile = {
  id: string;
  sprite: string;
  world_position: WorldPoint;
  size_m: number;
  rotation_deg: number;
};

type PropEffect = {
  id: string;
  prop_id: string;
  sprite: string;
  size_m: number;
  rotation_deg: number;
  offset_x: number;
  offset_y: number;
  offset_z: number;
};

type ChallengePhase = 'inactive' | 'countdown' | 'move' | 'throw';

type ChallengeState = {
  phase: ChallengePhase;
  round_index: number;
  countdown_started_at_ms: number | null;
  timer_started_at_ms: number | null;
  destination_tile: HexCoord | null;
  target_prop_id: string | null;
};

type OverrideDialogueLine = {
  speaker: string;
  text: string;
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
  [throw_position_wait_key]: {
    target: { q: 0, r: 1, s: -1 },
    use_path_variants: false,
    required_input: 'click',
    move_speed: 'walk',
  },
};

const throw_objectives: Record<string, ThrowObjective> = {
  [throw_wait_key]: {
    target_prop_id: 'target_post_02',
    required_item: 'shuriken',
  },
  [throw_short_arc_wait_key]: {
    target_prop_id: 'target_post_03',
    required_item: 'shuriken',
    use_path_variants: true,
    required_family: 'short',
    required_variants: ['left', 'right'],
  },
  [throw_wide_arc_wait_key]: {
    target_prop_id: 'target_post_01',
    required_item: 'shuriken',
    use_path_variants: true,
    required_family: 'wide',
    required_variants: ['left', 'right'],
  },
};

export function NarutoStory() {
  const [stage_scene, set_stage_scene] = useState<LoadedStageScene | null>(null);
  const [dialogue_lines, set_dialogue_lines] = useState<SpeechLine[]>([]);
  const [character_coord_overrides, set_character_coord_overrides] = useState<Record<string, HexCoord>>({});
  const [character_world_overrides, set_character_world_overrides] = useState<Record<string, WorldPoint>>({});
  const [character_facing_overrides, set_character_facing_overrides] = useState<Record<string, CharacterFacing>>({});
  const [moving_characters, set_moving_characters] = useState<Record<string, true>>({});
  const [hovered_destination_tile, set_hovered_destination_tile] = useState<HexCoord | null>(null);
  const [hovered_target_prop_id, set_hovered_target_prop_id] = useState<string | null>(null);
  const [active_path_family, set_active_path_family] = useState<PathFamily>('short');
  const [active_path_variant, set_active_path_variant] = useState<PathVariant>('shortest');
  const [selected_inventory_index, set_selected_inventory_index] = useState<number | null>(null);
  const [shuriken_count, set_shuriken_count] = useState(10);
  const [inventory_unlocked, set_inventory_unlocked] = useState(false);
  const [active_projectile, set_active_projectile] = useState<ActiveProjectile | null>(null);
  const [prop_effects, set_prop_effects] = useState<PropEffect[]>([]);
  const [challenge_state, set_challenge_state] = useState<ChallengeState>({
    phase: 'inactive',
    round_index: 0,
    countdown_started_at_ms: null,
    timer_started_at_ms: null,
    destination_tile: null,
    target_prop_id: null,
  });
  const [challenge_now_ms, set_challenge_now_ms] = useState(0);
  const [challenge_success_banner_visible, set_challenge_success_banner_visible] = useState(false);
  const [override_dialogue_lines, set_override_dialogue_lines] = useState<OverrideDialogueLine[] | null>(null);
  const [override_dialogue_index, set_override_dialogue_index] = useState(0);
  const [error_message, set_error_message] = useState<string | null>(null);
  const override_dialogue_finish_ref = useRef<(() => void) | null>(null);
  const challenge_runtime_ref = useRef({
    active: false,
    override: false,
  });
  const countdown_beep_stage_ref = useRef<string | null>(null);
  const danger_beep_step_ref = useRef<number | null>(null);
  const { play_looping_track, play_stinger } = useMusicController(0.42);
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

  const active_objective = speech_state.wait_key
    ? movement_objectives[speech_state.wait_key] ?? null
    : null;
  const active_throw_objective = speech_state.wait_key
    ? throw_objectives[speech_state.wait_key] ?? null
    : null;
  const is_challenge_active = speech_state.wait_key === challenge_wait_key && !speech_state.is_wait_satisfied;
  const is_override_dialogue_active = Boolean(override_dialogue_lines);
  const is_naruto_moving = Boolean(moving_characters[naruto_character_id]);
  const show_path_preview =
    (Boolean(active_objective) || Boolean(active_throw_objective) || is_challenge_active) &&
    !speech_state.is_wait_satisfied &&
    !is_naruto_moving &&
    !is_override_dialogue_active;

  useEffect(() => {
    if (!stage_scene?.music_path || is_challenge_active || challenge_success_banner_visible) {
      return;
    }

    void play_looping_track(stage_scene.music_path);
  }, [challenge_success_banner_visible, is_challenge_active, play_looping_track, stage_scene?.music_path]);

  useEffect(() => {
    challenge_runtime_ref.current = {
      active: is_challenge_active,
      override: is_override_dialogue_active,
    };
  }, [is_challenge_active, is_override_dialogue_active]);

  useEffect(() => {
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
  }, [speech_state.wait_key]);

  useEffect(() => {
    const active_text = speech_state.active_line?.text ?? '';
    if (
      active_text.includes('shuriken') ||
      active_text.includes('target practice') ||
      speech_state.wait_key === throw_position_wait_key ||
      speech_state.wait_key === throw_wait_key
    ) {
      set_inventory_unlocked(true);
    }
  }, [speech_state.active_line?.text, speech_state.wait_key]);

  useEffect(() => {
    if (!is_challenge_active) {
      set_challenge_state({
        phase: 'inactive',
        round_index: 0,
        countdown_started_at_ms: null,
        timer_started_at_ms: null,
        destination_tile: null,
        target_prop_id: null,
      });
      set_override_dialogue_lines(null);
      set_override_dialogue_index(0);
      return;
    }

    setInventoryForChallengeIfNeeded();
    startChallengeAttempt();
  }, [is_challenge_active]);

  useEffect(() => {
    if (!is_challenge_active || challenge_state.phase === 'inactive' || is_override_dialogue_active) {
      return;
    }

    const interval_id = window.setInterval(() => {
      set_challenge_now_ms(window.performance.now());
    }, challenge_now_tick_ms);

    return () => window.clearInterval(interval_id);
  }, [challenge_state.phase, is_challenge_active, is_override_dialogue_active]);

  useEffect(() => {
    if (!is_challenge_active || challenge_state.phase !== 'countdown') {
      countdown_beep_stage_ref.current = null;
      return;
    }

    void play_looping_track(dance_music_path, { restart: true });
  }, [challenge_state.phase, is_challenge_active, play_looping_track]);

  const rendered_scene = useMemo(() => {
    if (!stage_scene) {
      return null;
    }

    return {
      ...stage_scene,
      characters: stage_scene.characters.map((character) => ({
        ...character,
        coord: character_coord_overrides[character.id] ?? character.coord,
        facing: character_facing_overrides[character.id] ?? character.facing,
      })),
    };
  }, [character_coord_overrides, character_facing_overrides, stage_scene]);

  const naruto_current_coord = useMemo(() => {
    return get_character_current_coord(stage_scene, character_coord_overrides, naruto_character_id);
  }, [character_coord_overrides, stage_scene]);
  const iruka_current_coord = useMemo(() => {
    return get_character_current_coord(stage_scene, character_coord_overrides, iruka_character_id);
  }, [character_coord_overrides, stage_scene]);
  const target_posts = useMemo(
    () => stage_scene?.props.filter((prop) => prop.kind === 'target_post') ?? [],
    [stage_scene],
  );
  const challenge_blocked_tile_keys = useMemo(() => {
    if (!stage_scene) {
      return new Set<string>();
    }

    const blocked = new Set(stage_scene.props.map((prop) => key_hex(prop.coord)));
    if (iruka_current_coord) {
      blocked.add(key_hex(iruka_current_coord));
    }

    return blocked;
  }, [iruka_current_coord, stage_scene]);

  const inventory_slots = useMemo(
    () => [
      { icon: shuriken_icon_path, count: shuriken_count },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    [shuriken_count],
  );

  const selected_inventory_item =
    selected_inventory_index !== null
      ? inventory_slots[selected_inventory_index]
      : null;
  const naruto_status_panel = useMemo(() => {
    const naruto = stage_scene?.characters.find((character) => character.id === naruto_character_id);
    if (!naruto) {
      return null;
    }

    return {
      avatar: `/resources/characters/${naruto.defaults.id}/sprites/neutral_avatar.png`,
      name: naruto.info.name,
      bars: [
        { label: 'stamina', value: 1, tone: 'stamina' as const },
        { label: 'chakra_infused', value: 1, tone: 'chakra_infused' as const },
        { label: 'chakra_pool', value: 1, tone: 'chakra_pool' as const },
      ],
    };
  }, [stage_scene]);
  const active_target_prop = useMemo(
    () =>
      active_throw_objective
        ? stage_scene?.props.find((prop) => prop.id === active_throw_objective.target_prop_id) ?? null
        : null,
    [active_throw_objective, stage_scene],
  );
  const challenge_target_prop = useMemo(
    () => challenge_state.target_prop_id
      ? stage_scene?.props.find((prop) => prop.id === challenge_state.target_prop_id) ?? null
      : null,
    [challenge_state.target_prop_id, stage_scene],
  );
  const challenge_countdown_remaining = useMemo(() => {
    if (challenge_state.phase !== 'countdown' || challenge_state.countdown_started_at_ms === null) {
      return null;
    }

    return Math.max(0, challenge_countdown_ms - (challenge_now_ms - challenge_state.countdown_started_at_ms));
  }, [challenge_now_ms, challenge_state.countdown_started_at_ms, challenge_state.phase]);
  const challenge_timer_remaining = useMemo(() => {
    if (
      !is_challenge_active ||
      challenge_state.timer_started_at_ms === null ||
      challenge_state.phase === 'inactive'
    ) {
      return null;
    }

    return Math.max(0, challenge_duration_ms - (challenge_now_ms - challenge_state.timer_started_at_ms));
  }, [challenge_now_ms, challenge_state.phase, challenge_state.timer_started_at_ms, is_challenge_active]);

  useEffect(() => {
    if (
      challenge_state.phase === 'countdown' &&
      challenge_state.countdown_started_at_ms !== null &&
      challenge_countdown_remaining !== null &&
      challenge_countdown_remaining <= 0
    ) {
      set_challenge_state((current) => ({
        ...current,
        phase: 'move',
        countdown_started_at_ms: current.countdown_started_at_ms,
        timer_started_at_ms: current.timer_started_at_ms ?? window.performance.now(),
      }));
    }
  }, [challenge_countdown_remaining, challenge_state.countdown_started_at_ms, challenge_state.phase]);

  useEffect(() => {
    if (
      !is_challenge_active ||
      challenge_state.phase !== 'countdown' ||
      challenge_countdown_remaining === null
    ) {
      return;
    }

    const countdown_stage =
      challenge_countdown_remaining > 3_000
        ? '3'
        : challenge_countdown_remaining > 2_000
          ? '2'
          : challenge_countdown_remaining > 1_000
            ? '1'
            : 'GO';

    if (countdown_beep_stage_ref.current === countdown_stage) {
      return;
    }

    countdown_beep_stage_ref.current = countdown_stage;

    if (countdown_stage === 'GO') {
      play_beep({ frequency: 1160, duration_ms: 260, gain: 0.08 });
      return;
    }

    play_beep({ frequency: 860, duration_ms: 110, gain: 0.055 });
  }, [challenge_countdown_remaining, challenge_state.phase, is_challenge_active]);

  useEffect(() => {
    if (
      !is_challenge_active ||
      is_override_dialogue_active ||
      challenge_state.phase === 'inactive' ||
      challenge_timer_remaining === null ||
      challenge_timer_remaining > 0
    ) {
      return;
    }

    handleChallengeFailure();
  }, [challenge_timer_remaining, challenge_state.phase, is_challenge_active, is_override_dialogue_active]);

  useEffect(() => {
    if (
      !is_challenge_active ||
      challenge_state.phase !== 'move' && challenge_state.phase !== 'throw' ||
      challenge_timer_remaining === null
    ) {
      danger_beep_step_ref.current = null;
      return;
    }

    const seconds_remaining = Math.ceil(challenge_timer_remaining / 1000);
    if (seconds_remaining > 5 || seconds_remaining < 2) {
      return;
    }

    if (danger_beep_step_ref.current === seconds_remaining) {
      return;
    }

    danger_beep_step_ref.current = seconds_remaining;
    play_beep({ frequency: 720, duration_ms: 85, gain: 0.052 });
  }, [challenge_state.phase, challenge_timer_remaining, is_challenge_active]);

  const active_preview_path = useMemo(() => {
    if (!stage_scene || !naruto_current_coord) {
      return null;
    }

    if (is_challenge_active && challenge_state.phase === 'move' && challenge_state.destination_tile && hovered_destination_tile) {
      const matches_target =
        hovered_destination_tile.q === challenge_state.destination_tile.q &&
        hovered_destination_tile.r === challenge_state.destination_tile.r &&
        hovered_destination_tile.s === challenge_state.destination_tile.s;

      if (!matches_target) {
        return null;
      }

      return build_path_family_variant({
        start: naruto_current_coord,
        goal: hovered_destination_tile,
        tiles: stage_scene.map.tiles,
        family: active_path_family,
        variant: active_path_variant,
      });
    }

    if (active_objective && hovered_destination_tile) {
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
    }

    if (
      is_challenge_active &&
      challenge_state.phase === 'throw' &&
      challenge_target_prop &&
      hovered_target_prop_id === challenge_target_prop.id &&
      selected_inventory_item?.icon === shuriken_icon_path
    ) {
      if (active_path_variant === 'shortest') {
        return [naruto_current_coord, challenge_target_prop.coord];
      }

      return build_path_family_variant({
        start: naruto_current_coord,
        goal: challenge_target_prop.coord,
        tiles: stage_scene.map.tiles,
        family: active_path_family,
        variant: active_path_variant,
      });
    }

    if (
      active_throw_objective &&
      active_target_prop &&
      hovered_target_prop_id === active_throw_objective.target_prop_id &&
      selected_inventory_item?.icon === shuriken_icon_path
    ) {
      if (!active_throw_objective.use_path_variants || active_path_variant === 'shortest') {
        return [naruto_current_coord, active_target_prop.coord];
      }

      return build_path_family_variant({
        start: naruto_current_coord,
        goal: active_target_prop.coord,
        tiles: stage_scene.map.tiles,
        family: active_throw_objective.use_path_variants ? active_path_family : 'short',
        variant: active_throw_objective.use_path_variants ? active_path_variant : 'shortest',
      });
    }

    return null;
  }, [
    active_objective,
    active_path_family,
    active_path_variant,
    challenge_state.destination_tile,
    challenge_state.phase,
    challenge_target_prop,
    active_target_prop,
    active_throw_objective,
    hovered_destination_tile,
    hovered_target_prop_id,
    is_challenge_active,
    naruto_current_coord,
    selected_inventory_item,
    stage_scene,
  ]);

  const highlighted_tiles = useMemo(() => {
    if (is_challenge_active && challenge_state.phase === 'move' && challenge_state.destination_tile) {
      return [challenge_state.destination_tile];
    }

    if (!active_objective || speech_state.is_wait_satisfied) {
      return [];
    }

    return [active_objective.target];
  }, [active_objective, challenge_state.destination_tile, challenge_state.phase, is_challenge_active, speech_state.is_wait_satisfied]);

  const highlighted_prop_ids = useMemo(() => {
    if (is_challenge_active && challenge_state.phase === 'throw' && challenge_state.target_prop_id) {
      return [challenge_state.target_prop_id];
    }

    if (active_throw_objective && !speech_state.is_wait_satisfied) {
      return [active_throw_objective.target_prop_id];
    }

    return [];
  }, [active_throw_objective, challenge_state.phase, challenge_state.target_prop_id, is_challenge_active, speech_state.is_wait_satisfied]);

  function setInventoryForChallengeIfNeeded() {
    set_inventory_unlocked(true);
    set_selected_inventory_index(0);
    set_shuriken_count(challenge_round_count);
    set_prop_effects([]);
    set_active_projectile(null);
    set_challenge_success_banner_visible(false);
  }

  function pickChallengeDestination() {
    if (!stage_scene || !naruto_current_coord) {
      return null;
    }

    const available_tiles = stage_scene.map.tiles
      .map((tile) => tile.coord)
      .filter((coord) => {
        const coord_key = key_hex(coord);
        if (coord_key === key_hex(naruto_current_coord)) {
          return false;
        }

        return !challenge_blocked_tile_keys.has(coord_key);
      });

    if (available_tiles.length === 0) {
      return null;
    }

    return available_tiles[Math.floor(Math.random() * available_tiles.length)];
  }

  function pickChallengeTargetPost() {
    if (target_posts.length === 0) {
      return null;
    }

    return target_posts[Math.floor(Math.random() * target_posts.length)] ?? null;
  }

  function startChallengeAttempt() {
    const now = window.performance.now();
    const destination_tile = pickChallengeDestination();
    if (!destination_tile) {
      return;
    }

    setInventoryForChallengeIfNeeded();
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
    set_challenge_now_ms(now);
    set_challenge_state({
      phase: 'countdown',
      round_index: 0,
      countdown_started_at_ms: now,
      timer_started_at_ms: now + challenge_countdown_ms,
      destination_tile,
      target_prop_id: null,
    });
  }

  function queueOverrideDialogue(lines: OverrideDialogueLine[], on_finish: () => void) {
    set_override_dialogue_lines(lines);
    set_override_dialogue_index(0);
    override_dialogue_finish_ref.current = on_finish;
  }

  function handleChallengeFailure() {
    if (stage_scene?.music_path) {
      void play_looping_track(stage_scene.music_path, { restart: true });
    }

    set_challenge_state((current) => ({
      ...current,
      phase: 'inactive',
      destination_tile: null,
      target_prop_id: null,
    }));
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    queueOverrideDialogue(
      [
        { speaker: 'iruka_umino', text: "That's fine, Naruto. Reset, breathe, and do it again." },
        { speaker: 'naruto_uzumaki', text: "Tch. Fine. Give me another seven. I'll clear it this time." },
      ],
      () => {
        set_override_dialogue_lines(null);
        set_override_dialogue_index(0);
        startChallengeAttempt();
      },
    );
  }

  function handleChallengeMoveComplete() {
    if (!challenge_runtime_ref.current.active || challenge_runtime_ref.current.override) {
      return;
    }

    const target_post = pickChallengeTargetPost();
    if (!target_post) {
      return;
    }

    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
    set_challenge_state((current) => ({
      ...current,
      phase: 'throw',
      target_prop_id: target_post.id,
    }));
  }

  function handleChallengeThrowComplete() {
    if (!challenge_runtime_ref.current.active || challenge_runtime_ref.current.override) {
      return;
    }

    const next_destination_tile = pickChallengeDestination();
    set_hovered_target_prop_id(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');

    if (!next_destination_tile && challenge_state.round_index + 1 < challenge_round_count) {
      fulfill_wait(challenge_wait_key);
      return;
    }

    set_challenge_state((current) => {
      const next_round_index = current.round_index + 1;
      if (next_round_index >= challenge_round_count) {
        set_challenge_success_banner_visible(true);
        void play_stinger(success_music_path, {
          resume_track_path: stage_scene?.music_path ?? null,
          on_end: () => {
            set_challenge_success_banner_visible(false);
            fulfill_wait(challenge_wait_key);
          },
        });

        return {
          ...current,
          phase: 'inactive',
          destination_tile: null,
          target_prop_id: null,
        };
      }

      return {
        ...current,
        phase: 'move',
        round_index: next_round_index,
        destination_tile: next_destination_tile,
        target_prop_id: null,
      };
    });
  }

  const hop_along_path = (character_id: string, path: HexCoord[], move_speed: MoveSpeed, on_complete: () => void) => {
    if (!stage_scene || path.length < 2) {
      return;
    }

    set_character_moving(set_moving_characters, character_id, true);
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
        set_character_world_override(set_character_world_overrides, character_id, null);
        set_character_coord_override(set_character_coord_overrides, character_id, path[path.length - 1] ?? null);
        set_character_moving(set_moving_characters, character_id, false);
        on_complete();
        return;
      }

      const from_world = flat_top_hex_to_world(from_coord, default_projection_settings.tile_radius);
      const to_world = flat_top_hex_to_world(to_coord, default_projection_settings.tile_radius);
      const step_facing = get_facing_for_step(from_coord, to_coord);
      const start_time = window.performance.now();

      set_character_facing_override(set_character_facing_overrides, character_id, step_facing);

      const animate_step = (now: number) => {
        const raw_progress = (now - start_time) / segment_duration_ms;
        const progress = Math.min(1, Math.max(0, raw_progress));
        const hop_arc = Math.sin(progress * Math.PI) * hop_height_world;

        set_character_world_override(set_character_world_overrides, character_id, {
          x: from_world.x + (to_world.x - from_world.x) * progress,
          y: from_world.y + (to_world.y - from_world.y) * progress,
          z: from_world.z + (to_world.z - from_world.z) * progress + hop_arc,
        });

        if (progress < 1) {
          window.requestAnimationFrame(animate_step);
          return;
        }

        set_character_world_override(set_character_world_overrides, character_id, null);
        set_character_coord_override(set_character_coord_overrides, character_id, to_coord);

        if (segment_index + 1 >= path.length - 1) {
          set_character_moving(set_moving_characters, character_id, false);
          on_complete();
          return;
        }

        step_through(segment_index + 1);
      };

      window.requestAnimationFrame(animate_step);
    };

    step_through(0);
  };

  const teleport_to_coord = (character_id: string, coord: HexCoord, on_complete: () => void) => {
    if (!stage_scene) {
      return;
    }

    const current_coord = get_character_current_coord(stage_scene, character_coord_overrides, character_id);
    if (!current_coord) {
      return;
    }

    set_character_moving(set_moving_characters, character_id, true);
    set_character_facing_override(set_character_facing_overrides, character_id, get_facing_for_step(current_coord, coord));
    set_character_world_override(set_character_world_overrides, character_id, null);
    set_character_coord_override(set_character_coord_overrides, character_id, coord);

    window.setTimeout(() => {
      set_character_moving(set_moving_characters, character_id, false);
      on_complete();
    }, 80);
  };

  const clear_path_preview_selection = () => {
    set_hovered_destination_tile(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
  };

  const attempt_move = (coord: HexCoord, input_type: MoveInputType) => {
    if (!stage_scene || speech_state.is_wait_satisfied || moving_characters[naruto_character_id] || !naruto_current_coord) {
      return;
    }

    if (
      is_challenge_active &&
      challenge_state.phase === 'move' &&
      challenge_state.destination_tile &&
      !is_override_dialogue_active
    ) {
      const is_target_tile =
        coord.q === challenge_state.destination_tile.q &&
        coord.r === challenge_state.destination_tile.r &&
        coord.s === challenge_state.destination_tile.s;

      if (!is_target_tile) {
        return;
      }

      if (input_type === 'right_click') {
        clear_path_preview_selection();
        hop_along_path(naruto_character_id, [naruto_current_coord, challenge_state.destination_tile], 'jump', handleChallengeMoveComplete);
        return;
      }

      if (input_type === 'right_hold') {
        clear_path_preview_selection();
        teleport_to_coord(naruto_character_id, challenge_state.destination_tile, handleChallengeMoveComplete);
        return;
      }

      const move_speed = input_type === 'hold' ? 'run' : 'walk';
      const move_path = active_preview_path && active_preview_path.length >= 2
        ? active_preview_path
        : build_path_family_variant({
            start: naruto_current_coord,
            goal: challenge_state.destination_tile,
            tiles: stage_scene.map.tiles,
            family: active_path_family,
            variant: active_path_variant,
          });

      clear_path_preview_selection();
      hop_along_path(naruto_character_id, move_path, move_speed, handleChallengeMoveComplete);
      return;
    }

    if (!active_objective) {
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
      hop_along_path(naruto_character_id, [naruto_current_coord, active_objective.target], 'jump', () => {
        fulfill_wait(speech_state.wait_key ?? jump_wait_key);
      });
      return;
    }

    if (input_type === 'right_hold' && active_objective.move_speed === 'teleport') {
      clear_path_preview_selection();
      teleport_to_coord(naruto_character_id, active_objective.target, () => {
        fulfill_wait(speech_state.wait_key ?? teleport_wait_key);
      });
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
      hop_along_path(naruto_character_id, active_preview_path, active_objective.move_speed ?? 'walk', () => {
        fulfill_wait(speech_state.wait_key ?? route_wait_key);
      });
      return;
    }

    clear_path_preview_selection();
    hop_along_path(naruto_character_id, [naruto_current_coord, active_objective.target], active_objective.move_speed ?? 'walk', () => {
      fulfill_wait(speech_state.wait_key ?? move_wait_key);
    });
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
    if (
      !show_path_preview ||
      (active_throw_objective && !(is_challenge_active && challenge_state.phase === 'move')) ||
      is_naruto_moving ||
      is_override_dialogue_active
    ) {
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

    if (coord && naruto_current_coord) {
      set_character_facing_overrides((current) => ({
        ...current,
        [naruto_character_id]: get_facing_for_step(naruto_current_coord, coord),
      }));
    }

    set_hovered_destination_tile(coord);
  };

  const handle_tile_wheel = (coord: HexCoord, delta_y: number) => {
    if (
      is_challenge_active &&
      challenge_state.phase === 'move' &&
      challenge_state.destination_tile
    ) {
      const is_target_tile =
        coord.q === challenge_state.destination_tile.q &&
        coord.r === challenge_state.destination_tile.r &&
        coord.s === challenge_state.destination_tile.s;

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
      return;
    }

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
    if (
      is_challenge_active &&
      challenge_state.phase === 'move' &&
      challenge_state.destination_tile
    ) {
      const is_target_tile =
        coord.q === challenge_state.destination_tile.q &&
        coord.r === challenge_state.destination_tile.r &&
        coord.s === challenge_state.destination_tile.s;

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
      return;
    }

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

  const handle_prop_hover = (prop_id: string | null) => {
    if (!show_path_preview || is_naruto_moving || is_override_dialogue_active) {
      set_hovered_target_prop_id(null);
      return;
    }

    const active_prop_id =
      is_challenge_active && challenge_state.phase === 'throw'
        ? challenge_state.target_prop_id
        : active_throw_objective?.target_prop_id ?? null;

    if (!active_prop_id) {
      set_hovered_target_prop_id(null);
      return;
    }

    if (prop_id !== hovered_target_prop_id) {
      set_active_path_family('short');
      set_active_path_variant('shortest');
    }

    if (
      prop_id &&
      stage_scene &&
      naruto_current_coord &&
      selected_inventory_item?.icon === shuriken_icon_path &&
      prop_id === active_prop_id
    ) {
      const hovered_prop = stage_scene.props.find((prop) => prop.id === prop_id);
      if (hovered_prop) {
        set_character_facing_overrides((current) => ({
          ...current,
          [naruto_character_id]: get_facing_for_step(naruto_current_coord, hovered_prop.coord),
        }));
      }
    }

    set_hovered_target_prop_id(prop_id);
  };

  const handle_prop_click = (prop_id: string) => {
    if (
      is_challenge_active &&
      challenge_state.phase === 'throw' &&
      !speech_state.is_wait_satisfied &&
      selected_inventory_item?.icon === shuriken_icon_path &&
      prop_id === challenge_state.target_prop_id &&
      challenge_target_prop &&
      naruto_current_coord
    ) {
      const throw_path =
        active_preview_path && active_preview_path.length >= 2
          ? active_preview_path
          : [naruto_current_coord, challenge_target_prop.coord];

      throw_shuriken_at_prop(challenge_target_prop, throw_path, handleChallengeThrowComplete);
      return;
    }

    if (
      !stage_scene ||
      !active_throw_objective ||
      speech_state.is_wait_satisfied ||
      selected_inventory_item?.icon !== shuriken_icon_path ||
      prop_id !== active_throw_objective.target_prop_id ||
      !naruto_current_coord
    ) {
      return;
    }

    const target_prop = stage_scene.props.find((prop) => prop.id === prop_id);
    if (!target_prop) {
      return;
    }

    const family_matches = active_throw_objective.required_family
      ? active_path_family === active_throw_objective.required_family
      : true;
    const variant_matches = active_throw_objective.required_variants
      ? active_throw_objective.required_variants.includes(active_path_variant)
      : true;

    if (!family_matches || !variant_matches) {
      return;
    }

    const throw_path =
      active_preview_path && active_preview_path.length >= 2
        ? active_preview_path
        : [naruto_current_coord, target_prop.coord];

    throw_shuriken_at_prop(target_prop, throw_path, () => {
      fulfill_wait(speech_state.wait_key ?? throw_wait_key);
    });
  };

  const handle_prop_wheel = (prop_id: string, delta_y: number) => {
    if (
      is_challenge_active &&
      challenge_state.phase === 'throw' &&
      prop_id === challenge_state.target_prop_id
    ) {
      set_active_path_variant((current) => {
        const available_variants =
          active_path_family === 'wide' ? wide_family_variants : short_family_variants;
        const filtered_variants = available_variants.filter(
          (variant): variant is Exclude<PathVariant, 'shortest'> => variant !== 'shortest',
        );
        const safe_current: Exclude<PathVariant, 'shortest'> =
          current === 'left' || current === 'right'
            ? current
            : filtered_variants[0];
        const current_index = filtered_variants.indexOf(safe_current);
        const next_index =
          delta_y > 0
            ? (current_index + 1) % filtered_variants.length
            : (current_index - 1 + filtered_variants.length) % filtered_variants.length;
        return filtered_variants[next_index];
      });
      return;
    }

    if (
      !show_path_preview ||
      !active_throw_objective?.use_path_variants ||
      prop_id !== active_throw_objective.target_prop_id
    ) {
      return;
    }

    set_active_path_variant((current) => {
      const available_variants =
        active_path_family === 'wide' ? wide_family_variants : short_family_variants;
      const filtered_variants = available_variants.filter(
        (variant): variant is Exclude<PathVariant, 'shortest'> => variant !== 'shortest',
      );
      const safe_current: Exclude<PathVariant, 'shortest'> =
        current === 'left' || current === 'right'
          ? current
          : filtered_variants[0];
      const current_index = filtered_variants.indexOf(safe_current);
      const next_index =
        delta_y > 0
          ? (current_index + 1) % filtered_variants.length
          : (current_index - 1 + filtered_variants.length) % filtered_variants.length;
      return filtered_variants[next_index];
    });
  };

  const handle_prop_middle_click = (prop_id: string) => {
    if (
      is_challenge_active &&
      challenge_state.phase === 'throw' &&
      prop_id === challenge_state.target_prop_id
    ) {
      set_active_path_family((current) => {
        const current_index = path_families.indexOf(current);
        const next_family = path_families[(current_index + 1) % path_families.length];

        set_active_path_variant((current_variant) => {
          if (next_family === 'wide') {
            return current_variant === 'shortest' ? 'left' : current_variant;
          }

          return current_variant === 'shortest' ? 'shortest' : current_variant;
        });

        return next_family;
      });
      return;
    }

    if (
      !show_path_preview ||
      !active_throw_objective?.use_path_variants ||
      prop_id !== active_throw_objective.target_prop_id
    ) {
      return;
    }

    set_active_path_family((current) => {
      const current_index = path_families.indexOf(current);
      const next_family = path_families[(current_index + 1) % path_families.length];

      set_active_path_variant((current_variant) => {
        if (next_family === 'wide') {
          return current_variant === 'shortest' ? 'left' : current_variant;
        }

        return current_variant === 'shortest' ? 'shortest' : current_variant;
      });

      return next_family;
    });
  };

  const throw_shuriken_at_prop = (
    target_prop: LoadedStageProp,
    throw_path: HexCoord[],
    on_complete: () => void,
  ) => {
    if (!naruto_current_coord) {
      return;
    }

    const world_path = throw_path.map((coord, index) => {
      const is_start = index === 0;
      const is_end = index === throw_path.length - 1;

      return {
        ...flat_top_hex_to_world(coord, default_projection_settings.tile_radius),
        z: is_start ? 0.58 : is_end ? 0.42 : 0.5,
      };
    });
    const segment_lengths = world_path.slice(0, -1).map((point, index) => {
      const next = world_path[index + 1];
      return Math.hypot(next.x - point.x, next.y - point.y);
    });
    const total_path_length = Math.max(
      1,
      segment_lengths.reduce((total, length) => total + length, 0),
    );
    const duration_ms = 180;
    const start_time = window.performance.now();
    const projectile_id = `shuriken:${Date.now()}`;

    set_hovered_target_prop_id(null);

    const animate_throw = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start_time) / duration_ms));
      const arc_height = Math.sin(progress * Math.PI) * 0.12;
      const traveled_length = total_path_length * progress;
      const sampled_position = sample_world_path_position(world_path, segment_lengths, traveled_length);

      set_active_projectile({
        id: projectile_id,
        sprite: shuriken_icon_path,
        size_m: shuriken_projectile_size_m,
        rotation_deg: progress * 1800,
        world_position: {
          x: sampled_position.x,
          y: sampled_position.y,
          z: sampled_position.z + arc_height,
        },
      });

      if (progress < 1) {
        window.requestAnimationFrame(animate_throw);
        return;
      }

      set_active_projectile(null);
      set_shuriken_count((current) => Math.max(0, current - 1));
      set_prop_effects((current) => [
        ...current,
        {
          id: `stuck:${target_prop.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          prop_id: target_prop.id,
          sprite: pick_random_stuck_shuriken_sprite(),
          size_m: 0.22,
          rotation_deg: random_between(-32, 32),
          offset_x: random_between(-0.08, 0.08),
          offset_y: random_between(-0.06, -0.01),
          offset_z: random_between(1.16, 1.34),
        },
      ]);
      on_complete();
    };

    window.requestAnimationFrame(animate_throw);
  };

  useEffect(() => {
    if (speech_state.wait_key !== iruka_move_wait_key || speech_state.is_wait_satisfied || !stage_scene) {
      return;
    }

    if (moving_characters[iruka_character_id]) {
      return;
    }

    const iruka_coord = get_character_current_coord(stage_scene, character_coord_overrides, iruka_character_id);
    if (!iruka_coord) {
      return;
    }

    const path = build_shortest_path({
      start: iruka_coord,
      goal: iruka_side_coord,
      tiles: stage_scene.map.tiles,
    });

    if (path.length < 2) {
      fulfill_wait(iruka_move_wait_key);
      return;
    }

    hop_along_path(iruka_character_id, path, 'walk', () => {
      fulfill_wait(iruka_move_wait_key);
    });
  }, [character_coord_overrides, fulfill_wait, moving_characters, speech_state.is_wait_satisfied, speech_state.wait_key, stage_scene]);

  useEffect(() => {
    const iruka_coord = get_character_current_coord(stage_scene, character_coord_overrides, iruka_character_id);
    if (
      !iruka_coord ||
      iruka_coord.q !== iruka_side_coord.q ||
      iruka_coord.r !== iruka_side_coord.r ||
      iruka_coord.s !== iruka_side_coord.s
    ) {
      return;
    }

    set_character_facing_overrides((current) => {
      if (current[iruka_character_id] === 'left') {
        return current;
      }

      return {
        ...current,
        [iruka_character_id]: 'left',
      };
    });
  }, [character_coord_overrides, stage_scene]);

  const active_override_dialogue_line =
    override_dialogue_lines?.[override_dialogue_index] ?? null;
  const rendered_speech_line =
    active_override_dialogue_line
      ? {
          speaker: active_override_dialogue_line.speaker,
          text: active_override_dialogue_line.text,
        }
      : speech_state.active_line
        ? {
            speaker: speech_state.active_line.speaker,
            text: speech_state.visible_text,
          }
        : null;
  const handle_advance_speech = () => {
    if (active_override_dialogue_line && override_dialogue_lines) {
      if (override_dialogue_index + 1 < override_dialogue_lines.length) {
        set_override_dialogue_index((current) => current + 1);
        return;
      }

      const on_finish = override_dialogue_finish_ref.current;
      override_dialogue_finish_ref.current = null;
      set_override_dialogue_lines(null);
      set_override_dialogue_index(0);
      on_finish?.();
      return;
    }

    advance();
  };
  const challenge_overlay_text = useMemo(() => {
    if (challenge_success_banner_visible) {
      return 'Mission Acomplished!';
    }

    if (!is_challenge_active || is_override_dialogue_active) {
      return null;
    }

    if (challenge_state.phase === 'countdown' && challenge_countdown_remaining !== null) {
      if (challenge_countdown_remaining > 3_000) {
        return '3';
      }
      if (challenge_countdown_remaining > 2_000) {
        return '2';
      }
      if (challenge_countdown_remaining > 1_000) {
        return '1';
      }
      return 'GO!';
    }

    if (challenge_timer_remaining !== null) {
      return `${Math.ceil(challenge_timer_remaining / 1_000)}`;
    }

    return null;
  }, [challenge_countdown_remaining, challenge_state.phase, challenge_success_banner_visible, challenge_timer_remaining, is_challenge_active, is_override_dialogue_active]);
  const challenge_overlay_is_danger =
    !challenge_success_banner_visible &&
    challenge_timer_remaining !== null &&
    challenge_timer_remaining <= 5_000 &&
    challenge_state.phase !== 'countdown';

  const path_preview_tone =
    active_throw_objective || (is_challenge_active && challenge_state.phase === 'throw')
      ? 'attack'
      : 'move';

  return (
    <main className="naruto-story">
      {rendered_scene ? <SceneBackground preset={rendered_scene.background_preset} /> : null}
      <div className="naruto-story__content">
        {error_message ? <p className="naruto-story__status">{error_message}</p> : null}
        {!error_message && !stage_scene ? <p className="naruto-story__status">Loading academy yard...</p> : null}
        {rendered_scene ? (
          <MapView
            scene={rendered_scene}
            active_speech_line={rendered_speech_line}
            on_advance_speech={handle_advance_speech}
            highlighted_tiles={highlighted_tiles}
            highlighted_prop_ids={highlighted_prop_ids}
            prop_highlight_tone="attack"
            on_tile_click={handle_tile_click}
            on_tile_hold={handle_tile_hold}
            on_tile_right_click={handle_tile_right_click}
            on_tile_right_hold={handle_tile_right_hold}
            on_tile_hover={handle_tile_hover}
            on_tile_wheel={handle_tile_wheel}
            on_tile_middle_click={handle_tile_middle_click}
            on_prop_hover={handle_prop_hover}
            on_prop_click={handle_prop_click}
            on_prop_wheel={handle_prop_wheel}
            on_prop_middle_click={handle_prop_middle_click}
            character_world_overrides={character_world_overrides}
            character_facing_overrides={character_facing_overrides}
            path_preview={
              active_preview_path
                ? {
                    path: active_preview_path,
                    family: active_path_family,
                    tone: path_preview_tone,
                  }
                : null
            }
            projectiles={active_projectile ? [active_projectile] : []}
            prop_effects={prop_effects}
          />
        ) : null}
        {challenge_overlay_text ? (
          <div
            className={`naruto-story__challenge-timer${challenge_overlay_is_danger ? ' is-danger' : ''}${challenge_success_banner_visible ? ' is-success' : ''}`}
            aria-live="polite"
          >
            {challenge_overlay_text}
          </div>
        ) : null}
        {naruto_status_panel ? (
          <UnitStatusPanel
            avatar={naruto_status_panel.avatar}
            name={naruto_status_panel.name}
            bars={naruto_status_panel.bars}
          />
        ) : null}
        {inventory_unlocked ? (
          <InventoryBar
            slots={inventory_slots}
            selected_index={selected_inventory_index}
            on_select_slot={(index) => {
              if (index !== 0 || shuriken_count <= 0) {
                set_selected_inventory_index(null);
                return;
              }

              set_selected_inventory_index((current) => (current === index ? null : index));
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function get_character_current_coord(
  stage_scene: LoadedStageScene | null,
  overrides: Record<string, HexCoord>,
  character_id: string,
) {
  if (!stage_scene) {
    return null;
  }

  const character = stage_scene.characters.find((entry) => entry.id === character_id);
  if (!character) {
    return null;
  }

  return overrides[character_id] ?? character.coord;
}

function set_character_coord_override(
  set_state: Dispatch<SetStateAction<Record<string, HexCoord>>>,
  character_id: string,
  coord: HexCoord | null,
) {
  set_state((current) => {
    if (!coord) {
      const { [character_id]: _removed, ...rest } = current;
      return rest;
    }

    return {
      ...current,
      [character_id]: coord,
    };
  });
}

function set_character_world_override(
  set_state: Dispatch<SetStateAction<Record<string, WorldPoint>>>,
  character_id: string,
  world_position: WorldPoint | null,
) {
  set_state((current) => {
    if (!world_position) {
      const { [character_id]: _removed, ...rest } = current;
      return rest;
    }

    return {
      ...current,
      [character_id]: world_position,
    };
  });
}

function set_character_facing_override(
  set_state: Dispatch<SetStateAction<Record<string, CharacterFacing>>>,
  character_id: string,
  facing: CharacterFacing | null,
) {
  set_state((current) => {
    if (!facing) {
      const { [character_id]: _removed, ...rest } = current;
      return rest;
    }

    return {
      ...current,
      [character_id]: facing,
    };
  });
}

function set_character_moving(
  set_state: Dispatch<SetStateAction<Record<string, true>>>,
  character_id: string,
  is_moving: boolean,
) {
  set_state((current) => {
    if (!is_moving) {
      const { [character_id]: _removed, ...rest } = current;
      return rest;
    }

    return {
      ...current,
      [character_id]: true,
    };
  });
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

function pick_random_stuck_shuriken_sprite() {
  return shuriken_stuck_icon_paths[
    Math.floor(Math.random() * shuriken_stuck_icon_paths.length)
  ];
}

function random_between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function sample_world_path_position(
  world_path: WorldPoint[],
  segment_lengths: number[],
  traveled_length: number,
) {
  if (world_path.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  if (world_path.length === 1 || segment_lengths.length === 0) {
    return world_path[0];
  }

  let remaining = traveled_length;

  for (let index = 0; index < segment_lengths.length; index += 1) {
    const segment_length = segment_lengths[index];
    const from = world_path[index];
    const to = world_path[index + 1];

    if (remaining <= segment_length || index === segment_lengths.length - 1) {
      const local_progress = segment_length <= 0 ? 1 : Math.min(1, Math.max(0, remaining / segment_length));

      return {
        x: from.x + (to.x - from.x) * local_progress,
        y: from.y + (to.y - from.y) * local_progress,
        z: from.z + (to.z - from.z) * local_progress,
      };
    }

    remaining -= segment_length;
  }

  return world_path[world_path.length - 1];
}
