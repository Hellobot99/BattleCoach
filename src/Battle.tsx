import { useEffect, useMemo, useRef, useState } from 'react';
import { Field } from './Field';
import { InfoSheet } from './InfoSheet';
import { usePlayback } from './playback';
import { sound } from './sound';
import type { Choice, GameState, Review } from './types';
import { CATEGORY_KO, GradeChip, STATUS_KO, STAT_KO, Sprite, TYPE_KO, TypeChip, WinBar, effLabel, iga } from './ui';

const TURN_SECONDS = 45;
const EFF_KEY = 'battlecoach.showEff';
const SPEED_KEY = 'battlecoach.fast';

/** A boolean preference remembered per browser. */
function useStoredFlag(key: string, fallback: boolean) {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v === '1';
    } catch {}
    return fallback;
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {}
  };
  return [on, set] as const;
}

interface Props {
  state: GameState;
  busy: boolean;
  onChoose: (choice: string, timeout?: boolean) => void;
  onHint: () => void;
  onAnimated: (gameId: string, logLength: number) => void;
  onBackToReview?: () => void;
  onRetryAgain?: () => void;
}

export function Battle({ state, busy, onChoose, onHint, onAnimated, onBackToReview, onRetryAgain }: Props) {
  const beginner = state.coaching === 'beginner';
  const showCoach = state.coaching !== 'review';
  const [showEff, setShowEff] = useStoredFlag(EFF_KEY, beginner);
  const [fast, setFast] = useStoredFlag(SPEED_KEY, false);
  const [gimmick, setGimmick] = useState(false);
  const [inspect, setInspect] = useState<'p1' | 'p2' | null>(null);
  const [hoverMove, setHoverMove] = useState<Choice | null>(null);
  const [retryDismissed, setRetryDismissed] = useState(false);

  // what the player has already seen: the coach card and win bar wait until the turn has played out
  const [seenReviews, setSeenReviews] = useState(0);
  const [seenEval, setSeenEval] = useState<GameState['eval']>(null);
  const [seenLog, setSeenLog] = useState(0);
  const latest = useRef(state);
  latest.current = state;
  const { frame, playing, skip } = usePlayback(
    state,
    fast ? 2.2 : 1,
    len => {
      setSeenReviews(latest.current.reviews.length);
      setSeenEval(latest.current.eval);
      setSeenLog(len);
      onAnimated(latest.current.id, len);
    },
    (entry, before) => {
      // cries as Pokémon come out and faint
      const ev = entry.ev;
      if (ev?.type === 'switch') sound.cry(ev.spriteid);
      if (ev?.type === 'faint') sound.cry(before[ev.side]?.spriteid || '', true);
    },
  );
  useEffect(() => {
    if (!playing) setSeenEval(state.eval);
  }, [state.eval, playing]);

  const d = state.decision && state.decision.kind !== 'preview' ? state.decision : null;
  const me = state.me.team.find(m => m.active) || null;
  const foe = state.foe.team.find(m => m.active) || null;
  const reviews = playing ? state.reviews.slice(0, seenReviews) : state.reviews;
  const last = reviews[reviews.length - 1];
  const locked = busy || playing;

  useEffect(() => setGimmick(false), [d?.turn, d?.kind]);

  const moves = d?.choices.filter(c => c.kind === 'move' && !c.gimmick) || [];
  const gimmickChoices = d?.choices.filter(c => c.gimmick) || [];
  const gimmickKind = gimmickChoices[0]?.gimmick;
  const switches = d?.choices.filter(c => c.kind === 'switch') || [];

  const top = useMemo(() => {
    if (!d) return null;
    if (d.kind === 'switch') return switches[0] || d.choices[0];
    return moves[0] || d.choices[0];
  }, [d, moves, switches]);

  const pick = (c: Choice) => {
    if (locked) return;
    if (c.kind === 'move' && gimmick) {
      const g = gimmickChoices.find(x => x.slot === c.slot);
      if (g) return onChoose(g.choice);
    }
    onChoose(c.choice);
  };

  const prompt = busy
    ? '코치가 이번 턴을 계산하는 중…'
    : d?.kind === 'switch'
      ? '다음 포켓몬을 고르세요.'
      : d && me
        ? `${iga(me.species)} 무엇을 할까?`
        : state.ended
          ? '배틀이 끝났어요.'
          : '상대를 기다리는 중…';

  return (
    <div className="battle">
      {state.retry && !retryDismissed && (
        <RetryBanner
          state={state}
          playing={playing}
          seenReviews={seenReviews}
          onBack={onBackToReview}
          onAgain={onRetryAgain}
          onContinue={() => setRetryDismissed(true)}
        />
      )}
      <div className="battle-main">
        <div className="stage-wrap">
          <Field frame={frame} state={state} prompt={prompt} playing={playing} onInspect={setInspect} />
          <div className="stage-controls">
            {playing && (
              <button className="chip-btn" onClick={skip}>
                건너뛰기 ▸▸
              </button>
            )}
            <label className="chip-toggle">
              <input id="fast" type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} />
              <span>빠르게</span>
            </label>
          </div>
        </div>

        <WinBar w={seenEval ? seenEval.bestW : null} pending={!!d && !d.evalReady} />

        {!playing && (me || foe) && (
          <div className="field-notes">
            {beginner && state.speed && me && foe && (
              <span className="note">
                {state.speed === 'faster' ? `${iga(me.species)} 먼저 움직여요` : state.speed === 'slower' ? `상대 ${iga(foe.species)} 먼저 움직여요` : '스피드가 같아요'}
                <span className="muted"> · 선공기 제외{state.speedNote ? ` · ${state.speedNote}` : ''}</span>
              </span>
            )}
            {foe?.details && (
              <button className="note note-btn" onClick={() => setInspect('p2')}>
                상대 정보 보기
              </button>
            )}
            {me && (
              <button className="note note-btn" onClick={() => setInspect('p1')}>
                내 포켓몬 정보
              </button>
            )}
            <Boosts label="내" b={me?.boosts} />
            <Boosts label="상대" b={foe?.boosts} />

          </div>
        )}

        {showCoach && (
          <section className="panel coach-panel" aria-live="polite">
            <div className="panel-head">
              <h3>코치</h3>
              {busy && <span className="thinking">계산 중</span>}
            </div>
            {last ? <CoachCard r={last} /> : <p className="muted">첫 턴을 고르면 등급과 이유를 알려 줘요.</p>}
          </section>
        )}
        <Log log={state.log} upTo={playing ? seenLog : state.log.length} />
      </div>

      <aside className="battle-side">
        <section className={`actions${playing ? ' dim' : ''}`} aria-label="행동 고르기">
          {d ? (
            <>
              <div className="actions-head">
                <h3>{d.kind === 'switch' ? '다음 포켓몬' : `${d.turn}턴`}</h3>
                {d.kind === 'move' && (
                  <label className="chip-toggle">
                    <input id="show-eff" type="checkbox" checked={showEff} onChange={e => setShowEff(e.target.checked)} />
                    <span>상성 표시</span>
                  </label>
                )}
                {state.timer && top && !playing && (
                  <Countdown key={`${d.kind}-${d.turn}-${state.reviews.length}`} onTimeout={() => onChoose(top.choice, true)} paused={busy} />
                )}
              </div>
              {d.kind === 'move' && (
                <>
                  <div className="move-grid" onMouseLeave={() => setHoverMove(null)}>
                    {moves.map(c => (
                      <MoveButton key={c.choice} c={c} showEff={showEff} disabled={locked} onClick={() => pick(c)} onHover={() => setHoverMove(c)} />
                    ))}
                  </div>
                  <p className="desc-strip" aria-live="polite">
                    {hoverMove ? (
                      <>
                        <b>{hoverMove.moveName}</b> {hoverMove.desc}
                      </>
                    ) : (
                      <span className="muted">기술에 마우스를 올리면 설명이 나와요.</span>
                    )}
                  </p>
                </>
              )}
              {gimmickKind && d.kind === 'move' && (
                <label className={`gimmick-toggle g-${gimmickKind}${gimmick ? ' on' : ''}`}>
                  <input id="gimmick" type="checkbox" checked={gimmick} onChange={e => setGimmick(e.target.checked)} />
                  <span className="gimmick-icon" aria-hidden="true" />
                  <span>
                    {gimmickKind === 'tera' ? `테라스탈 · ${TYPE_KO[me?.teraType || ''] || me?.teraType}` : '메가진화'}
                    <small>{gimmick ? '켜짐: 다음 기술과 함께 써요' : '한 판에 한 번'}</small>
                  </span>
                </label>
              )}
              {switches.length > 0 && (
                <div className="switch-block">
                  {d.kind === 'move' && <span className="sub-label">교체</span>}
                  <div className="switch-row">
                    {switches.map(c => {
                      const pct = Math.round(((c.hp || 0) / (c.maxhp || 1)) * 100);
                      return (
                        <button key={c.choice} className="switch-btn" disabled={locked} onClick={() => pick(c)}>
                          <Sprite id={c.spriteid || ''} size={44} alt={c.label} />
                          <span className="sw-text">
                            <b>{c.label}</b>
                            <span className="sw-hp">
                              <span className={`sw-fill ${pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'low'}`} style={{ width: `${pct}%` }} />
                            </span>
                            <small>
                              {pct}%{c.status ? ` · ${STATUS_KO[c.status]}` : ''}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="muted">{state.ended ? '배틀이 끝났어요. 리뷰를 준비하는 중…' : '상대를 기다리는 중…'}</p>
          )}
        </section>
        {d && showCoach && (
          <section className="panel hint-panel">
            <div className="panel-head">
              <h3>힌트</h3>
              <button className="ghost small" onClick={onHint} disabled={locked || d.hintLevel >= 3 || !d.evalReady}>
                {d.hintLevel === 0 ? '힌트 보기' : d.hintLevel < 3 ? `힌트 ${d.hintLevel + 1}/3` : '힌트 끝'}
              </button>
            </div>
            {d.hints.length ? (
              <ol className="hints">
                {d.hints.map(h => <li key={h}>{h}</li>)}
              </ol>
            ) : (
              <p className="muted small">힌트를 쓴 턴은 정확도에서 빠지고 따로 세요.</p>
            )}
          </section>
        )}
      </aside>
      {inspect && (inspect === 'p1' ? me : foe?.details ? foe : null) && (
        <InfoSheet mon={(inspect === 'p1' ? me : foe)!} side={inspect} onClose={() => setInspect(null)} />
      )}
    </div>
  );
}

/** 「다시 해 보기」: what was played originally, then how the new choice compares. */
function RetryBanner({ state, playing, seenReviews, onBack, onAgain, onContinue }: {
  state: GameState; playing: boolean; seenReviews: number; onBack?: () => void; onAgain?: () => void; onContinue: () => void;
}) {
  const r = state.retry!;
  const now = !playing && seenReviews > r.index ? state.reviews[r.index] : null;
  const o = r.original;
  const better = now && now.dW < o.dW;
  return (
    <section className={`retry-banner${now ? (better ? ' better' : ' same') : ''}`} aria-live="polite">
      <div className="rb-text">
        <span className="eyebrow">다시 해 보기 · {o.turn}턴</span>
        {now ? (
          <p className="rb-compare">
            <span>
              원래 <b>{o.choiceLabel}</b> <GradeChip grade={o.grade} sym={o.gradeSym} label={o.gradeLabel} />
            </span>
            <span className="rb-arrow" aria-hidden="true">→</span>
            <span>
              이번 <b>{now.choiceLabel}</b> <GradeChip grade={now.grade} sym={now.gradeSym} label={now.gradeLabel} />
            </span>
          </p>
        ) : (
          <p>
            원래 고른 수 <b>{o.choiceLabel}</b> <GradeChip grade={o.grade} sym={o.gradeSym} label={o.gradeLabel} /> · 다른 수를 골라 보세요. 상대의 행동과 난수는
            원래 판과 같아요.
          </p>
        )}
        {now && <p className="small muted">{better ? '찾았어요! 아래 코치 설명에서 이유를 확인해 보세요.' : '이번에도 더 좋은 수가 있었어요. 한 번 더 해 볼까요?'}</p>}
      </div>
      <div className="rb-actions">
        {now && onAgain && (
          <button className="ghost" onClick={onAgain}>
            다른 수로 다시
          </button>
        )}
        {onBack && (
          <button className="primary" onClick={onBack}>
            리뷰로 돌아가기
          </button>
        )}
        {now && (
          <button className="link" onClick={onContinue}>
            여기서 이어서 하기
          </button>
        )}
      </div>
    </section>
  );
}

function Boosts({ label, b }: { label: string; b?: Record<string, number> }) {
  const e = Object.entries(b || {});
  if (!e.length) return null;
  return (
    <span className="note boosts">
      {label}{' '}
      {e.map(([k, v]) => (
        <span key={k} className={v > 0 ? 'up' : 'down'}>
          {STAT_KO[k] || k} {v > 0 ? `+${v}` : v}
        </span>
      ))}
    </span>
  );
}

function MoveButton({ c, showEff, disabled, onClick, onHover }: { c: Choice; showEff: boolean; disabled: boolean; onClick: () => void; onHover: () => void }) {
  const eff = showEff ? effLabel(c.effType) : null;
  return (
    <button className={`move-btn mt-${c.type}`} disabled={disabled} onClick={onClick} onMouseEnter={onHover} onFocus={onHover}>
      <span className="mv-top">
        <span className="mv-name">{c.moveName || c.label}</span>
        {c.type && <TypeChip type={c.type} small />}
      </span>
      <span className="mv-meta">
        <span>{CATEGORY_KO[c.category || ''] || ''}</span>
        <span>{c.power ? `위력 ${c.power}` : '위력 –'}</span>
        <span>{c.accuracy ? `명중 ${c.accuracy}` : '반드시 명중'}</span>
        {c.pp !== undefined && <span className="pp">PP {c.pp}/{c.maxpp}</span>}
      </span>
      {c.desc && <span className="mv-desc">{c.desc}</span>}
      {eff && <span className={`eff-pill ${eff.tone}`}>{eff.text}</span>}
    </button>
  );
}

export function CoachCard({ r }: { r: Review }) {
  const showBest = r.graded && r.dW > 1 && r.bestLabel !== r.choiceLabel;
  return (
    <div className={`coach-card cc-${r.grade}`}>
      <div className="coach-face" aria-hidden="true">코</div>
      <div className="coach-body">
        <div className="coach-line1">
          <GradeChip grade={r.grade} sym={r.gradeSym} label={r.gradeLabel} />
          <span className="act">
            {r.turn}턴 · {r.choiceLabel}
          </span>
          {r.hinted && <span className="tag">힌트</span>}
        </div>
        <p className="headline">{r.headline}</p>
        {r.reason && <p className="reason">{r.reason}</p>}
        {r.luck && <p className="luck">{r.luck}</p>}
        {r.detail && <p className="why">{r.detail}</p>}
        {showBest && (
          <p className="alt">
            더 좋은 수 <b>{r.bestLabel}</b>
            <span className="loss">−{r.dW}%p</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Log({ log, upTo }: { log: GameState['log']; upTo?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = log.slice(0, upTo ?? log.length).filter(l => l.text);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);
  return (
    <details className="panel log-panel" open>
      <summary>
        <h3>배틀 기록</h3>
      </summary>
      <div className="log" ref={ref}>
        {shown.map((l, i) => (
          <div key={i} className={`log-line k-${l.k}`}>
            {l.text}
          </div>
        ))}
      </div>
    </details>
  );
}

function Countdown({ onTimeout, paused }: { onTimeout: () => void; paused: boolean }) {
  const [left, setLeft] = useState(TURN_SECONDS);
  const fired = useRef(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [paused]);
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onTimeout();
    }
  }, [left, onTimeout]);
  return (
    <span className={`countdown${left <= 10 ? ' low' : ''}`} aria-live="off">
      {left}초
    </span>
  );
}
