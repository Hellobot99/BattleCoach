// Rule-based battle AI (no machine learning). Used for the opponent, for rollouts, and for "naive" comparisons.

const ABILITY_IMMUNE = {
  Ground: ['levitate', 'eartheater'],
  Fire: ['flashfire', 'wellbakedbody'],
  Water: ['waterabsorb', 'stormdrain', 'dryskin'],
  Electric: ['voltabsorb', 'lightningrod', 'motordrive'],
  Grass: ['sapsipper'],
};

const STATUS_MOVE_VALUE = {
  // inflicts a major status on the foe
  spore: 0.45, sleeppowder: 0.35, hypnosis: 0.25, yawn: 0.25,
  toxic: 0.3, willowisp: 0.3, thunderwave: 0.3, glare: 0.3, stunspore: 0.25, nuzzle: 0,
  // hazards
  stealthrock: 0.25, spikes: 0.18, toxicspikes: 0.15, stickyweb: 0.18,
};

/** Every legal choice for the side's current request, with labels for the UI. */
export function legalChoices(req, battle, sideId) {
  if (!req || req.wait) return [];
  if (req.teamPreview) return [];
  const sideData = req.side;
  const switches = sideData.pokemon
    .map((p, i) => ({ p, slot: i + 1 }))
    .filter(({ p }) => !p.active && !p.condition.endsWith(' fnt'));
  const switchChoice = ({ p, slot }) => ({
    choice: `switch ${slot}`,
    kind: 'switch',
    slot,
    label: p.details.split(',')[0],
  });
  if (req.forceSwitch) return switches.map(switchChoice);

  const active = req.active[0];
  const out = [];
  const enabled = active.moves.map((m, i) => ({ m, slot: i + 1 })).filter(({ m }) => !m.disabled);
  for (const { m, slot } of enabled) {
    out.push({ choice: `move ${slot}`, kind: 'move', slot, moveId: m.id, label: m.move, gimmick: null });
  }
  if (active.canTerastallize) {
    for (const { m, slot } of enabled) {
      out.push({ choice: `move ${slot} terastallize`, kind: 'move', slot, moveId: m.id, label: `${m.move} + 테라스탈`, gimmick: 'tera' });
    }
  }
  if (active.canMegaEvo) {
    for (const { m, slot } of enabled) {
      out.push({ choice: `move ${slot} mega`, kind: 'move', slot, moveId: m.id, label: `${m.move} + 메가진화`, gimmick: 'mega' });
    }
  }
  if (!active.trapped) out.push(...switches.map(switchChoice));
  if (!out.length) out.push({ choice: 'default', kind: 'move', slot: 1, label: '기본 행동', gimmick: null });
  return out;
}

export function moveImmune(dex, move, def) {
  if (move.category === 'Status') return false;
  if (!dex.getImmunity(move.type, def)) {
    if (!(move.ignoreImmunity === true || (move.ignoreImmunity && move.ignoreImmunity[move.type]))) return true;
  }
  const abil = ABILITY_IMMUNE[move.type];
  if (abil && def.hasAbility(abil)) return true;
  return false;
}

export function typeMultiplier(dex, move, def) {
  if (moveImmune(dex, move, def)) return 0;
  return 2 ** dex.getEffectiveness(move.type, def);
}

/** Expected damage as a fraction of the defender's max HP (rough, averaged over accuracy and rolls). */
export function estDamage(battle, att, def, moveId, gimmick = null) {
  const dex = battle.dex;
  const move = dex.moves.get(moveId);
  if (!move.exists || move.category === 'Status') return 0;
  const mult = typeMultiplier(dex, move, def);
  if (!mult) return 0;
  if (move.damage === 'level') return (att.level / def.maxhp) * accOf(move);
  if (typeof move.damage === 'number') return (move.damage / def.maxhp) * accOf(move);
  let bp = move.basePower || 60;
  if (move.id === 'lowkick' || move.id === 'grassknot' || move.id === 'heavyslam' || move.id === 'heatcrash') bp = 80;
  const physical = move.category === 'Physical';
  const atkStat = move.id === 'bodypress' ? statOf(att, 'def') : statOf(att, physical ? 'atk' : 'spa');
  const defStat = statOf(def, physical || move.overrideDefensiveStat === 'def' ? 'def' : 'spd');
  let stab = 1;
  const teraType = gimmick === 'tera' ? att.teraType : att.terastallized;
  if (att.hasType(move.type) || teraType === move.type) stab = att.hasAbility('adaptability') ? 2 : 1.5;
  if (teraType && teraType === move.type && att.hasType(move.type) && gimmick === 'tera') stab = 2;
  let hits = 1;
  if (Array.isArray(move.multihit)) hits = att.hasAbility('skilllink') ? move.multihit[1] : (move.multihit[0] + move.multihit[1]) / 2 + 0.6;
  else if (typeof move.multihit === 'number') hits = move.multihit;
  let dmg = ((((2 * att.level) / 5 + 2) * bp * atkStat) / defStat / 50 + 2) * stab * mult * hits * 0.925;
  if (physical && att.status === 'brn' && !att.hasAbility('guts')) dmg *= 0.5;
  if (att.hasItem('choiceband') && physical) dmg *= 1.5;
  if (att.hasItem('choicespecs') && !physical) dmg *= 1.5;
  if (att.hasItem('lifeorb')) dmg *= 1.3;
  if (gimmick === 'mega') dmg *= 1.15;
  return (dmg / def.maxhp) * accOf(move);
}

