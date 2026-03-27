import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { ActionQueueBar } from '../hud/action_queue_bar';
import { InventoryBar } from '../hud/inventory_bar';
import { JutsuPanel } from '../hud/jutsu_panel';
import { UnitStatusPanel } from '../hud/unit_status_panel';
import { play_beep, play_sfx, play_vox, start_looping_sfx, stop_looping_sfx, useMusicController } from '../audio';
import { load_stage_scene, MapView, type LoadedStageScene } from '../map_loader';
import type { CharacterFacing, HexCoord, LoadedCharacter, LoadedStageProp } from '../map_loader/map_types';
import { build_path_family_variant, build_shortest_path, get_hex_neighbors, key_hex, type PathFamily, type PathVariant } from '../movement';
import { SceneBackground } from '../rendering';
import type { WorldEffectRenderable } from '../rendering';
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
const infuse_chakra_wait_key = 'naruto_queue_infuse_chakra_jutsu';
const clone_wait_key = 'naruto_queue_clone_jutsu';
const ready_clone_wait_key = 'naruto_execute_clone_chain';
const substitution_infuse_wait_key = 'naruto_queue_infuse_chakra_for_substitution';
const substitution_destination_wait_key = 'naruto_queue_substitution_destination';
const ready_substitution_wait_key = 'naruto_execute_substitution_chain';
const transformation_infuse_wait_key = 'naruto_queue_infuse_chakra_for_transformation';
const transformation_wait_key = 'naruto_queue_transformation_jutsu';
const ready_transformation_wait_key = 'naruto_execute_transformation_chain';
const sexy_infuse_wait_key = 'naruto_queue_infuse_chakra_for_sexy_jutsu';
const sexy_wait_key = 'naruto_queue_sexy_jutsu';
const ready_sexy_wait_key = 'naruto_execute_sexy_jutsu_chain';
const iruka_side_coord: HexCoord = { q: 3, r: -1, s: -2 };
const path_families: PathFamily[] = ['short', 'wide'];
const short_family_variants: PathVariant[] = ['shortest', 'left', 'right'];
const wide_family_variants: PathVariant[] = ['left', 'right'];
const walk_hop_duration_ms = 300;
const run_hop_duration_ms = 150;
const jump_hop_duration_ms = 210;
const substitution_projectile_duration_ms = 190;
const substitution_log_drop_duration_ms = 720;
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
const sexiness_music_path = '/resources/music/sexiness.mp3';
const weapon_equip_sfx_path = '/resources/sfx/weapon_equip.wav';
const projectile_throw_sfx_path = '/resources/sfx/projectile_weapon_throw.wav';
const projectile_hit_sfx_path = '/resources/sfx/projectile_weapon_hit.mp3';
const walk_loop_sfx_path = '/resources/sfx/walk.wav';
const run_loop_sfx_path = '/resources/sfx/run.wav';
const jump_sfx_path = '/resources/sfx/jump.mp3';
const handsign_sfx_path = '/resources/sfx/handsign.wav';
const clone_sfx_path = '/resources/sfx/shadow_clone.mp3';
const disperse_sfx_path = '/resources/sfx/disperse.mp3';
const here_vox_path = '/resources/vox/naruto_uzumaki/part_1/here.mp3';
const here_i_go_vox_path = '/resources/vox/naruto_uzumaki/part_1/here_i_go.mp3';
const ah_vox_path = '/resources/vox/naruto_uzumaki/part_1/ah.mp3';
const great_vox_path = '/resources/vox/naruto_uzumaki/part_1/great.mp3';
const haha_vox_path = '/resources/vox/naruto_uzumaki/part_1/haha.mp3';
const missed_me_vox_path = '/resources/vox/naruto_uzumaki/part_1/missed_me.mp3';
const challenge_ten_second_vox_path = '/resources/vox/naruto_uzumaki/part_1/i_wont_lose_no_matter_what.mp3';
const sexy_jutsu_vox_path = '/resources/vox/naruto_uzumaki/part_1/sexy_jutsu.mp3';
const got_ya_thats_my_sexy_jutsu_vox_path =
  '/resources/vox/naruto_uzumaki/part_1/got_ya_thats_my_sexy_jutsu.mp3';
const iruka_sexy_jutsu_stun_vox_path = '/resources/vox/iruka_umino/sexy_jutsu_stun.mp3';
const shuriken_throw_vox_paths = [
  '/resources/vox/naruto_uzumaki/part_1/hit_1.mp3',
  '/resources/vox/naruto_uzumaki/part_1/hit_2.mp3',
  '/resources/vox/naruto_uzumaki/part_1/hit_3.mp3',
] as const;
const lucky_me_vox_path = '/resources/vox/naruto_uzumaki/part_1/lucky_me.mp3';
const infuse_chakra_icon_path = '/resources/jutsu/infuse_chakra.png';
const clone_jutsu_icon_path = '/resources/jutsu/e_rank/clone_jutsu.png';
const substitution_icon_path = '/resources/jutsu/e_rank/substitution_jutsu.png';
const transformation_icon_path = '/resources/jutsu/e_rank/transformation_jutsu.png';
const sexy_jutsu_icon_path = '/resources/jutsu/e_rank/sexy_jutsu.png';
const substitution_log_sprite_path = '/resources/jutsu/e_rank/substitution_log.png';
const naruto_infuse_sprite_paths = {
  front: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/infuse_front.png',
  back: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/infuse_back.png',
  left: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/infuse_left.png',
  right: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/infuse_right.png',
} as const;
const naruto_sexy_jutsu_sprite_paths = {
  front: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/sexy_jutsu_transformed_right.png',
  back: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/sexy_jutsu_transformed_right.png',
  left: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/sexy_jutsu_transformed_left.png',
  right: '/resources/characters/naruto_uzumaki/academy_newbie/sprites/sexy_jutsu_transformed_right.png',
} as const;
const iruka_sexy_jutsu_stunned_sprite_path =
  '/resources/characters/iruka_umino/part_1/sprites/sexy_jutsu_stunned.png';
