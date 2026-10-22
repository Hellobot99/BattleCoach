// Korean particles. Hangul words get the right form; other words (English Pokémon names) get both forms.
function hasBatchim(word) {
  const code = word.trim().slice(-1).charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return null;
}

function pick(word, withBatchim, without, both) {
  const b = hasBatchim(word);
  if (b === null) return word + both;
  return word + (b ? withBatchim : without);
}

export const eun = w => pick(w, '은', '는', '은(는)');
export const eul = w => pick(w, '을', '를', '을(를)');
export const iga = w => pick(w, '이', '가', '이(가)');
export const ro = w => {
  const code = w.trim().slice(-1).charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return w + (jong === 0 || jong === 8 ? '로' : '으로');
  }
  return w + '(으)로';
};
