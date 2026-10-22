// One coached battle: the player is p1, the rule-based AI is p2.
import { randomUUID } from 'node:crypto';
import { Battle, FORMATS, toID } from './showdown.mjs';
import { legalChoices, aiChoose, typeMultiplier, speedOf, pickTeam, matchup } from './policy.mjs';
import { evaluate } from './evaluator.mjs';
import { setStats, fits } from './determinize.mjs';
import { gradeTurn, hintFor, summarize, GRADES } from './coach.mjs';
import { eun, eul, iga } from './korean.mjs';
import { STORY_FORMAT, storyStage, storyTeams } from './story.mjs';
import { koMove, koItem, koAbility, koSpecies, koType, moveDesc, abilityDesc, itemDesc, TYPE_KO } from './names.mjs';

const STATUS = { brn: '화상', par: '마비', slp: '잠듦', psn: '독', tox: '맹독', frz: '얼음' };
const STATS = { atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어', spe: '스피드', accuracy: '명중률', evasion: '회피율' };
const WEATHER = { RainDance: '비', SunnyDay: '쾌청', Sandstorm: '모래바람', Snowscape: '설경', Hail: '싸라기눈', DesolateLand: '아주 강한 햇살', PrimordialSea: '강한 비', DeltaStream: '난기류' };
const CANT = { flinch: '풀이 죽음', par: '마비', slp: '잠듦', frz: '얼음', recharge: '반동으로 쉬는 중', nopp: 'PP 없음' };

const games = new Map();

export function createGame(opts) {
  const g = new Game(opts);
  games.set(g.id, g);
  if (games.size > 50) games.delete(games.keys().next().value);
  return g;
}
export function getGame(id) {
  return games.get(id);
}

/** A new game that starts again from turn `index` of a finished one (S04 §4). */
export function retryGame(id, index) {
  const orig = games.get(id);
  if (!orig) throw new Error('배틀을 찾을 수 없어요.');
  const g = Game.restore(orig, Number(index));
  games.set(g.id, g);
  if (games.size > 50) games.delete(games.keys().next().value);
  return g;
}

const cloneSeen = seen => new Map([...seen].map(([k, v]) => [k, { ...v, moves: new Set(v.moves) }]));

class Game {
  constructor({ format = '3v3', ai = 2, coaching = 'beginner', timer = false, story = null }) {
    this.id = randomUUID();
    this.story = null;
    this.hintLimit = null;
    this.hintsUsed = 0;
    this.aiNoise = null; // puzzles set the opponent's random-move rate per level
    let teams = null;
    let formatid;
    if (story) {
      // story mode: the stage fixes both teams, the AI level and how much help the player gets
      const stage = storyStage(story);
      teams = storyTeams(stage);
      format = '3v3';
      formatid = STORY_FORMAT;
      ai = stage.ai;
      coaching = stage.coaching;
      timer = stage.timer;
      this.hintLimit = stage.hintLimit;
      this.aiNoise = stage.noise;
      this.story = { id: stage.id, no: stage.no, next: stage.next, title: stage.title, goal: stage.goal, ai: stage.ai, hintLimit: stage.hintLimit };
    } else {
      if (!FORMATS[format]) throw new Error('unknown format');
      formatid = FORMATS[format].id;
    }
    this.format = format;
    this.ai = [1, 2, 3].includes(Number(ai)) ? Number(ai) : 2;
    this.coaching = coaching;
    this.timer = !!timer;
    this.battle = new Battle({ formatid });
    this.battle.setPlayer('p1', { name: '나', ...(teams ? { team: teams.me } : {}) });
    this.battle.setPlayer('p2', { name: 'AI', ...(teams ? { team: teams.foe } : {}) });
    this.logCursor = 0;
    this.log = [];
    this.foeSeen = new Map(); // name -> {moves:Set, item, ability}
    this.reviews = [];
    this.snapshots = []; // per review: the position before it, for 「다시 해 보기」
    this.retry = null;
    this.forcedAi = null;
    this.decision = null;
    this.lastEval = null;
    // 3v3: the opponent's six shown at team preview are all the player knows about its team
    this.foePreview = format === '3v3' ? this.battle.p2.pokemon.map(p => toID(p.set.species)) : null;
    this.consumeLog();
    this.prepareDecision();
  }

  // ---------- flow ----------

  aiAct() {
    const b = this.battle;
    const side = b.p2;
    const req = side.activeRequest;
    if (!req || req.wait || side.isChoiceDone() || b.ended) return;
    let choice = 'default';
    if (this.forcedAi) {
      // a retry replays the opponent's original action for that turn
      choice = this.forcedAi;
      this.forcedAi = null;
    } else {
      try {
        choice = aiChoose(b, 'p2', Math.random, { level: this.ai, noise: this.aiNoise ?? (this.ai === 1 ? 0 : 0.04) }) || 'default';
      } catch (err) {
        console.error('[ai]', err);
      }
    }
    if (!b.choose('p2', choice)) {
      b.choose('p2', 'default');
      return 'default';
    }
    return choice;
  }

  /** Rebuilds the position saved before review `index`, with the same dice and the opponent's same action. */
  static restore(orig, index) {
    const snap = orig.snapshots[index];
    if (!snap) throw new Error('이 턴은 다시 해 볼 수 없어요.');
    const g = Object.create(Game.prototype);
    Object.assign(g, {
      id: randomUUID(),
      format: orig.format,
      ai: orig.ai,
      coaching: orig.coaching,
      timer: orig.timer,
      battle: Battle.fromJSON(snap.json),
      log: orig.log.slice(0, snap.logLen),
      foeSeen: cloneSeen(snap.foeSeen),
      reviews: orig.reviews.slice(0, index),
      snapshots: orig.snapshots.slice(0, index),
      forcedAi: snap.aiChoice,
      lastEval: { bestW: Math.max(...Object.values(snap.ev.actions).map(a => a.W)), ms: snap.ev.ms, rollouts: snap.ev.rollouts },
      foePreview: orig.foePreview,
      story: orig.story,
      aiNoise: orig.aiNoise,
      hintLimit: orig.hintLimit,
      hintsUsed: orig.hintsUsed,
      retry: { fromId: orig.id, index, original: orig.reviews[index] },
    });
    g.battle.send = () => {};
    g.logCursor = g.battle.log.length;
    g.decision = {
      kind: snap.kind, turn: snap.turn, choices: snap.choices, ev: snap.ev, evalPromise: Promise.resolve(snap.ev),
      naive: snap.naive, hintLevel: 0, hinted: false, json: snap.json, logLen: snap.logLen, foeSeen: snap.foeSeen, lastEvalBefore: snap.lastEval,
    };
    return g;
  }

  prepareDecision() {
    const b = this.battle;
    // let the AI answer anything it has to do alone (e.g. its own forced switch)
    for (let i = 0; i < 4 && !b.ended; i++) {
      const p1req = b.p1.activeRequest;
      if (p1req && !p1req.wait) break;
      this.aiAct();
      this.consumeLog();
    }
    this.decision = null;
    if (b.ended) return;
    const req = b.p1.activeRequest;
    if (!req || req.wait) return;
    if (req.teamPreview) {
      this.decision = { kind: 'preview', size: req.maxChosenTeamSize || 6 };
      this.aiAct();
      return;
    }
    const choices = this.enrich(legalChoices(req, b, 'p1'));
    const d = { kind: req.forceSwitch ? 'switch' : 'move', turn: b.turn, choices, ev: null, evalPromise: null, hintLevel: 0, hinted: false };
    try {
      d.naive = aiChoose(b, 'p1', Math.random, { level: 1 });
    } catch {
      d.naive = null;
    }
    const p2req = b.p2.activeRequest;
    if (this.ai === 3 && p2req && !p2req.wait && !p2req.teamPreview) {
      const foeChoices = legalChoices(p2req, b, 'p2').map(c => c.choice);
      if (foeChoices.length >= 2) {
        // level 3: the opponent weighs its own options with rollouts and takes one of the best
        d.aiPlan = evaluate(JSON.stringify(b.toJSON()), 'p2', foeChoices)
          .then(ev => {
            const ranked = Object.entries(ev.actions).sort((x, y) => y[1].W - x[1].W);
            const close = ranked.filter(([, a]) => a.W >= ranked[0][1].W - 0.02);
            return close[Math.floor(Math.random() * close.length)][0];
          })
          .catch(() => null);
      }
    }
    if (choices.length >= 2) {
      const json = JSON.stringify(b.toJSON());
      Object.assign(d, { json, logLen: this.log.length, foeSeen: cloneSeen(this.foeSeen), lastEvalBefore: this.lastEval });
      d.evalPromise = evaluate(json, 'p1', choices.map(c => c.choice), this.hiddenInfo()).then(ev => {
        d.ev = ev;
        this.lastEval = { bestW: Math.max(...Object.values(ev.actions).map(a => a.W)), ms: ev.ms, rollouts: ev.rollouts };
        return ev;
      });
      d.evalPromise.catch(err => console.error('[evaluate]', err));
    }
    this.decision = d;
  }

  /** What the player knows about the opponent; the evaluator redraws everything else (S01 §4). */
  hiddenInfo() {
    return {
      mod: this.format === '6v6' ? 'gen9' : 'champions',
      pool: this.foePreview,
      foe: this.battle.p2.pokemon.map(p => {
        const seen = this.foeSeen.get(p.name);
        return {
          name: p.name,
          revealed: !!seen,
          moves: seen ? [...seen.moves].map(toID) : [],
          item: seen?.item ? toID(seen.item) : null,
          ability: seen?.ability ? toID(seen.ability) : null,
          tera: p.terastallized || null,
        };
      }),
    };
  }

  async waitEval() {
    if (this.decision?.evalPromise) await this.decision.evalPromise.catch(() => null);
  }

  async choose(choice, { timeout = false } = {}) {
    const b = this.battle;
    const d = this.decision;
    if (!d) throw new Error('지금은 고를 차례가 아니에요.');
    if (d.kind === 'preview') {
      if (!/^team \d+$/.test(choice) || !b.choose('p1', choice)) throw new Error('선출을 다시 골라 주세요.');
      this.aiAct();
      this.consumeLog();
      this.prepareDecision();
      return;
    }
    const picked = d.choices.find(c => c.choice === choice);
    if (!picked) throw new Error('고를 수 없는 행동이에요.');

    let review = null;
    if (d.evalPromise) {
      const ev = await d.evalPromise;
      const me = b.p1.active[0];
      const foe = b.p2.active[0];
      review = gradeTurn({ choices: d.choices, ev, chosen: choice, naive: d.naive, foeName: foe ? koSpecies(foe.species.name) : '?', myName: me ? koSpecies(me.species.name) : '?' });
    } else {
      review = { grade: 'only', graded: false, score: null, dW: 0, W: this.lastEval?.bestW ?? 0.5, bestW: this.lastEval?.bestW ?? 0.5, choiceLabel: picked.label, bestLabel: picked.label, tags: [], headline: '고를 수 있는 행동이 하나뿐이었어요.', reason: '', detail: '' };
    }
    review.turn = d.turn;
    review.kind = d.kind;
    review.hinted = d.hinted;
    review.timeout = timeout;
    if (timeout) {
      review.grade = 'timeout';
      review.headline = '시간이 다 되어 맨 위 행동을 자동으로 골랐어요.';
    }

    if (d.aiPlan && !this.forcedAi) this.forcedAi = await d.aiPlan;
    const aiChoice = this.aiAct();
    const logStart = this.battle.log.length;
    if (!b.choose('p1', choice)) throw new Error('이 행동은 지금 쓸 수 없어요.');
    const turnLines = this.battle.log.slice(logStart);
    const unlucky = turnLines.some(l => l.startsWith('|-miss|p1a')) || turnLines.some(l => l.startsWith('|-crit|p1a'));
    if (unlucky && ['brill', 'great', 'best', 'exc'].includes(review.grade)) {
      review.tags = [...review.tags, 'bad_luck'];
      review.luck = '좋은 선택이었어요. 이번엔 운이 없었어요.';
    }
    review.gradeLabel = GRADES[review.grade].label;
    review.gradeSym = GRADES[review.grade].sym;
    this.reviews.push(review);
    if (d.json && d.ev) {
      this.snapshots[this.reviews.length - 1] = {
        json: d.json, logLen: d.logLen, foeSeen: d.foeSeen, lastEval: d.lastEvalBefore, ev: d.ev,
        choices: d.choices, naive: d.naive, kind: d.kind, turn: d.turn, aiChoice: aiChoice || null,
      };
      review.retryable = ['inacc', 'mist', 'blund'].includes(review.grade);
    }
    this.consumeLog();
    this.prepareDecision();
  }

  async hint() {
    const d = this.decision;
    if (!d || d.kind === 'preview' || !d.evalPromise) return { level: 0, text: '지금은 힌트가 필요 없는 턴이에요.' };
    if (this.hintLimit !== null && this.hintsUsed >= this.hintLimit) return { level: d.hintLevel, text: `이 단계의 힌트 ${this.hintLimit}번을 다 썼어요.` };
    this.hintsUsed++;
    const ev = await d.evalPromise;
    d.hintLevel = Math.min(3, d.hintLevel + 1);
    d.hinted = true;
    const me = this.battle.p1.active[0];
    const foe = this.battle.p2.active[0];
    const text = hintFor(d.hintLevel, { choices: d.choices, ev, myName: me ? koSpecies(me.species.name) : '', foeName: foe ? koSpecies(foe.species.name) : '' });
    d.hints = [...(d.hints || []), text];
    return { level: d.hintLevel, text };
  }

  // ---------- views ----------

  enrich(choices) {
    const b = this.battle;
    const me = b.p1.active[0];
    const foe = b.p2.active[0];
    return choices.map(c => {
      if (c.kind === 'move' && c.moveId) {
        const move = b.dex.moves.get(c.moveId);
        const slot = me?.moveSlots.find(s => s.id === c.moveId);
        const moveName = koMove(move.name);
        const suffix = c.gimmick === 'tera' ? ' + 테라스탈' : c.gimmick === 'mega' ? ' + 메가진화' : '';
        return {
          ...c,
          label: moveName + suffix,
          moveName,
          desc: moveDesc(move),
          type: move.type,
          category: move.category,
          power: move.basePower || null,
          accuracy: move.accuracy === true ? null : move.accuracy,
          pp: slot?.pp,
          maxpp: slot?.maxpp,
          eff: foe && !foe.fainted && move.category !== 'Status' ? typeMultiplier(b.dex, move, foe) : null,
          // what a player can know: type chart only (a hidden ability such as Levitate is not counted)
          effType: foe && !foe.fainted && move.category !== 'Status'
            ? (b.dex.getImmunity(move.type, foe) ? 2 ** b.dex.getEffectiveness(move.type, foe) : 0)
            : null,
        };
      }
      if (c.kind === 'switch') {
        const mon = b.p1.pokemon[c.slot - 1];
        const species = koSpecies(mon.species.name);
        return { ...c, label: species, species, spriteid: mon.species.spriteid, hp: mon.hp, maxhp: mon.maxhp, status: mon.status || null, types: mon.getTypes() };
      }
      return c;
    });
  }

  myMon(p) {
    const dex = this.battle.dex;
    return {
      name: p.name,
      species: koSpecies(p.species.name),
      spriteid: p.species.spriteid,
      level: p.level,
      hp: p.hp,
      maxhp: p.maxhp,
      status: p.status || null,
      fainted: p.fainted,
      active: p.isActive,
      item: p.item ? koItem(dex.items.get(p.item).name) : null,
      itemDesc: p.item ? itemDesc(dex.items.get(p.item)) : null,
      ability: koAbility(dex.abilities.get(p.ability).name),
      abilityDesc: abilityDesc(dex.abilities.get(p.ability)),
      weak: this.matchupChart(p),
      types: p.getTypes(),
      teraType: this.format === '6v6' ? p.teraType : null,
      terastallized: p.terastallized || null,
      boosts: Object.fromEntries(Object.entries(p.boosts).filter(([, v]) => v)),
      stats: { hp: p.maxhp, ...p.storedStats },
      moves: p.moveSlots.map(s => ({ name: koMove(s.move), pp: s.pp, maxpp: s.maxpp, type: dex.moves.get(s.id).type, desc: moveDesc(dex.moves.get(s.id)) })),
    };
  }

  /** Damage taken from each attacking type: what a player checks before switching in. */
  matchupChart(p) {
    const dex = this.battle.dex;
    const chart = { x4: [], x2: [], half: [], quarter: [], immune: [] };
    for (const t of Object.keys(TYPE_KO)) {
      if (t === 'Stellar') continue;
      const m = dex.getImmunity(t, p) ? 2 ** dex.getEffectiveness(t, p) : 0;
      if (m === 0) chart.immune.push(t);
      else if (m >= 4) chart.x4.push(t);
      else if (m >= 2) chart.x2.push(t);
      else if (m <= 0.25) chart.quarter.push(t);
      else if (m < 1) chart.half.push(t);
    }
    return chart;
  }

  /** Opponent details a player could look up: base stats, speed, and the odds for what is still hidden. */
  foeDetails(p, seen) {
    const dex = this.battle.dex;
    const db = setStats(this.format === '6v6' ? 'gen9' : 'champions')[toID(p.set.species)];
    const info = {
      moves: [...seen.moves].map(toID),
      item: seen.item ? toID(seen.item) : null,
      ability: seen.ability ? toID(seen.ability) : null,
      tera: p.terastallized || null,
    };
    const odds = { moves: [], items: [], abilities: [], tera: [] };
    if (db) {
      const sets = db.sets.filter(s => fits(s, info));
      const total = sets.reduce((a, s) => a + s.w, 0);
      const tally = (key, get) => {
        const m = {};
        for (const s of sets) for (const v of [].concat(get(s))) if (v) m[v] = (m[v] || 0) + s.w;
        odds[key] = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, w]) => [v, Math.round((w / total) * 100)]);
      };
      if (total) {
        tally('moves', s => s.moves.filter(m => !info.moves.includes(m)));
        if (!info.item) tally('items', s => s.item);
        if (!info.ability) tally('abilities', s => s.ability);
        if (!info.tera && this.format === '6v6') tally('tera', s => s.teraType);
      }
    }
    return {
      baseStats: p.species.baseStats,
      speed: { plain: Math.round(speedOf(p, null)), scarf: Math.round(speedOf(p, 'choicescarf')) },
      weak: this.matchupChart(p),
      odds: {
        moves: odds.moves.map(([id, pct]) => [koMove(dex.moves.get(id).name), pct, dex.moves.get(id).type]),
        items: odds.items.map(([n, pct]) => [koItem(n), pct]),
        abilities: odds.abilities.map(([n, pct]) => [koAbility(n), pct]),
        tera: odds.tera.map(([t, pct]) => [t, pct]),
      },
    };
  }

  foeMon(p) {
    const seen = this.foeSeen.get(p.name) || { moves: new Set() };
    return {
      name: p.name,
      species: koSpecies(p.species.name),
      spriteid: p.species.spriteid,
      level: p.level,
      hpPct: p.fainted ? 0 : Math.max(1, Math.round((p.hp / p.maxhp) * 100)),
      status: p.status || null,
      fainted: p.fainted,
      active: p.isActive,
      types: p.getTypes(),
      terastallized: p.terastallized || null,
      boosts: Object.fromEntries(Object.entries(p.boosts).filter(([, v]) => v)),
      moves: [...seen.moves].map(koMove),
      item: seen.item ? koItem(seen.item) : null,
      ability: seen.ability ? koAbility(seen.ability) : null,
      details: this.foeSeen.has(p.name) ? this.foeDetails(p, seen) : null,
    };
  }

  state() {
    const b = this.battle;
    const d = this.decision;
    const preview = d?.kind === 'preview';
    const foeTeam = b.p2.pokemon.filter(p => preview || this.foeSeen.has(p.name)).map(p => this.foeMon(p));
    const me = b.p1.active[0];
    const foe = b.p2.active[0];
    let speed = null;
    let speedNote = null;
    if (me && foe && !me.fainted && !foe.fainted && !preview) {
      // only what the player can know: the opponent's item counts once it has been revealed
      const seenItem = this.foeSeen.get(foe.name)?.item;
      const a = speedOf(me);
      const f = speedOf(foe, seenItem ? toID(seenItem) : null);
      const tr = !!b.field.getPseudoWeather('trickroom');
      const order = (x, y) => (x > y ? 'faster' : x < y ? 'slower' : 'tie');
      const flip = o => (o === 'faster' ? 'slower' : o === 'slower' ? 'faster' : 'tie');
      speed = tr ? flip(order(a, f)) : order(a, f);
      if (!seenItem && !tr && speed === 'faster' && a < f * 1.5) {
        const scarf = setStats(this.format === '6v6' ? 'gen9' : 'champions')[toID(foe.set.species)]?.items['Choice Scarf'];
        if (scarf) speedNote = `상대가 구애스카프(${Math.round(scarf * 100)}%)면 상대가 먼저`;
      }
    }
    const out = {
      id: this.id,
      format: this.format,
      formatLabel: this.story ? `퍼즐 · ${this.story.title}` : FORMATS[this.format].label,
      ai: this.ai,
      coaching: this.coaching,
      timer: this.timer,
      turn: b.turn,
      ended: b.ended,
      winner: b.ended ? (b.winner === '나' ? 'me' : b.winner ? 'foe' : 'tie') : null,
      me: { team: b.p1.pokemon.map(p => this.myMon(p)) },
      foe: { team: foeTeam, total: preview ? 6 : b.p2.pokemon.length },
      speed,
      speedNote,
      decision: d
        ? d.kind === 'preview'
          ? { kind: 'preview', size: d.size, recommend: this.recommendPicks(d.size) }
          : { kind: d.kind, turn: d.turn, choices: d.choices, hintLevel: d.hintLevel, hints: d.hints || [], evalReady: !d.evalPromise || !!d.ev }
        : null,
      eval: this.lastEval,
      log: this.log,
      reviews: this.reviews,
      summary: b.ended ? summarize(this.reviews) : null,
      retry: this.retry,
      story: this.story,
      hintsLeft: this.hintLimit === null ? null : Math.max(0, this.hintLimit - this.hintsUsed),
    };
    return out;
  }

  /** Coach recommendation for team preview (S01 §2-1: no grade in the first version). */
  recommendPicks(size) {
    const b = this.battle;
    const slots = pickTeam(b, 'p1', size);
    // how each of my six fares against the opposing six (shown on every card)
    const matchups = b.p1.pokemon.map(mon => {
      let good = 0;
      let bad = 0;
      for (const f of b.p2.pokemon) {
        const m = matchup(b, mon, f);
        if (m > 0.2) good++;
        if (m < -0.4) bad++;
      }
      return { good, bad };
    });
    const lines = slots.map(slot => {
      const { good, bad } = matchups[slot - 1];
      return `${koSpecies(b.p1.pokemon[slot - 1].species.name)}: 상대 ${b.p2.pokemon.length}마리 중 ${good}마리에게 유리, ${bad}마리에게 불리`;
    });
    return { slots, lines, matchups };
  }

  // ---------- log ----------

  seen(name) {
    if (!this.foeSeen.has(name)) this.foeSeen.set(name, { moves: new Set() });
    return this.foeSeen.get(name);
  }

  consumeLog() {
    const lines = this.battle.log;
    for (let i = this.logCursor; i < lines.length; i++) {
      let line = lines[i];
      if (line.startsWith('|split|')) {
        const who = line.slice(7);
        // our own side reads the exact line, the opponent's side the public one
        line = who === 'p1' ? lines[i + 1] : lines[i + 2];
        i += 2;
      }
      const entry = this.format1(line);
      const ev = line ? this.eventOf(line) : null;
      // a text-less event (e.g. a forme change) is still sent so the page can animate it
      if (entry || ev) this.log.push({ ...(entry || { k: 'hidden', text: '' }), ...(ev ? { ev } : {}) });
    }
    this.logCursor = lines.length;
  }

  who(ident) {
    // "p2a: Garchomp" -> {side, name, label}
    const m = /^(p[12])[a-z]?: (.+)$/.exec(ident || '');
    if (!m) return { side: null, name: ident, label: ident };
    const side = m[1];
    const mon = this.battle[side].pokemon.find(p => p.name === m[2]);
    const sp = koSpecies(mon ? mon.species.name : m[2]);
    return { side, name: m[2], label: side === 'p2' ? `상대 ${sp}` : sp };
  }

  revealFrom(parts) {
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const of = parts.find(x => x.startsWith('[of] '));
      const target = of ? of.slice(5) : parts[2];
      if (p.startsWith('[from] item: ')) {
        const w = this.who(target);
        if (w.side === 'p2') this.seen(w.name).item = p.slice(13);
      }
      if (p.startsWith('[from] ability: ')) {
        const w = this.who(target);
        if (w.side === 'p2') this.seen(w.name).ability = p.slice(16);
      }
    }
  }

  format1(line) {
    if (!line || line === '|') return null;
    const parts = line.split('|');
    const cmd = parts[1];
    const a = parts[2];
    this.revealFrom(parts);
    const w = this.who(a);
    switch (cmd) {
      case 'turn':
        return { k: 'turn', text: `${a}턴` };
      case 'switch':
      case 'drag': {
        if (w.side === 'p2') this.seen(w.name);
        const sp = koSpecies(parts[3].split(',')[0]);
        return { k: w.side, text: w.side === 'p1' ? `가자! ${sp}!` : `상대가 ${eul(sp)} 내보냈다.` };
      }
      case 'move': {
        if (w.side === 'p2' && !line.includes('[from]')) this.seen(w.name).moves.add(parts[3]);
        return { k: w.side, text: `${w.label}의 ${koMove(parts[3])}!` };
      }
      case '-damage': {
        if (parts[3] === '0 fnt') return null;
        const hp = this.hpText(parts[3], w.side);
        return { k: 'dmg', text: `${w.label} HP ${hp}${this.sourceText(parts)}` };
      }
      case '-heal':
        return { k: 'heal', text: `${w.label} HP ${this.hpText(parts[3], w.side)} 회복${this.sourceText(parts)}` };
      case '-supereffective':
        return { k: 'eff', text: '효과가 굉장했다!' };
      case '-resisted':
        return { k: 'eff', text: '효과가 별로인 듯하다…' };
      case '-immune':
        return { k: 'eff', text: `${w.label}에게는 효과가 없다.` };
      case '-crit':
        return { k: 'eff', text: '급소에 맞았다!' };
      case '-miss':
        return { k: 'eff', text: `${w.label}의 공격이 빗나갔다!` };
      case 'faint':
        return { k: 'faint', text: `${eun(w.label)} 쓰러졌다!` };
      case '-status':
        return { k: 'status', text: `${eun(w.label)} ${STATUS[parts[3]] || parts[3]} 상태가 되었다.` };
      case '-curestatus':
        return { k: 'status', text: `${w.label}의 ${STATUS[parts[3]] || parts[3]} 상태가 나았다.` };
      case '-boost':
        return { k: 'boost', text: `${w.label}의 ${iga(STATS[parts[3]] || parts[3])} ${parts[4]}단계 올랐다.` };
      case '-unboost':
        return { k: 'boost', text: `${w.label}의 ${iga(STATS[parts[3]] || parts[3])} ${parts[4]}단계 떨어졌다.` };
      case '-terastallize':
        return { k: 'gimmick', text: `${iga(w.label)} ${koType(parts[3])} 타입으로 테라스탈했다!` };
      case '-mega':
        if (w.side === 'p2') this.seen(w.name).item = parts[4];
        return { k: 'gimmick', text: `${iga(w.label)} 메가진화했다!` };
      case '-item':
        if (w.side === 'p2') this.seen(w.name).item = parts[3];
        return { k: 'info', text: `${w.label}의 ${koItem(parts[3])}` };
      case '-enditem':
        if (w.side === 'p2') this.seen(w.name).item = parts[3];
        return { k: 'info', text: `${w.label}의 ${iga(koItem(parts[3]))} 없어졌다.` };
      case '-ability':
        if (w.side === 'p2') this.seen(w.name).ability = parts[3];
        return { k: 'info', text: `${w.label}의 특성 ${koAbility(parts[3])}` };
      case 'cant':
        return { k: 'info', text: `${eun(w.label)} 움직일 수 없다 (${this.reasonText(parts[3])}).` };
      case '-fail':
        return { k: 'info', text: '하지만 실패했다!' };
      case '-weather':
        if (parts[2] === 'none') return { k: 'field', text: '날씨가 원래대로 돌아왔다.' };
        if (line.includes('[upkeep]')) return null;
        return { k: 'field', text: `날씨: ${WEATHER[parts[2]] || parts[2]}` };
      case '-sidestart':
        return { k: 'field', text: `${parts[2].startsWith('p2') ? '상대' : '내'} 진영에 ${this.reasonText(parts[3])}` };
      case '-sideend':
        return { k: 'field', text: `${parts[2].startsWith('p2') ? '상대' : '내'} 진영의 ${this.reasonText(parts[3])} 효과가 끝났다.` };
      case '-fieldstart':
        return { k: 'field', text: `필드: ${this.reasonText(parts[2])}` };
      case 'win':
        return { k: 'win', text: a === '나' ? '승리했다!' : '패배했다…' };
      case 'tie':
        return { k: 'win', text: '무승부.' };
      default:
        return null;
    }
  }

  /** Structured version of a log line, used by the page to animate the turn. */
  eventOf(line) {
    const parts = line.split('|');
    const cmd = parts[1];
    const w = this.who(parts[2]);
    const side = w.side;
    const pct = cond => {
      const hp = (cond || '').split(' ')[0];
      if (hp === '0') return 0;
      const [cur, max] = hp.split('/').map(Number);
      return max ? Math.round((cur / max) * 1000) / 10 : null;
    };
    switch (cmd) {
      case 'switch':
      case 'drag': {
        const sp = this.battle.dex.species.get(parts[3].split(',')[0]);
        const level = Number((/, L(\d+)/.exec(parts[3]) || [])[1]) || 100;
        return { type: 'switch', side, spriteid: sp.spriteid, species: koSpecies(sp.name), level, hpPct: pct(parts[4]), hp: parts[4].split(' ')[0] };
      }
      case 'move': {
        const move = this.battle.dex.moves.get(parts[3]);
        const target = this.who(parts[4]).side;
        return { type: 'move', side, target, moveType: move.type, category: move.category };
      }
      case '-damage':
        return { type: 'damage', side, hpPct: pct(parts[3]), hp: (parts[3] || '').split(' ')[0], indirect: line.includes('[from]') };
      case '-heal':
        return { type: 'heal', side, hpPct: pct(parts[3]), hp: (parts[3] || '').split(' ')[0] };
      case '-supereffective':
        return { type: 'se', side };
      case '-resisted':
        return { type: 'nve', side };
      case '-immune':
        return { type: 'immune', side };
      case '-crit':
        return { type: 'crit', side };
      case '-miss':
        return { type: 'miss', side: this.who(parts[3]).side || side };
      case 'faint':
        return { type: 'faint', side };
      case '-status':
        return { type: 'status', side, status: parts[3] };
      case '-curestatus':
        return { type: 'cure', side };
      case '-boost':
        return { type: 'boost', side, up: true };
      case '-unboost':
        return { type: 'boost', side, up: false };
      case '-terastallize':
        return { type: 'tera', side, teraType: parts[3] };
      case 'detailschange': {
        const sp = this.battle.dex.species.get(parts[3].split(',')[0]);
        return { type: 'forme', side, spriteid: sp.spriteid, species: koSpecies(sp.name) };
      }
      case '-mega':
        return { type: 'mega', side };
      case 'turn':
        return { type: 'turn' };
      default:
        return null;
    }
  }

  sourceText(parts) {
    const from = parts.find(x => x.startsWith('[from] '));
    if (!from) return '';
    return ` (${this.reasonText(from.slice(7))})`;
  }

  /** "item: Life Orb" / "ability: Intimidate" / "move: Stealth Rock" / "psn" -> Korean. */
  reasonText(raw = '') {
    if (raw.startsWith('item: ')) return koItem(raw.slice(6));
    if (raw.startsWith('ability: ')) return koAbility(raw.slice(9));
    if (raw.startsWith('move: ')) return koMove(raw.slice(6));
    const ko = { psn: '독', tox: '맹독', brn: '화상', Recoil: '반동', confusion: '혼란', drain: '흡수', ...CANT, ...WEATHER };
    return ko[raw] || koMove(raw);
  }

  hpText(cond, side) {
    const hp = (cond || '').split(' ')[0];
    if (hp === '0') return '0';
    const [cur, max] = hp.split('/').map(Number);
    if (!max) return hp;
    return side === 'p1' ? `${cur}/${max}` : `${Math.max(1, Math.round((cur / max) * 100))}%`;
  }
}
