import { useState } from 'react';
import { fieldSpriteUrls } from './api';
import type { Frame, MonFrame } from './playback';
import type { GameState, Side } from './types';
import { STATUS_KO, TYPE_KO } from './ui';

/** Animated Showdown sprite (idle motion), falling back to the still pixel sprite with a breathing loop. */
export function FieldSprite({ id, back, alt }: { id: string; back: boolean; alt: string }) {
  const urls = fieldSpriteUrls(id, back);
  const [i, setI] = useState(0);
  if (!id || i >= urls.length) return <div className="fs-missing" aria-label={alt} />;
  const still = urls[i].endsWith('.png');
  return (
    <img
      key={urls[i]}
      className={`fs-img${still ? ' still' : ''}`}
      src={urls[i]}
      alt={alt}
      onError={() => setI(i + 1)}
      draggable={false}
    />
  );
}

function Hud({ side, mon, balls, onInspect }: { side: Side; mon: MonFrame; balls: ('ok' | 'down' | 'unknown')[]; onInspect?: () => void }) {
  const pct = Math.max(0, Math.min(100, mon.hpPct));
  const tone = pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'low';
  return (
    <div className={`hud hud-${side}`}>
      <button className="hud-top" onClick={onInspect} disabled={!onInspect} title="눌러서 정보 보기">
        <b className="hud-name">{side === 'p2' ? '상대 ' : ''}{mon.species}</b>
        <span className="hud-lv">Lv{mon.level}</span>
        {onInspect && <span className="hud-info" aria-hidden="true">i</span>}
      </button>
      <div className="hud-bar">
        <span className="hud-hp-label">HP</span>
        <div className="hud-track">
          <div className={`hud-fill ${tone}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="hud-bottom">
        <span className="hud-badges">
          {mon.status && <span className={`status s-${mon.status}`}>{STATUS_KO[mon.status]}</span>}
          {mon.tera && <span className={`tera-badge type t-${mon.tera}`}>테라 {TYPE_KO[mon.tera] || mon.tera}</span>}
        </span>
        <span className="hud-hp">{mon.hpText}</span>
      </div>
      <div className="hud-balls" aria-label={side === 'p1' ? '내 팀 상태' : '상대 팀 상태'}>
        {balls.map((b, i) => <i key={i} className={`ball ${b}`} />)}
      </div>
    </div>
  );
}

export function Field({ frame, state, prompt, playing, onInspect }: { frame: Frame; state: GameState; prompt: string; playing: boolean; onInspect?: (side: Side) => void }) {
  const myBalls = state.me.team.map(m => (m.fainted ? 'down' : 'ok') as 'ok' | 'down');
  const foeBalls: ('ok' | 'down' | 'unknown')[] = [
    ...state.foe.team.map(m => (m.fainted ? 'down' : 'ok') as 'ok' | 'down'),
    ...Array.from({ length: Math.max(0, state.foe.total - state.foe.team.length) }, () => 'unknown' as const),
  ];
  const fx = frame.fx;
  // fx is cleared on every event, so the class comes off and back on and the shake restarts
  const shaking = fx?.kind === 'quake';
  return (
    <section className={`stage${shaking ? ' quake' : ''}`} aria-label="배틀 필드">
      <div className="stage-sky" aria-hidden="true" />
      <div className="stage-ground" aria-hidden="true" />
      {(['p2', 'p1'] as Side[]).map(side => {
        const mon = frame[side];
        return (
          <div key={side} className={`spot spot-${side}`}>
            <div className="platform" aria-hidden="true" />
            {mon && (
              <div key={`${mon.spriteid}-${mon.animKey}`} className={`mon ${mon.anim ? `a-${mon.anim}` : ''}${mon.fainted && mon.anim !== 'faint' ? ' gone' : ''}`}>
                <FieldSprite id={mon.spriteid} back={side === 'p1'} alt={mon.species} />
                {mon.anim === 'boost-up' && <span className="boost-fx up" aria-hidden="true" />}
                {mon.anim === 'boost-down' && <span className="boost-fx down" aria-hidden="true" />}
              </div>
            )}
          </div>
        );
      })}
      {fx?.kind === 'orb' && <span key={fx.key} className={`orb from-${fx.from} t-${fx.type}`} aria-hidden="true" />}
      {fx?.kind === 'flash' && <span key={fx.key} className="flash" aria-hidden="true" />}
      {frame.p2 && <Hud side="p2" mon={frame.p2} balls={foeBalls} onInspect={onInspect && !playing ? () => onInspect('p2') : undefined} />}
      {frame.p1 && <Hud side="p1" mon={frame.p1} balls={myBalls} onInspect={onInspect && !playing ? () => onInspect('p1') : undefined} />}
      <div className="msgbox" aria-live="polite">
        <span key={playing ? frame.message : prompt}>{playing ? frame.message : prompt}</span>
      </div>
    </section>
  );
}
