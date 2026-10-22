// Loads the official Pokémon Showdown simulator (CommonJS) for use from ES modules.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PS = require('pokemon-showdown');

export const { Battle, Dex, PRNG, toID } = PS;

export const FORMATS = {
  '6v6': { id: 'gen9randombattle', label: '6 대 6 (9세대 랜덤 배틀)' },
  '3v3': {
    id: 'gen9championsrandombattle@@@Team Preview,Picked Team Size = 3',
    label: '3 대 3 (포켓몬 챔피언스 랜덤 배틀)',
  },
};

/** Deterministic Gen 5 RNG seed for rollout number n (same n = same randomness for every action). */
export function seedFor(n) {
  const a = (n * 7919 + 13) % 65536;
  const b = (n * 104729 + 7) % 65536;
  const c = (n * 1299709 + 3) % 65536;
  const d = (n * 15485863 + 1) % 65536;
  return `${a},${b},${c},${d}`;
}

/** Small seeded RNG for AI decisions inside rollouts. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
