// Spreads rollouts over worker threads and turns them into a win estimate per action (S02 §4, §4-1).
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const WORKERS = Math.max(1, Math.min(8, os.cpus().length - 2));
const PHASE1 = 24; // rollouts per action for every action
const PHASE2 = 72; // extra rollouts for actions still in contention
const DEPTH = 4; // turns per rollout before scoring by remaining HP
const PRUNE = 0.2; // actions this far below the best stop after phase 1

let pool = null;
let nextId = 1;
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
async function runPhase(json, sideId, actions, seedFrom, count) {
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
      Promise.all(bucket.map(j => run(wi, { json, sideId, actions: [j.action], seeds: j.seeds, depth: DEPTH }))),
    ),
  );
  const merged = {};
  for (const group of results) {
    for (const r of group) {
      for (const [action, acc] of Object.entries(r)) {
        const m = (merged[action] ||= { sumW: 0, n: 0, ko: 0, selfFaint: 0, first: 0, firstN: 0 });
        for (const k of Object.keys(m)) m[k] += acc[k];
      }
    }
  }
  return merged;
}

function add(into, from) {
  for (const [action, acc] of Object.entries(from)) {
    const m = (into[action] ||= { sumW: 0, n: 0, ko: 0, selfFaint: 0, first: 0, firstN: 0 });
    for (const k of Object.keys(m)) m[k] += acc[k];
  }
}

/**
 * Returns { actions: {choice: {W, n, ko, selfFaint, first}}, ms, rollouts }.
 * W, ko, selfFaint and first are rates in 0..1 (first is null when no move was compared).
 */
export async function evaluate(json, sideId, choices) {
  const t0 = performance.now();
  const totals = {};
  add(totals, await runPhase(json, sideId, choices, 0, PHASE1));
  const w = c => (totals[c].n ? totals[c].sumW / totals[c].n : 0.5);
  const best = Math.max(...choices.map(w));
  const keep = choices.filter(c => w(c) >= best - PRUNE).sort((a, b) => w(b) - w(a)).slice(0, 6);
  if (keep.length > 1) add(totals, await runPhase(json, sideId, keep, PHASE1, PHASE2));
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
  return { actions, ms: Math.round(performance.now() - t0), rollouts };
}
