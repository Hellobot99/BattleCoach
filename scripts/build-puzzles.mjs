// Builds server/data/puzzles.json: numbered puzzle levels with rising difficulty.
// For each level it makes candidate team pairs, lets a decent rule-based AI play the player's side many times,
// and keeps the pair whose win rate is closest to the level's target. Run: npm run puzzles
import { writeFileSync } from 'node:fs';
import { Battle, Dex, STORY_FORMAT, mulberry32, toID } from '../server/showdown.mjs';
import { aiChoose } from '../server/policy.mjs';
import { setStats } from '../server/determinize.mjs';

const CANDIDATES = 20; // team pairs tried per level
const GAMES = 30; // first screening games per pair
const FINALISTS = 4; // pairs re-checked more closely
const FINAL_GAMES = 120; // games per finalist

// level: opponent AI, its random-move rate, help for the player, team strength gap (+ = player stronger), target win rate
const LEVELS = [
  { ai: 1, noise: 0.25, coaching: 'beginner', hints: null, timer: false, gap: 5, target: 0.92 },
  { ai: 1, noise: 0.15, coaching: 'beginner', hints: null, timer: false, gap: 4, target: 0.88 },
  { ai: 1, noise: 0.05, coaching: 'beginner', hints: null, timer: false, gap: 3, target: 0.84 },
  { ai: 1, noise: 0, coaching: 'beginner', hints: null, timer: false, gap: 2, target: 0.8 },
  { ai: 2, noise: 0.04, coaching: 'beginner', hints: null, timer: false, gap: 2, target: 0.75 },
  { ai: 2, noise: 0.04, coaching: 'beginner', hints: 8, timer: false, gap: 1, target: 0.7 },
  { ai: 2, noise: 0.04, coaching: 'beginner', hints: 6, timer: false, gap: 1, target: 0.66 },
  { ai: 2, noise: 0.04, coaching: 'beginner', hints: 5, timer: false, gap: 0, target: 0.62 },
  { ai: 2, noise: 0.02, coaching: 'real', hints: 5, timer: false, gap: 0, target: 0.58 },
  { ai: 2, noise: 0, coaching: 'real', hints: 4, timer: false, gap: 0, target: 0.55 },
  { ai: 3, noise: 0, coaching: 'real', hints: 4, timer: false, gap: 0, target: 0.55 },
  { ai: 3, noise: 0, coaching: 'real', hints: 3, timer: false, gap: 0, target: 0.52 },
  { ai: 3, noise: 0, coaching: 'real', hints: 3, timer: false, gap: -1, target: 0.5 },
  { ai: 3, noise: 0, coaching: 'real', hints: 3, timer: false, gap: -1, target: 0.48 },
  { ai: 3, noise: 0, coaching: 'real', hints: 2, timer: false, gap: -2, target: 0.45 },
  { ai: 3, noise: 0, coaching: 'real', hints: 2, timer: true, gap: -2, target: 0.43 },
  { ai: 3, noise: 0, coaching: 'real', hints: 2, timer: true, gap: -3, target: 0.4 },
  { ai: 3, noise: 0, coaching: 'real', hints: 1, timer: true, gap: -3, target: 0.38 },
  { ai: 3, noise: 0, coaching: 'real', hints: 1, timer: true, gap: -4, target: 0.35 },
  { ai: 3, noise: 0, coaching: 'real', hints: 0, timer: true, gap: -4, target: 0.32 },
];

const db = setStats('champions');
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const expand = v => (typeof v === 'number' ? Object.fromEntries(STATS.map(s => [s, v])) : v);
// colour-only forms (Vivillon patterns, Florges flowers …) would repeat the same Pokémon; keep one per species
const seenBase = new Set();
const pool = Object.entries(db)
  .map(([id, d]) => ({ id, level: d.level, data: d, sp: Dex.species.get(d.species) }))
  .filter(p => p.sp.exists && !p.sp.isCosmeticForme)
  .sort((a, b) => b.data.n - a.data.n)
  .filter(p => !seenBase.has(p.sp.baseSpecies) && seenBase.add(p.sp.baseSpecies))
  .map(p => ({ ...p, id: toID(p.sp.baseSpecies) }));
const MID = pool.reduce((a, p) => a + p.level, 0) / pool.length;

