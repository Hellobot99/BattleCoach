import { useState } from 'react';
import { spriteUrls } from './api';
import type { GradeKey } from './types';

export const TYPE_KO: Record<string, string> = {
  Normal: '노말', Fire: '불꽃', Water: '물', Electric: '전기', Grass: '풀', Ice: '얼음',
  Fighting: '격투', Poison: '독', Ground: '땅', Flying: '비행', Psychic: '에스퍼', Bug: '벌레',
  Rock: '바위', Ghost: '고스트', Dragon: '드래곤', Dark: '악', Steel: '강철', Fairy: '페어리', Stellar: '스텔라',
};
export const STATUS_KO: Record<string, string> = { brn: '화상', par: '마비', slp: '잠듦', psn: '독', tox: '맹독', frz: '얼음' };
export const CATEGORY_KO: Record<string, string> = { Physical: '물리', Special: '특수', Status: '변화' };
export const STAT_KO: Record<string, string> = { atk: '공', def: '방', spa: '특공', spd: '특방', spe: '스피드', accuracy: '명중', evasion: '회피' };

/** Reason tag -> lesson in the curriculum (C01). */
export const TAG_LESSON: Record<string, string> = {
  type_immune: 'L1 타입 상성 다시 보기',
  type_se: 'L1 타입 상성 다시 보기',
  resisted: 'L1 타입 상성 다시 보기',
  outspeed: 'L2 누가 먼저 움직이나',
  ko_now: 'L3 쓰러뜨릴 수 있나',
  stay_bad: 'L4 교체는 지는 게 아니다',
  switch_safe: 'L4 교체는 지는 게 아니다',
  free_turn: 'L4 교체는 지는 게 아니다',
  tera_flip: 'L6 테라스탈 언제 쓰나',
  mega_timing: 'L12 메가진화 언제 쓰나',
};

export function Sprite({ id, back = false, size = 96, dim = false, alt }: { id: string; back?: boolean; size?: number; dim?: boolean; alt: string }) {
  const urls = spriteUrls(id, back);
  const [i, setI] = useState(0);
  if (i >= urls.length) return <div className="sprite-missing" style={{ width: size, height: size }} aria-label={alt} />;
  return (
    <img
      className={`sprite${dim ? ' dim' : ''}`}
      src={urls[i]}
      alt={alt}
      width={size}
      height={size}
      onError={() => setI(i + 1)}
      draggable={false}
    />
  );
}

export function TypeChip({ type, small = false }: { type: string; small?: boolean }) {
  return <span className={`type t-${type}${small ? ' small' : ''}`}>{TYPE_KO[type] || type}</span>;
}

export function GradeChip({ grade, sym, label, compact = false }: { grade: GradeKey; sym: string; label: string; compact?: boolean }) {
  return (
    <span className={`grade g-${grade}`} title={label}>
      <i aria-hidden="true">{sym}</i>
      {!compact && label}
    </span>
  );
}

export function HpBar({ pct }: { pct: number }) {
  const tone = pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'low';
  return (
    <div className="hpbar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="체력">
      <div className={`hpfill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function WinBar({ w, pending }: { w: number | null; pending: boolean }) {
  const pct = w === null ? 50 : Math.round(w * 100);
  return (
    <div className="winbar" aria-label={`내 승률 추정 ${pct}%`}>
      <div className="winbar-track">
        <div className="winbar-me" style={{ width: `${pct}%` }} />
      </div>
      <div className="winbar-label">
        <span>
          내 승률 추정 <b>{w === null ? '–' : `${pct}%`}</b>
        </span>
        <span className="muted">{pending ? '코치가 계산 중…' : '롤아웃 추정치'}</span>
      </div>
    </div>
  );
}

/** 이/가 after a Korean word (both forms for anything else). */
export function iga(word: string) {
  const code = word.trim().slice(-1).charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return word + ((code - 0xac00) % 28 ? '이' : '가');
  return word + '이(가)';
}

export function effLabel(eff: number | null | undefined) {
  if (eff === null || eff === undefined) return null;
  if (eff === 0) return { text: '효과 없음', tone: 'none' };
  if (eff >= 4) return { text: '효과가 굉장함 ×4', tone: 'se' };
  if (eff >= 2) return { text: '효과가 굉장함 ×2', tone: 'se' };
  if (eff <= 0.25) return { text: '효과가 별로 ×¼', tone: 'nve' };
  if (eff < 1) return { text: '효과가 별로 ×½', tone: 'nve' };
  return { text: '보통', tone: 'neutral' };
}
