import { useEffect, useState } from 'react';
import { api } from './api';
import { loadProgress } from './progress';
import type { StoryStage } from './types';
import { Sprite } from './ui';

function Stars({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <span className={`stars${big ? ' big' : ''}`} aria-label={`별 ${n}개`}>
      {[1, 2, 3].map(i => (
        <i key={i} className={i <= n ? 'on' : ''}>★</i>
      ))}
    </span>
  );
}

/** 퍼즐: numbered levels, each unlocked by clearing the one before. */
export function Story({ onStart, onBack, busy }: { onStart: (id: string) => void; onBack: () => void; busy: boolean }) {
  const [levels, setLevels] = useState<StoryStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const progress = loadProgress();

  useEffect(() => {
    api.story().then(list => {
      setLevels(list);
      // open on the first level not cleared yet
      setSel((list.find(l => !progress[l.id]) || list[list.length - 1]).id);
    }, e => setError(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOpen = (i: number) => !!levels && (i === 0 || !!progress[levels[i - 1].id]);
  const cleared = levels ? levels.filter(l => progress[l.id]).length : 0;
  const total = levels ? levels.reduce((a, l) => a + (progress[l.id] || 0), 0) : 0;
  const idx = levels ? levels.findIndex(l => l.id === sel) : -1;
  const cur = idx >= 0 ? levels![idx] : null;
  const open = idx >= 0 && isOpen(idx);
  const stars = cur ? progress[cur.id] || 0 : 0;

  return (
    <div className="story">
      <header className="story-head">
        <button className="link back-link" onClick={onBack}>
          ← 처음으로
        </button>
        <p className="eyebrow">퍼즐</p>
        <h2 className="screen-title">1단계부터 차례로 올라가요</h2>
        <p className="muted">
          단계마다 정해진 팀으로 싸워요. 올라갈수록 상대가 똑똑해지고, 팀 전력이 불리해지고, 도움(상성 표시 · 힌트)이 줄어요. 이기면 다음 단계가 열리고 정확도에 따라 별을
          받아요 (승리 ★ · 정확도 70 이상 ★★ · 85 이상 ★★★).
        </p>
        {levels && (
          <p className="story-progress">
            {cleared} / {levels.length} 단계 · 별 {total} / {levels.length * 3}
          </p>
        )}
      </header>
      {error && <p className="error">{error}</p>}
      {!levels && !error && <p className="muted">단계를 불러오는 중…</p>}

      {levels && (
        <div className="level-layout">
          <ol className="level-grid" aria-label="단계">
            {levels.map((l, i) => {
              const st = progress[l.id] || 0;
              const o = isOpen(i);
              return (
                <li key={l.id}>
                  <button
                    className={`level-tile${l.id === sel ? ' on' : ''}${o ? '' : ' locked'}${st ? ' cleared' : ''} ai-${l.ai}`}
                    onClick={() => setSel(l.id)}
                    aria-pressed={l.id === sel}
                    aria-label={`${l.no}단계${o ? '' : ' (잠김)'}`}
                  >
                    <b>{l.no}</b>
                    {o ? (
                      <Stars n={st} />
                    ) : (
                      <svg className="lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                        <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {cur && (
            <section className="level-detail" aria-live="polite">
              <div className="ld-head">
                <span className="ld-no">{cur.no}</span>
                <div>
                  <h3 className="ld-title">{cur.title}</h3>
                  {stars > 0 && <Stars n={stars} />}
                </div>
              </div>
              {open ? (
                <>
                  <p className="ld-note">
                    <b>이번 단계</b> {cur.goal}
                  </p>
                  <div className="ld-teams">
                    <div>
                      <span className="sub-label">내 팀</span>
                      <span className="ld-team">
                        {cur.me.map(m => (
                          <span key={m.spriteid} className="ld-mon">
                            <Sprite id={m.spriteid} size={56} alt={m.species} />
                            <small>{m.species}</small>
                          </span>
                        ))}
                      </span>
                    </div>
                    <span className="sc-vs">VS</span>
                    <div>
                      <span className="sub-label">상대 팀</span>
                      <span className="ld-team">
                        {cur.foe.map(m => (
                          <span key={m.spriteid} className="ld-mon">
                            <Sprite id={m.spriteid} size={56} alt={m.species} />
                            <small>{m.species}</small>
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                  <div className="sc-tags">
                    <span className="tag">상대 AI {cur.ai}</span>
                    <span className="tag">{cur.gap}</span>
                    <span className="tag">{cur.coaching === 'beginner' ? '상성 · 속도 표시' : '실전 정보'}</span>
                    <span className="tag">{cur.hintLimit === null ? '힌트 무제한' : cur.hintLimit === 0 ? '힌트 없음' : `힌트 ${cur.hintLimit}번`}</span>
                    {cur.timer && <span className="tag">턴 45초</span>}
                  </div>
                  <button className="primary big" disabled={busy} onClick={() => onStart(cur.id)}>
                    {stars ? '다시 도전' : `${cur.title} 도전`}
                  </button>
                </>
              ) : (
                <p className="muted">{cur.no - 1}단계를 깨면 열려요.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