const failed_clone_sprite_path = '/resources/characters/naruto_uzumaki/academy_newbie/sprites/failed_clone.png';
const movement_loop_sfx_key = 'naruto-story-movement';
const substitution_destination_icon_path =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#ffffff"/>
      <g fill="#2b2117">
        <ellipse cx="22" cy="22" rx="6" ry="9"/>
        <ellipse cx="17" cy="35" rx="3.2" ry="4.8"/>
        <ellipse cx="24" cy="41" rx="2.8" ry="4.2"/>
        <ellipse cx="31" cy="34" rx="2.6" ry="4"/>
        <ellipse cx="42" cy="28" rx="6" ry="9"/>
        <ellipse cx="37" cy="41" rx="3.2" ry="4.8"/>
        <ellipse cx="45" cy="47" rx="2.8" ry="4.2"/>
        <ellipse cx="51" cy="40" rx="2.6" ry="4"/>
      </g>
    </svg>`,
  );

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

type TemporaryWorldSprite = ActiveProjectile;

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

type NarutoJutsuPose = 'infuse' | 'sexy' | null;
type IrukaReactionPose = 'sexy_stunned' | null;

type TemporaryCloneState = {
  id: string;
  coord: HexCoord;
  facing: CharacterFacing;
};

type TemporaryHiddenCharacterId = typeof naruto_character_id;

const smoke_puff_effect_duration_ms = 640;

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

type JutsuId = 'infuse_chakra' | 'clone' | 'substitution' | 'transformation' | 'sexy';

type JutsuEntry = {
  id: JutsuId;
  label: string;
  abbreviation: string;
  icon?: string | null;
};

type QueuedActionSlot = {
  id: string;
  label: string;
  abbreviation?: string;
  icon?: string | null;
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

const naruto_jutsu_list: JutsuEntry[] = [
  {
    id: 'infuse_chakra',
    label: 'Infuse Chakra',
    abbreviation: 'IC',
    icon: infuse_chakra_icon_path,
  },
  {
    id: 'clone',
    label: 'Clone Jutsu',
    abbreviation: 'CL',
    icon: clone_jutsu_icon_path,
  },
  {
    id: 'substitution',
    label: 'Substitution Jutsu',
    abbreviation: 'SUB',
    icon: substitution_icon_path,
  },
  {
    id: 'transformation',
    label: 'Transformation Jutsu',
    abbreviation: 'TRN',
    icon: transformation_icon_path,
  },
  {
    id: 'sexy',
    label: 'Sexy Jutsu',
    abbreviation: 'SX',
    icon: sexy_jutsu_icon_path,
  },
];

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
  const [jutsu_ui_unlocked, set_jutsu_ui_unlocked] = useState(false);
  const [jutsu_panel_open, set_jutsu_panel_open] = useState(true);
  const [queued_jutsu_ids, set_queued_jutsu_ids] = useState<JutsuId[]>([]);
  const [substitution_destination_tile, set_substitution_destination_tile] = useState<HexCoord | null>(null);
  const [is_selecting_substitution_destination, set_is_selecting_substitution_destination] = useState(false);
  const [naruto_jutsu_pose, set_naruto_jutsu_pose] = useState<NarutoJutsuPose>(null);
  const [iruka_reaction_pose, set_iruka_reaction_pose] = useState<IrukaReactionPose>(null);
  const [temporary_failed_clone, set_temporary_failed_clone] = useState<TemporaryCloneState | null>(null);
  const [hidden_character_ids, set_hidden_character_ids] = useState<Partial<Record<TemporaryHiddenCharacterId, true>>>({});
  const [is_executing_jutsu_chain, set_is_executing_jutsu_chain] = useState(false);
  const [world_effects, set_world_effects] = useState<WorldEffectRenderable[]>([]);
  const [active_projectile, set_active_projectile] = useState<ActiveProjectile | null>(null);
  const [temporary_world_sprites, set_temporary_world_sprites] = useState<TemporaryWorldSprite[]>([]);
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
  const [transient_dialogue_line, set_transient_dialogue_line] = useState<OverrideDialogueLine | null>(null);
  const [clear_naruto_pose_on_next_advance, set_clear_naruto_pose_on_next_advance] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const override_dialogue_finish_ref = useRef<(() => void) | null>(null);
  const transient_dialogue_timeout_ref = useRef<number | null>(null);
  const challenge_runtime_ref = useRef({
    active: false,
    override: false,
  });
  const countdown_beep_stage_ref = useRef<string | null>(null);
  const danger_beep_step_ref = useRef<number | null>(null);
  const challenge_ten_second_vox_ref = useRef(false);
  const [iruka_reaction_rotation_deg, set_iruka_reaction_rotation_deg] = useState(5);
  const line_vox_key_ref = useRef<string | null>(null);
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
    return () => {
      if (transient_dialogue_timeout_ref.current !== null) {
        window.clearTimeout(transient_dialogue_timeout_ref.current);
      }
    };
  }, []);

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
    const active_text = speech_state.active_line?.text?.toLowerCase() ?? '';
    if (
      speech_state.wait_key === infuse_chakra_wait_key
      || speech_state.wait_key === clone_wait_key
      || speech_state.wait_key === transformation_infuse_wait_key
      || speech_state.wait_key === transformation_wait_key
      || speech_state.wait_key === sexy_infuse_wait_key
      || speech_state.wait_key === sexy_wait_key
      || active_text.includes('clone jutsu')
      || active_text.includes('transformation jutsu')
      || active_text.includes('sexy jutsu')
      || active_text.includes('infuse chakra')
      || active_text.includes('jutsu panel')
    ) {
      set_jutsu_ui_unlocked(true);
      set_jutsu_panel_open(true);
    }
  }, [speech_state.active_line?.text, speech_state.wait_key]);

  useEffect(() => {
    if (iruka_reaction_pose !== 'sexy_stunned') {
      return;
    }

    set_iruka_reaction_rotation_deg(5);
    const interval_id = window.setInterval(() => {
      set_iruka_reaction_rotation_deg((current) => (current > 0 ? -5 : 5));
    }, 1000);

    return () => {
      window.clearInterval(interval_id);
    };
  }, [iruka_reaction_pose]);

  useEffect(() => {
    const speaker = speech_state.active_line?.speaker ?? '';
    const text = speech_state.active_line?.text ?? '';
    const line_key = `${speaker}::${text}`;

    if (!text) {
      line_vox_key_ref.current = null;
      return;
    }

    if (line_vox_key_ref.current === line_key) {
      return;
    }

    line_vox_key_ref.current = line_key;

    if (speaker === 'iruka_umino' && text === 'Ugh... N-Naruto...') {
      play_vox(iruka_sexy_jutsu_stun_vox_path, 0.92);
      return;
    }

    if (speaker === 'naruto_uzumaki' && text === "Got ya. That's my Sexy Jutsu!") {
      play_vox(got_ya_thats_my_sexy_jutsu_vox_path, 0.92);
    }
  }, [speech_state.active_line?.speaker, speech_state.active_line?.text]);

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

  const base_naruto_character = useMemo(
    () => stage_scene?.characters.find((character) => character.id === naruto_character_id) ?? null,
    [stage_scene],
  );
  const base_iruka_character = useMemo(
    () => stage_scene?.characters.find((character) => character.id === iruka_character_id) ?? null,
    [stage_scene],
  );

  const naruto_pose_defaults_override = useMemo(() => {
    if (!base_naruto_character || !naruto_jutsu_pose) {
      return null;
    }

    const pose_paths =
      naruto_jutsu_pose === 'sexy'
        ? naruto_sexy_jutsu_sprite_paths
        : naruto_infuse_sprite_paths;

    return {
      ...base_naruto_character.defaults,
      sprite_front: pose_paths.front,
      sprite_back: pose_paths.back,
      sprite_left: pose_paths.left,
      sprite_right: pose_paths.right,
    };
  }, [base_naruto_character, naruto_jutsu_pose]);

  const iruka_pose_defaults_override = useMemo(() => {
    if (!base_iruka_character || iruka_reaction_pose !== 'sexy_stunned') {
      return null;
    }

    return {
      ...base_iruka_character.defaults,
      sprite_front: iruka_sexy_jutsu_stunned_sprite_path,
      sprite_back: iruka_sexy_jutsu_stunned_sprite_path,
      sprite_left: iruka_sexy_jutsu_stunned_sprite_path,
      sprite_right: iruka_sexy_jutsu_stunned_sprite_path,
    };
  }, [base_iruka_character, iruka_reaction_pose]);

  const temporary_failed_clone_character = useMemo<LoadedCharacter | null>(() => {
    if (!base_naruto_character || !temporary_failed_clone) {
      return null;
    }

    return {
      id: temporary_failed_clone.id,
      coord: temporary_failed_clone.coord,
      facing: temporary_failed_clone.facing,
      scale: base_naruto_character.scale,
      info: {
        ...base_naruto_character.info,
        name: 'Failed Clone',
      },
      defaults: {
        id: 'naruto_failed_clone',
        sprite_front: failed_clone_sprite_path,
        sprite_back: failed_clone_sprite_path,
        sprite_left: failed_clone_sprite_path,
        sprite_right: failed_clone_sprite_path,
      },
    };
  }, [base_naruto_character, temporary_failed_clone]);

  const rendered_scene = useMemo(() => {
    if (!stage_scene) {
      return null;
    }

    return {
      ...stage_scene,
      characters: [
        ...stage_scene.characters
          .filter((character) => !hidden_character_ids[character.id as TemporaryHiddenCharacterId])
          .map((character) => ({
            ...character,
            coord: character_coord_overrides[character.id] ?? character.coord,
            facing: character_facing_overrides[character.id] ?? character.facing,
            info:
              character.id === naruto_character_id && naruto_jutsu_pose === 'sexy'
                ? {
                    ...character.info,
                    height_cm: 169,
                  }
                : character.info,
            defaults:
              character.id === naruto_character_id && naruto_pose_defaults_override
                ? naruto_pose_defaults_override
                : character.id === iruka_character_id && iruka_pose_defaults_override
                  ? iruka_pose_defaults_override
                  : character.defaults,
          })),
        ...(temporary_failed_clone_character ? [temporary_failed_clone_character] : []),
      ],
    };
  }, [
    character_coord_overrides,
    character_facing_overrides,
    hidden_character_ids,
    iruka_pose_defaults_override,
    naruto_pose_defaults_override,
    stage_scene,
    temporary_failed_clone_character,
  ]);

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
  const substitution_blocked_tile_keys = useMemo(() => {
    if (!stage_scene) {
      return new Set<string>();
    }

    const blocked = new Set(stage_scene.props.map((prop) => key_hex(prop.coord)));
    if (iruka_current_coord) {
      blocked.add(key_hex(iruka_current_coord));
    }
    if (naruto_current_coord) {
      blocked.add(key_hex(naruto_current_coord));
    }

    return blocked;
  }, [iruka_current_coord, naruto_current_coord, stage_scene]);

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
    ],
    [shuriken_count],
  );

  const queued_action_slots = useMemo(() => {
    const action_entries = queued_jutsu_ids.reduce<QueuedActionSlot[]>((current, queued_id) => {
      const entry = naruto_jutsu_list.find((jutsu) => jutsu.id === queued_id);
      if (!entry) {
        return current;
      }

      current.push({
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
        abbreviation: entry.abbreviation,
      });
      return current;
    }, []);

    if (substitution_destination_tile) {
      action_entries.push({
        id: `substitution-destination:${key_hex(substitution_destination_tile)}`,
        label: `Reappear at q ${substitution_destination_tile.q} | r ${substitution_destination_tile.r} | s ${substitution_destination_tile.s}`,
        icon: substitution_destination_icon_path,
        abbreviation: 'RE',
      });
    }

    return Array.from({ length: 3 }, (_, index) => action_entries[index] ?? null);
  }, [queued_jutsu_ids, substitution_destination_tile]);

  const selected_inventory_item =
    selected_inventory_index !== null
      ? inventory_slots[selected_inventory_index]
      : null;
  const should_highlight_shuriken_slot =
    (speech_state.active_line?.text ?? '').includes('Click the **shuriken** in your inventory.')
    || (speech_state.wait_key === throw_wait_key && selected_inventory_index !== 0);
  const highlighted_jutsu_id =
    (
      speech_state.wait_key === infuse_chakra_wait_key
      || speech_state.wait_key === substitution_infuse_wait_key
      || speech_state.wait_key === transformation_infuse_wait_key
      || speech_state.wait_key === sexy_infuse_wait_key
    ) && !queued_jutsu_ids.includes('infuse_chakra')
      ? 'infuse_chakra'
      : speech_state.wait_key === clone_wait_key && !queued_jutsu_ids.includes('clone')
        ? 'clone'
        : speech_state.wait_key === transformation_wait_key && !queued_jutsu_ids.includes('transformation')
          ? 'transformation'
        : speech_state.wait_key === sexy_wait_key && !queued_jutsu_ids.includes('sexy')
          ? 'sexy'
        : speech_state.wait_key === substitution_destination_wait_key && !queued_jutsu_ids.includes('substitution')
          ? 'substitution'
        : null;
  const is_clone_chain_valid =
    queued_jutsu_ids[0] === 'infuse_chakra' &&
    queued_jutsu_ids[1] === 'clone';
  const is_substitution_chain_valid =
    queued_jutsu_ids[0] === 'infuse_chakra' &&
    queued_jutsu_ids[1] === 'substitution' &&
    Boolean(substitution_destination_tile);
  const is_transformation_chain_valid =
    queued_jutsu_ids[0] === 'infuse_chakra' &&
    queued_jutsu_ids[1] === 'transformation';
  const is_sexy_chain_valid =
    queued_jutsu_ids[0] === 'infuse_chakra' &&
    queued_jutsu_ids[1] === 'sexy';
  const should_highlight_ready_check =
    (
      speech_state.wait_key === ready_clone_wait_key
      || speech_state.wait_key === ready_substitution_wait_key
      || speech_state.wait_key === ready_transformation_wait_key
      || speech_state.wait_key === ready_sexy_wait_key
    ) &&
    !speech_state.is_wait_satisfied;
  const naruto_status_panel = useMemo(() => {
    const naruto = base_naruto_character;
    if (!naruto) {
      return null;
    }

    return {
      avatar: `/resources/characters/${naruto.defaults.id}/sprites/neutral_avatar.png`,
      name: naruto.info.name,
      bars: [
        { label: 'stamina', value: 1, tone: 'stamina' as const },
        { label: 'chakra_infused', value: 0, tone: 'chakra_infused' as const },
        { label: 'chakra_pool', value: 1, tone: 'chakra_pool' as const },
      ],
    };
  }, [base_naruto_character]);
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
      play_vox(here_i_go_vox_path, 0.92);
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
      challenge_ten_second_vox_ref.current = false;
      return;
    }

    const seconds_remaining = Math.ceil(challenge_timer_remaining / 1000);
    if (seconds_remaining > 10) {
      challenge_ten_second_vox_ref.current = false;
    } else if (!challenge_ten_second_vox_ref.current) {
      challenge_ten_second_vox_ref.current = true;
      play_vox(challenge_ten_second_vox_path, 0.92);
    }

    if (seconds_remaining > 5 || seconds_remaining < 2) {
      return;
    }

    if (danger_beep_step_ref.current === seconds_remaining) {
      return;
    }

    danger_beep_step_ref.current = seconds_remaining;
    play_beep({ frequency: 720, duration_ms: 85, gain: 0.052 });
  }, [challenge_state.phase, challenge_timer_remaining, is_challenge_active]);

  useEffect(() => {
    if (
      !is_challenge_active ||
      challenge_state.phase !== 'throw' ||
      !challenge_state.target_prop_id ||
      selected_inventory_item?.icon !== shuriken_icon_path
    ) {
      return;
    }

    set_hovered_target_prop_id(challenge_state.target_prop_id);
  }, [challenge_state.phase, challenge_state.target_prop_id, is_challenge_active, selected_inventory_item]);

  useEffect(() => {
    if (
      !is_challenge_active ||
      challenge_state.phase !== 'throw' ||
      !challenge_target_prop ||
      selected_inventory_item?.icon !== shuriken_icon_path ||
      !naruto_current_coord
    ) {
      return;
    }

    set_hovered_target_prop_id(challenge_target_prop.id);
    set_character_facing_overrides((current) => ({
      ...current,
      [naruto_character_id]: get_facing_for_step(naruto_current_coord, challenge_target_prop.coord),
    }));
  }, [
    challenge_state.phase,
    challenge_target_prop,
    is_challenge_active,
    naruto_current_coord,
    selected_inventory_item,
  ]);

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
    if (is_selecting_substitution_destination && hovered_destination_tile && is_valid_substitution_destination(hovered_destination_tile)) {
      return [hovered_destination_tile];
    }

    if (substitution_destination_tile) {
      return [substitution_destination_tile];
    }

    if (is_challenge_active && challenge_state.phase === 'move' && challenge_state.destination_tile) {
      return [challenge_state.destination_tile];
    }

    if (!active_objective || speech_state.is_wait_satisfied) {
      return [];
    }

    return [active_objective.target];
  }, [
    active_objective,
    challenge_state.destination_tile,
    challenge_state.phase,
    hovered_destination_tile,
    is_challenge_active,
    is_selecting_substitution_destination,
    speech_state.is_wait_satisfied,
    substitution_destination_tile,
  ]);

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

  function clearTransientDialogue() {
    if (transient_dialogue_timeout_ref.current !== null) {
      window.clearTimeout(transient_dialogue_timeout_ref.current);
      transient_dialogue_timeout_ref.current = null;
    }

    set_transient_dialogue_line(null);
  }

  function showTransientDialogue(line: OverrideDialogueLine, duration_ms = 860) {
    clearTransientDialogue();
    set_transient_dialogue_line(line);
    transient_dialogue_timeout_ref.current = window.setTimeout(() => {
      transient_dialogue_timeout_ref.current = null;
      set_transient_dialogue_line(null);
    }, duration_ms);
  }

  function spawn_world_effect(
    kind: WorldEffectRenderable['kind'],
    coord: HexCoord,
    options?: {
      size_m?: number;
      offset_x?: number;
      offset_y?: number;
      offset_z?: number;
      duration_ms?: number;
    },
  ) {
    const world_position = flat_top_hex_to_world(coord, default_projection_settings.tile_radius);
    const effect_id = `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const created_at_ms = window.performance.now();
    const duration_ms = options?.duration_ms ?? smoke_puff_effect_duration_ms;
    const effect: WorldEffectRenderable = {
      id: effect_id,
      kind,
      size_m: options?.size_m ?? 1,
      created_at_ms,
      duration_ms,
      world_position: {
        x: world_position.x + (options?.offset_x ?? 0),
        y: world_position.y + (options?.offset_y ?? 0),
        z: world_position.z + (options?.offset_z ?? 0),
      },
    };

    set_world_effects((current) => [...current, effect]);

    window.setTimeout(() => {
      set_world_effects((current) => current.filter((entry) => entry.id !== effect_id));
    }, duration_ms);
  }

  function pick_free_clone_coord(origin: HexCoord) {
    if (!stage_scene) {
      return null;
    }

    const walkable_tile_keys = new Set(stage_scene.map.tiles.map((tile) => key_hex(tile.coord)));
    const blocked_tile_keys = new Set(stage_scene.props.map((prop) => key_hex(prop.coord)));
    const iruka_coord = get_character_current_coord(stage_scene, character_coord_overrides, iruka_character_id);
    if (iruka_coord) {
      blocked_tile_keys.add(key_hex(iruka_coord));
    }

    const free_neighbors = get_hex_neighbors(origin).filter((coord) => {
      const coord_key = key_hex(coord);
      return walkable_tile_keys.has(coord_key) && !blocked_tile_keys.has(coord_key);
    });

    if (free_neighbors.length === 0) {
      return null;
    }

    return free_neighbors[Math.floor(Math.random() * free_neighbors.length)] ?? null;
  }

  function is_valid_substitution_destination(coord: HexCoord) {
    if (!stage_scene) {
      return false;
    }

    const tile_exists = stage_scene.map.tiles.some((tile) => key_hex(tile.coord) === key_hex(coord));
    if (!tile_exists) {
      return false;
    }

    return !substitution_blocked_tile_keys.has(key_hex(coord));
  }

  function get_tile_targeted_prop(coord: HexCoord) {
    if (
      is_challenge_active &&
      challenge_state.phase === 'throw' &&
      challenge_target_prop &&
      key_hex(challenge_target_prop.coord) === key_hex(coord)
    ) {
      return challenge_target_prop;
    }

    if (
      active_throw_objective &&
      active_target_prop &&
      !speech_state.is_wait_satisfied &&
      key_hex(active_target_prop.coord) === key_hex(coord)
    ) {
      return active_target_prop;
    }

    return null;
  }

  const animate_projectile_along_world_path = (
    world_path: WorldPoint[],
    options: {
      sprite: string;
      size_m: number;
      duration_ms: number;
      arc_height_world: number;
      rotation_deg: number;
    },
  ) =>
    new Promise<void>((resolve) => {
      const segment_lengths = world_path.slice(0, -1).map((point, index) => {
        const next = world_path[index + 1];
        return Math.hypot(next.x - point.x, next.y - point.y);
      });
      const total_path_length = Math.max(
        1,
        segment_lengths.reduce((total, length) => total + length, 0),
      );
      const projectile_id = `projectile:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      const start_time = window.performance.now();

      const animate_throw = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - start_time) / options.duration_ms));
        const arc_height = Math.sin(progress * Math.PI) * options.arc_height_world;
        const traveled_length = total_path_length * progress;
        const sampled_position = sample_world_path_position(world_path, segment_lengths, traveled_length);

        set_active_projectile({
          id: projectile_id,
          sprite: options.sprite,
          size_m: options.size_m,
          rotation_deg: progress * options.rotation_deg,
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
        resolve();
      };

      window.requestAnimationFrame(animate_throw);
    });

  const animate_substitution_log_fall = (
    origin_coord: HexCoord,
    stuck_shuriken_sprite: string,
    stuck_shuriken_rotation_deg: number,
  ) =>
    new Promise<void>((resolve) => {
      const origin_world = flat_top_hex_to_world(origin_coord, default_projection_settings.tile_radius);
      const start_time = window.performance.now();

      const animate = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - start_time) / substitution_log_drop_duration_ms));
        const eased = 1 - Math.pow(1 - progress, 3);
        const log_world_position: WorldPoint = {
          x: origin_world.x + 0.06 * eased,
          y: origin_world.y + 0.18 * eased,
          z: origin_world.z + 0.82 * (1 - eased) + 0.05,
        };
        const log_rotation_deg = 94 * eased;
        const shuriken_world_position: WorldPoint = {
          x: log_world_position.x + 0.02,
          y: log_world_position.y - 0.03 + 0.04 * eased,
          z: log_world_position.z + 0.34 - 0.14 * eased,
        };

        set_temporary_world_sprites([
          {
            id: 'substitution-log',
            sprite: substitution_log_sprite_path,
            size_m: 0.96,
            rotation_deg: log_rotation_deg,
            world_position: log_world_position,
          },
          {
            id: 'substitution-log-shuriken',
            sprite: stuck_shuriken_sprite,
            size_m: 0.19,
            rotation_deg: stuck_shuriken_rotation_deg + log_rotation_deg,
            world_position: shuriken_world_position,
          },
        ]);

        if (progress < 1) {
          window.requestAnimationFrame(animate);
          return;
        }

        resolve();
      };

      window.requestAnimationFrame(animate);
    });

  const execute_clone_chain = async () => {
    if (
      !base_naruto_character ||
      !naruto_current_coord ||
      speech_state.wait_key !== ready_clone_wait_key ||
      speech_state.is_wait_satisfied ||
      !is_clone_chain_valid ||
      is_executing_jutsu_chain
    ) {
      return;
    }

    const clone_coord = pick_free_clone_coord(naruto_current_coord);
    if (!clone_coord) {
      return;
    }

    set_is_executing_jutsu_chain(true);
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_selected_inventory_index(null);

    play_sfx(handsign_sfx_path, 0.76);
    spawn_world_effect('chakra_burst', naruto_current_coord, {
      size_m: 2.24,
      offset_z: 0.96,
      duration_ms: 960,
    });
    set_naruto_jutsu_pose('infuse');
    await delay_ms(760);

    spawn_world_effect('smoke_puff', clone_coord, {
      size_m: 1.52,
      offset_z: 1.02,
      duration_ms: 900,
    });
    set_temporary_failed_clone({
      id: `failed-clone:${Date.now()}`,
      coord: clone_coord,
      facing: character_facing_overrides[naruto_character_id] ?? base_naruto_character.facing,
    });
    play_sfx(clone_sfx_path, 0.82);
    set_queued_jutsu_ids([]);
    await delay_ms(320);

    set_naruto_jutsu_pose(null);
    queueOverrideDialogue(
      [
        { speaker: 'naruto_uzumaki', text: "Tch... what kind of lousy clone is that?" },
        { speaker: 'iruka_umino', text: 'Because you are not focused. Stop fooling around, be serious, and concentrate!' },
        { speaker: 'naruto_uzumaki', text: 'I **am** being serious!' },
      ],
      () => {
        spawn_world_effect('smoke_puff', clone_coord, {
          size_m: 1.46,
          offset_z: 1.02,
          duration_ms: 900,
        });
        play_sfx(disperse_sfx_path, 0.78);
        set_temporary_failed_clone(null);
        set_is_executing_jutsu_chain(false);
        fulfill_wait(ready_clone_wait_key);
      },
    );
  };

  const execute_substitution_chain = async () => {
    if (
      !stage_scene ||
      !naruto_current_coord ||
      !iruka_current_coord ||
      !substitution_destination_tile ||
      speech_state.wait_key !== ready_substitution_wait_key ||
      speech_state.is_wait_satisfied ||
      !is_substitution_chain_valid ||
      is_executing_jutsu_chain
    ) {
      return;
    }

    const facing_after_reappear = get_facing_for_step(naruto_current_coord, substitution_destination_tile);
    const throw_world_path = [
      {
        ...flat_top_hex_to_world(iruka_current_coord, default_projection_settings.tile_radius),
        z: 0.78,
      },
      {
        ...flat_top_hex_to_world(naruto_current_coord, default_projection_settings.tile_radius),
        z: 0.92,
      },
    ];
    const stuck_shuriken_sprite = pick_random_stuck_shuriken_sprite();
    const stuck_shuriken_rotation = random_between(-28, 28);

    set_is_executing_jutsu_chain(true);
    set_is_selecting_substitution_destination(false);
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_selected_inventory_index(null);

    play_sfx(handsign_sfx_path, 0.76);
    spawn_world_effect('chakra_burst', naruto_current_coord, {
      size_m: 2.24,
      offset_z: 0.96,
      duration_ms: 960,
    });
    set_naruto_jutsu_pose('infuse');
    await delay_ms(760);
    set_naruto_jutsu_pose(null);

    showTransientDialogue({ speaker: 'naruto_uzumaki', text: 'Yikes!' }, 920);
    play_vox(ah_vox_path, 0.96);
    play_sfx(projectile_throw_sfx_path, 0.72);
    await animate_projectile_along_world_path(throw_world_path, {
      sprite: shuriken_icon_path,
      size_m: shuriken_projectile_size_m,
      duration_ms: substitution_projectile_duration_ms,
      arc_height_world: 0.08,
      rotation_deg: 1700,
    });

    play_sfx(projectile_hit_sfx_path, 0.74);
    play_sfx(disperse_sfx_path, 0.8);
    spawn_world_effect('smoke_puff', naruto_current_coord, {
      size_m: 1.68,
      offset_z: 1.08,
      duration_ms: 980,
    });
    set_hidden_character_ids({ [naruto_character_id]: true });
    await delay_ms(90);
    await animate_substitution_log_fall(
      naruto_current_coord,
      stuck_shuriken_sprite,
      stuck_shuriken_rotation,
    );

    set_temporary_world_sprites([]);
    set_character_coord_override(set_character_coord_overrides, naruto_character_id, substitution_destination_tile);
    set_character_facing_override(set_character_facing_overrides, naruto_character_id, facing_after_reappear);
    set_hidden_character_ids({});
    play_sfx(disperse_sfx_path, 0.78);
    play_vox(missed_me_vox_path, 0.94);
    spawn_world_effect('smoke_puff', substitution_destination_tile, {
      size_m: 1.52,
      offset_z: 1.04,
      duration_ms: 920,
    });
    set_substitution_destination_tile(null);
    set_queued_jutsu_ids([]);
    set_is_executing_jutsu_chain(false);
    fulfill_wait(ready_substitution_wait_key);
  };

  const execute_transformation_chain = async () => {
    if (
      !naruto_current_coord ||
      speech_state.wait_key !== ready_transformation_wait_key ||
      speech_state.is_wait_satisfied ||
      !is_transformation_chain_valid ||
      is_executing_jutsu_chain
    ) {
      return;
    }

    set_is_executing_jutsu_chain(true);
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_selected_inventory_index(null);

    play_sfx(handsign_sfx_path, 0.76);
    spawn_world_effect('chakra_burst', naruto_current_coord, {
      size_m: 2.24,
      offset_z: 0.96,
      duration_ms: 960,
    });
    set_naruto_jutsu_pose('infuse');
    await delay_ms(760);

    spawn_world_effect('smoke_puff', naruto_current_coord, {
      size_m: 1.58,
      offset_z: 1.04,
      duration_ms: 920,
    });
    play_vox(haha_vox_path, 0.92);
    play_sfx(disperse_sfx_path, 0.78);
    set_queued_jutsu_ids([]);
    set_clear_naruto_pose_on_next_advance(true);
    set_is_executing_jutsu_chain(false);
    fulfill_wait(ready_transformation_wait_key);
  };

  const execute_sexy_chain = async () => {
    if (
      !naruto_current_coord ||
      speech_state.wait_key !== ready_sexy_wait_key ||
      speech_state.is_wait_satisfied ||
      !is_sexy_chain_valid ||
      is_executing_jutsu_chain
    ) {
      return;
    }

    set_is_executing_jutsu_chain(true);
    set_hovered_destination_tile(null);
    set_hovered_target_prop_id(null);
    set_selected_inventory_index(null);

    play_sfx(handsign_sfx_path, 0.76);
    spawn_world_effect('chakra_burst', naruto_current_coord, {
      size_m: 2.24,
      offset_z: 0.96,
      duration_ms: 960,
    });
    set_naruto_jutsu_pose('infuse');
    await delay_ms(760);

    spawn_world_effect('smoke_puff', naruto_current_coord, {
      size_m: 1.62,
      offset_z: 1.06,
      duration_ms: 920,
    });
    play_sfx(disperse_sfx_path, 0.78);
    void play_looping_track(sexiness_music_path, { restart: true });
    play_vox(sexy_jutsu_vox_path, 0.94);
    set_naruto_jutsu_pose('sexy');
    set_iruka_reaction_pose('sexy_stunned');
    showTransientDialogue({ speaker: 'iruka_umino', text: 'AAARGH!?' }, 980);
    set_queued_jutsu_ids([]);
    set_clear_naruto_pose_on_next_advance(true);
    set_is_executing_jutsu_chain(false);
    fulfill_wait(ready_sexy_wait_key);
  };

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

    flushSync(() => {
      set_hovered_destination_tile(null);
      set_hovered_target_prop_id(target_post.id);
      set_active_path_family('short');
      set_active_path_variant('shortest');
      set_challenge_state((current) => ({
        ...current,
        phase: 'throw',
        target_prop_id: target_post.id,
      }));
    });
  }

  function handleChallengeThrowComplete() {
    if (!challenge_runtime_ref.current.active || challenge_runtime_ref.current.override) {
      return;
    }

    const next_destination_tile = pickChallengeDestination();
    flushSync(() => {
      set_hovered_target_prop_id(null);
      set_active_path_family('short');
      set_active_path_variant('shortest');
    });

    if (!next_destination_tile && challenge_state.round_index + 1 < challenge_round_count) {
      fulfill_wait(challenge_wait_key);
      return;
    }

    set_challenge_state((current) => {
      const next_round_index = current.round_index + 1;
      if (next_round_index >= challenge_round_count) {
        set_challenge_success_banner_visible(true);
        play_vox(lucky_me_vox_path, 0.96);
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
    const movement_loop_key = `${movement_loop_sfx_key}:${character_id}`;
    if (move_speed === 'walk') {
      start_looping_sfx(movement_loop_key, walk_loop_sfx_path, 0.46);
    } else if (move_speed === 'run' && character_id === naruto_character_id) {
      start_looping_sfx(movement_loop_key, run_loop_sfx_path, 0.5);
    } else if (move_speed === 'jump' && character_id === naruto_character_id) {
      stop_looping_sfx(movement_loop_key);
      play_sfx(jump_sfx_path, 0.72);
    } else {
      stop_looping_sfx(movement_loop_key);
    }
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
        stop_looping_sfx(movement_loop_key);
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
          flushSync(() => {
            set_character_coord_override(set_character_coord_overrides, character_id, to_coord);
            set_character_moving(set_moving_characters, character_id, false);
          });
          stop_looping_sfx(movement_loop_key);
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
    stop_looping_sfx(`${movement_loop_sfx_key}:${character_id}`);
    if (character_id === naruto_character_id) {
      play_sfx(jump_sfx_path, 0.72);
    }
    set_character_facing_override(set_character_facing_overrides, character_id, get_facing_for_step(current_coord, coord));
    set_character_world_override(set_character_world_overrides, character_id, null);
    flushSync(() => {
      set_character_coord_override(set_character_coord_overrides, character_id, coord);
      set_character_moving(set_moving_characters, character_id, false);
    });

    window.setTimeout(() => {
      on_complete();
    }, 80);
  };

  const clear_path_preview_selection = () => {
    set_hovered_destination_tile(null);
    set_active_path_family('short');
    set_active_path_variant('shortest');
  };

  const fulfill_movement_wait = (fallback_wait_key: string) => {
    const resolved_wait_key = speech_state.wait_key ?? fallback_wait_key;

    if (resolved_wait_key === move_wait_key) {
      play_vox(here_vox_path, 0.92);
    } else if (resolved_wait_key === run_wait_key || resolved_wait_key === teleport_wait_key) {
      play_vox(great_vox_path, 0.92);
    }

    fulfill_wait(resolved_wait_key);
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
        fulfill_movement_wait(jump_wait_key);
      });
      return;
    }

    if (input_type === 'right_hold' && active_objective.move_speed === 'teleport') {
      clear_path_preview_selection();
      teleport_to_coord(naruto_character_id, active_objective.target, () => {
        fulfill_movement_wait(teleport_wait_key);
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
        fulfill_movement_wait(route_wait_key);
      });
      return;
    }

    clear_path_preview_selection();
    hop_along_path(naruto_character_id, [naruto_current_coord, active_objective.target], active_objective.move_speed ?? 'walk', () => {
      fulfill_movement_wait(move_wait_key);
    });
  };

  const handle_tile_click = (coord: HexCoord) => {
    if (is_selecting_substitution_destination) {
      if (!is_valid_substitution_destination(coord)) {
        return;
      }

      set_substitution_destination_tile(coord);
      set_is_selecting_substitution_destination(false);
      set_hovered_destination_tile(coord);
      if (speech_state.wait_key === substitution_destination_wait_key) {
        fulfill_wait(substitution_destination_wait_key);
      }
      return;
    }

    const tile_target_prop = get_tile_targeted_prop(coord);
    if (tile_target_prop && selected_inventory_item?.icon === shuriken_icon_path && naruto_current_coord) {
      if (
        is_challenge_active &&
        challenge_state.phase === 'throw' &&
        tile_target_prop.id === challenge_state.target_prop_id
      ) {
        const throw_path =
          active_preview_path && active_preview_path.length >= 2
            ? active_preview_path
            : [naruto_current_coord, tile_target_prop.coord];

        throw_shuriken_at_prop(tile_target_prop, throw_path, handleChallengeThrowComplete);
        return;
      }

      if (
        active_throw_objective &&
        !speech_state.is_wait_satisfied &&
        tile_target_prop.id === active_throw_objective.target_prop_id
      ) {
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
            : [naruto_current_coord, tile_target_prop.coord];

        throw_shuriken_at_prop(tile_target_prop, throw_path, () => {
          fulfill_wait(speech_state.wait_key ?? throw_wait_key);
        });
        return;
      }
    }

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
    if (is_selecting_substitution_destination) {
      if (!coord) {
        set_hovered_destination_tile(null);
        return;
      }

      if (naruto_current_coord && is_valid_substitution_destination(coord)) {
        set_character_facing_overrides((current) => ({
          ...current,
          [naruto_character_id]: get_facing_for_step(naruto_current_coord, coord),
        }));
      }

      set_hovered_destination_tile(coord);
      return;
    }

    if (
      coord &&
      selected_inventory_item?.icon === shuriken_icon_path
    ) {
      const tile_target_prop = get_tile_targeted_prop(coord);
      if (tile_target_prop && naruto_current_coord) {
        set_hovered_target_prop_id(tile_target_prop.id);
        set_hovered_destination_tile(null);
        set_character_facing_overrides((current) => ({
          ...current,
          [naruto_character_id]: get_facing_for_step(naruto_current_coord, tile_target_prop.coord),
        }));
        return;
      }
    }

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

    if (is_challenge_active && challenge_state.phase === 'throw' && challenge_state.target_prop_id) {
      if (prop_id === null) {
        return;
      }
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
    const throw_vox_path =
      shuriken_throw_vox_paths[Math.floor(Math.random() * shuriken_throw_vox_paths.length)] ??
      shuriken_throw_vox_paths[0];

    set_hovered_target_prop_id(null);
    play_sfx(projectile_throw_sfx_path, 0.72);
    play_vox(throw_vox_path, 0.9);

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
      play_sfx(projectile_hit_sfx_path, 0.74);
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
    is_challenge_active && !is_override_dialogue_active && !transient_dialogue_line
      ? null
      : active_override_dialogue_line
      ? {
          speaker: active_override_dialogue_line.speaker,
          text: active_override_dialogue_line.text,
        }
      : transient_dialogue_line
        ? {
            speaker: transient_dialogue_line.speaker,
            text: transient_dialogue_line.text,
          }
      : speech_state.is_hidden
        ? null
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

    if (transient_dialogue_line) {
      clearTransientDialogue();
      return;
    }

    if (clear_naruto_pose_on_next_advance) {
      set_clear_naruto_pose_on_next_advance(false);
      if (naruto_current_coord && naruto_jutsu_pose === 'sexy') {
        spawn_world_effect('smoke_puff', naruto_current_coord, {
          size_m: 1.58,
          offset_z: 1.04,
          duration_ms: 900,
        });
        play_sfx(disperse_sfx_path, 0.78);
        if (stage_scene?.music_path) {
          void play_looping_track(stage_scene.music_path, { restart: true });
        }
      }
      set_naruto_jutsu_pose(null);
    }

    advance();
  };

  const handle_select_jutsu = (jutsu_id: string) => {
    const typed_jutsu_id = jutsu_id as JutsuId;

    if (typed_jutsu_id === 'substitution') {
      set_is_selecting_substitution_destination(true);
      set_substitution_destination_tile(null);
      set_hovered_destination_tile(null);
    }

    set_queued_jutsu_ids((current) => {
      const occupied_slots = current.length + (substitution_destination_tile ? 1 : 0);
      if (current.includes(typed_jutsu_id) || occupied_slots >= 3) {
        return current;
      }

      return [...current, typed_jutsu_id];
    });

    if (
      typed_jutsu_id === 'infuse_chakra' &&
      (
        speech_state.wait_key === infuse_chakra_wait_key
        || speech_state.wait_key === substitution_infuse_wait_key
        || speech_state.wait_key === transformation_infuse_wait_key
        || speech_state.wait_key === sexy_infuse_wait_key
      )
    ) {
      const wait_key = speech_state.wait_key;
      if (wait_key) {
        fulfill_wait(wait_key);
      }
      return;
    }

    if (typed_jutsu_id === 'clone' && speech_state.wait_key === clone_wait_key) {
      fulfill_wait(clone_wait_key);
      return;
    }

    if (typed_jutsu_id === 'transformation' && speech_state.wait_key === transformation_wait_key) {
      fulfill_wait(transformation_wait_key);
      return;
    }

    if (typed_jutsu_id === 'sexy' && speech_state.wait_key === sexy_wait_key) {
      fulfill_wait(sexy_wait_key);
    }
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
  const iruka_rotation_overrides = useMemo<Partial<Record<string, number>>>(() => {
    if (iruka_reaction_pose !== 'sexy_stunned') {
      return {};
    }

    return {
      [iruka_character_id]: iruka_reaction_rotation_deg,
    };
  }, [iruka_reaction_pose, iruka_reaction_rotation_deg]);
  const iruka_shadow_anchor_modes = useMemo<Partial<Record<string, 'feet' | 'body'>>>(() => {
    if (iruka_reaction_pose !== 'sexy_stunned') {
      return {};
    }

    return {
      [iruka_character_id]: 'body',
    };
  }, [iruka_reaction_pose]);

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
            character_rotation_overrides={iruka_rotation_overrides}
            character_shadow_anchor_modes={iruka_shadow_anchor_modes}
            path_preview={
              active_preview_path
                ? {
                    path: active_preview_path,
                    family: active_path_family,
                    tone: path_preview_tone,
                  }
                : null
            }
            projectiles={[
              ...temporary_world_sprites,
              ...(active_projectile ? [active_projectile] : []),
            ]}
            prop_effects={prop_effects}
            world_effects={world_effects}
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
        {jutsu_ui_unlocked ? (
          <JutsuPanel
            is_open={jutsu_panel_open}
            items={naruto_jutsu_list}
            highlighted_item_id={highlighted_jutsu_id}
            on_toggle={() => set_jutsu_panel_open((current) => !current)}
            on_select_item={handle_select_jutsu}
          />
        ) : null}
        {inventory_unlocked || jutsu_ui_unlocked ? (
          <div className="naruto-story__bottom-hud">
            {jutsu_ui_unlocked ? (
              <ActionQueueBar
                slots={queued_action_slots}
                is_ready_enabled={
                  !is_executing_jutsu_chain &&
                  (
                    speech_state.wait_key === ready_clone_wait_key
                      ? is_clone_chain_valid
                      : speech_state.wait_key === ready_substitution_wait_key
                        ? is_substitution_chain_valid
                        : speech_state.wait_key === ready_transformation_wait_key
                          ? is_transformation_chain_valid
                        : speech_state.wait_key === ready_sexy_wait_key
                          ? is_sexy_chain_valid
                        : queued_action_slots.some(Boolean)
                  )
                }
                is_ready_highlighted={should_highlight_ready_check}
                on_ready={() => {
                  if (speech_state.wait_key === ready_substitution_wait_key) {
                    void execute_substitution_chain();
                    return;
                  }

                  if (speech_state.wait_key === ready_transformation_wait_key) {
                    void execute_transformation_chain();
                    return;
                  }

                  if (speech_state.wait_key === ready_sexy_wait_key) {
                    void execute_sexy_chain();
                    return;
                  }

                  void execute_clone_chain();
                }}
              />
            ) : null}
            {inventory_unlocked ? (
              <InventoryBar
                slots={inventory_slots}
                selected_index={selected_inventory_index}
                highlighted_indices={should_highlight_shuriken_slot ? [0] : []}
                on_select_slot={(index) => {
                  if (index !== 0 || shuriken_count <= 0) {
                    set_selected_inventory_index(null);
                    return;
                  }

                  set_selected_inventory_index((current) => {
                    const next_index = current === index ? null : index;
                    if (next_index !== null && next_index !== current) {
                      play_sfx(weapon_equip_sfx_path, 0.68);
                    }
                    return next_index;
                  });
                }}
              />
            ) : null}
          </div>
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

function delay_ms(duration_ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration_ms);
  });
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
