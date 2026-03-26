import { useCallback, useEffect, useRef } from 'react';

type PlayTrackOptions = {
  restart?: boolean;
};

type PlayStingerOptions = {
  resume_track_path?: string | null;
  on_end?: () => void;
};

export function useMusicController(volume = 0.42) {
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const looping_track_ref = useRef<string | null>(null);
  const pending_unlock_play_ref = useRef(false);
  const stinger_end_ref = useRef<(() => void) | null>(null);

  if (audio_ref.current === null) {
    audio_ref.current = new Audio();
  }

  useEffect(() => {
    const audio = audio_ref.current;
    if (!audio) {
      return;
    }

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const try_resume = async () => {
      const audio = audio_ref.current;
      if (!audio || !pending_unlock_play_ref.current) {
        return;
      }

      try {
        await audio.play();
        pending_unlock_play_ref.current = false;
      } catch {
        // Keep waiting for the next user gesture.
      }
    };

    window.addEventListener('pointerdown', try_resume, { passive: true });
    window.addEventListener('keydown', try_resume);

    return () => {
      window.removeEventListener('pointerdown', try_resume);
      window.removeEventListener('keydown', try_resume);
      audio_ref.current?.pause();
      if (audio_ref.current) {
        audio_ref.current.currentTime = 0;
      }
    };
  }, []);

  const play_looping_track = useCallback(async (track_path: string | null, options: PlayTrackOptions = {}) => {
    const audio = audio_ref.current;
    if (!audio) {
      return;
    }

    looping_track_ref.current = track_path;
    stinger_end_ref.current = null;

    if (!track_path) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      pending_unlock_play_ref.current = false;
      return;
    }

    if (audio.src.endsWith(track_path) && audio.loop && !options.restart) {
      try {
        await audio.play();
        pending_unlock_play_ref.current = false;
      } catch {
        pending_unlock_play_ref.current = true;
      }
      return;
    }

    audio.onended = null;
    audio.src = track_path;
    audio.loop = true;
    if (options.restart) {
      audio.currentTime = 0;
    }
    audio.load();

    try {
      await audio.play();
      pending_unlock_play_ref.current = false;
    } catch {
      pending_unlock_play_ref.current = true;
    }
  }, []);

  const play_stinger = useCallback(async (track_path: string, options: PlayStingerOptions = {}) => {
    const audio = audio_ref.current;
    if (!audio) {
      return;
    }

    const resume_track_path =
      options.resume_track_path === undefined
        ? looping_track_ref.current
        : options.resume_track_path;

    stinger_end_ref.current = options.on_end ?? null;
    audio.onended = async () => {
      const on_end = stinger_end_ref.current;
      stinger_end_ref.current = null;
      on_end?.();

      if (resume_track_path) {
        await play_looping_track(resume_track_path, { restart: true });
      }
    };

    audio.src = track_path;
    audio.loop = false;
    audio.currentTime = 0;
    audio.load();

    try {
      await audio.play();
      pending_unlock_play_ref.current = false;
    } catch {
      pending_unlock_play_ref.current = true;
    }
  }, [play_looping_track]);

  return {
    play_looping_track,
    play_stinger,
  };
}
