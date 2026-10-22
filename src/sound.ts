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

  /**
   * End-of-battle jingle. Plays public/audio/victory.mp3 (or defeat.mp3) when the player has put one there;
   * otherwise a short fanfare of our own for a win, and nothing for a loss.
   */
  playEnd(win: boolean) {
    this.stopMusic();
    if (settings.muted) return;
    const a = new Audio(`/audio/${win ? 'victory' : 'defeat'}.mp3`);
    a.volume = musicVolume();
    a.addEventListener('error', () => win && fanfare(), { once: true });
    a.play().catch(() => {});
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

/** A short original fanfare (not a game melody), synthesized so no audio file is needed. */
function fanfare() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const vol = musicVolume() * 0.35;
  // [semitones above C5, start beat, length in beats]
  const notes: [number, number, number][] = [[0, 0, 0.5], [4, 0.5, 0.5], [7, 1, 0.5], [12, 1.5, 1], [9, 2.5, 0.5], [12, 3, 1.5]];
  const beat = 0.16;
  const t0 = ctx.currentTime + 0.05;
  for (const [semi, start, len] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 523.25 * 2 ** (semi / 12);
    const s = t0 + start * beat;
    const e = s + len * beat;
    gain.gain.setValueAtTime(0, s);
    gain.gain.linearRampToValueAtTime(vol, s + 0.01);
    gain.gain.setValueAtTime(vol, e - 0.03);
    gain.gain.linearRampToValueAtTime(0, e);
    osc.connect(gain).connect(ctx.destination);
    osc.start(s);
    osc.stop(e + 0.02);
  }
  window.setTimeout(() => ctx.close(), 2000);
}

export function useSound() {
  return useSyncExternalStore(sound.subscribe, sound.get, sound.get);
}
