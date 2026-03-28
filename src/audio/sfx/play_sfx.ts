import { getAudioSettings } from '../settings';

const audio_pool = new Map<string, HTMLAudioElement>();
const looping_audio_pool = new Map<string, HTMLAudioElement>();
const pending_one_shots: Array<{ path: string; volume: number }> = [];
let unlock_listeners_installed = false;
let audio_unlocked = false;

export function play_sfx(path: string, volume = 0.7) {
  install_unlock_listeners();
  ensure_base_audio(path);
  void play_one_shot_sfx(path, volume);
}

export function start_looping_sfx(key: string, path: string, volume = 0.55) {
  install_unlock_listeners();
  const { sfx_volume } = getAudioSettings();
  ensure_base_audio(path);

  const existing_audio = looping_audio_pool.get(key);
  if (existing_audio) {
    if (existing_audio.src.endsWith(path)) {
      existing_audio.volume = volume * (sfx_volume / 100);
      const play_attempt = existing_audio.play();
      if (play_attempt) {
        void play_attempt.then(() => {
          audio_unlocked = true;
        }).catch(() => undefined);
      }
      return;
    }

    existing_audio.pause();
    existing_audio.currentTime = 0;
    looping_audio_pool.delete(key);
  }

  const audio = new Audio(path);
  audio.preload = 'auto';
  audio.loop = true;
  audio.volume = volume * (sfx_volume / 100);
  audio.load();
  looping_audio_pool.set(key, audio);

  const play_attempt = audio.play();
  if (play_attempt) {
    void play_attempt
      .then(() => {
        audio_unlocked = true;
      })
      .catch(() => undefined);
  }
}

export function stop_looping_sfx(key: string) {
  const audio = looping_audio_pool.get(key);
  if (!audio) {
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  looping_audio_pool.delete(key);
}

function install_unlock_listeners() {
  if (unlock_listeners_installed) {
    return;
  }

  const unlock = async () => {
    if (!audio_unlocked) {
      const silent_audio = new Audio();
      const attempt = silent_audio.play();
      if (attempt) {
        try {
          await attempt;
          audio_unlocked = true;
        } catch {
          return;
        }
      }
    }

    if (pending_one_shots.length > 0) {
      const queued = [...pending_one_shots];
      pending_one_shots.length = 0;
      queued.forEach(({ path, volume }) => {
        void play_one_shot_sfx(path, volume);
      });
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  unlock_listeners_installed = true;
}

function ensure_base_audio(path: string) {
  let base_audio = audio_pool.get(path);
  if (!base_audio) {
    base_audio = new Audio(path);
    base_audio.preload = 'auto';
    base_audio.load();
    audio_pool.set(path, base_audio);
  }

  return base_audio;
}

async function play_one_shot_sfx(path: string, volume: number) {
  const { sfx_volume } = getAudioSettings();
  const audio = new Audio(path);
  audio.preload = 'auto';
  audio.volume = volume * (sfx_volume / 100);
  audio.currentTime = 0;

  if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await wait_for_audio_ready(audio);
  }

  try {
    await audio.play();
    audio_unlocked = true;
  } catch {
    pending_one_shots.push({ path, volume });
  }
}

function wait_for_audio_ready(audio: HTMLAudioElement) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      audio.removeEventListener('loadeddata', finish);
      audio.removeEventListener('canplaythrough', finish);
      resolve();
    };

    audio.addEventListener('loadeddata', finish, { once: true });
    audio.addEventListener('canplaythrough', finish, { once: true });
    audio.load();
    window.setTimeout(finish, 220);
  });
}
