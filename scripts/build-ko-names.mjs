// Builds server/data/ko-names.json (official Korean names) from PokeAPI's open CSV data,
// keyed by Showdown ids, and reports names the random battle sets use that have no Korean entry.
// Run: npm run ko-names
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Dex, toID } = require('pokemon-showdown');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const KO = '3'; // languages.csv: 3 = ko

async function csv(name) {
  const res = await fetch(`${BASE}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
  const [head, ...rows] = (await res.text()).trim().split('\n');
  const cols = head.split(',');
  return rows.map(r => {
    const v = r.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

async function names(base, table, idCol) {
  const ids = Object.fromEntries((await csv(base)).map(r => [r.id, toID(r.identifier)]));
  const out = {};
  for (const r of await csv(table)) if (r.local_language_id === KO && ids[r[idCol]]) out[ids[r[idCol]]] = r.name;
  return out;
}

const data = {
  source: 'PokeAPI (https://github.com/PokeAPI/pokeapi), official Korean names',
  moves: await names('moves', 'move_names', 'move_id'),
  species: await names('pokemon_species', 'pokemon_species_names', 'pokemon_species_id'),
  abilities: await names('abilities', 'ability_names', 'ability_id'),
  items: await names('items', 'item_names', 'item_id'),
};

// coverage against what the two random formats can actually show
const used = { moves: new Set(), species: new Set(), abilities: new Set(), items: new Set() };
for (const [folder, mod] of [['gen9', 'gen9'], ['champions', 'champions']]) {
  const sets = require(`pokemon-showdown/dist/data/random-battles/${folder}/sets.json`);
  const dex = Dex.mod(mod);
  for (const [sp, entry] of Object.entries(sets)) {
    const s = dex.species.get(sp);
    used.species.add(toID(s.baseSpecies));
    if (s.requiredItem) used.items.add(toID(s.requiredItem));
    for (const set of entry.sets) {
      for (const m of set.movepool) used.moves.add(toID(m));
      for (const a of set.abilities || []) used.abilities.add(toID(a));
    }
  }
}
for (const [kind, ids] of Object.entries(used)) {
  const missing = [...ids].filter(id => !data[kind][id]);
  console.log(`${kind}: ${ids.size} used, ${missing.length} without Korean name${missing.length ? ': ' + missing.join(', ') : ''}`);
}

mkdirSync(new URL('../server/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../server/data/ko-names.json', import.meta.url), JSON.stringify(data));
console.log('wrote server/data/ko-names.json');
