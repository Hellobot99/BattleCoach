import { useState } from 'react';
import type { GameState } from './types';
import { Sprite, TypeChip } from './ui';

const SLOT_LABEL = ['선봉', '2번', '3번', '4번', '5번', '6번'];

export function Preview({ state, onChoose, busy }: { state: GameState; onChoose: (choice: string) => void; busy: boolean }) {
  const d = state.decision;
  const [picks, setPicks] = useState<number[]>([]);
  // the coach's pick stays hidden until asked for, so the player tries on their own first
  const [showRec, setShowRec] = useState(false);
  if (!d || d.kind !== 'preview') return null;
  const size = d.size;
  const rec = d.recommend;

  const toggle = (slot: number) =>
    setPicks(p => (p.includes(slot) ? p.filter(x => x !== slot) : p.length < size ? [...p, slot] : p));
  const ready = picks.length === size;

  return (
    <div className="pick">
      <header className="pick-head">
        <p className="eyebrow">팀 선출</p>
        <h2 className="screen-title">상대 6마리를 보고, 싸울 {size}마리를 고르세요</h2>
        <p className="muted">처음 고른 포켓몬이 선봉으로 나가요. 상대도 지금 {size}마리를 골랐어요.</p>
      </header>

      <section className="foe-strip" aria-label="상대 6마리">
        <span className="strip-label">상대 팀 · 이 중 {size}마리가 나와요</span>
        <div className="foe-row">
          {state.foe.team.map(m => (
            <div key={m.name} className="foe-chip">
              <Sprite id={m.spriteid} size={56} alt={m.species} />
              <span className="foe-chip-text">
                <b>{m.species}</b>
                <span className="types">{m.types.map(t => <TypeChip key={t} type={t} small />)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="pick-body">
        <section className="my-grid" aria-label="내 6마리">
          {state.me.team.map((m, i) => {
            const slot = i + 1;
            const order = picks.indexOf(slot);
            const mu = showRec ? rec.matchups?.[i] : null;
            const recommended = showRec && rec.slots.includes(slot);
            return (
              <button key={m.name} className={`pick-card${order >= 0 ? ' picked' : ''}`} onClick={() => toggle(slot)} aria-pressed={order >= 0}>
                {order >= 0 && <span className="pick-badge">{SLOT_LABEL[order]}</span>}
                {recommended && <span className="rec-badge">코치 추천</span>}
                <span className="pc-top">
                  <span className="pc-sprite">
                    <Sprite id={m.spriteid} size={80} alt={m.species} />
                  </span>
                  <span className="pc-id">
                    <b>{m.species}</b>
                    <span className="types">{m.types.map(t => <TypeChip key={t} type={t} small />)}</span>
                    <small>
                      Lv{m.level} · {m.ability}
                    </small>
                    <small>{m.item || '도구 없음'}</small>
                  </span>
                </span>
                <span className="pc-moves">
                  {m.moves.map(mv => (
                    <span key={mv.name} className={`mv-chip mt-${mv.type}`}>
                      {mv.name}
                    </span>
                  ))}
                </span>
                {mu && (
                  <span className="pc-matchup">
                    <span className="mu good">유리 {mu.good}</span>
                    <span className="mu bad">불리 {mu.bad}</span>
                    <span className="muted">상대 6마리 기준</span>
                  </span>
                )}
              </button>
            );
          })}
        </section>

        <aside className="pick-side">
          <section className="panel tray">
            <h3>내 선출</h3>
            <ol className="tray-slots">
              {Array.from({ length: size }, (_, k) => {
                const slot = picks[k];
                const m = slot ? state.me.team[slot - 1] : null;
                return (
                  <li key={k} className={m ? 'filled' : ''}>
                    <span className="tray-label">{SLOT_LABEL[k]}</span>
                    {m ? (
                      <>
                        <Sprite id={m.spriteid} size={40} alt={m.species} />
                        <b>{m.species}</b>
                        <button className="tray-x" onClick={() => toggle(slot)} aria-label={`${m.species} 빼기`}>
                          ×
                        </button>
                      </>
                    ) : (
                      <span className="muted small">비어 있음</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <button className="primary big full" disabled={!ready || busy} onClick={() => onChoose('team ' + picks.join(''))}>
              {busy ? '배틀 준비 중…' : ready ? `이 ${size}마리로 시작` : `${size - picks.length}마리 더 고르세요`}
            </button>
          </section>

          <section className="panel rec-panel">
            <div className="panel-head">
              <label className="switch">
                <input id="show-rec" type="checkbox" checked={showRec} onChange={e => setShowRec(e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span>코치 추천 보기</span>
              </label>
              {showRec && (
                <button className="ghost small" onClick={() => setPicks(rec.slots)}>
                  추천대로 고르기
                </button>
              )}
            </div>
            {!showRec && <p className="muted small">먼저 혼자 골라 보세요. 켜면 추천 3마리와 카드마다 상대 6마리 기준 유리 · 불리 수가 나와요.</p>}
            {showRec && <div className="coach-card">
              <div className="coach-face" aria-hidden="true">코</div>
              <div className="coach-body">
                <ul className="rec-lines">
                  {rec.lines.map(l => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p className="muted small">상성만 보고 추천해요. 선출 등급은 2차에 넣어요.</p>
              </div>
            </div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
