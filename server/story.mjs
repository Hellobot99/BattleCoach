// Puzzle mode (퍼즐): numbered levels with rising difficulty, built and calibrated by scripts/build-puzzles.mjs.
// All 3 vs 3 under Champions rules with fixed teams.
import { readFileSync } from 'node:fs';
import { Dex } from './showdown.mjs';
import { koSpecies } from './names.mjs';

export { STORY_FORMAT } from './showdown.mjs';

const LEVELS = JSON.parse(readFileSync(new URL('./data/puzzles.json', import.meta.url), 'utf8'));

const AI_TEXT = l =>
  l.ai === 1 ? (l.noise > 0 ? '가끔 실수하는 상대' : '가장 센 기술만 쓰는 상대') : l.ai === 2 ? '불리하면 교체하고 상태이상도 쓰는 상대' : '코치처럼 수를 계산하는 상대';
const GAP_TEXT = g => (g >= 3 ? '내 팀이 확실히 강해요' : g >= 1 ? '내 팀이 조금 강해요' : g > -1 ? '두 팀 전력이 비슷해요' : g >= -2.5 ? '상대 팀이 조금 강해요' : '상대 팀이 확실히 강해요');

/** What changes at this level compared with the one before. */
function note(i) {
  const l = LEVELS[i];
  if (i === 0) return `가장 쉬운 단계예요. ${AI_TEXT(l)}이고, ${GAP_TEXT(l.gap)}.`;
  const p = LEVELS[i - 1];
  const out = [];
  if (l.ai !== p.ai || (l.ai === 1 && l.noise === 0 && p.noise > 0)) out.push(`상대가 ${AI_TEXT(l)}로 바뀌어요`);
  else if (l.noise < p.noise) out.push('상대의 실수가 줄어요');
  if (l.coaching !== p.coaching) out.push('상성 배율 · 속도 안내가 꺼져요 (실전 정보만)');
  if (l.hints !== p.hints) out.push(l.hints === 0 ? '힌트를 쓸 수 없어요' : `힌트가 ${l.hints}번으로 줄어요`);
  if (l.timer && !p.timer) out.push('턴 제한 45초가 켜져요');
  if (GAP_TEXT(l.gap) !== GAP_TEXT(p.gap)) out.push(GAP_TEXT(l.gap));
  return out.length ? `${out.join('. ')}.` : '앞 단계와 규칙은 같고, 팀이 바뀌어요.';
}

const idOf = i => `lv${i + 1}`;

export function storyStage(id) {
  const i = LEVELS.findIndex((_, k) => idOf(k) === id);
  if (i < 0) throw new Error('없는 단계예요.');
  const l = LEVELS[i];
  return {
    id, no: i + 1, next: i + 1 < LEVELS.length ? idOf(i + 1) : null, title: `${i + 1}단계`, goal: note(i),
    ai: l.ai, noise: l.noise, coaching: l.coaching, timer: l.timer, hintLimit: l.hints, me: l.me, foe: l.foe,
  };
}

export function storyTeams(stage) {
  return { me: stage.me, foe: stage.foe };
}

/** Level list for the puzzle screen. */
export function storyList() {
  const mon = s => ({ species: koSpecies(s.species), spriteid: Dex.species.get(s.species).spriteid });
  return LEVELS.map((l, i) => ({
    id: idOf(i), no: i + 1, title: `${i + 1}단계`, goal: note(i), ai: l.ai, timer: l.timer, hintLimit: l.hints,
    coaching: l.coaching, gap: GAP_TEXT(l.gap), simWin: l.simWin, me: l.me.map(mon), foe: l.foe.map(mon),
  }));
}