/** Boosted stat without ability/item event hooks (those expect an active move and can throw here). */
function statOf(p, stat) {
  return p.getStat(stat, false, true);
}

function accOf(move) {
  return move.accuracy === true ? 1 : move.accuracy / 100;
}

/** Effective speed. `item` overrides the held item (what the player believes it holds; null = no known item). */
export function speedOf(p, item) {
  let s = statOf(p, 'spe');
  if (p.status === 'par') s *= 0.5;
  if (item === undefined ? p.hasItem('choicescarf') : item === 'choicescarf') s *= 1.5;
  return s;
}

/** Does `att` act before `def` with this move (ignoring speed ties)? */
export function movesFirst(battle, att, def, moveId, defMoveId = null) {
  const dex = battle.dex;
  const pa = moveId ? dex.moves.get(moveId).priority || 0 : 0;
  const pd = defMoveId ? dex.moves.get(defMoveId).priority || 0 : 0;
  if (pa !== pd) return pa > pd;
  const tr = battle.field.getPseudoWeather('trickroom');
  return tr ? speedOf(att) < speedOf(def) : speedOf(att) > speedOf(def);
}

/** Highest expected damage `att` can deal to `def` with its known moves. */
export function bestHit(battle, att, def) {
  let best = 0;
  let id = null;
  for (const slot of att.moveSlots) {
    const d = estDamage(battle, att, def, slot.id);
    if (d > best) { best = d; id = slot.id; }
  }
  return { dmg: best, moveId: id };
}

function hpFrac(p) {
  return p.fainted ? 0 : p.hp / p.maxhp;
}

/** Matchup of `mon` coming in against `foe`: positive is good for `mon`. */
export function matchup(battle, mon, foe) {
  const out = Math.min(bestHit(battle, mon, foe).dmg, 1.2);
  const inc = Math.min(bestHit(battle, foe, mon).dmg, 1.2);
  return out - inc * 1.1;
}

function moveValue(battle, me, foe, moveId, gimmick, threat) {
  const dex = battle.dex;
  const move = dex.moves.get(moveId);
  if (move.category !== 'Status') {
    const dmg = estDamage(battle, me, foe, moveId, gimmick);
    const foeHp = hpFrac(foe);
    let v = Math.min(dmg, foeHp);
    if (dmg >= foeHp * 1.05) v += 0.35; // likely knock-out
    if (move.priority > 0 && dmg >= foeHp && threat >= hpFrac(me)) v += 0.4;
    if ((move.selfSwitch === true) && threat > 0.5) v += 0.15;
    if (move.recoil || move.mindBlownRecoil) v -= 0.05;
    return v;
  }
  if (STATUS_MOVE_VALUE[move.id] !== undefined) {
    const isHazard = ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(move.id);
    if (isHazard) return foe.side.sideConditions[move.id] ? 0 : STATUS_MOVE_VALUE[move.id];
    if (foe.status || foe.hasType(['Electric']) && move.id === 'thunderwave') return 0;
    if (move.id === 'willowisp' && foe.hasType('Fire')) return 0;
    if (move.id === 'toxic' && foe.hasType(['Poison', 'Steel'])) return 0;
    if (!dex.getImmunity(move.type, foe) && move.id === 'thunderwave') return 0;
    return STATUS_MOVE_VALUE[move.id];
  }
  if (move.heal || ['roost', 'recover', 'softboiled', 'slackoff', 'moonlight', 'synthesis', 'morningsun', 'shoreup', 'strengthsap', 'milkdrink'].includes(move.id)) {
    const missing = 1 - hpFrac(me);
    return missing > 0.45 && threat < 0.5 ? 0.4 : missing * 0.3;
  }
  if (move.self?.boosts || (move.boosts && move.target === 'self')) {
    const boosts = move.boosts || move.self.boosts;
    const already = Object.values(me.boosts).reduce((a, b) => a + Math.max(b, 0), 0);
    if (already >= 4) return 0.02;
    const total = Object.values(boosts).reduce((a, b) => a + b, 0);
    return threat < 0.4 && hpFrac(me) > 0.6 ? 0.18 + 0.06 * total : 0.04;
  }
  if (move.id === 'protect' || move.id === 'detect') return 0.05;
  return 0.08;
}

