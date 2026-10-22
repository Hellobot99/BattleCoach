import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { Battle } from './Battle';
import { Lobby, type LobbyOptions } from './Lobby';
import { Preview } from './Preview';
import { ReviewScreen } from './ReviewScreen';
import type { GameState } from './types';
import { sound, useSound } from './sound';

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [opts, setOpts] = useState<LobbyOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = useRef<string | null>(null);
  // how much of each game's log the field has finished animating (the review waits for the last turn)
  const [animated, setAnimated] = useState<{ id: string; len: number }>({ id: '', len: 0 });

  const run = useCallback(async (fn: () => Promise<GameState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // when a new decision arrives, wait for the coach's evaluation to refresh the win bar and enable hints
  useEffect(() => {
    const d = state?.decision;
    if (!state || !d || d.kind === 'preview' || d.evalReady) return;
    const key = `${state.id}-${d.kind}-${d.turn}-${state.reviews.length}`;
    if (waiting.current === key) return;
    waiting.current = key;
    api.get(state.id, true).then(s => {
      setState(cur => (cur && cur.id === s.id && cur.reviews.length === s.reviews.length && cur.turn === s.turn ? s : cur));
    }).catch(() => {});
  }, [state]);

  const start = (o: LobbyOptions) => {
    sound.startMusic(); // inside the click, so the browser lets it play
    setOpts(o);
    run(() => api.create(o));
  };
  const leave = () => {
    sound.stopMusic();
    setState(null);
  };
  const reviewing = !!state?.ended && animated.id === state.id && animated.len >= state.log.length;
  useEffect(() => {
    if (reviewing) sound.stopMusic();
  }, [reviewing]);

  if (!state) {
    return (
      <Shell>
        <Lobby onStart={start} busy={busy} error={error} />
      </Shell>
    );
  }

  const id = state.id;
  let body;
  if (reviewing) {
    body = <ReviewScreen state={state} onAgain={() => opts && start(opts)} onLobby={leave} />;
  } else if (state.decision?.kind === 'preview') {
    body = <Preview state={state} busy={busy} onChoose={c => run(() => api.choose(id, c))} />;
  } else {
    body = (
      <Battle
        state={state}
        busy={busy}
        onChoose={(c, timeout) => run(() => api.choose(id, c, timeout))}
        onHint={() => run(async () => (await api.hint(id)).state)}
        onAnimated={(gameId, len) => setAnimated({ id: gameId, len })}
      />
    );
  }

  return (
    <Shell
      top={
        <div className="topbar-info">
          <span>{state.formatLabel}</span>
          <span className="muted">
            AI {state.ai} · {state.coaching === 'beginner' ? '입문' : state.coaching === 'real' ? '실전' : '리뷰만'}
            {state.timer ? ' · 45초' : ''}
          </span>
          <button className="ghost small" onClick={leave}>
            나가기
          </button>
        </div>
      }
    >
      {error && <p className="error">{error}</p>}
      {body}
    </Shell>
  );
}

function SoundControl() {
  const s = useSound();
  const off = s.muted || s.volume === 0;
  return (
    <div className="sound-ctl">
      <button className="sound-btn" onClick={() => sound.setMuted(!off)} aria-label={off ? '소리 켜기' : '소리 끄기'} aria-pressed={!off} title={off ? '소리 켜기' : '소리 끄기'}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {off ? (
            <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      <input
        id="volume"
        className="volume"
        type="range"
        min={0}
        max={100}
        value={Math.round((s.muted ? 0 : s.volume) * 100)}
        onChange={e => sound.setVolume(Number(e.target.value) / 100)}
        aria-label="볼륨"
      />
    </div>
  );
}

function Shell({ children, top }: { children: ReactNode; top?: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BATTLE COACH</span>
        {top}
        <SoundControl />
      </header>
      <main className="content">{children}</main>
      <footer className="credits">
        비상업 팬 프로젝트입니다. 포켓몬 이름과 그림의 권리는 Nintendo · Creatures · GAME FREAK에 있습니다. 배틀 엔진과 스프라이트는{' '}
        <a href="https://pokemonshowdown.com" target="_blank" rel="noreferrer">
          Pokémon Showdown
        </a>
        에서 가져왔습니다(배틀 음악과 울음소리 포함). 프로토타입 평가기는 상대 세트를 모두 아는 상태로 계산합니다.
      </footer>
    </div>
  );
}
