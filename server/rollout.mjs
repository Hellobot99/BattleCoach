// Monte Carlo rollouts: for each candidate action, play the battle forward a few turns with the rule-based AI on both sides.
import { Battle, PRNG, seedFor, mulberry32 } from './showdown.mjs';
import { aiChoose, heuristicWin } from './policy.mjs';

let warned = false;

function chooseSafe(battle, sideId, choice) {
  try {
    if (battle.choose(sideId, choice)) return true;
  } catch {}
  try {
    battle[sideId].clearChoice?.();
    return battle.choose(sideId, 'default');
  } catch {
    return false;
  }
}

function stepUntilChoices(battle, rand, maxTurn) {
  let guard = 0;
  while (!battle.ended && battle.turn < maxTurn && guard++ < 60) {
    let acted = false;
    for (const sideId of ['p1', 'p2']) {
      const side = battle[sideId];
      const req = side.activeRequest;
      if (req && !req.wait && !side.isChoiceDone()) {
        chooseSafe(battle, sideId, aiChoose(battle, sideId, rand, { level: 2, noise: 0.08 }));
        acted = true;
      }
    }
    if (!acted) break;
  }
}

/**
 * Runs rollouts for `actions` (choice strings) using rollout numbers `seeds`.
 * Returns per-action sums so several workers' results can be added together.
 */
export function runRollouts({ json, worlds, sideId, actions, seeds, depth }) {
  const foeId = sideId === 'p1' ? 'p2' : 'p1';
  const out = {};
  for (const action of actions) {
    const acc = { sumW: 0, n: 0, ko: 0, selfFaint: 0, first: 0, firstN: 0 };
    for (const s of seeds) {
      try {
        rollout(acc, action, s);
      } catch (err) {
        // a rare simulator edge case in one sample: skip it rather than fail the whole evaluation
        if (!warned) {
          warned = true;
          console.error('[rollout] skipped a sample:', err?.message || err);
        }
      }
    }
    out[action] = acc;
  }
  return out;

  function rollout(acc, action, s) {
    // each rollout plays in one of the redrawn worlds (the opponent's hidden info resampled), picked by its seed
    const b = Battle.fromJSON(worlds ? worlds[seeds.indexOf(s)] : json);
    const rand = mulberry32(s * 2654435761);
    b.prng = new PRNG(seedFor(s));
    b.send = () => {};
    const startTurn = b.turn;
    const foeName = b[foeId].active[0]?.name;
    const logStart = b.log.length;

    // the opponent's choice is sampled first, from the same pre-turn state
    const foeReq = b[foeId].activeRequest;
    if (foeReq && !foeReq.wait) chooseSafe(b, foeId, aiChoose(b, foeId, rand, { level: 2, noise: 0.08 }));
    chooseSafe(b, sideId, action);

    // first-turn facts used by the coach
    let myFirst = null;
    let foeFirst = null;
    for (let i = logStart; i < b.log.length; i++) {
      const line = b.log[i];
      if (!line.startsWith('|move|')) continue;
      const who = line.slice(6, 8);
      if (who === sideId && myFirst === null) myFirst = i;
      if (who === foeId && foeFirst === null) foeFirst = i;
    }
    if (myFirst !== null && foeFirst !== null) {
      acc.firstN++;
      if (myFirst < foeFirst) acc.first++;
    }
    const mine = b[sideId].active[0];
    const foeMon = b[foeId].pokemon.find(p => p.name === foeName);
    if (foeMon && foeMon.fainted) acc.ko++;
    // the Pokémon left on our field after this action (the switch-in for a switch)
    if (mine && mine.fainted) acc.selfFaint++;
    else if (b.log.slice(logStart).some(l => l.startsWith(`|faint|${sideId}a`))) acc.selfFaint++;

    stepUntilChoices(b, rand, startTurn + depth);
    let w;
    if (b.ended) w = b.winner === b[sideId].name ? 1 : b.winner ? 0 : 0.5;
    else w = heuristicWin(b, sideId);
    acc.sumW += w;
    acc.n++;
  }
}
