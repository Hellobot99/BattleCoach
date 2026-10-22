// Official Korean names (built by scripts/build-ko-names.mjs from PokeAPI). Falls back to the English name.
import { readFileSync } from 'node:fs';
import { Dex, toID } from './showdown.mjs';

const KO = JSON.parse(readFileSync(new URL('./data/ko-names.json', import.meta.url), 'utf8'));

export const TYPE_KO = {
  Normal: '노말', Fire: '불꽃', Water: '물', Electric: '전기', Grass: '풀', Ice: '얼음',
  Fighting: '격투', Poison: '독', Ground: '땅', Flying: '비행', Psychic: '에스퍼', Bug: '벌레',
  Rock: '바위', Ghost: '고스트', Dragon: '드래곤', Dark: '악', Steel: '강철', Fairy: '페어리', Stellar: '스텔라',
};

const FORME_KO = {
  Alola: '알로라', Galar: '가라르', Hisui: '히스이', Paldea: '팔데아',
  'Paldea-Combat': '팔데아 컴뱃종', 'Paldea-Blaze': '팔데아 블레이즈종', 'Paldea-Aqua': '팔데아 워터종',
  Therian: '영물폼', Origin: '오리진폼', Midnight: '한밤중의 모습', Dusk: '황혼의 모습',
  Bloodmoon: '붉은달', Terastal: '테라스탈폼', Wellspring: '우물의 가면', Hearthflame: '화덕의 가면',
  Cornerstone: '주춧돌의 가면', Rapid: '연격의 태세', 'Rapid-Strike': '연격의 태세',
  Hero: '마이티폼', Crowned: '검왕', Sky: '스카이폼', Wash: '워시', Heat: '히트', Frost: '프로스트',
  Fan: '스핀', Mow: '커트', Female: '암컷', F: '암컷', Shadow: '흑마', Ice: '백마',
};

export const koMove = name => KO.moves[toID(name)] || name;
export const koItem = name => (name ? KO.items[toID(name)] || name : name);
export const koAbility = name => (name ? KO.abilities[toID(name)] || name : name);
export const koType = type => TYPE_KO[type] || type;

/** "Golurk-Mega" -> "메가골루그", "Tauros-Paldea-Aqua" -> "켄타로스 (팔데아 워터종)". */
export function koSpecies(name) {
  const s = Dex.species.get(name);
  if (!s.exists) return name;
  const base = KO.species[toID(s.baseSpecies)] || s.baseSpecies;
  const forme = s.forme;
  if (!forme) return base;
  if (forme === 'Mega') return `메가${base}`;
  if (forme.startsWith('Mega-')) return `메가${base}${forme.slice(5)}`;
  if (forme === 'Primal') return `원시${base}`;
  const label = FORME_KO[forme] || TYPE_KO[forme];
  // cosmetic or rare formes without a Korean label show the base name only
  return label ? `${base} (${label})` : base;
}
