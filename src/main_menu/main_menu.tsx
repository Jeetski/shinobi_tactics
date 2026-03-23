import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getContainedOpaqueBounds, loadCollisionMask, type CollisionMask } from '../lib/collision_mask';
import './main_menu.css';
import {
  copy_layout_css,
  clamp,
  default_layout_positions,
  snap_to_grid,
  type LayoutItemKey,
  type LayoutPositions,
} from './layout_editor';
import {
  get_main_menu_story_index,
  get_menu_options,
  get_story_menu_new_game_index,
  type MenuScreen,
} from './menu_config';

const petal_frames = Array.from({ length: 37 }, (_, index) => {
  const padded = index.toString().padStart(2, '0');
  return `/resources/UI/main_menu/sakura_petals/frame_${padded}_delay-${index === 3 || index === 13 ? '0.05s' : '0.1s'}.png`;
});

type MainMenuProps = {
  is_enabled?: boolean;
  on_naruto_selected?: () => void;
};

export function MainMenu({ is_enabled = true, on_naruto_selected }: MainMenuProps) {
  const [menu_screen, set_menu_screen] = useState<MenuScreen>('main');
  const [selected_index, set_selected_index] = useState(0);
  const [petal_frame, set_petal_frame] = useState(0);
  const [music_track_index, set_music_track_index] = useState(0);
  const [paper_offset_style, set_paper_offset_style] = useState<{ paddingLeft: string; transform: string } | null>(null);
  const [art_masks, set_art_masks] = useState<{ scroll: CollisionMask; paper: CollisionMask } | null>(null);
  const [layout_mode, set_layout_mode] = useState(false);
  const [layout_message, set_layout_message] = useState<string | null>(null);
  const [layout_positions, set_layout_positions] = useState<LayoutPositions>(default_layout_positions);
  const menu_stage_ref = useRef<HTMLElement | null>(null);
  const scroll_button_ref = useRef<HTMLButtonElement | null>(null);
  const paper_unfurl_ref = useRef<HTMLDivElement | null>(null);
  const music_ref = useRef<HTMLAudioElement | null>(null);
  const drag_state_ref = useRef<{
    key: LayoutItemKey;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const music_tracks = useMemo(
    () => ['/resources/music/konoha_peace_1.mp3', '/resources/music/konoha_peace_2.mp3'],
    [],
  );
  const current_menu_options = useMemo(() => get_menu_options(menu_screen), [menu_screen]);
  const selected_option = useMemo(
    () => current_menu_options[selected_index] ?? current_menu_options[0],
    [current_menu_options, selected_index],
  );
  const previous_option =
    current_menu_options[(selected_index - 1 + current_menu_options.length) % current_menu_options.length];
  const next_option = current_menu_options[(selected_index + 1) % current_menu_options.length];

  useEffect(() => {
    const interval = window.setInterval(() => {
      set_petal_frame((current) => (current + 1) % petal_frames.length);
    }, 95);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const audio = music_ref.current;
    if (!audio) {
      return;
    }

    const try_play = async () => {
      try {
        await audio.play();
      } catch {
        // Ignore autoplay blocking. We retry on first user interaction.
      }
    };

    audio.volume = 0.45;
    audio.src = music_tracks[music_track_index];
    audio.load();
    void try_play();
  }, [music_track_index, music_tracks]);

  useEffect(() => {
    const audio = music_ref.current;
    if (!audio) {
      return;
    }

    const handle_ended = () => {
      set_music_track_index((current) => (current + 1) % music_tracks.length);
    };

    const unlock_playback = async () => {
      try {
        await audio.play();
      } catch {
        // Ignore repeated blocked attempts.
      }
    };

    audio.addEventListener('ended', handle_ended);
    window.addEventListener('pointerdown', unlock_playback, { passive: true });
    window.addEventListener('keydown', unlock_playback);

    return () => {
      audio.removeEventListener('ended', handle_ended);
      window.removeEventListener('pointerdown', unlock_playback);
      window.removeEventListener('keydown', unlock_playback);
    };
  }, [music_tracks.length]);

  useEffect(() => {
    if (!is_enabled) {
      return;
    }

    const handle_key_down = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        void toggle_layout_mode();
        return;
      }

      if (event.key === 'Escape') {
        if (menu_screen !== 'main') {
          event.preventDefault();
          navigate_back();
        }
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        activate_selected_option();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        set_selected_index((current) => (current + 1) % current_menu_options.length);
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        set_selected_index((current) => (current - 1 + current_menu_options.length) % current_menu_options.length);
      }
    };

    window.addEventListener('keydown', handle_key_down);
    return () => window.removeEventListener('keydown', handle_key_down);
  }, [current_menu_options.length, is_enabled, layout_mode, menu_screen]);

  useEffect(() => {
    let cancelled = false;

    const load_masks = async () => {
      const [scroll_mask, paper_mask] = await Promise.all([
        loadCollisionMask('/resources/UI/main_menu/scroll.png'),
        loadCollisionMask('/resources/UI/main_menu/paper.png'),
      ]);

      if (!cancelled) {
        set_art_masks({ scroll: scroll_mask, paper: paper_mask });
      }
    };

    void load_masks();

    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!art_masks || !scroll_button_ref.current || !paper_unfurl_ref.current) {
      return;
    }

    const update_seam_offset = () => {
      const scroll_rect = scroll_button_ref.current?.getBoundingClientRect();
      const paper_rect = paper_unfurl_ref.current?.getBoundingClientRect();

      if (!scroll_rect || !paper_rect) {
        return;
      }

      const scroll_bounds = getContainedOpaqueBounds(art_masks.scroll, scroll_rect.width, scroll_rect.height);
      const paper_bounds = getContainedOpaqueBounds(art_masks.paper, paper_rect.width, paper_rect.height);
      const scroll_center_y = (scroll_bounds.top + scroll_bounds.bottom) / 2;
      const scroll_center = (scroll_bounds.left + scroll_bounds.right) / 2;
      const paper_center_y = (paper_bounds.top + paper_bounds.bottom) / 2;
      const offset = Math.max(0, scroll_center - paper_bounds.left);
      const offset_y = scroll_center_y - paper_center_y + paper_rect.height / 4 - 10;

      set_paper_offset_style({
        paddingLeft: `${offset}px`,
        transform: `translateY(${offset_y}px)`,
      });
    };

    update_seam_offset();

    const resize_observer = new ResizeObserver(() => update_seam_offset());
    resize_observer.observe(scroll_button_ref.current);
    resize_observer.observe(paper_unfurl_ref.current);
    window.addEventListener('resize', update_seam_offset);

    return () => {
      resize_observer.disconnect();
      window.removeEventListener('resize', update_seam_offset);
    };
  }, [art_masks, menu_screen, selected_index]);

  const brand_position_style = useMemo(
    () => ({ left: `${layout_positions.brand.x}%`, top: `${layout_positions.brand.y}%` }),
    [layout_positions.brand.x, layout_positions.brand.y],
  );
  const item_position_style = (key: LayoutItemKey) => ({
    left: `${layout_positions[key].x}%`,
    top: `${layout_positions[key].y}%`,
  });

  function begin_drag(event: React.PointerEvent<HTMLDivElement>, key: LayoutItemKey) {
    if (!layout_mode || !menu_stage_ref.current) {
      return;
    }

    const target_rect = event.currentTarget.getBoundingClientRect();
    const center_x = target_rect.left + target_rect.width / 2;
    const center_y = target_rect.top + target_rect.height / 2;

    drag_state_ref.current = {
      key,
      offsetX: event.clientX - center_x,
      offsetY: event.clientY - center_y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function drag_item(event: React.PointerEvent<HTMLDivElement>) {
    if (!layout_mode || !drag_state_ref.current || !menu_stage_ref.current) {
      return;
    }

    const stage_rect = menu_stage_ref.current.getBoundingClientRect();
    const next_center_x = snap_to_grid(event.clientX - stage_rect.left - drag_state_ref.current.offsetX);
    const next_center_y = snap_to_grid(event.clientY - stage_rect.top - drag_state_ref.current.offsetY);
    const clamped_x = clamp(next_center_x, 0, stage_rect.width);
    const clamped_y = clamp(next_center_y, 0, stage_rect.height);

    set_layout_positions((current) => ({
      ...current,
      [drag_state_ref.current!.key]: {
        x: (clamped_x / stage_rect.width) * 100,
        y: (clamped_y / stage_rect.height) * 100,
      },
    }));
  }

  function end_drag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag_state_ref.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    drag_state_ref.current = null;
  }

  async function toggle_layout_mode() {
    if (layout_mode) {
      const copied = await copy_layout_css(layout_positions);
      set_layout_mode(false);
      set_layout_message(copied ? 'Layout CSS copied.' : 'Clipboard blocked. Use Copy CSS.');
      return;
    }

    set_layout_mode(true);
    set_layout_message('Layout mode enabled.');
  }

  async function handle_copy_css() {
    const copied = await copy_layout_css(layout_positions);
    set_layout_message(copied ? 'Layout CSS copied.' : 'Clipboard blocked. Copy manually from console.');
  }

  function activate_selected_option() {
    if (!is_enabled) {
      return;
    }

    if (menu_screen === 'main' && selected_option.id === 'story') {
      set_menu_screen('story');
      set_selected_index(0);
      return;
    }

    if (menu_screen === 'story' && selected_option.id === 'new_game') {
      set_menu_screen('new_game');
      set_selected_index(0);
      return;
    }

    if (menu_screen === 'new_game' && selected_option.id === 'naruto') {
      on_naruto_selected?.();
    }
  }

  function navigate_back() {
    if (!is_enabled) {
      return;
    }

    if (menu_screen === 'new_game') {
      set_menu_screen('story');
      set_selected_index(get_story_menu_new_game_index());
      return;
    }

    if (menu_screen === 'story') {
      set_menu_screen('main');
      set_selected_index(get_main_menu_story_index());
    }
  }

  return (
    <main className={`main-menu-shell${layout_mode ? ' is-layout-mode' : ''}`}>
      <audio ref={music_ref} preload="auto" />
      <div className="background-layer" />
      <img className="petals-layer" src={petal_frames[petal_frame]} alt="" />
      {layout_mode ? <div className="layout-grid" aria-hidden="true" /> : null}

      <section ref={menu_stage_ref} className="menu-stage">
        {layout_mode ? (
          <div className="layout-toolbar">
            <button type="button" className="layout-copy-button" onClick={() => void handle_copy_css()}>
              Copy CSS
            </button>
            <span className="layout-toolbar-text">Ctrl+Shift+D toggles layout mode</span>
          </div>
        ) : null}
        {layout_message ? <div className="layout-toast">{layout_message}</div> : null}

        <div
          className={`layout-item brand-item${layout_mode ? ' is-layout-target' : ''}`}
          style={brand_position_style}
          onPointerDown={(event) => begin_drag(event, 'brand')}
          onPointerMove={drag_item}
          onPointerUp={end_drag}
          onPointerCancel={end_drag}
        >
          {layout_mode ? <span className="layout-item-label">brand</span> : null}
          <header className="brand-block">
            <img className="brand-logo" src="/resources/UI/logo.png" alt="Shinobi Tactics" />
            <div className="brand-copy">
              <h1>Shinobi Tactics</h1>
            </div>
          </header>
        </div>

        <div className="menu-layout">
          <div className="menu-composite">
            <div
              className={`layout-item paper-item${layout_mode ? ' is-layout-target' : ''}`}
              style={item_position_style('paper')}
              onPointerDown={(event) => begin_drag(event, 'paper')}
              onPointerMove={drag_item}
              onPointerUp={end_drag}
              onPointerCancel={end_drag}
            >
              {layout_mode ? <span className="layout-item-label">paper</span> : null}
              <aside
                className="paper-panel"
                aria-live="polite"
                style={
                  paper_offset_style
                    ? paper_offset_style
                    : { visibility: 'hidden' }
                }
              >
                <div ref={paper_unfurl_ref} className="paper-unfurl">
                  <img className="paper-art" src="/resources/UI/main_menu/paper.png" alt="" />
                  <div className="paper-content">
                    <h2>{selected_option.label}</h2>
                  </div>
                </div>
              </aside>
            </div>

            <div
              className={`layout-item scroll-item${layout_mode ? ' is-layout-target' : ''}`}
              style={item_position_style('scroll')}
              onPointerDown={(event) => begin_drag(event, 'scroll')}
              onPointerMove={drag_item}
              onPointerUp={end_drag}
              onPointerCancel={end_drag}
            >
              {layout_mode ? <span className="layout-item-label">scroll</span> : null}
              <button
                type="button"
                ref={scroll_button_ref}
                className="scroll-button is-active"
                onClick={() => {
                  if (layout_mode) {
                    return;
                  }

                  activate_selected_option();
                }}
                aria-label={`Current selection ${selected_option.label}. Click to activate.`}
              >
                <img className="scroll-art" src="/resources/UI/main_menu/scroll.png" alt="" />
              </button>
            </div>

            <div
              className={`layout-item scroll-two-item${layout_mode ? ' is-layout-target' : ''}`}
              style={item_position_style('scroll_two')}
              onPointerDown={(event) => begin_drag(event, 'scroll_two')}
              onPointerMove={drag_item}
              onPointerUp={end_drag}
              onPointerCancel={end_drag}
            >
              {layout_mode ? <span className="layout-item-label">scroll_two</span> : null}
              <button
                type="button"
                className={`scroll-button${layout_mode ? ' layout-ghost-scroll' : ''}`}
                aria-label="Secondary scroll"
                onClick={(event) => {
                  if (layout_mode) {
                    event.preventDefault();
                  }
                }}
              >
                <img className="scroll-art" src="/resources/UI/main_menu/scroll.png" alt="" />
              </button>
            </div>

            <div
              className={`layout-item arrow-item arrow-up-item${layout_mode ? ' is-layout-target' : ''}`}
              style={item_position_style('arrow_up')}
              onPointerDown={(event) => begin_drag(event, 'arrow_up')}
              onPointerMove={drag_item}
              onPointerUp={end_drag}
              onPointerCancel={end_drag}
            >
              {layout_mode ? <span className="layout-item-label">arrow_up</span> : null}
              <button
                type="button"
                className="arrow-button"
                onClick={() => {
                  if (layout_mode) {
                    return;
                  }

                  if (!is_enabled) {
                    return;
                  }

                  set_selected_index((current) => (current - 1 + current_menu_options.length) % current_menu_options.length);
                }}
                aria-label={`Select ${previous_option.label}`}
              >
                ▲
              </button>
            </div>

            <div
              className={`layout-item arrow-item arrow-down-item${layout_mode ? ' is-layout-target' : ''}`}
              style={item_position_style('arrow_down')}
              onPointerDown={(event) => begin_drag(event, 'arrow_down')}
              onPointerMove={drag_item}
              onPointerUp={end_drag}
              onPointerCancel={end_drag}
            >
              {layout_mode ? <span className="layout-item-label">arrow_down</span> : null}
              <button
                type="button"
                className="arrow-button"
                onClick={() => {
                  if (layout_mode) {
                    return;
                  }

                  if (!is_enabled) {
                    return;
                  }

                  set_selected_index((current) => (current + 1) % current_menu_options.length);
                }}
                aria-label={`Select ${next_option.label}`}
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
