// Hides what the player cannot know (S01 §4): before each rollout, the opponent's unrevealed sets — and, for
// Pokémon not seen yet, their species — are redrawn from the sets Showdown's random generator really produces.
import { readFileSync } from 'node:fs';
import { Pokemon, toID } from './showdown.mjs';

const SETS = {
  gen9: JSON.parse(readFileSync(new URL('./data/sets-gen9.json', import.meta.url), 'utf8')),
  champions: JSON.parse(readFileSync(new URL('./data/sets-champions.json', import.meta.url), 'utf8')),
};

export const setStats = mod => SETS[mod];

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const expand = v => (typeof v === 'number' ? Object.fromEntries(STATS.map(s => [s, v])) : v);

// fields that describe an active Pokémon's ongoing state, carried over to the redrawn one
const ACTIVE_FIELDS = [
  'position', 'isActive', 'activeTurns', 'activeMoveActions', 'previouslySwitchedIn', 'isStarted', 'boosts',
  'volatiles', 'lastMove', 'lastMoveUsed', 'moveThisTurn', 'moveLastTurnResult', 'hurtThisTurn', 'lastDamage',
  'attackedBy', 'timesAttacked', 'newlyStarted', 'beingCalledBack', 'trapped', 'maybeTrapped', 'switchFlag', 'speed',
];

function pick(list, rand, weight) {
  const total = list.reduce((a, x) => a + weight(x), 0);
  let r = rand() * total;
  for (const x of list) {
    r -= weight(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

// links that lead out of the battle state (or back up to it) and never hold a replaced Pokémon
const SKIP_KEYS = new Set(['battle', 'side', 'foe', 'allySide', 'sides', 'dex', 'format', 'ruleTable', 'prng', 'gen', 'data']);

/** Points every reference to a replaced Pokémon (volatile sources, side conditions …) at its replacement. */
function remap(root, swaps) {
  const seen = new WeakSet();
  const walk = obj => {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
    seen.add(obj);
    for (const key of Object.keys(obj)) {
      if (SKIP_KEYS.has(key)) continue;
      const v = obj[key];
      if (v && typeof v === 'object') {
        if (swaps.has(v)) obj[key] = swaps.get(v);
        else walk(v);
      }
    }
  };
  walk(root);
}

export function fits(set, info) {
  if (info.moves.some(m => !set.moves.includes(m))) return false;
  if (info.item && toID(set.item) !== info.item) return false;
  if (info.ability && toID(set.ability) !== info.ability) return false;
  if (info.tera && set.teraType && set.teraType !== info.tera) return false;
  return true;
}

/**
 * hidden = { mod, foe: [{ name, revealed, moves: [ids], item, ability, tera }], pool: [species ids] | null }
 * pool: the species the opponent can still have (3v3: its six at team preview); null = any species in the format.
 */
export function determinize(battle, sideId, hidden, rand) {
  const db = SETS[hidden.mod];
  const side = battle[sideId];
  const swaps = new Map();
  const known = new Set();
  for (const p of battle[sideId === 'p1' ? 'p2' : 'p1'].pokemon) known.add(toID(p.set.species));
  for (const p of side.pokemon) {
    const info = hidden.foe.find(f => f.name === p.name);
    if (!info || info.revealed) known.add(toID(p.set.species));
  }

  for (let i = 0; i < side.pokemon.length; i++) {
    const old = side.pokemon[i];
    const info = hidden.foe.find(f => f.name === old.name);
    if (!info) continue;
    // a Pokémon that has already changed form (Mega Evolution) keeps its real set
    if (old.species.name !== old.set.species && old.species.baseSpecies === old.set.species) continue;

    let speciesId;
    if (info.revealed) {
      speciesId = toID(old.set.species);
    } else {
      const pool = (hidden.pool || Object.keys(db)).filter(id => db[id] && !known.has(id));
      if (!pool.length) continue;
      speciesId = pool[Math.floor(rand() * pool.length)];
      known.add(speciesId);
    }
    const data = db[speciesId];
    if (!data) continue;
    const candidates = data.sets.filter(s => fits(s, info));
    if (!candidates.length) continue;
    const set = pick(candidates, rand, s => s.w);

    const mon = new Pokemon(
      {
        name: old.name,
        species: data.species,
        level: data.level,
        gender: set.gender || '',
        moves: set.moves,
        ability: set.ability,
        item: old.item || !info.revealed ? set.item : '', // an item already used or knocked off stays gone
        teraType: set.teraType || undefined,
        evs: expand(set.evs),
        ivs: expand(set.ivs),
        nature: set.nature || '',
      },
      side,
    );
    if (info.revealed) {
      mon.hp = old.fainted ? 0 : Math.max(1, Math.round((old.hp / old.maxhp) * mon.maxhp));
      mon.fainted = old.fainted;
      mon.status = old.status;
      mon.statusState = { ...old.statusState, target: mon };
      for (const slot of mon.moveSlots) {
        const was = old.moveSlots.find(s => s.id === slot.id);
        if (was) Object.assign(slot, { pp: was.pp, used: was.used });
      }
      if (old.terastallized) {
        mon.terastallized = old.terastallized;
        mon.teraType = old.terastallized;
      }
    }
    mon.canTerastallize = old.canTerastallize;
    mon.position = old.position;
    if (old.isActive) {
      for (const f of ACTIVE_FIELDS) mon[f] = old[f];
      for (const v of Object.values(mon.volatiles)) if (v.target === old) v.target = mon;
      side.active[old.position] = mon;
    }
    side.pokemon[i] = mon;
    // the saved state rebuilds the side from its team list, so the redrawn set has to be in it
    const t = side.team.indexOf(old.set);
    if (t >= 0) side.team[t] = mon.set;
    swaps.set(old, mon);
  }
  if (swaps.size) {
    for (const s of battle.sides) remap(s, swaps);
    remap(battle.field, swaps);
    remap(battle.queue, swaps);
  }
  // requests were built from the real sets: rebuild them from the redrawn ones
  if (battle.requestState) battle.makeRequest(battle.requestState);
}
