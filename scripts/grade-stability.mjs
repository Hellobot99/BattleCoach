// How much do the coach's grades wobble? Evaluates the same positions several times with fresh dice and counts how
// often an action's grade changes. Uses the evaluator settings from the environment (EVAL_PHASE1/2, EVAL_WORLDS, EVAL_REFINE).
//   npm run stability                         30 positions from random 3v3 + 6v6 games, 5 evaluations each
//   npm run stability -- --positions 10 --runs 3
//   npm run stability -- --feedback feedback/feedback.jsonl   turns players flagged with 「이 평가가 이상해요」
//   --refine          include the extra rounds a player gets while thinking (EVAL_REFINE)
//   --noise dice|worlds   vary only the rollout dice, or only the redrawn opponent sets (to see where wobble comes from)
import { readFileSync } from 'node:fs';
import { Battle, FORMATS, mulberry32, toID } from '../server/showdown.mjs';
import { aiChoose, legalChoices } from '../server/policy.mjs';
import { evaluate } from '../server/evaluator.mjs';
import { gradeTurn } from '../server/coach.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const POSITIONS = Number(arg('positions', 30));
const RUNS = Number(arg('runs', 5));
const FEEDBACK = arg('feedback', null);
const REFINED = process.argv.includes('--refine'); // include the extra rounds a player who thinks a while gets
const MODE = arg('noise', 'all'); // experiments: 'dice' keeps the redrawn worlds fixed, 'worlds' keeps the dice fixed

const ORDER = ['brill', 'great', 'best', 'exc', 'good', 'inacc', 'mist', 'blund', 'miss'];
const LABEL = { brill: '묘수', great: '좋은 수', best: '최선', exc: '우수', good: '무난', inacc: '부정확', mist: '실수', blund: '블런더', miss: '놓친 기회', only: '유일', any: '어느 쪽이든', decided: '승부 결정' };
// what a player takes away from a grade: fine, so-so, or wrong
const BAND = { brill: 'ok', great: 'ok', best: 'ok', exc: 'ok', good: 'meh', inacc: 'bad', mist: 'bad', blund: 'bad', miss: 'bad' };

function chooseSafe(b, side, choice) {
  try {
    if (b.choose(side, choice)) return;
  } catch {}
  try {
    b.choose(side, 'default');
  } catch {}
}

/** Plays a random game with the rule-based AI on both sides and stops at a move decision for p1. */
function randomPosition(format, seed) {
  const rand = mulberry32(seed);
  const b = new Battle({ formatid: FORMATS[format].id, seed: `${seed % 65536},${(seed * 7) % 65536},${(seed * 13) % 65536},${(seed * 31) % 65536}` });
  b.send = () => {};
  b.setPlayer('p1', { name: 'P' });
  b.setPlayer('p2', { name: 'AI' });
  const pool = format === '3v3' ? b.p2.pokemon.map(p => toID(p.set.species)) : null;
  const stopAt = 1 + Math.floor(rand() * 9);
  for (let guard = 0; guard < 300 && !b.ended; guard++) {
    const req = b.p1.activeRequest;
    if (b.turn >= stopAt && req && !req.wait && !req.teamPreview && !req.forceSwitch && !b.p1.isChoiceDone()) {
      const choices = legalChoices(req, b, 'p1');
      if (choices.length >= 2) return { b, choices, pool, format };
    }
    for (const side of ['p1', 'p2']) {
      const r = b[side].activeRequest;
      if (!r || r.wait || b[side].isChoiceDone()) continue;
      chooseSafe(b, side, aiChoose(b, side, rand, { level: 2, noise: 0.1 }) || 'default');
    }
  }
  return null;
}

/** What a player could know about the opponent here: who has come out, moves used, terastallization. */
function hiddenOf({ b, pool, format }) {
  return {
    mod: format === '6v6' ? 'gen9' : 'champions',
    pool,
    foe: b.p2.pokemon.map(p => {
      const revealed = p.isActive || p.previouslySwitchedIn > 0;
      return {
        name: p.name, revealed, item: null, ability: null, tera: p.terastallized || null,
        moves: revealed ? p.moveSlots.filter(m => m.pp < m.maxpp).map(m => m.id) : [],
      };
    }),
  };
}

const pct = x => `${(x * 100).toFixed(1)}%`;

