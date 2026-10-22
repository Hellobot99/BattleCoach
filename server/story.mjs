// Puzzle mode (퍼즐): fixed rental teams, one principle per stage, rising difficulty. All 3 vs 3, Champions rules.
import { Dex, toID } from './showdown.mjs';
import { setStats } from './determinize.mjs';
import { koSpecies } from './names.mjs';

export const STORY_FORMAT = 'gen9championscustomgame@@@Picked Team Size = 3';

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const expand = v => (typeof v === 'number' ? Object.fromEntries(STATS.map(s => [s, v])) : v);

/** A real Champions random-battle set for the species, preferring one with the listed moves. */
function set(species, prefer = []) {
  const db = setStats('champions');
  const id = toID(species);
  const data = db[id];
  if (!data) throw new Error(`no Champions set for ${species}`);
  const want = prefer.map(toID);
  const s = data.sets.find(x => want.every(m => x.moves.includes(m))) || data.sets[0];
  return {
    name: data.species,
    species: data.species,
    level: 50,
    moves: s.moves,
    ability: s.ability,
    item: s.item,
    evs: expand(s.evs),
    ivs: expand(s.ivs),
    nature: s.nature || '',
    gender: s.gender || '',
  };
}

// lesson tags link a stage to the curriculum (C01) and the coach's reason tags (C02)
const STAGES = [
  {
    id: 'fire', trainer: '불꽃 사범 화진', title: '불꽃의 관문', lesson: '타입 상성',
    goal: '상대 불꽃 포켓몬에게 효과가 굉장한 기술을 고르세요. 땅 기술이 안 통하는 상대도 있어요.',
    ai: 1, coaching: 'beginner', timer: false, hintLimit: null, tags: ['type_se', 'type_immune'],
    me: [['Swampert', ['earthquake']], ['Rhyperior', ['stoneedge']], ['Azumarill', ['aquajet']]],
    foe: [['Arcanine'], ['Talonflame'], ['Houndoom']],
  },
  {
    id: 'speed', trainer: '번개 질주 레이', title: '번개의 관문', lesson: '누가 먼저 움직이나',
    goal: '상대는 모두 빠릅니다. 먼저 나가는 기술(선공기)로 체력이 줄어든 상대를 마무리하세요.',
    ai: 1, coaching: 'beginner', timer: false, hintLimit: null, tags: ['outspeed', 'priority', 'ko_now'],
    me: [['Lucario', ['extremespeed']], ['Mimikyu', ['shadowsneak']], ['Scizor', ['bulletpunch']]],
    foe: [['Jolteon'], ['Weavile'], ['Alakazam']],
  },
  {
    id: 'switch', trainer: '물결 수호자 수아', title: '물결의 관문', lesson: '교체는 지는 게 아니다',
    goal: '불리하면 상대 기술을 잘 받는 포켓몬으로 바꾸세요. 교체로 받은 뒤에 반격해요.',
    ai: 2, coaching: 'beginner', timer: false, hintLimit: null, tags: ['stay_bad', 'switch_safe'],
    me: [['Corviknight'], ['Gardevoir'], ['Rotom-Wash']],
    foe: [['Machamp'], ['Excadrill'], ['Hydreigon']],
  },
  {
    id: 'status', trainer: '저주술사 묵', title: '저주의 관문', lesson: '상태이상의 값',
    goal: '물리 공격수에게 화상을 걸면 공격이 반으로 줄어요. 언제 거는지가 중요해요.',
    ai: 2, coaching: 'beginner', timer: false, hintLimit: 6, tags: ['status_value'],
    me: [['Sableye', ['willowisp']], ['Dragapult', ['willowisp']], ['Toxapex', ['toxic']]],
    foe: [['Garchomp'], ['Kingambit'], ['Heracross']],
  },
  {
    id: 'mega', trainer: '강철 진화가 강철', title: '진화의 관문', lesson: '메가진화 언제 쓰나',
    goal: '메가진화는 한 판에 한 번이에요. 누구를, 몇 번째 턴에 진화시킬지 고르세요.',
    ai: 2, coaching: 'real', timer: false, hintLimit: 5, tags: ['mega_timing'],
    me: [['Gyarados'], ['Metagross'], ['Kangaskhan']],
    foe: [['Tyranitar'], ['Scizor'], ['Venusaur']],
  },
  {
    id: 'setup', trainer: '각성 수련자 비아', title: '각성의 관문', lesson: '능력 올리기 타이밍',
    goal: '상대가 나를 쓰러뜨리지 못하는 턴에 능력을 올리세요. 상대도 버티기 선수예요.',
    ai: 3, coaching: 'real', timer: false, hintLimit: 4, tags: ['setup_window'],
    me: [['Dragonite', ['dragondance']], ['Volcarona', ['quiverdance']], ['Quaquaval', ['swordsdance']]],
    foe: [['Corviknight'], ['Garganacl'], ['Umbreon']],
  },
  {
    id: 'predict', trainer: '책사 연', title: '책략의 관문', lesson: '상대 교체 읽기',
    goal: '상대는 불리하면 바로 바꿉니다. 바꿔 들어올 포켓몬까지 생각해서 기술을 고르세요.',
    ai: 3, coaching: 'real', timer: false, hintLimit: 3, tags: ['predict_switch'],
    me: [['Meowscarada', ['uturn']], ['Hydreigon'], ['Excadrill']],
    foe: [['Rotom-Heat'], ['Hippowdon'], ['Aegislash']],
  },
  {
    id: 'champion', trainer: '챔피언 하루', title: '챔피언 결전', lesson: '지금까지 배운 것 전부',
    goal: '실전과 같아요. 턴 제한 45초, 힌트는 두 번까지예요.',
    ai: 3, coaching: 'real', timer: true, hintLimit: 2, tags: [],
    me: [['Dragapult'], ['Incineroar'], ['Azumarill']],
    foe: [['Garchomp'], ['Metagross'], ['Gardevoir']],
  },
];

export function storyStage(id) {
  const i = STAGES.findIndex(x => x.id === id);
  if (i < 0) throw new Error('없는 스테이지예요.');
  return { ...STAGES[i], no: i + 1, next: STAGES[i + 1]?.id || null };
}

export function storyTeams(stage) {
  return { me: stage.me.map(([sp, pref]) => set(sp, pref)), foe: stage.foe.map(([sp, pref]) => set(sp, pref)) };
}

/** Stage list for the story screen (team species only; full sets are seen in battle). */
export function storyList() {
  return STAGES.map((s, i) => {
    const teams = storyTeams(s);
    const mon = p => ({ species: koSpecies(p.species), spriteid: Dex.species.get(p.species).spriteid });
    return {
      id: s.id, no: i + 1, title: s.title, trainer: s.trainer, lesson: s.lesson, goal: s.goal,
      ai: s.ai, timer: s.timer, hintLimit: s.hintLimit, coaching: s.coaching,
      me: teams.me.map(mon), foe: teams.foe.map(mon),
    };
  });
}
