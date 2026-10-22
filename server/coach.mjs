// Turns rollout results into a grade (S02 §3) and short coach lines built from reason tags (S03, C02).
import { eun, eul, iga, ro } from './korean.mjs';

export const GRADES = {
  brill: { label: '묘수', sym: '!!' },
  great: { label: '좋은 수', sym: '!' },
  best: { label: '최선', sym: '★' },
  exc: { label: '우수', sym: '✓' },
  good: { label: '무난', sym: '·' },
  inacc: { label: '부정확', sym: '?!' },
  mist: { label: '실수', sym: '?' },
  blund: { label: '블런더', sym: '??' },
  miss: { label: '놓친 기회', sym: '✕' },
  only: { label: '유일한 수', sym: '–' },
  any: { label: '어느 쪽이든', sym: '≈' },
  decided: { label: '승부 결정', sym: '–' },
  timeout: { label: '시간 초과', sym: '⏱' },
};

const pct = x => Math.round(x * 100);

// 「놓친 기회」: a weak choice (worse than 무난) right when a big chance was there
const CHANCE_OPENED = 0.12; // the best win rate rose this much since the last decision (the opponent slipped, or luck)
const CHANCE_KO = 0.6; // or the best move would have knocked the opponent out this often…
const CHANCE_KO_LOST = 0.4; // …and the chosen action gave up at least this much of that chance

/**
 * choices: legal choices with labels (from policy.legalChoices) plus `eff` for moves.
 * ev: evaluator result. chosen: the choice string played. naive: what the level-1 AI would play.
 * prevBestW: the best win rate at the previous decision (null on the first one).
 */
export function gradeTurn({ choices, ev, chosen, naive, foeName, myName, prevBestW = null }) {
  const byChoice = Object.fromEntries(choices.map(c => [c.choice, c]));
  const entries = choices.map(c => ({ c, a: ev.actions[c.choice] })).filter(x => x.a);
  entries.sort((x, y) => y.a.W - x.a.W);
  const bestE = entries[0];
  const chosenE = entries.find(x => x.c.choice === chosen) || bestE;
  const bestW = bestE.a.W;
  const worstW = entries[entries.length - 1].a.W;
  const dW = Math.max(0, (bestW - chosenE.a.W) * 100);
  const second = entries.find(x => x.c.choice !== chosenE.c.choice);
  const gapToSecond = second ? (chosenE.a.W - second.a.W) * 100 : 0;

  let grade;
  if (entries.length <= 1) grade = 'only';
  else if (bestW >= 0.98 || bestW <= 0.02) grade = 'decided';
  else if ((bestW - worstW) * 100 < 3) grade = 'any';
  else if (dW <= 1) {
    if (gapToSecond >= 8 && naive && naive !== chosen && chosenE.c.kind === 'switch') grade = 'brill';
    else if (gapToSecond >= 8 && naive && naive !== chosen && chosenE.c.gimmick) grade = 'brill';
    else if (gapToSecond >= 10) grade = 'great';
    else grade = 'best';
  } else if (dW <= 3) grade = 'exc';
  else if (dW <= 6) grade = 'good';
  else if (dW <= 12) grade = 'inacc';
  else if (dW <= 25) grade = 'mist';
  else grade = 'blund';

  let chance = null;
  if (['inacc', 'mist', 'blund'].includes(grade)) {
    const opened = prevBestW !== null ? bestW - prevBestW : 0;
    if (bestE.c.kind === 'move' && bestE.a.ko >= CHANCE_KO && chosenE.a.ko <= bestE.a.ko - CHANCE_KO_LOST) chance = 'ko';
    else if (opened >= CHANCE_OPENED) chance = { opened };
    if (chance) grade = 'miss';
  }

  const graded = !['only', 'any', 'decided'].includes(grade);
  const lines = graded
    ? reasonLines({ grade, chosenE, bestE, entries, byChoice, foeName, myName })
    : { tags: [], reason: '', detail: `승률 추정 ${pct(chosenE.a.W)}%` };
  if (chance && chance !== 'ko') lines.reason = `직전보다 이길 확률이 ${Math.round(chance.opened * 100)}%p 올라간 턴이었어요. ${lines.reason}`;
  return {
    grade,
    graded,
    score: graded ? Math.max(0, 100 - 4 * dW) : null,
    dW: Math.round(dW * 10) / 10,
    W: chosenE.a.W,
    bestW,
    choiceLabel: chosenE.c.label,
    bestLabel: bestE.c.label,
    bestChoice: bestE.c.choice,
    tags: lines.tags,
    headline: chance === 'ko' ? '쓰러뜨릴 기회를 놓쳤어요.' : headline(grade),
    reason: lines.reason,
    detail: lines.detail,
  };
}

