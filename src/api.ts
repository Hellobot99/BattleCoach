import type { Coaching, Format, GameState, StoryStage } from './types';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body as T;
}

export const api = {
  create: (opts: { format: Format; ai: number; coaching: Coaching; timer: boolean } | { story: string }) =>
    call<GameState>('/games', { method: 'POST', body: JSON.stringify(opts) }),
  story: () => call<StoryStage[]>('/story'),
  get: (id: string, waitEval = false) => call<GameState>(`/games/${id}${waitEval ? '?wait=eval' : ''}`),
  choose: (id: string, choice: string, timeout = false) =>
    call<GameState>(`/games/${id}/choose`, { method: 'POST', body: JSON.stringify({ choice, timeout }) }),
  retry: (id: string, index: number) => call<GameState>(`/games/${id}/retry`, { method: 'POST', body: JSON.stringify({ index }) }),
  feedback: (id: string, index: number, note: string) =>
    call<{ saved: boolean }>(`/games/${id}/feedback`, { method: 'POST', body: JSON.stringify({ index, note }) }),
  hint: (id: string) =>
    call<{ hint: { level: number; text: string }; state: GameState }>(`/games/${id}/hint`, { method: 'POST' }),
};

const SPRITES = 'https://play.pokemonshowdown.com/sprites';

/** Field sprites: animated 3D-style GIFs first (idle motion like Showdown), then animated pixel, then stills. */
export const fieldSpriteUrls = (id: string, back = false) => [
  `${SPRITES}/${back ? 'ani-back' : 'ani'}/${id}.gif`,
  `${SPRITES}/${back ? 'gen5ani-back' : 'gen5ani'}/${id}.gif`,
  `${SPRITES}/gen5${back ? '-back' : ''}/${id}.png`,
  `${SPRITES}/dex/${id}.png`,
];
export const spriteUrls = (id: string, back = false) => [
  `${SPRITES}/gen5${back ? '-back' : ''}/${id}.png`,
  `${SPRITES}/${back ? 'ani-back' : 'ani'}/${id}.gif`,
  `${SPRITES}/dex/${id}.png`,
];
