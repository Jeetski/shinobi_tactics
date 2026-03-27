import { getAudioSettings } from '../settings';

let shared_audio_context: AudioContext | null = null;
let unlock_listeners_installed = false;

export function play_beep({
  frequency = 880,
  duration_ms = 110,
  gain = 0.085,
}: {
  frequency?: number;
  duration_ms?: number;
  gain?: number;
} = {}) {
  const audio_context = get_audio_context();
  if (!audio_context) {
    return;
  }
  const { sfx_volume } = getAudioSettings();
  const effective_gain = gain * (sfx_volume / 100);

  const schedule_beep = () => {
    const oscillator = audio_context.createOscillator();
    const gain_node = audio_context.createGain();
    const now = audio_context.currentTime;
    const end_time = now + duration_ms / 1000;

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(160, frequency * 0.92), end_time);

    gain_node.gain.setValueAtTime(0.0001, now);
    gain_node.gain.exponentialRampToValueAtTime(Math.max(0.0001, effective_gain), now + 0.012);
    gain_node.gain.exponentialRampToValueAtTime(0.0001, end_time);

    oscillator.connect(gain_node);
    gain_node.connect(audio_context.destination);
    oscillator.start(now);
    oscillator.stop(end_time + 0.03);
  };

  if (audio_context.state === 'running') {
    schedule_beep();
    return;
  }

  void audio_context.resume()
    .then(() => {
      schedule_beep();
    })
    .catch(() => undefined);
}

function get_audio_context() {
  const AudioContextCtor =
    window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (shared_audio_context === null) {
    shared_audio_context = new AudioContextCtor();
  }

  install_unlock_listeners();
  return shared_audio_context;
}

function install_unlock_listeners() {
  if (unlock_listeners_installed || shared_audio_context === null) {
    return;
  }

  const unlock = () => {
    if (shared_audio_context && shared_audio_context.state !== 'running') {
      void shared_audio_context.resume().catch(() => undefined);
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  unlock_listeners_installed = true;
}