function toSet(entry) {
  const s = entry.data.sets[0];
  return {
    name: entry.data.species, species: entry.data.species, level: 50, moves: s.moves, ability: s.ability, item: s.item,
    evs: expand(s.evs), ivs: expand(s.ivs), nature: s.nature || '', gender: s.gender || '',
  };
}

/** Three species around a target random-battle level (lower = stronger), no repeats. */
function pickTeam(rand, targetLevel, avoid) {
  const near = pool.filter(p => Math.abs(p.level - targetLevel) <= 1.5 && !avoid.has(p.id));
  const team = [];
  while (team.length < 3 && near.length) {
    const i = Math.floor(rand() * near.length);
    const p = near.splice(i, 1)[0];
    // one Mega Stone per team keeps it to the in-game rule of one Mega Evolution
    if (/ite$/.test(toID(p.data.sets[0].item)) && team.some(t => /ite$/.test(toID(t.data.sets[0].item)))) continue;
    team.push(p);
    avoid.add(p.id);
  }
  return team;
}

function chooseSafe(b, side, choice) {
  try {
    if (b.choose(side, choice)) return;
  } catch {}
  try {
    b.choose(side, 'default');
  } catch {}
}

/** Player side: a decent rule-based player. Opponent: the level's AI (level 3 is simulated as level 2). */
function simulate(me, foe, lv, games, seed) {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const rand = mulberry32(seed * 7919 + g);
    const b = new Battle({ formatid: STORY_FORMAT, seed: `${(seed + g) % 65536},${g},${seed % 997},${(g * 31) % 65536}` });
    b.send = () => {};
    b.setPlayer('p1', { name: 'P', team: me });
    b.setPlayer('p2', { name: 'AI', team: foe });
    let guard = 0;
    while (!b.ended && guard++ < 200) {
      for (const side of ['p1', 'p2']) {
        const req = b[side].activeRequest;
        if (!req || req.wait || b[side].isChoiceDone()) continue;
        const opts = side === 'p1' ? { level: 2, noise: 0.04 } : { level: Math.min(2, lv.ai), noise: lv.noise };
        chooseSafe(b, side, aiChoose(b, side, rand, opts) || 'default');
      }
    }
    if (b.winner === 'P') wins++;
  }
  return wins / games;
}

const out = [];
const t0 = Date.now();
let prevWin = 1;
LEVELS.forEach((lv, i) => {
  const cands = [];
  for (let c = 0; c < CANDIDATES; c++) {
    const rand = mulberry32((i + 1) * 104729 + c * 7);
    const avoid = new Set();
    // the gap splits around the middle of the level range
    const meTeam = pickTeam(rand, MID - lv.gap / 2, avoid);
    const foeTeam = pickTeam(rand, MID + lv.gap / 2, avoid);
    if (meTeam.length < 3 || foeTeam.length < 3) continue;
    const me = meTeam.map(toSet);
    const foe = foeTeam.map(toSet);
    cands.push({ me, foe, win: simulate(me, foe, lv, GAMES, (i + 1) * 1000 + c) });
  }
  // re-check the closest few with many more games; a level must not be easier than the one before
  cands.sort((a, b) => Math.abs(a.win - lv.target) - Math.abs(b.win - lv.target));
  const finals = cands.slice(0, FINALISTS).map((c, k) => ({ ...c, win: simulate(c.me, c.foe, lv, FINAL_GAMES, (i + 1) * 5000 + k) }));
  // closest to the target wins; among pairs within 6 points of it, prefer one not easier than the previous level
  const byTarget = (a, b) => Math.abs(a.win - lv.target) - Math.abs(b.win - lv.target);
  const near = finals.filter(c => Math.abs(c.win - lv.target) <= 0.06 && c.win <= prevWin + 0.02);
  const best = (near.length ? near : finals).sort(byTarget)[0];
  prevWin = best.win;
  out.push({ level: i + 1, ...lv, simWin: Math.round(best.win * 100) / 100, me: best.me, foe: best.foe });
  console.log(`${String(i + 1).padStart(2)}단계  AI${lv.ai}  목표 ${Math.round(lv.target * 100)}%  시뮬 ${Math.round(best.win * 100)}%  나: ${best.me.map(s => s.species).join(', ')}  /  상대: ${best.foe.map(s => s.species).join(', ')}`);
});
writeFileSync(new URL('../server/data/puzzles.json', import.meta.url), JSON.stringify(out));
console.log(`wrote server/data/puzzles.json (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
