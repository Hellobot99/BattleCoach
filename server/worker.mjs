import { parentPort } from 'node:worker_threads';
import { runRollouts } from './rollout.mjs';

parentPort.on('message', ({ id, task }) => {
  try {
    parentPort.postMessage({ id, result: runRollouts(task) });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err?.stack || err) });
  }
});
