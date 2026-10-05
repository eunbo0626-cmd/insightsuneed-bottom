import fs from 'node:fs';
import path from 'node:path';

export type Dist = { cagr: number[]; opm: number[]; roe: number[]; debt: number[]; cur: number[] };
export type Group = {
  label: string; n: number; dist: Dist;
  med: Record<keyof Dist, number | null>; q1: Record<keyof Dist, number | null>; q3: Record<keyof Dist, number | null>;
  aggGrowth: number | null; aggOpm: number | null; lossShare: number | null; totalRev: number;
  top: { code: string; name: string; rev: number; opm: number | null; cagr: number | null }[];
};
export type Bench = { market: 'KR' | 'US'; builtAt: string; source: string; total: number; all: Group; groups: Record<string, Group> };

const cache: Partial<Record<'KR' | 'US', Bench | null>> = {};
export function bench(market: 'KR' | 'US'): Bench | null {
  if (market in cache) return cache[market]!;
  try {
    const f = path.join(process.cwd(), 'data', market === 'KR' ? 'kr-bench.json' : 'us-bench.json');
    cache[market] = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { cache[market] = null; }
  return cache[market]!;
}

export function industryKeyKR(induty?: string, hasCurrentAssets = false) { const k = (induty || '').slice(0, 2); return k === '64' && hasCurrentAssets ? 'HOLD' : k; }

/** v 이하인 값의 비율(0~1). 값이 클수록 순위가 높음 */
export function rankPct(sorted: number[], v: number | null | undefined): number | null {
  if (v === null || v === undefined || !isFinite(v) || !sorted.length) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
  // 동점 보정: 같은 값의 중간 지점
  let eq = 0; for (let i = lo - 1; i >= 0 && sorted[i] === v; i--) eq++;
  return (lo - eq / 2) / sorted.length;
}

/** 비교 그룹 고르기: 업종 표본이 충분하면 업종, 아니면 전체 상장사 */
export function peerGroup(market: 'KR' | 'US', key?: string): { g: Group; scope: 'industry' | 'market'; label: string; key?: string } | null {
  const b = bench(market); if (!b) return null;
  const g = key ? b.groups[key] : undefined;
  if (g && g.n >= 10) return { g, scope: 'industry', label: g.label, key };
  return { g: b.all, scope: 'market', label: market === 'KR' ? '전체 상장사' : '미국 전체 상장사', key: g ? key : undefined };
}