function headline(grade) {
  return {
    brill: '남들이 놓칠 수를 찾았어요!',
    great: '이 턴에 가장 크게 앞서는 수예요.',
    best: '가장 좋은 선택이에요.',
    exc: '거의 최선이에요.',
    good: '나쁘지 않지만 더 좋은 수가 있었어요.',
    inacc: '조금 아쉬운 선택이에요.',
    mist: '더 좋은 수가 분명히 있었어요.',
    blund: '큰 손해를 본 선택이에요.',
    miss: '상대가 빈틈을 보였는데 살리지 못했어요.',
    only: '고를 수 있는 행동이 하나뿐이었어요.',
    any: '어느 쪽을 골라도 비슷했어요.',
    decided: '이미 승부가 거의 정해진 턴이에요.',
  }[grade];
}

function reasonLines({ grade, chosenE, bestE, entries, foeName, myName }) {
  const tags = [];
  const c = chosenE.c;
  const a = chosenE.a;
  const b = bestE.c;
  const ba = bestE.a;
  const foe = `상대 ${foeName}`;
  let reason = '';
  const isBest = chosenE === bestE || (ba.W - a.W) * 100 <= 1;

  if (c.kind === 'move' && c.eff === 0) {
    tags.push('type_immune');
    reason = `${eun(c.moveName || c.label)} ${foe}에게 효과가 없어요.`;
  } else if (isBest) {
    if (c.kind === 'switch') {
      const stay = entries.filter(x => x.c.kind === 'move');
      const stayFaint = stay.length ? Math.min(...stay.map(x => x.a.selfFaint)) : 0;
      if (stayFaint >= 0.5) {
        tags.push('stay_bad', 'switch_safe');
        reason = `남았다면 이번 턴에 쓰러질 확률이 ${pct(stayFaint)}%였어요. ${ro(c.label)} 바꾼 게 맞아요.`;
      } else {
        tags.push('switch_safe');
        reason = `${iga(c.label)} ${foe}에게 더 유리해요.`;
      }
    } else if (a.ko >= 0.5) {
      tags.push('ko_now');
      reason = `이번 턴에 ${eul(foe)} 쓰러뜨릴 확률이 ${pct(a.ko)}%예요.`;
    } else if (c.gimmick === 'tera') {
      tags.push('tera_flip');
      reason = '지금 테라스탈하는 게 가장 이득이에요.';
    } else if (c.gimmick === 'mega') {
      tags.push('mega_timing');
      reason = '메가진화로 능력이 올라 지금 쓰는 게 좋아요.';
    } else if (c.eff >= 2) {
      tags.push('type_se');
      reason = `${eun(c.moveName)} ${foe}에게 효과가 굉장해요.`;
    } else if (a.first !== null && a.first >= 0.8) {
      tags.push('outspeed');
      reason = `${iga(myName)} 먼저 움직여서 피해를 먼저 줄 수 있어요.`;
    } else {
      const gap = Math.round((ba.W - (entries[1]?.a.W ?? ba.W)) * 100);
      reason = gap >= 3 ? `다음으로 좋은 선택보다 승률이 ${gap}%p 높아요.` : '다른 선택과 차이는 작지만 이게 가장 나아요.';
    }
  } else {
    const diff = Math.round((ba.W - a.W) * 100);
    if (b.kind === 'switch' && c.kind === 'move' && a.selfFaint >= 0.5) {
      tags.push('stay_bad', 'switch_safe');
      reason = `남으면 이번 턴에 쓰러질 확률이 ${pct(a.selfFaint)}%예요. ${ro(b.label)} 바꾸는 게 더 좋았어요.`;
    } else if (b.kind === 'move' && ba.ko >= a.ko + 0.3 && ba.ko >= 0.4) {
      tags.push('ko_now');
      reason = `${b.moveName} 기술이었다면 이번 턴에 쓰러뜨릴 확률이 ${pct(ba.ko)}%였어요.`;
    } else if (b.kind === 'move' && b.eff >= 2 && (c.kind !== 'move' || c.eff < 2)) {
      tags.push('type_se');
      reason = `${eun(b.moveName)} ${foe}에게 효과가 굉장해요.`;
    } else if (c.kind === 'switch' && b.kind === 'move') {
      tags.push('free_turn');
      reason = `교체하는 동안 ${foe}에게 공짜 턴을 줬어요. ${b.label} 쪽이 나았어요.`;
    } else if (b.gimmick === 'tera' && !c.gimmick) {
      tags.push('tera_flip');
      reason = `${b.label} 쪽이 더 유리했어요. 지금이 테라스탈할 때였어요.`;
    } else if (b.gimmick === 'mega' && !c.gimmick) {
      tags.push('mega_timing');
      reason = '지금 메가진화했다면 더 유리했어요.';
    } else if (c.kind === 'move' && c.eff > 0 && c.eff < 1) {
      tags.push('resisted');
      reason = `${eun(c.moveName)} ${foe}에게 효과가 별로예요.`;
    } else {
      reason = `${b.label} 쪽이 승률이 ${diff}%p 높았어요.`;
    }
  }
  const detail = `승률 추정 ${pct(a.W)}% · 최선 ${pct(ba.W)}%${a.ko > 0 && c.kind === 'move' ? ` · 이번 턴 쓰러뜨릴 확률 ${pct(a.ko)}%` : ''}`;
  return { tags, reason, detail };
}