/** Grades every action of one position RUNS times. */
async function measure({ json, hidden, choices, prevBestW = null }) {
  const runs = [];
  for (let r = 0; r < RUNS; r++) {
    const ev = await evaluate(json, 'p1', choices.map(c => c.choice), hidden, { salt: r + 1, refineAll: REFINED, ...(MODE === 'all' ? {} : { only: MODE }) });
    const grades = Object.fromEntries(choices.map(c => [c.choice, gradeTurn({ choices, ev, chosen: c.choice, naive: null, foeName: '', myName: '', prevBestW }).grade]));
    const best = Object.entries(ev.actions).sort((x, y) => y[1].W - x[1].W)[0][0];
    runs.push({ ev, grades, best });
  }
  return runs;
}

if (FEEDBACK) {
  const lines = readFileSync(FEEDBACK, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(f => f.position);
  console.log(`피드백 ${lines.length}건, 건마다 ${RUNS}번 다시 평가\n`);
  for (const f of lines) {
    const chosen = f.choices.find(c => c.label === f.review.choiceLabel)?.choice;
    const runs = await measure({ json: f.position, hidden: f.hidden, choices: f.choices, prevBestW: f.prevBestW });
    const got = runs.map(r => LABEL[r.grades[chosen]] || '?');
    console.log(`${f.at.slice(0, 16)} ${f.format}${f.story ? ` ${f.story}` : ''} ${f.review.turn}턴 「${f.review.choiceLabel}」 원래 ${f.review.gradeLabel} → 다시: ${got.join(', ')}${f.note ? `\n    의견: ${f.note}` : ''}`);
  }
  process.exit(0);
}

const t0 = Date.now();
let actions = 0;
let sameGrade = 0;
let sameBand = 0;
let bestAgree = 0;
let wSpread = 0;
let bigFlip = 0; // an action called fine in one run and wrong in another
const flips = {};
let done = 0;
for (let i = 0; done < POSITIONS && i < POSITIONS * 4; i++) {
  const format = i % 2 ? '6v6' : '3v3';
  const pos = randomPosition(format, 1000 + i);
  if (!pos) continue;
  const runs = await measure({ json: JSON.stringify(pos.b.toJSON()), hidden: hiddenOf(pos), choices: pos.choices });
  done++;
  const modal = mode(runs.map(r => r.best));
  bestAgree += runs.filter(r => r.best === modal).length / RUNS;
  for (const c of pos.choices) {
    const gs = runs.map(r => r.grades[c.choice]);
    if (gs.some(g => !ORDER.includes(g))) continue; // only / any / decided positions say nothing about thresholds
    actions++;
    if (new Set(gs).size === 1) sameGrade++;
    const bands = new Set(gs.map(g => BAND[g]));
    if (bands.size === 1) sameBand++;
    if (bands.has('ok') && bands.has('bad')) bigFlip++;
    for (const g of new Set(gs)) if (gs.some(x => x !== g)) flips[g] = (flips[g] || 0) + 1;
    const ws = runs.map(r => r.ev.actions[c.choice].W);
    wSpread += Math.max(...ws) - Math.min(...ws);
  }
  process.stdout.write(`\r위치 ${done}/${POSITIONS}`);
}
process.stdout.write('\n');

function mode(list) {
  const n = {};
  for (const x of list) n[x] = (n[x] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
}

const env = ['EVAL_PHASE1', 'EVAL_PHASE2', 'EVAL_WORLDS', 'EVAL_REFINE'].map(k => `${k}=${process.env[k] || '기본'}`).join(' ') + (REFINED ? ' (보강 포함)' : ' (보강 없이)');
console.log(`\n설정: ${env}`);
console.log(`위치 ${done}개 × 평가 ${RUNS}번, 등급이 매겨진 행동 ${actions}개 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
console.log(`  등급이 매번 같음          ${pct(sameGrade / actions)}`);
console.log(`  좋음/애매/나쁨 묶음이 같음  ${pct(sameBand / actions)}`);
console.log(`  좋음 ↔ 나쁨으로 뒤집힘     ${pct(bigFlip / actions)}`);
console.log(`  최선 행동이 같음          ${pct(bestAgree / done)}`);
console.log(`  같은 행동의 승률 추정 폭   평균 ${(wSpread / actions * 100).toFixed(1)}%p (최고 - 최저)`);
console.log(`  등급별로 다른 등급과 섞인 횟수: ${ORDER.filter(g => flips[g]).map(g => `${LABEL[g]} ${flips[g]}`).join(' · ')}`);
process.exit(0);
