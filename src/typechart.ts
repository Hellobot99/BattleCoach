// Type chart (Gen 6 onward): for each attacking type, the defending types it hits for ×2, ×½ and ×0.
export const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;

const CHART: Record<string, { se: string[]; nve: string[]; immune: string[] }> = {
  Normal: { se: [], nve: ['Rock', 'Steel'], immune: ['Ghost'] },
  Fire: { se: ['Grass', 'Ice', 'Bug', 'Steel'], nve: ['Fire', 'Water', 'Rock', 'Dragon'], immune: [] },
  Water: { se: ['Fire', 'Ground', 'Rock'], nve: ['Water', 'Grass', 'Dragon'], immune: [] },
  Electric: { se: ['Water', 'Flying'], nve: ['Electric', 'Grass', 'Dragon'], immune: ['Ground'] },
  Grass: { se: ['Water', 'Ground', 'Rock'], nve: ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'], immune: [] },
  Ice: { se: ['Grass', 'Ground', 'Flying', 'Dragon'], nve: ['Fire', 'Water', 'Ice', 'Steel'], immune: [] },
  Fighting: { se: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'], nve: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'], immune: ['Ghost'] },
  Poison: { se: ['Grass', 'Fairy'], nve: ['Poison', 'Ground', 'Rock', 'Ghost'], immune: ['Steel'] },
  Ground: { se: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel'], nve: ['Grass', 'Bug'], immune: ['Flying'] },
  Flying: { se: ['Grass', 'Fighting', 'Bug'], nve: ['Electric', 'Rock', 'Steel'], immune: [] },
  Psychic: { se: ['Fighting', 'Poison'], nve: ['Psychic', 'Steel'], immune: ['Dark'] },
  Bug: { se: ['Grass', 'Psychic', 'Dark'], nve: ['Fire', 'Fighting', 'Poison', 'Flying', 'Ghost', 'Steel', 'Fairy'], immune: [] },
  Rock: { se: ['Fire', 'Ice', 'Flying', 'Bug'], nve: ['Fighting', 'Ground', 'Steel'], immune: [] },
  Ghost: { se: ['Psychic', 'Ghost'], nve: ['Dark'], immune: ['Normal'] },
  Dragon: { se: ['Dragon'], nve: ['Steel'], immune: ['Fairy'] },
  Dark: { se: ['Psychic', 'Ghost'], nve: ['Fighting', 'Dark', 'Fairy'], immune: [] },
  Steel: { se: ['Ice', 'Rock', 'Fairy'], nve: ['Fire', 'Water', 'Electric', 'Steel'], immune: [] },
  Fairy: { se: ['Fighting', 'Dragon', 'Dark'], nve: ['Fire', 'Poison', 'Steel'], immune: [] },
};

/** Multiplier for an attacking type against one defending type. */
export function single(attack: string, defend: string) {
  const row = CHART[attack];
  if (!row) return 1;
  if (row.immune.includes(defend)) return 0;
  if (row.se.includes(defend)) return 2;
  if (row.nve.includes(defend)) return 0.5;
  return 1;
}

/** Damage a Pokémon of `types` takes from each attacking type, grouped by multiplier. */
export function defense(types: string[]) {
  const out = { x4: [] as string[], x2: [] as string[], half: [] as string[], quarter: [] as string[], immune: [] as string[] };
  for (const atk of TYPES) {
    const m = types.reduce((acc, t) => acc * single(atk, t), 1);
    if (m === 0) out.immune.push(atk);
    else if (m >= 4) out.x4.push(atk);
    else if (m >= 2) out.x2.push(atk);
    else if (m <= 0.25) out.quarter.push(atk);
    else if (m < 1) out.half.push(atk);
  }
  return out;
}

/** What a move of type `attack` does against each single defending type. */
export function offense(attack: string) {
  const row = CHART[attack];
  return { se: row?.se ?? [], nve: row?.nve ?? [], immune: row?.immune ?? [] };
}
