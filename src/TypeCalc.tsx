import { useState } from 'react';
import { TYPES, defense, offense } from './typechart';
import { TYPE_KO, TypeChip } from './ui';

const OPEN_KEY = 'battlecoach.typecalc';

function Row({ label, tone, types }: { label: string; tone: 'bad' | 'good' | 'none'; types: string[] }) {
  if (!types.length) return null;
  return (
    <div className={`weak-row ${tone}`}>
      <span className="weak-label">{label}</span>
      <span className="types">{types.map(t => <TypeChip key={t} type={t} small />)}</span>
    </div>
  );
}

/** Pick one or two types and see what they take (defense) and what they hit (offense). */
export function TypeCalc({ foeTypes, myTypes }: { foeTypes: string[] | null; myTypes: string[] | null }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (t: string) =>
    setPicked(p => (p.includes(t) ? p.filter(x => x !== t) : p.length < 2 ? [...p, t] : [p[1], t]));
  const def = picked.length ? defense(picked) : null;

  return (
    <details
      className="panel typecalc-panel"
      open={open}
      onToggle={e => {
        const v = (e.target as HTMLDetailsElement).open;
        setOpen(v);
        try {
          localStorage.setItem(OPEN_KEY, v ? '1' : '0');
        } catch {}
      }}
    >
      <summary>
        <h3>상성 계산기</h3>
        {!open && picked.length > 0 && (
          <span className="types">{picked.map(t => <TypeChip key={t} type={t} small />)}</span>
        )}
      </summary>

      <div className="tc-fill">
        {foeTypes && (
          <button className="ghost small" onClick={() => setPicked(foeTypes.slice(0, 2))}>
            상대 타입 넣기
          </button>
        )}
        {myTypes && (
          <button className="ghost small" onClick={() => setPicked(myTypes.slice(0, 2))}>
            내 타입 넣기
          </button>
        )}
        {picked.length > 0 && (
          <button className="link small" onClick={() => setPicked([])}>
            지우기
          </button>
        )}
      </div>

      <div className="tc-grid" role="group" aria-label="타입 고르기 (최대 2개)">
        {TYPES.map(t => (
          <button key={t} className={`tc-type t-${t}${picked.includes(t) ? ' on' : ''}`} onClick={() => toggle(t)} aria-pressed={picked.includes(t)}>
            {TYPE_KO[t]}
          </button>
        ))}
      </div>

      {!picked.length ? (
        <p className="muted small">타입을 1 ~ 2개 고르면 받는 피해와 주는 피해를 보여 줘요.</p>
      ) : (
        <div className="tc-result">
          <section>
            <h4>
              방어 상성 <span className="muted">· {picked.map(t => TYPE_KO[t]).join(' / ')} 포켓몬이 받을 때</span>
            </h4>
            <div className="weak-chart">
              <Row label="×4" tone="bad" types={def!.x4} />
              <Row label="×2" tone="bad" types={def!.x2} />
              <Row label="×½" tone="good" types={def!.half} />
              <Row label="×¼" tone="good" types={def!.quarter} />
              <Row label="×0" tone="good" types={def!.immune} />
            </div>
          </section>
          {picked.map(t => {
            const o = offense(t);
            return (
              <section key={t}>
                <h4>
                  공격 상성 <span className="muted">· {TYPE_KO[t]} 기술로 때릴 때</span>
                </h4>
                <div className="weak-chart">
                  <Row label="×2" tone="good" types={o.se} />
                  <Row label="×½" tone="bad" types={o.nve} />
                  <Row label="×0" tone="bad" types={o.immune} />
                  {!o.se.length && <p className="muted small">효과가 굉장한 타입이 없어요.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </details>
  );
}
