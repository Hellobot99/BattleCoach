export type Format = '3v3' | '6v6';
export type Coaching = 'beginner' | 'real' | 'review';

export type GradeKey =
  | 'brill' | 'great' | 'best' | 'exc' | 'good' | 'inacc' | 'mist' | 'blund' | 'miss'
  | 'only' | 'any' | 'decided' | 'timeout';

export interface MyMon {
  name: string;
  species: string;
  spriteid: string;
  level: number;
  hp: number;
  maxhp: number;
  status: string | null;
  fainted: boolean;
  active: boolean;
  item: string | null;
  itemDesc: string | null;
  ability: string;
  abilityDesc: string;
  weak: WeakChart;
  types: string[];
  teraType: string | null;
  terastallized: string | null;
  boosts: Record<string, number>;
  stats: Record<string, number>;
  moves: { name: string; pp: number; maxpp: number; type: string; desc: string }[];
}

export interface FoeMon {
  name: string;
  species: string;
  spriteid: string;
  level: number;
  hpPct: number;
  status: string | null;
  fainted: boolean;
  active: boolean;
  types: string[];
  terastallized: string | null;
  boosts: Record<string, number>;
  moves: string[];
  item: string | null;
  ability: string | null;
  details: FoeDetails | null;
}

export interface WeakChart {
  x4: string[];
  x2: string[];
  half: string[];
  quarter: string[];
  immune: string[];
}

export interface FoeDetails {
  baseStats: Record<string, number>;
  speed: { plain: number; scarf: number };
  weak: WeakChart;
  /** [name, percent] (moves also carry their type) for what is still hidden */
  odds: { moves: [string, number, string][]; items: [string, number][]; abilities: [string, number][]; tera: [string, number][] };
}

export interface Choice {
  choice: string;
  kind: 'move' | 'switch';
  slot: number;
  label: string;
  gimmick?: 'tera' | 'mega' | null;
  moveName?: string;
  desc?: string;
  type?: string;
  category?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number;
  maxpp?: number;
  eff?: number | null;
  effType?: number | null;
  species?: string;
  spriteid?: string;
  hp?: number;
  maxhp?: number;
  status?: string | null;
  types?: string[];
}

export interface Review {
  turn: number;
  kind: 'move' | 'switch';
  grade: GradeKey;
  gradeLabel: string;
  gradeSym: string;
  graded: boolean;
  score: number | null;
  dW: number;
  W: number;
  bestW: number;
  choiceLabel: string;
  bestLabel: string;
  tags: string[];
  headline: string;
  reason: string;
  detail: string;
  luck?: string;
  hinted: boolean;
  timeout: boolean;
  retryable?: boolean;
  bestChoice?: string;
}

export type Decision =
  | { kind: 'preview'; size: number; recommend: { slots: number[]; lines: string[]; matchups: { good: number; bad: number }[] } }
  | { kind: 'move' | 'switch'; turn: number; choices: Choice[]; hintLevel: number; hints: string[]; evalReady: boolean };

export interface Summary {
  accuracy: number | null;
  counts: Partial<Record<GradeKey, number>>;
  turning: { index: number; turn: number; delta: number }[];
  weakTag: string | null;
  hints: number;
  timeouts: number;
}

export interface GameState {
  id: string;
  format: Format;
  formatLabel: string;
  ai: number;
  coaching: Coaching;
  timer: boolean;
  turn: number;
  ended: boolean;
  winner: 'me' | 'foe' | 'tie' | null;
  me: { team: MyMon[] };
  foe: { team: FoeMon[]; total: number };
  speed: 'faster' | 'slower' | 'tie' | null;
  speedNote: string | null;
  decision: Decision | null;
  eval: { bestW: number; ms: number; rollouts: number } | null;
  log: LogEntry[];
  reviews: Review[];
  summary: Summary | null;
  /** set when this game is a 「다시 해 보기」 of turn `index` of game `fromId` */
  retry: { fromId: string; index: number; original: Review } | null;
  story: StoryInfo | null;
  hintsLeft: number | null;
}

export interface StoryInfo {
  id: string;
  no: number;
  next: string | null;
  title: string;
  /** what changes at this level */
  goal: string;
  ai: number;
  hintLimit: number | null;
}

export interface StoryStage {
  id: string;
  no: number;
  title: string;
  goal: string;
  ai: number;
  timer: boolean;
  hintLimit: number | null;
  coaching: Coaching;
  gap: string;
  simWin: number;
  me: { species: string; spriteid: string }[];
  foe: { species: string; spriteid: string }[];
}

export type Side = 'p1' | 'p2';

/** Structured log event used to animate a turn (server/game.mjs eventOf). */
export type BattleEvent =
  | { type: 'switch'; side: Side; spriteid: string; species: string; level: number; hpPct: number; hp: string }
  | { type: 'move'; side: Side; target: Side | null; moveType: string; category: 'Physical' | 'Special' | 'Status' }
  | { type: 'damage'; side: Side; hpPct: number; hp: string; indirect: boolean }
  | { type: 'heal'; side: Side; hpPct: number; hp: string }
  | { type: 'se' | 'nve' | 'immune' | 'crit' | 'miss' | 'faint' | 'cure' | 'mega'; side: Side }
  | { type: 'status'; side: Side; status: string }
  | { type: 'boost'; side: Side; up: boolean }
  | { type: 'tera'; side: Side; teraType: string }
  | { type: 'forme'; side: Side; spriteid: string; species: string }
  | { type: 'turn' };

export interface LogEntry {
  k: string;
  text: string;
  ev?: BattleEvent;
}
