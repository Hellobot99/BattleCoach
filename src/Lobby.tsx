import { useState } from 'react';
import { FieldSprite } from './Field';
import type { Coaching, Format, GradeKey } from './types';
import { GradeChip } from './ui';

const GRADES: [GradeKey, string, string][] = [
  ['brill', '!!', '묘수'], ['great', '!', '좋은 수'], ['best', '★', '최선'], ['exc', '✓', '우수'],
  ['good', '·', '무난'], ['inacc', '?!', '부정확'], ['mist', '?', '실수'], ['blund', '??', '블런더'],
];

export interface LobbyOptions {
  format: Format;
  ai: number;
  coaching: Coaching;
  timer: boolean;
}

const FORMATS: { id: Format; title: string; balls: number; rules: string[] }[] = [
  { id: '3v3', title: '3 대 3', balls: 3, rules: ['포켓몬 챔피언스 규칙', '6마리 중 3마리 선출', '메가진화'] },
  { id: '6v6', title: '6 대 6', balls: 6, rules: ['9세대 랜덤 배틀', '쇼다운 방식', '테라스탈'] },
];
const COACHING: { id: Coaching; title: string; note: string }[] = [
  { id: 'beginner', title: '입문', note: '상성 배율과 누가 먼저 움직이는지 화면에 보여 줘요.' },
  { id: 'real', title: '실전', note: '본가와 같은 정보만 보여 주고, 매 턴 등급과 이유를 알려 줘요.' },
  { id: 'review', title: '리뷰만', note: '배틀 중에는 등급을 숨기고, 끝난 뒤 리뷰에서 한꺼번에 보여 줘요.' },
];
const AI = [
  { id: 1, title: '연습 상대', note: '가장 센 기술만 써요' },
  { id: 2, title: '보통', note: '불리하면 교체해요' },
];

const STEPS = [
  { no: '1', title: 'AI와 배틀', text: '랜덤 팀으로 바로 싸워요.' },
  { no: '2', title: '턴마다 등급과 이유', text: '고른 행동이 왜 좋았는지 한 줄로 알려 줘요.' },
  { no: '3', title: '게임 리뷰', text: '판을 바꾼 턴과 약점을 다시 봐요.' },
];

export function Lobby({ onStart, busy, error }: { onStart: (o: LobbyOptions) => void; busy: boolean; error: string | null }) {
  const [o, setO] = useState<LobbyOptions>({ format: '3v3', ai: 2, coaching: 'beginner', timer: false });
  const coaching = COACHING.find(c => c.id === o.coaching)!;
  const summary = [
    FORMATS.find(f => f.id === o.format)!.title,
    `코칭 ${coaching.title}`,
    `AI ${AI.find(a => a.id === o.ai)!.title}`,
    o.timer ? '턴 45초' : '시간 제한 없음',
  ].join(' · ');

  return (
    <div className="lobby">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">포켓몬 싱글 배틀 코칭</p>
          <h1>한 턴마다, 코치가 알려 줘요.</h1>
          <p className="hero-lead">고른 행동이 최선이었는지, 아니라면 무엇이 더 나았고 왜 그런지. 체스 엔진처럼 매 턴을 평가해요.</p>
          <ol className="steps">
            {STEPS.map(s => (
              <li key={s.no}>
                <span className="step-no">{s.no}</span>
                <span>
                  <b>{s.title}</b>
                  <small>{s.text}</small>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <figure className="demo" aria-label="코칭 예시">
          <div className="demo-stage">
            <div className="demo-sky" />
            <div className="demo-ground" />
            <div className="demo-foe">
              <FieldSprite id="tyranitar" back={false} alt="마기라스" />
            </div>
            <div className="demo-me">
              <FieldSprite id="garchomp" back alt="한카리아스" />
            </div>
            <span className="demo-tag">예시</span>
          </div>
          <figcaption className="demo-coach">
            <span className="coach-face" aria-hidden="true">코</span>
            <span className="demo-bubble">
              <span className="demo-line1">
                <b>한카리아스 → 지진</b>
                <GradeChip grade="best" sym="★" label="최선" />
              </span>
              <span>상대 마기라스에게 효과가 굉장하고, 내가 먼저 움직여요.</span>
              <span className="demo-alt">드래곤클로였다면 <GradeChip grade="mist" sym="?" label="실수" compact /> 확정 2타라 반격을 한 번 받아요.</span>
            </span>
          </figcaption>
        </figure>
      </section>

      <section className="setup" aria-label="배틀 설정">
        <div className="setup-head">
          <h2>배틀 설정</h2>
          <div className="grade-strip" aria-label="턴마다 받는 등급">
            {GRADES.map(([g, sym, label]) => <GradeChip key={g} grade={g} sym={sym} label={label} compact />)}
            <span className="muted small">턴마다 이 중 하나를 받아요</span>
          </div>
        </div>

        <div className="setup-grid">
          <div className="setup-block wide">
            <h3>형식</h3>
            <div className="format-cards">
              {FORMATS.map(f => (
                <button key={f.id} className={`format-card${o.format === f.id ? ' on' : ''}`} onClick={() => setO({ ...o, format: f.id })} aria-pressed={o.format === f.id}>
                  <span className="fc-balls" aria-hidden="true">
                    {Array.from({ length: f.balls }, (_, i) => <i key={i} className="ball" />)}
                  </span>
                  <b>{f.title}</b>
                  <span className="fc-rules">
                    {f.rules.map(r => <span key={r}>{r}</span>)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="setup-block wide">
            <h3>코칭 수준</h3>
            <div className="seg big" role="group" aria-label="코칭 수준">
              {COACHING.map(c => (
                <button key={c.id} className={o.coaching === c.id ? 'on' : ''} onClick={() => setO({ ...o, coaching: c.id })} aria-pressed={o.coaching === c.id}>
                  {c.title}
                </button>
              ))}
            </div>
            <p className="setup-note">{coaching.note}</p>
          </div>

          <div className="setup-block">
            <h3>상대 AI</h3>
            <div className="seg" role="group" aria-label="상대 AI 난이도">
              {AI.map(a => (
                <button key={a.id} className={o.ai === a.id ? 'on' : ''} onClick={() => setO({ ...o, ai: a.id })} aria-pressed={o.ai === a.id}>
                  {a.title}
                </button>
              ))}
            </div>
            <p className="setup-note">{AI.find(a => a.id === o.ai)!.note}</p>
          </div>

          <div className="setup-block">
            <h3>실전 연습</h3>
            <label className="switch">
              <input id="timer" type="checkbox" checked={o.timer} onChange={e => setO({ ...o, timer: e.target.checked })} />
              <span className="switch-track" aria-hidden="true" />
              <span>턴 제한 45초</span>
            </label>
            <p className="setup-note">시간이 다 되면 맨 위 기술(교체 때는 맨 위 포켓몬)을 자동으로 골라요.</p>
          </div>
        </div>

        <div className="setup-foot">
          <span className="setup-summary">{summary}</span>
          {error && <span className="error">{error}</span>}
          <button className="primary big" onClick={() => onStart(o)} disabled={busy}>
            {busy ? '팀을 받는 중…' : '배틀 시작'}
          </button>
        </div>
      </section>
    </div>
  );
}
