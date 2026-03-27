import { useSyncExternalStore } from 'react';

type AudioSettings = {
  music_volume: number;
  sfx_volume: number;
  vox_volume: number;
};

const storage_key = 'shinobi-tactics-audio-settings';
const default_audio_settings: AudioSettings = {
  music_volume: 50,
  sfx_volume: 100,
  vox_volume: 60,
};

const subscribers = new Set<() => void>();
let cached_audio_settings = read_audio_settings();

export function useAudioSettings() {
  return useSyncExternalStore(subscribe_to_audio_settings, get_audio_settings, get_audio_settings);
}

export function getAudioSettings() {
  return cached_audio_settings;
}

export function updateAudioSettings(next_partial: Partial<AudioSettings>) {
  cached_audio_settings = {
    ...cached_audio_settings,
    ...sanitize_audio_settings(next_partial),
  };
  persist_audio_settings(cached_audio_settings);
  emit_audio_settings_change();
}

export function replaceAudioSettings(next_settings: AudioSettings) {
  cached_audio_settings = {
    ...default_audio_settings,
    ...sanitize_audio_settings(next_settings),
  };
  persist_audio_settings(cached_audio_settings);
  emit_audio_settings_change();
}

function subscribe_to_audio_settings(on_store_change: () => void) {
  subscribers.add(on_store_change);

  return () => {
    subscribers.delete(on_store_change);
  };
}

function get_audio_settings() {
  return cached_audio_settings;
}

function emit_audio_settings_change() {
  subscribers.forEach((subscriber) => subscriber());
}

function read_audio_settings(): AudioSettings {
  if (typeof window === 'undefined') {
    return default_audio_settings;
  }

  try {
    const stored = window.localStorage.getItem(storage_key);
    if (!stored) {
      return default_audio_settings;
    }

    const parsed = JSON.parse(stored) as Partial<AudioSettings>;
    return {
      ...default_audio_settings,
      ...sanitize_audio_settings(parsed),
    };
  } catch {
    return default_audio_settings;
  }
}

function persist_audio_settings(settings: AudioSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storage_key, JSON.stringify(settings));
}

function sanitize_audio_settings(settings: Partial<AudioSettings>): Partial<AudioSettings> {
  const next_settings: Partial<AudioSettings> = {};

  if (typeof settings.music_volume === 'number') {
    next_settings.music_volume = clamp_percent(settings.music_volume);
  }

  if (typeof settings.sfx_volume === 'number') {
    next_settings.sfx_volume = clamp_percent(settings.sfx_volume);
  }

  if (typeof settings.vox_volume === 'number') {
    next_settings.vox_volume = clamp_percent(settings.vox_volume);
  }

  return next_settings;
}

function clamp_percent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
