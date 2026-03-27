import { getAudioSettings } from '../settings';

const audio_pool = new Map<string, HTMLAudioElement>();
let unlock_listeners_installed = false;
let audio_unlocked = false;

export function play_vox(path: string, volume = 0.9) {
  install_unlock_listeners();
  const { vox_volume } = getAudioSettings();

  let base_audio = audio_pool.get(path);
  if (!base_audio) {
    base_audio = new Audio(path);
    base_audio.preload = 'auto';
    audio_pool.set(path, base_audio);
  }

  const audio = base_audio.cloneNode(true) as HTMLAudioElement;
  audio.volume = volume * (vox_volume / 100);
  audio.currentTime = 0;

  const play_attempt = audio.play();
  if (play_attempt) {
    void play_attempt.then(() => {
      audio_unlocked = true;
    }).catch(() => undefined);
  }
}

function install_unlock_listeners() {
  if (unlock_listeners_installed) {
    return;
  }

  const unlock = () => {
    if (audio_unlocked) {
      return;
    }

    const silent_audio = new Audio();
    const attempt = silent_audio.play();
    if (attempt) {
      void attempt.then(() => {
        audio_unlocked = true;
      }).catch(() => undefined);
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  unlock_listeners_installed = true;
}
