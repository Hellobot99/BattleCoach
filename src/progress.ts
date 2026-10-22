// Story progress (stars per stage), kept in this browser only.
const KEY = 'battlecoach.story';

export type Progress = Record<string, number>; // stage id -> best stars (1..3)

export function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

/** Stars for a finished stage: a win gives 1, accuracy 70+ gives 2, 85+ gives 3. */
export function starsFor(win: boolean, accuracy: number | null) {
  if (!win) return 0;
  if (accuracy !== null && accuracy >= 85) return 3;
  if (accuracy !== null && accuracy >= 70) return 2;
  return 1;
}

export function saveStars(id: string, stars: number): Progress {
  const p = loadProgress();
  if (stars > (p[id] || 0)) p[id] = stars;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  return p;
}
