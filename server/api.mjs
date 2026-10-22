// JSON API. The Vite dev server mounts it (`npm run dev`); server/prod.mjs serves it with the built page (`npm start`).
import { createGame, getGame, retryGame } from './game.mjs';
import { storyList } from './story.mjs';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// a public server caps how fast one address can start battles (each battle keeps the CPU busy)
const GAMES_PER_HOUR = Number(process.env.GAMES_PER_HOUR || 0); // 0 = no limit
const started = new Map(); // ip -> start times

function allowNewGame(ip) {
  if (!GAMES_PER_HOUR) return true;
  const now = Date.now();
  const recent = (started.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= GAMES_PER_HOUR) return false;
  recent.push(now);
  started.set(ip, recent);
  return true;
}

/** Handles a request whose path has had the `/api` prefix removed. */
export async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const parts = url.pathname.split('/').filter(Boolean); // ['games', id?, action?]
  if (parts[0] === 'health') return send(res, 200, { ok: true });
  if (parts[0] === 'story' && req.method === 'GET') return send(res, 200, storyList());
  if (parts[0] !== 'games') return send(res, 404, { error: 'not found' });

  if (parts.length === 1 && req.method === 'POST') {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!allowNewGame(ip)) return send(res, 429, { error: '배틀을 너무 많이 시작했어요. 잠시 뒤에 다시 해 주세요.' });
    const body = await readBody(req);
    return send(res, 200, createGame(body).state());
  }
  const game = getGame(parts[1]);
  if (!game) return send(res, 404, { error: '배틀을 찾을 수 없어요. 새로 시작해 주세요.' });

  if (parts.length === 2 && req.method === 'GET') {
    if (url.searchParams.get('wait') === 'eval') await game.waitEval();
    return send(res, 200, game.state());
  }
  if (parts[2] === 'choose' && req.method === 'POST') {
    const body = await readBody(req);
    await game.choose(String(body.choice || ''), { timeout: !!body.timeout });
    return send(res, 200, game.state());
  }
  if (parts[2] === 'retry' && req.method === 'POST') {
    const body = await readBody(req);
    return send(res, 200, retryGame(game.id, body.index).state());
  }
  if (parts[2] === 'feedback' && req.method === 'POST') {
    const body = await readBody(req);
    return send(res, 200, { saved: game.feedback(Number(body.index), body.note || '') });
  }
  if (parts[2] === 'hint' && req.method === 'POST') {
    const hint = await game.hint();
    return send(res, 200, { hint, state: game.state() });
  }
  return send(res, 404, { error: 'not found' });
}

export function battleApi() {
  return {
    name: 'battle-coach-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        handle(req, res).catch(err => {
          console.error('[api]', err);
          send(res, 400, { error: err.message || String(err) });
        });
      });
    },
  };
}