/**
 * Picks a choice for `sideId`.
 * level 1: strongest attack only, never switches voluntarily.
 * level 2: also switches out of bad matchups and uses status/setup moves.
 * noise: chance of a random legal choice (keeps rollouts varied).
 */
export function aiChoose(battle, sideId, rand = Math.random, { level = 2, noise = 0 } = {}) {
  const side = battle[sideId];
  const req = side.activeRequest;
  if (!req || req.wait) return null;
  if (req.teamPreview) return 'team ' + pickTeam(battle, sideId, req.maxChosenTeamSize || 6).join('');
  const choices = legalChoices(req, battle, sideId);
  if (!choices.length) return 'default';
  if (noise && rand() < noise) return choices[Math.floor(rand() * choices.length)].choice;

  const foe = side.foe.active[0];
  const me = side.active[0];

  if (req.forceSwitch || !me || me.fainted) {
    let best = choices[0];
    let bestScore = -Infinity;
    for (const c of choices) {
      const mon = side.pokemon[c.slot - 1];
      const s = foe && !foe.fainted ? matchup(battle, mon, foe) + hpFrac(mon) * 0.3 : hpFrac(mon);
      const jitter = rand() * 0.05;
      if (s + jitter > bestScore) { bestScore = s + jitter; best = c; }
    }
    return best.choice;
  }

  const foeHit = foe ? bestHit(battle, foe, me) : { dmg: 0, moveId: null };
  const threat = foeHit.dmg;
  let best = null;
  let bestScore = -Infinity;
  for (const c of choices) {
    if (c.kind !== 'move') continue;
    if (c.choice === 'default') { best = c; continue; }
    let v = moveValue(battle, me, foe, c.moveId, c.gimmick, threat);
    if (c.gimmick === 'mega') v += 0.06; // mega early is almost always right
    if (c.gimmick === 'tera') {
      const plain = moveValue(battle, me, foe, c.moveId, null, threat);
      if (v < plain * 1.25 + 0.05) v = plain - 0.05; else v -= 0.03;
    }
    if (level >= 2 && foe && !movesFirst(battle, me, foe, c.moveId, foeHit.moveId) && threat >= hpFrac(me)) {
      v *= 0.35; // we will probably faint before acting
    }
    v *= 1 + (rand() - 0.5) * 0.12;
    if (v > bestScore) { bestScore = v; best = c; }
  }
  if (level >= 2 && foe) {
    const stay = bestScore;
    for (const c of choices) {
      if (c.kind !== 'switch') continue;
      const mon = side.pokemon[c.slot - 1];
      const inc = bestHit(battle, foe, mon).dmg;
      const s = matchup(battle, mon, foe) - inc * 0.4 - 0.25 + (rand() - 0.5) * 0.08;
      const danger = threat >= hpFrac(me) && !movesFirst(battle, me, foe, null, foeHit.moveId);
      const helpless = stay < 0.15;
      if ((danger || helpless) && inc < 0.55 && s > stay && s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
  }
  return (best || choices[0]).choice;
}

/** Team preview: picks the `size` members with the best matchups against the opposing six. Returns 1-based slots. */
export function pickTeam(battle, sideId, size) {
  const side = battle[sideId];
  const foes = side.foe.pokemon;
  const scored = side.pokemon.map((mon, i) => {
    let s = 0;
    for (const f of foes) s += matchup(battle, mon, f);
    return { slot: i + 1, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, size).map(x => x.slot);
}

/** Win estimate from remaining HP when a rollout stops early. */
export function heuristicWin(battle, sideId) {
  const mine = battle[sideId].pokemon.reduce((a, p) => a + hpFrac(p), 0);
  const theirs = battle[sideId].foe.pokemon.reduce((a, p) => a + hpFrac(p), 0);
  return 1 / (1 + Math.exp(-1.3 * (mine - theirs)));
}
