// 「이 평가가 이상해요」: players flag a coach verdict. Each report is one JSON line with the position, so it can be
// re-evaluated later (scripts/grade-stability.mjs --feedback). The folder is a Docker volume on the server.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(process.env.FEEDBACK_DIR || 'feedback');
export const FEEDBACK_FILE = join(DIR, 'feedback.jsonl');

export function saveFeedback(record) {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(FEEDBACK_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
  const r = record.review;
  console.log(`[feedback] ${record.format}${record.story ? ` ${record.story}` : ''} ${r.turn}턴 ${r.gradeLabel} (${r.choiceLabel} / 최선 ${r.bestLabel})${record.note ? `: ${record.note}` : ''}`);
}
