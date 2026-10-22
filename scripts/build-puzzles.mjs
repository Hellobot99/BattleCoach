// Builds server/data/puzzles.json: numbered puzzle levels with rising difficulty.
// For each level it makes candidate team pairs, lets a decent rule-based AI play the player's side many times,
// and keeps the pair whose win rate is closest to the level's target. Run: npm run puzzles
// (npm run puzzles -- --retune searches again only for the levels that ended up more than 5 points off target)
import { readFileSync, writeFileSync } from 'node:fs';
import { Battle, Dex, STORY_FORMAT, mulberry32, toID } from '../server/showdown.mjs';
import { aiChoose } from '../server/policy.mjs';
import { setStats } from '../server/determinize.mjs';

const CANDIDATES = 24; // team pairs tried per level
const GAMES = 30; // first screening games per pair
const FINALISTS = 4; // pairs re-checked more closely
const FINAL_GAMES = 100; // games per finalist

// 100 levels in five stretches of 20. Each stretch changes one or two things, the rest moves smoothly:
//   1-20 level-1 AI stops making mistakes, my team strong          21-40 level-2 AI, hints start running out
//   41-60 type/speed help turns off, even teams                    61-80 level-3 AI, the opponent's team gets stronger
//   81-100 45-second turns, hints run out, clearly weaker team
const TOTAL = 100;
const lerp = (a, b, t) => a + (b - a) * t;
const half = x => Math.round(x * 2) / 2;
function levelAt(i) {
  const n = i + 1;
  const t = i / (TOTAL - 1);
  const within = (from, to) => (n - from) / (to - from); // 0..1 inside a stretch
  const ai = n <= 20 ? 1 : n <= 60 ? 2 : 3;
  const noise = n <= 20 ? Math.round(lerp(0.25, 0, within(1, 20)) * 100) / 100 : n <= 40 ? Math.round(lerp(0.06, 0, within(21, 40)) * 100) / 100 : 0;
  const coaching = n <= 40 ? 'beginner' : 'real';
  const hints = n <= 25 ? null : n <= 40 ? Math.round(lerp(8, 5, within(26, 40))) : n <= 80 ? Math.round(lerp(5, 2, within(41, 80))) : Math.round(lerp(2, 0, within(81, 100)));
  const timer = n > 80;
  const gap = half(n <= 40 ? lerp(5, 1, within(1, 40)) : n <= 60 ? lerp(1, 0, within(41, 60)) : lerp(0, -4.5, within(61, 100)));
  const target = Math.round(lerp(0.93, 0.3, t) * 100) / 100;
  return { ai, noise, coaching, hints, timer, gap, target };
}
const LEVELS = Array.from({ length: TOTAL }, (_, i) => levelAt(i));

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

const OUT = new URL('../server/data/puzzles.json', import.meta.url);
// --retune: keep server/data/puzzles.json and search again, harder, only for levels more than 5 points off target
const RETUNE = process.argv.includes('--retune');
const OFF = 0.05;
const teamKey = t => t.map(s => s.species).sort().join('/');
const byTarget = lv => (a, b) => Math.abs(a.win - lv.target) - Math.abs(b.win - lv.target);

/** Tries `count` candidate pairs for level i and returns the best one (closest to target, not easier than prevWin). */
function search(i, lv, { prevWin, usedTeams, count, round = 0 }) {
  const cands = [];
  for (let c = 0; c < count; c++) {
    const rand = mulberry32((i + 1) * 104729 + c * 7 + round * 7919);
    const avoid = new Set();
    // the gap splits around the middle of the level range
    const meTeam = pickTeam(rand, MID - lv.gap / 2, avoid);
    const foeTeam = pickTeam(rand, MID + lv.gap / 2, avoid);
    if (meTeam.length < 3 || foeTeam.length < 3) continue;
    const me = meTeam.map(toSet);
    const foe = foeTeam.map(toSet);
    if (usedTeams.has(teamKey(me)) || usedTeams.has(teamKey(foe))) continue;
    cands.push({ me, foe, win: simulate(me, foe, lv, GAMES, (i + 1) * 1000 + c + round * 100) });
  }
  // re-check the closest few with many more games
  cands.sort(byTarget(lv));
  const finals = cands.slice(0, FINALISTS).map((c, k) => ({ ...c, win: simulate(c.me, c.foe, lv, FINAL_GAMES, (i + 1) * 5000 + k + round * 100) }));
  // closest to the target wins; among pairs within 6 points of it, prefer one not easier than the previous level
  const near = finals.filter(c => Math.abs(c.win - lv.target) <= 0.06 && c.win <= prevWin + 0.02);
  return (near.length ? near : finals).sort(byTarget(lv))[0];
}

const line = (n, lv, best) =>
  `${String(n).padStart(3)}단계  AI${lv.ai}  목표 ${Math.round(lv.target * 100)}%  시뮬 ${Math.round(best.win * 100)}%  나: ${best.me.map(s => s.species).join(', ')}  /  상대: ${best.foe.map(s => s.species).join(', ')}`;
const t0 = Date.now();
let out = [];
if (RETUNE) {
  out = JSON.parse(readFileSync(OUT, 'utf8'));
  const usedTeams = new Set(out.flatMap(l => [teamKey(l.me), teamKey(l.foe)]));
  out.forEach((l, i) => {
    const lv = LEVELS[i];
    if (Math.abs(l.simWin - lv.target) <= OFF) return;
    const best = search(i, lv, { prevWin: i ? out[i - 1].simWin : 1, usedTeams, count: CANDIDATES * 3, round: 1 });
    if (Math.abs(best.win - lv.target) >= Math.abs(l.simWin - lv.target)) return console.log(`${String(i + 1).padStart(3)}단계  그대로 (시뮬 ${Math.round(l.simWin * 100)}%, 새 후보 ${Math.round(best.win * 100)}%)`);
    usedTeams.delete(teamKey(l.me));
    usedTeams.delete(teamKey(l.foe));
    usedTeams.add(teamKey(best.me)).add(teamKey(best.foe));
    out[i] = { level: i + 1, ...lv, simWin: Math.round(best.win * 100) / 100, me: best.me, foe: best.foe };
    console.log(`${line(i + 1, lv, best)}  (전 ${Math.round(l.simWin * 100)}%)`);
  });
} else {
  let prevWin = 1;
  const usedTeams = new Set(); // a team (as a set of three) appears in one level only
  LEVELS.forEach((lv, i) => {
    const best = search(i, lv, { prevWin, usedTeams, count: CANDIDATES });
    prevWin = best.win;
    usedTeams.add(teamKey(best.me)).add(teamKey(best.foe));
    out.push({ level: i + 1, ...lv, simWin: Math.round(best.win * 100) / 100, me: best.me, foe: best.foe });
    console.log(line(i + 1, lv, best));
  });
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote server/data/puzzles.json (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
