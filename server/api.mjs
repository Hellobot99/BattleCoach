// JSON API mounted on the Vite dev server (`npm run dev`), so the page and the simulator run from one command.
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

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const parts = url.pathname.split('/').filter(Boolean); // ['games', id?, action?]
  if (parts[0] === 'story' && req.method === 'GET') return send(res, 200, storyList());
  if (parts[0] !== 'games') return send(res, 404, { error: 'not found' });

  if (parts.length === 1 && req.method === 'POST') {
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
