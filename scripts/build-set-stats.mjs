// Samples Showdown's own random team generator and records, per species, which full sets appear and how often.
// The evaluator draws the opponent's hidden information from these (S01 §4), and the page shows the odds.
// Run: npm run set-stats
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Teams, toID } = require('pokemon-showdown');

const TEAMS = 6000;
const MAX_SETS = 30; // most common full sets kept per species

const FORMATS = { gen9: 'gen9randombattle', champions: 'gen9championsrandombattle' };

const compact = stats => {
  const v = Object.values(stats);
  return v.every(x => x === v[0]) ? v[0] : stats;
};
const bump = (obj, key) => (obj[key] = (obj[key] || 0) + 1);

mkdirSync(new URL('../server/data/', import.meta.url), { recursive: true });
for (const [name, formatid] of Object.entries(FORMATS)) {
  const t0 = Date.now();
  const bySpecies = {};
  for (let i = 0; i < TEAMS; i++) {
    for (const set of Teams.generate(formatid)) {
      const id = toID(set.species);
      const s = (bySpecies[id] ||= { species: set.species, level: set.level, n: 0, sets: {}, moves: {}, items: {}, abilities: {}, tera: {} });
      s.n++;
      const moves = [...set.moves].map(toID).sort();
      const key = [moves.join(','), set.ability, set.item, set.teraType || ''].join('|');
      const entry = (s.sets[key] ||= { w: 0, moves, ability: set.ability, item: set.item, teraType: set.teraType || null, evs: compact(set.evs), ivs: compact(set.ivs), nature: set.nature || null, gender: set.gender || '' });
      entry.w++;
      moves.forEach(m => bump(s.moves, m));
      bump(s.items, set.item || '');
      bump(s.abilities, set.ability);
      if (set.teraType) bump(s.tera, set.teraType);
    }
  }
  const out = {};
  for (const [id, s] of Object.entries(bySpecies)) {
    const frac = obj => Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / s.n) * 1000) / 1000]));
    out[id] = {
      species: s.species,
      level: s.level,
      n: s.n,
      sets: Object.values(s.sets).sort((a, b) => b.w - a.w).slice(0, MAX_SETS),
      moves: frac(s.moves),
      items: frac(s.items),
      abilities: frac(s.abilities),
      tera: frac(s.tera),
    };
  }
  writeFileSync(new URL(`../server/data/sets-${name}.json`, import.meta.url), JSON.stringify(out));
  console.log(`${name}: ${Object.keys(out).length} species from ${TEAMS} teams in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
