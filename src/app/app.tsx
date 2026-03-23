import { useEffect, useRef, useState } from 'react';
import { LoadingScreen } from '../loading_screen';
import { MainMenu } from '../main_menu/main_menu';
import { NarutoStory } from '../naruto_story';
import './app.css';

type AppScene = 'main_menu' | 'loading_screen' | 'naruto_story';

type TransitionStep = {
  scene: AppScene;
  scene_name?: string;
  hold_ms?: number;
};

const fade_duration_ms = 420;

export function App() {
  const [current_scene, set_current_scene] = useState<AppScene>('main_menu');
  const [loading_scene_name, set_loading_scene_name] = useState('Scene Name');
  const [is_faded_out, set_is_faded_out] = useState(false);
  const [is_transitioning, set_is_transitioning] = useState(false);
  const transition_queue_ref = useRef<TransitionStep[]>([]);
  const timeout_ids_ref = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timeout_id of timeout_ids_ref.current) {
        window.clearTimeout(timeout_id);
      }
    };
  }, []);

  function queue_timeout(callback: () => void, delay_ms: number) {
    const timeout_id = window.setTimeout(() => {
      timeout_ids_ref.current = timeout_ids_ref.current.filter((active_id) => active_id !== timeout_id);
      callback();
    }, delay_ms);

    timeout_ids_ref.current.push(timeout_id);
  }

  function run_next_transition_step() {
    const next_step = transition_queue_ref.current.shift();

    if (!next_step) {
      set_is_transitioning(false);
      return;
    }

    set_is_transitioning(true);
    set_is_faded_out(true);

    queue_timeout(() => {
      if (next_step.scene === 'loading_screen' && next_step.scene_name) {
        set_loading_scene_name(next_step.scene_name);
      }

      set_current_scene(next_step.scene);
      set_is_faded_out(false);

      queue_timeout(() => {
        if (next_step.hold_ms) {
          queue_timeout(() => run_next_transition_step(), next_step.hold_ms);
          return;
        }

        run_next_transition_step();
      }, fade_duration_ms);
    }, fade_duration_ms);
  }

  function start_transition(steps: TransitionStep[]) {
    if (is_transitioning) {
      return;
    }

    transition_queue_ref.current = [...steps];
    run_next_transition_step();
  }

  function handle_naruto_selected() {
    start_transition([
      { scene: 'loading_screen', scene_name: 'Academy | Yard', hold_ms: 900 },
      { scene: 'naruto_story' },
    ]);
  }

  return (
    <div className={`app-shell${is_faded_out ? ' is-faded-out' : ''}${is_transitioning ? ' is-transitioning' : ''}`}>
      {current_scene === 'main_menu' ? (
        <MainMenu is_enabled={!is_transitioning} on_naruto_selected={handle_naruto_selected} />
      ) : null}
      {current_scene === 'loading_screen' ? <LoadingScreen scene_name={loading_scene_name} /> : null}
      {current_scene === 'naruto_story' ? <NarutoStory /> : null}
    </div>
  );
}
