import { useEffect, useState } from 'react';
import { api } from './api';
import { loadProgress } from './progress';
import type { StoryStage } from './types';
import { Sprite } from './ui';

function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`별 ${n}개`}>
      {[1, 2, 3].map(i => (
        <i key={i} className={i <= n ? 'on' : ''}>★</i>
      ))}
    </span>
  );
}

/** 퍼즐: stages in order, each unlocked by clearing the one before. */
export function Story({ onStart, onBack, busy }: { onStart: (id: string) => void; onBack: () => void; busy: boolean }) {
  const [stages, setStages] = useState<StoryStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = loadProgress();

  useEffect(() => {
    api.story().then(setStages, e => setError(String(e.message || e)));
  }, []);

  const cleared = stages ? stages.filter(s => progress[s.id]).length : 0;
  const total = stages ? stages.reduce((a, s) => a + (progress[s.id] || 0), 0) : 0;

  return (
    <div className="story">
      <header className="story-head">
        <button className="link back-link" onClick={onBack}>
          ← 처음으로
        </button>
        <p className="eyebrow">퍼즐</p>
        <h2 className="screen-title">퍼즐을 하나씩 풀며 원칙을 익혀요</h2>
        <p className="muted">
          퍼즐마다 정해진 팀으로 싸워요. 이기면 다음 퍼즐이 열리고, 정확도에 따라 별을 받아요 (승리 ★ · 정확도 70 이상 ★★ · 85 이상 ★★★).
        </p>
        {stages && (
          <p className="story-progress">
            {cleared} / {stages.length} 퍼즐 · 별 {total} / {stages.length * 3}
          </p>
        )}
      </header>
      {error && <p className="error">{error}</p>}
      {!stages && !error && <p className="muted">퍼즐을 불러오는 중…</p>}
      <ol className="stage-list">
        {stages?.map((s, i) => {
          const stars = progress[s.id] || 0;
          const open = i === 0 || !!progress[stages[i - 1].id];
          return (
            <li key={s.id} className={`stage-card${open ? '' : ' locked'}${stars ? ' cleared' : ''}`}>
              <div className="sc-no">{s.no}</div>
              <div className="sc-body">
                <div className="sc-top">
                  <b className="sc-title">{s.title}</b>
                  <span className="muted small">{s.trainer}</span>
                  {stars > 0 && <Stars n={stars} />}
                </div>
                <p className="sc-lesson">
                  배울 것 <b>{s.lesson}</b>
                </p>
                {open && <p className="small muted">{s.goal}</p>}
                <div className="sc-tags">
                  <span className="tag">AI {s.ai}</span>
                  <span className="tag">{s.coaching === 'beginner' ? '입문 도움' : '실전 정보'}</span>
                  <span className="tag">{s.hintLimit === null ? '힌트 무제한' : `힌트 ${s.hintLimit}번`}</span>
                  {s.timer && <span className="tag">턴 45초</span>}
                </div>
              </div>
              <div className="sc-teams" aria-hidden={!open}>
                <span className="sc-team">
                  {s.me.map(m => <Sprite key={m.spriteid} id={m.spriteid} size={44} alt={m.species} />)}
                </span>
                <span className="sc-vs">VS</span>
                <span className="sc-team">
                  {open ? s.foe.map(m => <Sprite key={m.spriteid} id={m.spriteid} size={44} alt={m.species} />) : <span className="muted">???</span>}
                </span>
              </div>
              <button className={stars ? 'ghost' : 'primary'} disabled={!open || busy} onClick={() => onStart(s.id)}>
                {!open ? '잠김' : stars ? '다시 도전' : '도전'}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
