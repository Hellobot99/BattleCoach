// Battle music and Pokémon cries, served by Pokémon Showdown. On by default; the choice is remembered per browser.
import { useSyncExternalStore } from 'react';

const AUDIO = 'https://play.pokemonshowdown.com/audio';
const TRACKS = ['bw-trainer', 'xy-trainer', 'sm-trainer', 'dpp-trainer', 'hgss-johto-trainer', 'bw2-rival'];
const KEY = 'battlecoach.sound';

interface Settings {
  muted: boolean;
  volume: number; // 0..1
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { muted: false, volume: 0.5, ...JSON.parse(raw) };
  } catch {}
  return { muted: false, volume: 0.5 };
}

let settings = load();
const listeners = new Set<() => void>();
let bgm: HTMLAudioElement | null = null;
let fadeTimer: number | undefined;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  listeners.forEach(l => l());
}

const musicVolume = () => (settings.muted ? 0 : settings.volume * 0.6);

export const sound = {
  /** Starts a random battle track. Call it from a click so the browser allows playback. */
  startMusic() {
    window.clearInterval(fadeTimer);
    bgm?.pause();
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)];
    bgm = new Audio(`${AUDIO}/${track}.mp3`);
    bgm.loop = true;
    bgm.volume = musicVolume();
    bgm.play().catch(() => {});
  },

  /** Fades the music out (end of battle, leaving the battle). */
  stopMusic() {
    const a = bgm;
    if (!a) return;
    bgm = null;
    window.clearInterval(fadeTimer);
    fadeTimer = window.setInterval(() => {
      a.volume = Math.max(0, a.volume - 0.05);
      if (a.volume <= 0.01) {
        a.pause();
        window.clearInterval(fadeTimer);
      }
    }, 60);
  },

  /** Plays a cry; `faint` plays it lower and slower, like the games. Forms fall back to the base cry. */
  cry(spriteid: string, faint = false) {
    if (settings.muted || !spriteid) return;
    const ids = [spriteid.replace(/-/g, ''), spriteid.split('-')[0]];
    const tryPlay = (i: number) => {
      if (i >= ids.length) return;
      const a = new Audio(`${AUDIO}/cries/${ids[i]}.mp3`);
      a.volume = Math.min(1, settings.volume * 0.9);
      if (faint) {
        a.playbackRate = 0.8;
        a.preservesPitch = false;
      }
      a.addEventListener('error', () => tryPlay(i + 1), { once: true });
      a.play().catch(() => {});
    };
    tryPlay(ids[0] === ids[1] ? 1 : 0);
  },

  setMuted(muted: boolean) {
    // unmuting at volume 0 would still be silent: bring the volume back up
    settings = { muted, volume: !muted && settings.volume === 0 ? 0.5 : settings.volume };
    if (bgm) bgm.volume = musicVolume();
    save();
  },

  setVolume(volume: number) {
    settings = { volume, muted: volume === 0 };
    if (bgm) bgm.volume = musicVolume();
    save();
  },

  get: () => settings,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSound() {
  return useSyncExternalStore(sound.subscribe, sound.get, sound.get);
}