/** Three-step hint (S05 §4) built from the best action. */
export function hintFor(level, { choices, ev, myName, foeName }) {
  const entries = choices.map(c => ({ c, a: ev.actions[c.choice] })).filter(x => x.a).sort((x, y) => y.a.W - x.a.W);
  const best = entries[0];
  if (!best) return null;
  const stayFaint = Math.min(...entries.filter(x => x.c.kind === 'move').map(x => x.a.selfFaint), 1);
  if (level === 1) {
    if (best.c.kind === 'switch') return `${iga(myName)} 이번 턴을 버틸 수 있는지 보세요.`;
    if (best.a.ko >= 0.5) return `상대 ${eul(foeName)} 이번 턴에 쓰러뜨릴 수 있는 기술이 있는지 보세요.`;
    if (best.c.gimmick) return `이번 턴에 쓸 수 있는 특별한 힘이 있어요.`;
    if (best.c.eff >= 2) return '타입 상성을 보세요.';
    return '누가 먼저 움직이는지, 남은 체력이 얼마인지 비교해 보세요.';
  }
  if (level === 2) {
    if (best.c.kind === 'switch') return stayFaint >= 0.5 ? `남으면 쓰러질 확률이 ${pct(stayFaint)}%예요. 교체 쪽에 답이 있어요.` : '교체 쪽에 답이 있어요.';
    if (best.c.gimmick === 'tera') return '테라스탈을 생각해 보세요.';
    if (best.c.gimmick === 'mega') return '메가진화를 생각해 보세요.';
    return '공격 기술 중에 답이 있어요.';
  }
  return `답: ${best.c.label}`;
}

export function summarize(reviews) {
  const counted = reviews.filter(r => r.graded && !r.hinted && !r.timeout);
  const accuracy = counted.length ? Math.round(counted.reduce((s, r) => s + r.score, 0) / counted.length) : null;
  const counts = {};
  for (const r of reviews) counts[r.grade] = (counts[r.grade] || 0) + 1;
  const turning = [];
  for (let i = 1; i < reviews.length; i++) {
    const delta = (reviews[i].bestW - reviews[i - 1].bestW) * 100;
    if (Math.abs(delta) < 15) continue;
    // credit the swing to the last real decision before it (a forced or one-option turn explains nothing)
    let j = i - 1;
    while (j > 0 && !reviews[j].graded) j--;
    if (!turning.some(t => t.index === j)) turning.push({ index: j, turn: reviews[j].turn, delta: Math.round(delta) });
  }
  turning.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const tagCount = {};
  for (const r of reviews) if (['inacc', 'mist', 'blund', 'miss'].includes(r.grade)) for (const t of r.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  const weakTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { accuracy, counts, turning: turning.slice(0, 3), weakTag, hints: reviews.filter(r => r.hinted).length, timeouts: reviews.filter(r => r.timeout).length };
}
