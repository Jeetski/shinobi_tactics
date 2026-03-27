import { getAudioSettings } from '../settings';

const audio_pool = new Map<string, HTMLAudioElement>();
const looping_audio_pool = new Map<string, HTMLAudioElement>();
let unlock_listeners_installed = false;
let audio_unlocked = false;

export function play_sfx(path: string, volume = 0.7) {
  install_unlock_listeners();
  const { sfx_volume } = getAudioSettings();

  let base_audio = audio_pool.get(path);
  if (!base_audio) {
    base_audio = new Audio(path);
    base_audio.preload = 'auto';
    audio_pool.set(path, base_audio);
  }

  const audio = base_audio.cloneNode(true) as HTMLAudioElement;
  audio.volume = volume * (sfx_volume / 100);
  audio.currentTime = 0;

  const play_attempt = audio.play();
  if (play_attempt) {
    void play_attempt
      .then(() => {
        audio_unlocked = true;
      })
      .catch(() => undefined);
  }
}

export function start_looping_sfx(key: string, path: string, volume = 0.55) {
  install_unlock_listeners();
  const { sfx_volume } = getAudioSettings();

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

  const unlock = () => {
    if (audio_unlocked) {
      return;
    }

    const silent_audio = new Audio();
    const attempt = silent_audio.play();
    if (attempt) {
      void attempt
        .then(() => {
          audio_unlocked = true;
        })
        .catch(() => undefined);
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  unlock_listeners_installed = true;
}
