// Builds server/data/ko-names.json (official Korean names) from PokeAPI's open CSV data,
// keyed by Showdown ids, and reports names the random battle sets use that have no Korean entry.
// Run: npm run ko-names
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Dex, toID } = require('pokemon-showdown');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const KO = '3'; // languages.csv: 3 = ko

/** Parses CSV with quoted fields (descriptions contain commas and line breaks). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function csv(name) {
  const res = await fetch(`${BASE}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
  const [cols, ...rows] = parseCsv(await res.text());
  return rows.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

/** Newest Korean in-game description per entry, keyed by Showdown id. */
async function descriptions(base, table, idCol) {
  const ids = Object.fromEntries((await csv(base)).map(r => [r.id, toID(r.identifier)]));
  const best = {};
  for (const r of await csv(table)) {
    if (r.language_id !== KO || !ids[r[idCol]]) continue;
    const vg = Number(r.version_group_id);
    const id = ids[r[idCol]];
    if (!best[id] || vg > best[id].vg) best[id] = { vg, text: r.flavor_text.replace(/\u00ad\s*/g, '').replace(/\s+/g, ' ').trim() };
  }
  return Object.fromEntries(Object.entries(best).map(([id, v]) => [id, v.text]));
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
  moveDesc: await descriptions('moves', 'move_flavor_text', 'move_id'),
  abilityDesc: await descriptions('abilities', 'ability_flavor_text', 'ability_id'),
  itemDesc: await descriptions('items', 'item_flavor_text', 'item_id'),
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
for (const [kind, desc] of [['moves', 'moveDesc'], ['abilities', 'abilityDesc']]) {
  const missing = [...used[kind]].filter(id => !data[desc][id]);
  console.log(`${desc}: ${used[kind].size - missing.length}/${used[kind].size} described${missing.length ? ' (missing: ' + missing.slice(0, 15).join(', ') + (missing.length > 15 ? ' …' : '') + ')' : ''}`);
}

mkdirSync(new URL('../server/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../server/data/ko-names.json', import.meta.url), JSON.stringify(data));
console.log('wrote server/data/ko-names.json');
