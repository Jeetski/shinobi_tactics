import { useEffect, useState } from 'react';
import { load_stage_scene, MapView, type LoadedStageScene } from '../map_loader';
import { SceneBackground } from '../rendering';
import { load_dialogue_script, use_speech_controller, type SpeechLine } from '../speech';
import './naruto_story.css';

const walk_target_line = 'Then show me. Walk over there.';

export function NarutoStory() {
  const [stage_scene, set_stage_scene] = useState<LoadedStageScene | null>(null);
  const [dialogue_lines, set_dialogue_lines] = useState<SpeechLine[]>([]);
  const [show_walk_target, set_show_walk_target] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [scene_audio] = useState(() => new Audio());
  const { speech_state, advance } = use_speech_controller(dialogue_lines);

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

  useEffect(() => {
    if (speech_state.active_line?.speaker !== 'iruka_umino') {
      return;
    }

    if (speech_state.active_line.text !== walk_target_line) {
      return;
    }

    set_show_walk_target(true);
  }, [speech_state.active_line]);

  return (
    <main className="naruto-story">
      {stage_scene ? <SceneBackground preset={stage_scene.background_preset} /> : null}
      <div className="naruto-story__content">
        {error_message ? <p className="naruto-story__status">{error_message}</p> : null}
        {!error_message && !stage_scene ? <p className="naruto-story__status">Loading academy yard...</p> : null}
        {stage_scene ? (
          <MapView
            scene={stage_scene}
            active_speech_line={
              speech_state.active_line
                ? {
                    speaker: speech_state.active_line.speaker,
                    text: speech_state.visible_text,
                  }
                : null
            }
            on_advance_speech={advance}
            highlighted_tiles={show_walk_target ? [{ q: 0, r: 0, s: 0 }] : []}
          />
        ) : null}
      </div>
    </main>
  );
}
