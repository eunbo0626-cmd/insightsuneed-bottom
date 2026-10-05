// 시세·주식 수 데이터
// - 국내 일봉·지수: 네이버 금융 차트 데이터
// - 미국 일봉·지수: Yahoo Finance 차트 데이터
// - 국내 주식 수: 금융감독원 OpenDART 주식총수 현황
// - 미국 주식 수: SEC EDGAR (dei:EntityCommonStockSharesOutstanding)
import { companyFacts } from './sec';

export type Bar = { d: string; c: number; v: number };
export type Series = { bars: Bar[]; source: string };

async function naver(symbol: string, count: number): Promise<Bar[]> {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${encodeURIComponent(symbol)}&timeframe=day&count=${count}&requestType=0`;
  const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('시세 조회 실패');
  const text = await res.text();
  const out: Bar[] = [];
  const re = /data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const c = Number(m[5]);
    if (c > 0) out.push({ d: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}`, c, v: Number(m[6]) });
  }
  return out;
}

async function yahoo(symbol: string, range: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('시세 조회 실패');
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0] ?? {};
  const adj: (number | null)[] | undefined = r?.indicators?.adjclose?.[0]?.adjclose;
  const out: Bar[] = [];
  ts.forEach((t, i) => {
    const c = adj?.[i] ?? q.close?.[i];
    if (typeof c === 'number' && c > 0) out.push({ d: new Date(t * 1000).toISOString().slice(0, 10), c, v: q.volume?.[i] ?? 0 });
  });
  return out;
}

export async function stockSeries(market: 'KR' | 'US', code: string): Promise<Series> {
  if (market === 'KR') return { bars: await naver(code, 1300), source: '네이버 금융 일별 시세' };
  return { bars: await yahoo(code.replace('.', '-'), '5y'), source: 'Yahoo Finance 일별 시세(배당·분할 조정)' };
}

export async function indexSeries(market: 'KR' | 'US', krMarket?: string): Promise<{ name: string; bars: Bar[] } | null> {
  try {
    if (market === 'KR') {
      const kosdaq = krMarket === '코스닥';
      return { name: kosdaq ? '코스닥' : '코스피', bars: await naver(kosdaq ? 'KOSDAQ' : 'KOSPI', 300) };
    }
    return { name: 'S&P 500', bars: await yahoo('^GSPC', '1y') };
  } catch { return null; }
}

const n = (s?: string) => { const v = Number(String(s ?? '').replace(/,/g, '')); return isFinite(v) && v > 0 ? v : null; };

export async function sharesKR(corpCode: string): Promise<{ shares: number; basis: string } | null> {
  const key = process.env.DART_API_KEY;
  if (!key) return null;
  const y = new Date().getFullYear();
  const tries: [number, string][] = [[y, '11014'], [y, '11012'], [y, '11013'], [y - 1, '11011'], [y - 2, '11011']];
  for (const [yr, rp] of tries) {
    try {
      const qs = new URLSearchParams({ crtfc_key: key, corp_code: corpCode, bsns_year: String(yr), reprt_code: rp });
      const res = await fetch(`https://opendart.fss.or.kr/api/stockTotqySttus.json?${qs}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15000) });
      const j = await res.json();
      if (j.status !== '000' || !Array.isArray(j.list)) continue;
      const row = j.list.find((r: any) => r.se === '보통주') ?? j.list.find((r: any) => /합계/.test(r.se));
      const s = n(row?.distb_stock_co) ?? n(row?.istc_totqy);
      if (s) return { shares: s, basis: `보통주 유통주식수(${row.stlm_dt ?? yr} 기준)` };
    } catch { /* 다음 보고서 시도 */ }
  }
  return null;
}

export async function sharesUS(cik: number): Promise<{ shares: number; basis: string } | null> {
  try {
    const f = await companyFacts(cik);
    const arr: any[] = f?.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
    if (!arr.length) return null;
    const last = [...arr].sort((a, b) => String(a.end).localeCompare(String(b.end))).pop();
    return last?.val ? { shares: Number(last.val), basis: `보통주 발행주식수(${last.end} 기준)` } : null;
  } catch { return null; }
}
