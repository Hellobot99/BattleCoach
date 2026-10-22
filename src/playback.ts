// Replays a turn's log entries one by one so the field can animate them (attack, hit, faint, switch …).
import { useEffect, useRef, useState } from 'react';
import type { BattleEvent, GameState, LogEntry, Side } from './types';

export interface MonFrame {
  spriteid: string;
  species: string;
  level: number;
  hpPct: number;
  hpText: string;
  fainted: boolean;
  status: string | null;
  tera: string | null;
  /** current one-shot animation and a counter that restarts it */
  anim: string | null;
  animKey: number;
}

export interface Fx {
  key: number;
  kind: 'orb' | 'quake' | 'flash';
  from?: Side;
  to?: Side;
  type?: string;
}

export interface Frame {
  p1: MonFrame | null;
  p2: MonFrame | null;
  message: string;
  fx: Fx | null;
}

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Frame built from the authoritative state (no animation). */
export function frameFromState(state: GameState): Frame {
  const me = state.me.team.find(m => m.active);
  const foe = state.foe.team.find(m => m.active);
  return {
    p1: me
      ? { spriteid: me.spriteid, species: me.species, level: me.level, hpPct: (me.hp / me.maxhp) * 100, hpText: `${me.hp}/${me.maxhp}`, fainted: me.fainted, status: me.status, tera: me.terastallized, anim: null, animKey: 0 }
      : null,
    p2: foe
      ? { spriteid: foe.spriteid, species: foe.species, level: foe.level, hpPct: foe.hpPct, hpText: `${foe.hpPct}%`, fainted: foe.fainted, status: foe.status, tera: foe.terastallized, anim: null, animKey: 0 }
      : null,
    message: '',
    fx: null,
  };
}

function hpText(side: Side, hp: string, pct: number) {
  if (hp === '0') return side === 'p1' ? '0' : '0%';
  return side === 'p1' ? hp : `${Math.round(pct)}%`;
}

/** Applies one event to a frame; returns how long to hold it (ms at normal speed). */
function apply(frame: Frame, entry: LogEntry, seq: number): number {
  const ev = entry.ev as BattleEvent | undefined;
  if (entry.text) frame.message = entry.text;
  frame.fx = null;
  if (!ev) return entry.text ? 450 : 0;
  const mon = 'side' in ev ? frame[ev.side] : null;
  const animate = (side: Side, anim: string) => {
    const m = frame[side];
    if (m) frame[side] = { ...m, anim, animKey: seq };
  };
  switch (ev.type) {
    case 'turn':
      return 350;
    case 'switch':
      frame[ev.side] = {
        spriteid: ev.spriteid, species: ev.species, level: ev.level, hpPct: ev.hpPct,
        hpText: hpText(ev.side, ev.hp, ev.hpPct), fainted: false, status: null, tera: null, anim: 'enter', animKey: seq,
      };
      return 800;
    case 'move': {
      const anim = ev.category === 'Physical' ? `lunge-${ev.side}` : ev.category === 'Special' ? 'cast' : 'pulse';
      animate(ev.side, anim);
      if (ev.category === 'Special' && ev.target && ev.target !== ev.side) frame.fx = { key: seq, kind: 'orb', from: ev.side, to: ev.target, type: ev.moveType };
      return 750;
    }
    case 'damage':
      if (mon) frame[ev.side] = { ...mon, hpPct: ev.hpPct, hpText: hpText(ev.side, ev.hp, ev.hpPct), anim: ev.indirect ? 'hurt' : 'hit', animKey: seq };
      return 650;
    case 'heal':
      if (mon) frame[ev.side] = { ...mon, hpPct: ev.hpPct, hpText: hpText(ev.side, ev.hp, ev.hpPct), anim: 'heal', animKey: seq };
      return 550;
    case 'se':
    case 'crit':
      frame.fx = { key: seq, kind: 'quake' };
      return 550;
    case 'nve':
    case 'immune':
      return 500;
    case 'miss':
      animate(ev.side, 'dodge');
      return 550;
    case 'faint':
      if (mon) frame[ev.side] = { ...mon, hpPct: 0, fainted: true, anim: 'faint', animKey: seq };
      return 900;
    case 'status':
      if (mon) frame[ev.side] = { ...mon, status: ev.status, anim: `status-${ev.status}`, animKey: seq };
      return 600;
    case 'cure':
      if (mon) frame[ev.side] = { ...mon, status: null };
      return 400;
    case 'boost':
      animate(ev.side, ev.up ? 'boost-up' : 'boost-down');
      return 650;
    case 'tera':
      if (mon) frame[ev.side] = { ...mon, tera: ev.teraType, anim: 'tera', animKey: seq };
      frame.fx = { key: seq, kind: 'flash' };
      return 1000;
    case 'forme':
      if (mon) frame[ev.side] = { ...mon, spriteid: ev.spriteid, species: ev.species };
      return 0;
    case 'mega':
      animate(ev.side, 'mega');
      frame.fx = { key: seq, kind: 'flash' };
      return 1100;
  }
  return 400;
}

