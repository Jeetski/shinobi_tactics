import { getAudioSettings } from '../settings';

const audio_pool = new Map<string, HTMLAudioElement>();
const pending_vox: Array<{ path: string; volume: number }> = [];
let unlock_listeners_installed = false;
let audio_unlocked = false;

export function play_vox(path: string, volume = 0.9) {
  install_unlock_listeners();
  ensure_base_audio(path);
  void play_one_shot_vox(path, volume);
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

    if (pending_vox.length > 0) {
      const queued = [...pending_vox];
      pending_vox.length = 0;
      queued.forEach(({ path, volume }) => {
        void play_one_shot_vox(path, volume);
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

async function play_one_shot_vox(path: string, volume: number) {
  const { vox_volume } = getAudioSettings();
  const audio = new Audio(path);
  audio.preload = 'auto';
  audio.volume = volume * (vox_volume / 100);
  audio.currentTime = 0;

  if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await wait_for_audio_ready(audio);
  }

  try {
    await audio.play();
    audio_unlocked = true;
  } catch {
    pending_vox.push({ path, volume });
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
