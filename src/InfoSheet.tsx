import { useEffect, useRef } from 'react';
import { FieldSprite } from './Field';
import type { FoeMon, MyMon, WeakChart } from './types';
import { STATUS_KO, TYPE_KO, TypeChip } from './ui';

const STAT_LABEL: [string, string][] = [['hp', 'HP'], ['atk', '공격'], ['def', '방어'], ['spa', '특공'], ['spd', '특방'], ['spe', '스피드']];

function Weak({ chart }: { chart: WeakChart }) {
  const rows: [string, string[], string][] = [
    ['×4', chart.x4, 'bad'],
    ['×2', chart.x2, 'bad'],
    ['×½', chart.half, 'good'],
    ['×¼', chart.quarter, 'good'],
    ['×0', chart.immune, 'good'],
  ];
  return (
    <div className="weak-chart">
      {rows.filter(([, list]) => list.length).map(([label, list, tone]) => (
        <div key={label} className={`weak-row ${tone}`}>
          <span className="weak-label">{label}</span>
          <span className="types">{list.map(t => <TypeChip key={t} type={t} small />)}</span>
        </div>
      ))}
    </div>
  );
}

function Odds({ title, rows }: { title: string; rows: [string, number, string?][] }) {
  if (!rows.length) return null;
  return (
    <div className="odds">
      <h4>{title}</h4>
      {rows.slice(0, 8).map(([name, pct, type]) => (
        <div key={name} className="odds-row">
          <span className="odds-name">
            {type && <i className={`dot t-${type}`} />}
            {name}
          </span>
          <span className="odds-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="odds-pct">{pct}%</span>
        </div>
      ))}
    </div>
  );
}

/** A sheet with what a player would look up about a Pokémon: matchups, stats, moves, and (opponent) the odds. */
export function InfoSheet({ mon, side, onClose }: { mon: MyMon | FoeMon; side: 'p1' | 'p2'; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mine = side === 'p1' ? (mon as MyMon) : null;
  const foe = side === 'p2' ? (mon as FoeMon) : null;
  const d = foe?.details;
  const stats = mine ? mine.stats : d?.baseStats;
  const max = mine ? 400 : 160;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${mon.species} 정보`} onClick={e => e.stopPropagation()}>
        <header className="sheet-head">
          <span className="sheet-sprite">
            <FieldSprite id={mon.spriteid} back={false} alt={mon.species} />
          </span>
          <span className="sheet-title">
            <span className="eyebrow">{side === 'p2' ? '상대 포켓몬' : '내 포켓몬'}</span>
            <b>{mon.species}</b>
            <span className="types">
              {(mon.terastallized ? [mon.terastallized] : mon.types).map(t => <TypeChip key={t} type={t} />)}
              {mon.status && <span className={`status s-${mon.status}`}>{STATUS_KO[mon.status]}</span>}
            </span>
          </span>
          <button ref={closeRef} className="sheet-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className="sheet-body">
          <section>
            <h3>받는 피해 (타입 상성)</h3>
            <Weak chart={mine ? mine.weak : d!.weak} />
          </section>

          {stats && (
            <section>
              <h3>{mine ? '능력치 (실수치)' : '종족값'}</h3>
              <div className="stat-bars">
                {STAT_LABEL.filter(([k]) => stats[k] !== undefined).map(([k, label]) => (
                  <div key={k} className="stat-row">
                    <span>{label}</span>
                    <span className="stat-bar">
                      <span style={{ width: `${Math.min(100, (stats[k] / max) * 100)}%` }} />
                    </span>
                    <b>{stats[k]}</b>
                  </div>
                ))}
              </div>
              {d && (
                <p className="small muted">
                  스피드 실수치 <b>{d.speed.plain}</b> · 구애스카프면 <b>{d.speed.scarf}</b>
                </p>
              )}
            </section>
          )}

          {mine && (
            <section>
              <h3>특성 · 도구</h3>
              <dl className="desc-list">
                <dt>{mine.ability}</dt>
                <dd>{mine.abilityDesc}</dd>
                {mine.item && (
                  <>
                    <dt>{mine.item}</dt>
                    <dd>{mine.itemDesc}</dd>
                  </>
                )}
              </dl>
              <h3>기술</h3>
              <dl className="desc-list">
                {mine.moves.map(m => (
                  <div key={m.name} className="desc-move">
                    <dt>
                      <i className={`dot t-${m.type}`} />
                      {m.name}
                    </dt>
                    <dd>{m.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {foe && d && (
            <section>
              <h3>드러난 정보</h3>
              <p className="small">
                {[foe.moves.length ? `기술 ${foe.moves.join(', ')}` : null, foe.item ? `도구 ${foe.item}` : null, foe.ability ? `특성 ${foe.ability}` : null]
                  .filter(Boolean)
                  .join(' · ') || '아직 드러난 정보가 없어요.'}
              </p>
              <h3>아직 모르는 것 (랜덤 배틀 세트 기준 확률)</h3>
              <div className="odds-grid">
                <Odds title="기술" rows={d.odds.moves} />
                <Odds title="도구" rows={d.odds.items} />
                <Odds title="특성" rows={d.odds.abilities} />
                <Odds title="테라 타입" rows={d.odds.tera.map(([t, p]) => [TYPE_KO[t] || t, p, t] as [string, number, string])} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
