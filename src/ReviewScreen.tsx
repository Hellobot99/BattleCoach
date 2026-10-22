import { useState } from 'react';
import type { GameState, GradeKey } from './types';
import { CoachCard } from './Battle';
import { GradeChip, TAG_LESSON } from './ui';
import { starsFor } from './progress';

const ORDER: { key: GradeKey; label: string; sym: string }[] = [
  { key: 'brill', label: '묘수', sym: '!!' },
  { key: 'great', label: '좋은 수', sym: '!' },
  { key: 'best', label: '최선', sym: '★' },
  { key: 'exc', label: '우수', sym: '✓' },
  { key: 'good', label: '무난', sym: '·' },
  { key: 'inacc', label: '부정확', sym: '?!' },
  { key: 'mist', label: '실수', sym: '?' },
  { key: 'blund', label: '블런더', sym: '??' },
];

export function ReviewScreen({ state, onAgain, onLobby, onRetry, onBackToOriginal, onNextStage }: {
  state: GameState;
  onAgain: () => void;
  onLobby: () => void;
  onRetry: (index: number) => void;
  onBackToOriginal?: () => void;
  onNextStage?: () => void;
}) {
  const s = state.summary;
  const reviews = state.reviews;
  const turningIdx = new Set(s?.turning.map(t => t.index));
  const [sel, setSel] = useState<number | null>(s?.turning[0]?.index ?? (reviews.length ? 0 : null));
  const result = state.winner === 'me' ? '승리' : state.winner === 'foe' ? '패배' : '무승부';

  return (
    <div className="review">
      <header className="review-head">
        <div>
          <p className={`result r-${state.winner}`}>{result}</p>
          <h2 className="screen-title">게임 리뷰</h2>
          <p className="muted">
            {state.formatLabel} · {state.turn}턴
          </p>
        </div>
        <div className="accuracy">
          <span className="muted small">정확도</span>
          <b>{s?.accuracy ?? '–'}</b>
          <span className="muted small">
            힌트 {s?.hints ?? 0}번 · 시간 초과 {s?.timeouts ?? 0}번 (정확도에서 뺌)
          </span>
        </div>
      </header>

      {state.story && !state.retry && <StageResult state={state} onNext={onNextStage} onAgain={onAgain} />}

      <section className="panel">
        <h3>등급별 횟수</h3>
        <div className="grade-counts">
          {ORDER.map(g => (
            <span key={g.key} className="gc">
              <GradeChip grade={g.key} sym={g.sym} label={g.label} />
              <b>{s?.counts[g.key] || 0}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>승률 흐름</h3>
        <WinGraph state={state} turning={turningIdx} sel={sel} onSel={setSel} />
        {s && s.turning.length > 0 && (
          <p className="small">
            전환점:{' '}
            {s.turning.map(t => (
              <button key={t.index} className="link" onClick={() => setSel(t.index)}>
                {t.turn}턴 ({t.delta > 0 ? '+' : ''}
                {t.delta}%p)
              </button>
            ))}
          </p>
        )}
        {s?.weakTag && (
          <p className="weak">
            이번 판의 약점: <b>{TAG_LESSON[s.weakTag] || s.weakTag}</b> 레슨을 추천해요.
          </p>
        )}
      </section>

      {sel !== null && reviews[sel] && (
        <section className="panel">
          <div className="panel-head">
            <h3>선택한 턴</h3>
            {reviews[sel].retryable && (
              <button className="primary" onClick={() => onRetry(sel)}>
                이 턴 다시 해 보기
              </button>
            )}
          </div>
          <CoachCard r={reviews[sel]} />
        </section>
      )}

      <section className="panel">
        <h3>턴 타임라인</h3>
        <ol className="timeline">
          {reviews.map((r, i) => (
            <li key={i}>
              <button className={`tl-row${sel === i ? ' on' : ''}${turningIdx.has(i) ? ' turning' : ''}`} onClick={() => setSel(i)}>
                <span className="tl-turn">{r.turn}턴</span>
                <GradeChip grade={r.grade} sym={r.gradeSym} label={r.gradeLabel} compact />
                <span className="tl-act">{r.choiceLabel}</span>
                <span className="tl-reason muted">{r.reason || r.headline}</span>
                {r.retryable && <span className="tl-retry" title="다시 해 볼 수 있어요">↺</span>}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="review-actions">
        {onBackToOriginal && (
          <button className="ghost" onClick={onBackToOriginal}>
            원래 판 리뷰로
          </button>
        )}
        <button className="primary" onClick={onAgain}>
          {state.story ? '이 퍼즐 다시 도전' : '같은 설정으로 다시'}
        </button>
        <button className="ghost" onClick={onLobby}>
          처음으로
        </button>
      </div>
    </div>
  );
}

/** Story mode: stars for this stage and the way forward. */
function StageResult({ state, onNext, onAgain }: { state: GameState; onNext?: () => void; onAgain: () => void }) {
  const st = state.story!;
  const stars = starsFor(state.winner === 'me', state.summary?.accuracy ?? null);
  return (
    <section className={`stage-result${stars ? ' win' : ''}`}>
      <div>
        <p className="eyebrow">
          {st.no}. {st.title} · {st.trainer}
        </p>
        <h3 className="sr-title">{stars ? '퍼즐 성공!' : '아쉽게 졌어요'}</h3>
        <p className="small muted">
          {stars
            ? stars < 3
              ? `정확도 ${stars === 1 ? '70' : '85'} 이상이면 별을 하나 더 받아요.`
              : '별 세 개! 이 퍼즐의 원칙을 완전히 익혔어요.'
            : `배울 것: ${st.lesson}. 아래 타임라인에서 실수한 턴을 다시 해 보고 재도전하세요.`}
        </p>
      </div>
      <span className="stars big" aria-label={`별 ${stars}개`}>
        {[1, 2, 3].map(i => (
          <i key={i} className={i <= stars ? 'on' : ''}>★</i>
        ))}
      </span>
      <div className="sr-actions">
        {stars > 0 && onNext && (
          <button className="primary" onClick={onNext}>
            다음 퍼즐
          </button>
        )}
        {stars > 0 && !onNext && <span className="tag">마지막 퍼즐까지 풀었어요</span>}
        {!stars && (
          <button className="primary" onClick={onAgain}>
            다시 도전
          </button>
        )}
      </div>
    </section>
  );
}

function WinGraph({ state, turning, sel, onSel }: { state: GameState; turning: Set<number>; sel: number | null; onSel: (i: number) => void }) {
  const rs = state.reviews;
  if (rs.length < 2) return <p className="muted small">턴이 너무 적어 그래프를 그리지 않았어요.</p>;
  const W = 1000;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 12 };
  const x = (i: number) => pad.l + (i / (rs.length - 1)) * (W - pad.l - pad.r);
  const y = (w: number) => pad.t + (1 - w) * (H - pad.t - pad.b);
  const pts = rs.map((r, i) => `${x(i)},${y(r.bestW)}`).join(' ');
  const area = `${x(0)},${y(0.5)} ${pts} ${x(rs.length - 1)},${y(0.5)}`;
  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph" role="img" aria-label="턴별 내 승률 추정">
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0.5 ? 'mid' : 'grid'} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
              {v * 100}%
            </text>
          </g>
        ))}
        <polygon points={area} className="area" />
        <polyline points={pts} className="line" />
        {rs.map((r, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(r.bestW)}
            r={sel === i ? 6 : turning.has(i) ? 5 : 3.5}
            className={`dot g-${r.grade}${sel === i ? ' sel' : ''}`}
            onClick={() => onSel(i)}
          >
            <title>
              {r.turn}턴 {r.choiceLabel}: {Math.round(r.bestW * 100)}%
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
