// Spreads rollouts over worker threads and turns them into a win estimate per action (S02 §4, §4-1).
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { Battle, mulberry32 } from './showdown.mjs';
import { determinize } from './determinize.mjs';

// all of these can be tuned per server with environment variables (see DEPLOY.md)
const env = (name, fallback) => Number(process.env[name]) || fallback;
const CPUS = os.cpus().length;
// small servers use every core; big machines leave two for the page and the game itself
const WORKERS = env('EVAL_WORKERS', Math.max(1, Math.min(8, CPUS <= 4 ? CPUS : CPUS - 2)));
const PHASE1 = env('EVAL_PHASE1', 24); // rollouts per action for every action
const PHASE2 = env('EVAL_PHASE2', 72); // extra rollouts for actions still in contention
const DEPTH = 4; // turns per rollout before scoring by remaining HP
const PRUNE = 0.2; // actions this far below the best stop after phase 1
const WORLDS = env('EVAL_WORLDS', 32); // redrawn versions of the opponent's hidden info per evaluation
// while the player is still thinking, the leading actions get more rollouts (grades wobble less, see npm run stability)
const REFINE = Number(process.env.EVAL_REFINE ?? 3); // extra rounds at most (0 = off)
const REFINE_N = env('EVAL_REFINE_N', 32); // rollouts per action per round

let pool = null;
let nextId = 1;
let firstPasses = 0; // evaluations still in their first two phases; refinement waits for them
const pending = new Map();

function getPool() {
  if (pool) return pool;
  pool = [];
  for (let i = 0; i < WORKERS; i++) {
    const w = new Worker(new URL('./worker.mjs', import.meta.url));
    w.unref();
    w.on('message', ({ id, result, error }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(result);
    });
    pool.push(w);
  }
  return pool;
}

function run(workerIndex, task) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getPool()[workerIndex].postMessage({ id, task });
  });
}

/** Splits (actions × seeds) into one job per worker and merges the sums. */
async function runPhase(json, sideId, actions, seedFrom, count, worlds) {
  const jobs = [];
  for (const action of actions) {
    for (let s = 0; s < count; s += 8) {
      const seeds = [];
      for (let k = s; k < Math.min(s + 8, count); k++) seeds.push(seedFrom + k);
      jobs.push({ action, seeds });
    }
  }
  const buckets = Array.from({ length: WORKERS }, () => []);
  jobs.forEach((j, i) => buckets[i % WORKERS].push(j));
  const results = await Promise.all(
    buckets.filter(b => b.length).map((bucket, wi) =>
      Promise.all(bucket.map(j => run(wi, { json, worlds: worlds && j.seeds.map(s => worlds[s % worlds.length]), sideId, actions: [j.action], seeds: j.seeds, depth: DEPTH }))),
    ),
  );
  const merged = {};
  for (const group of results) for (const r of group) add(merged, r);
  return merged;
}

function add(into, from) {
  for (const [action, acc] of Object.entries(from)) {
    const m = (into[action] ||= { sumW: 0, n: 0, ko: 0, selfFaint: 0, first: 0, firstN: 0 });
    for (const k of Object.keys(m)) m[k] += acc[k];
  }
}

/** Builds the redrawn worlds once; a world that hits a simulator edge case falls back to the real position. */
function makeWorlds(json, foeId, hidden, salt) {
  return Array.from({ length: WORLDS }, (_, k) => {
    try {
      const b = Battle.fromJSON(json);
      determinize(b, foeId, hidden, mulberry32(k * 40503 + 17 + salt * 7919));
      return JSON.stringify(b.toJSON());
    } catch (err) {
      console.error('[determinize] fell back to the real sets:', err?.message || err);
      return json;
    }
  });
}

/**
 * Returns { actions: {choice: {W, n, ko, selfFaint, first}}, ms, rollouts }.
 * W, ko, selfFaint and first are rates in 0..1 (first is null when no move was compared).
 * The same position always gets the same dice; a different `salt` rolls new ones (used to measure how much grades wobble).
 * With `onRefine`, the promise still settles after the first pass, and then up to REFINE more rounds run until
 * `stopped()` says the player has chosen; each round calls onRefine with the improved result.
 * `refineAll` runs every round before settling (for measuring).
 */
export async function evaluate(json, sideId, choices, hidden = null, { salt = 0, only = null, onRefine = null, stopped = () => false, refineAll = false } = {}) {
  const t0 = performance.now();
  const worlds = hidden ? makeWorlds(json, sideId === 'p1' ? 'p2' : 'p1', hidden, only === 'dice' ? 0 : salt) : null;
  const seed0 = only === 'worlds' ? 0 : salt * 100000;
  const totals = {};
  const w = c => (totals[c].n ? totals[c].sumW / totals[c].n : 0.5);
  // actions still in contention; the first pass looks closer at the top 6, extra rounds at all of them
  const leaders = (max = choices.length) => {
    const best = Math.max(...choices.map(w));
    return choices.filter(c => w(c) >= best - PRUNE).sort((a, b) => w(b) - w(a)).slice(0, max);
  };
  firstPasses++;
  try {
    add(totals, await runPhase(json, sideId, choices, seed0, PHASE1, worlds));
    const keep = leaders(6);
    if (keep.length > 1) add(totals, await runPhase(json, sideId, keep, seed0 + PHASE1, PHASE2, worlds));
  } finally {
    firstPasses--;
  }
  const ms = Math.round(performance.now() - t0);
  const refine = async () => {
    for (let r = 0; r < REFINE && !stopped(); r++) {
      // another player's first pass goes ahead of this one's extra rounds
      if (firstPasses > 0 && !refineAll) break;
      const keep = leaders();
      if (keep.length < 2) break;
      add(totals, await runPhase(json, sideId, keep, seed0 + PHASE1 + PHASE2 + r * REFINE_N, REFINE_N, worlds));
      onRefine?.(result(totals, choices, w, ms));
    }
  };
  if (refineAll) await refine();
  else if (onRefine && REFINE > 0) refine().catch(err => console.error('[refine]', err));
  return result(totals, choices, w, ms);
}

function result(totals, choices, w, ms) {
  const actions = {};
  let rollouts = 0;
  for (const c of choices) {
    const a = totals[c];
    rollouts += a.n;
    actions[c] = {
      W: a.n ? a.sumW / a.n : 0.5,
      n: a.n,
      ko: a.n ? a.ko / a.n : 0,
      selfFaint: a.n ? a.selfFaint / a.n : 0,
      first: a.firstN ? a.first / a.firstN : null,
    };
  }
  return { actions, ms, rollouts };
}