/**
 * Plays every log entry that arrived since the last render, in order, even if newer states arrive meanwhile.
 * `speed` 1 = normal, 2 = fast. Returns the frame to draw, whether playback is running, and a skip function.
 */
export function usePlayback(
  state: GameState,
  speed: number,
  onDone: (logLength: number) => void,
  onCue?: (entry: LogEntry, before: Frame) => void,
) {
  const [frame, setFrame] = useState<Frame>(() => ({ p1: null, p2: null, message: '', fx: null }));
  const [playing, setPlaying] = useState(false);
  const played = useRef<{ id: string; len: number }>({ id: '', len: 0 });
  const queue = useRef<LogEntry[]>([]);
  const running = useRef(false);
  const skipRef = useRef(false);
  const working = useRef<Frame>(frame);
  const latest = useRef(state);
  const speedRef = useRef(speed);
  const doneRef = useRef(onDone);
  const cueRef = useRef(onCue);
  cueRef.current = onCue;
  latest.current = state;
  speedRef.current = speed;
  doneRef.current = onDone;

  useEffect(() => {
    let alive = true;
    const run = async (gameId: string) => {
      running.current = true;
      skipRef.current = false;
      setPlaying(true);
      const f: Frame = { ...working.current };
      let seq = Date.now();
      while (queue.current.length && alive && played.current.id === gameId) {
        const entry = queue.current.shift()!;
        const before = { ...f };
        const hold = apply(f, entry, ++seq);
        working.current = { ...f };
        if (skipRef.current || hold === 0) continue;
        cueRef.current?.(entry, before);
        setFrame({ ...f });
        await sleep(reduceMotion() ? Math.min(hold, 250) : hold / speedRef.current);
      }
      // a newer effect has taken over the queue: leave its runner alone
      if (!alive || played.current.id !== gameId) return;
      running.current = false;
      const final = { ...frameFromState(latest.current), message: f.message };
      working.current = final;
      setFrame(final);
      setPlaying(false);
      doneRef.current(played.current.len);
    };

    if (played.current.id !== state.id) {
      // a retry starts mid-battle: show its position as is and only animate what happens from here
      played.current = { id: state.id, len: state.retry ? state.log.length : 0 };
      queue.current = [];
      working.current = state.retry ? frameFromState(state) : { p1: null, p2: null, message: '', fx: null };
    }
    const entries = state.log.slice(played.current.len);
    played.current.len = state.log.length;
    queue.current.push(...entries);
    if (!running.current) {
      if (queue.current.length) run(state.id);
      else {
        // also covers a runner that was interrupted right after its last entry
        setFrame({ ...frameFromState(state), message: working.current.message });
        setPlaying(false);
        doneRef.current(played.current.len);
      }
    }
    return () => {
      alive = false;
      running.current = false;
    };
  }, [state]);

  return { frame, playing, skip: () => (skipRef.current = true) };
}
