export function won(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '자료 없음';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(a >= 1e13 ? 1 : 2)}조`;
  if (a >= 1e8) return `${sign}${Math.round(a / 1e8).toLocaleString('ko-KR')}억`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a).toLocaleString('ko-KR')}`;
}
export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !isFinite(x)) return '자료 없음';
  return `${(x * 100).toFixed(digits)}%`;
}
export function times(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !isFinite(x)) return '자료 없음';
  return `${x.toFixed(digits)}배`;
}
export function ymd(s: string): string {
  return s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s;
}
export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '자료 없음';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e11 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
}
export function money(n: number | null | undefined, cur: 'KRW' | 'USD'): string { return cur === 'USD' ? usd(n) : won(n); }
// 받침 유무에 따라 '이에요/예요' 선택
export function yeyo(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  return word + (has ? '이에요' : '예요');
}
export function price(n: number | null | undefined, cur: 'KRW' | 'USD'): string {
  if (n === null || n === undefined || !isFinite(n)) return '-';
  return cur === 'USD' ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${Math.round(n).toLocaleString('ko-KR')}원`;
}
