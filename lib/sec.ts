// 미국 SEC EDGAR 공개 데이터 (공공 자료, 인증키 불필요, User-Agent 필수)
const UA = process.env.SEC_USER_AGENT || 'insightsuneed research contact@insightsuneed.app';
const H = { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' };

async function secJson(url: string, revalidate = 21600) {
  const res = await fetch(url, { headers: H, next: { revalidate } });
  if (!res.ok) throw new Error(`SEC 호출 실패 (HTTP ${res.status})`);
  return res.json();
}
async function secText(url: string, revalidate = 86400) {
  const res = await fetch(url, { headers: H, next: { revalidate } });
  if (!res.ok) throw new Error(`SEC 호출 실패 (HTTP ${res.status})`);
  return res.text();
}
export const pad10 = (cik: number | string) => String(cik).padStart(10, '0');

// ---------- 종목 목록 ----------
export type UsTicker = { cik: number; ticker: string; title: string };
export type UsFund = { cik: number; seriesId: string; classId: string; ticker: string };
let tCache: { at: number; stocks: UsTicker[]; funds: UsFund[] } | null = null;

export async function usTickers() {
  if (tCache && Date.now() - tCache.at < 24 * 3600e3) return tCache;
  const [a, b] = await Promise.all([
    secJson('https://www.sec.gov/files/company_tickers.json', 86400),
    secJson('https://www.sec.gov/files/company_tickers_mf.json', 86400),
  ]);
  const stocks: UsTicker[] = Object.values(a as Record<string, any>).map((r: any) => ({ cik: r.cik_str, ticker: r.ticker, title: r.title }));
  const funds: UsFund[] = (b.data as any[]).map(r => ({ cik: r[0], seriesId: r[1], classId: r[2], ticker: r[3] }));
  tCache = { at: Date.now(), stocks, funds };
  return tCache;
}

// 상장 신탁형 ETF(SPY, DIA 등)는 펀드 목록에 없고 일반 목록에 있음
const UIT_ETF = new Set(['SPY', 'DIA', 'MDY', 'QQQM']);
export async function findUs(tk: string): Promise<{ kind: 'stock'; t: UsTicker } | { kind: 'etf'; f: UsFund | null; t: UsTicker | null } | null> {
  const T = tk.toUpperCase().replace('.', '-');
  const { stocks, funds } = await usTickers();
  const f = funds.find(x => x.ticker === T);
  const t = stocks.find(x => x.ticker === T) ?? null;
  if (f) return { kind: 'etf', f, t };
  if (t && (UIT_ETF.has(T) || /\bETF\b|\bTRUST\b.*\b(SPDR|INDEX)\b|\bSPDR\b/i.test(t.title))) return { kind: 'etf', f: null, t };
  if (t) return { kind: 'stock', t };
  return null;
}

// ---------- 기업 데이터 ----------
const mem = new Map<string, { at: number; p: Promise<any> }>();
function cached(k: string, ttl: number, f: () => Promise<any>) { const c = mem.get(k); if (c && Date.now() - c.at < ttl) return c.p; const p = f().catch(e => { mem.delete(k); throw e; }); mem.set(k, { at: Date.now(), p }); if (mem.size > 400) mem.delete(mem.keys().next().value!); return p; }
export const companyFacts = (cik: number) => cached('f' + cik, 6 * 3600e3, () => secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`));
export const submissions = (cik: number) => cached('s' + cik, 3600e3, () => secJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`, 3600));
export const filingUrl = (cik: number, acc: string, doc: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${doc}`;

export async function goingConcernHits(cik: number): Promise<{ hits: number; url?: string }> {
  try {
    const end = new Date(); const start = new Date(end.getTime() - 450 * 86400e3);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const q = encodeURIComponent('"substantial doubt" "going concern"');
    const j = await secJson(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=10-K&ciks=${pad10(cik)}&dateRange=custom&startdt=${f(start)}&enddt=${f(end)}`, 86400);
    const n = j?.hits?.total?.value ?? 0;
    const h = j?.hits?.hits?.[0]?._source;
    const id = j?.hits?.hits?.[0]?._id as string | undefined;
    const url = h && id ? filingUrl(cik, h.adsh, id.split(':')[1]) : undefined;
    return { hits: n, url };
  } catch { return { hits: 0 }; }
}

// ---------- 연간 재무 추출 ----------
type Fact = { start?: string; end: string; val: number; form: string; fp?: string; fy?: number; filed: string };
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400e3;

export function annualSeries(facts: any, tags: string[], kind: 'flow' | 'instant', ends: string[]): { vals: (number | undefined)[]; tag?: string }[] {
  const g = facts?.facts?.['us-gaap'] ?? {};
  return tags.map(tag => {
    const u: Fact[] | undefined = g[tag]?.units?.USD;
    if (!u) return { vals: ends.map(() => undefined) };
    const vals = ends.map(end => {
      const c = u.filter(r => r.end === end && /^10-K/.test(r.form) && (kind === 'instant' ? !r.start : r.start && days(r.start, r.end) > 330 && days(r.start, r.end) < 380));
      if (!c.length) return undefined;
      c.sort((a, b) => b.filed.localeCompare(a.filed));
      return c[0].val;
    });
    return { vals, tag };
  });
}

export function fiscalYearEnds(facts: any): string[] {
  const g = facts?.facts?.['us-gaap'] ?? {};
  const u: Fact[] = g.Assets?.units?.USD ?? g.StockholdersEquity?.units?.USD ?? [];
  const ends = [...new Set(u.filter(r => /^10-K/.test(r.form) && r.fp === 'FY').map(r => r.end))].sort().reverse();
  // 10-K는 당기·전기를 함께 싣기 때문에, 서로 300일 이상 떨어진 결산일만 남김
  const out: string[] = [];
  for (const e of ends) if (!out.length || days(e, out[out.length - 1]) > 300) out.push(e);
  return out.slice(0, 3);
}

// ---------- 8-K 위험 항목 ----------
export const ITEM_CRIT: Record<string, string> = {
  '1.03': '파산·법정관리 신청', '3.01': '상장폐지 통보·상장요건 미달', '4.02': '과거 재무제표 신뢰 불가(재작성)',
};
export const ITEM_WARN: Record<string, string> = {
  '2.04': '채무 조기상환 요구 사유 발생', '4.01': '감사인 교체', '3.02': '신주 발행(지분 희석)', '5.01': '경영권 변경',
  '2.06': '대규모 자산 손상', '2.05': '구조조정 비용', '1.02': '중요 계약 해지', '3.03': '주주 권리 변경',
};

// ---------- ETF: N-PORT 보유내역 ----------
export type Holding = {
  name: string; title: string; cusip?: string; isin?: string; ticker?: string;
  value: number; pct: number; assetCat: string; issuerCat?: string; country?: string; currency?: string;
  payoff?: string; deriv?: { cat: string; notional?: number; payoff?: string; counterparty?: string; ref?: string };
};
export type Nport = { seriesName: string; seriesId?: string; reportDate: string; filedUrl: string; netAssets: number; holdings: Holding[]; dv100: number | null };

const tag = (s: string, t: string) => s.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1];
const unesc = (s?: string) => (s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

export function parseNport(xml: string, filedUrl: string): Nport {
  const items = xml.match(/<invstOrSec>[\s\S]*?<\/invstOrSec>/g) ?? [];
  const holdings: Holding[] = items.map(it => {
    const di = it.match(/<derivativeInfo>[\s\S]*?<\/derivativeInfo>/)?.[0];
    let deriv: Holding['deriv'];
    if (di) {
      const cat = di.match(/derivCat="([^"]+)"/)?.[1] ?? '?';
      const notional = Number(tag(di, 'notionalAmt') ?? NaN);
      const payoff = tag(di, 'payOffProf');
      const counterparty = unesc(tag(di, 'counterpartyName'));
      const ref = unesc(tag(di, 'indexName') ?? tag(di, 'name'));
      // 스왑: 수취 레그가 기초자산 수익률이면 롱
      let p = payoff;
      if (!p && /swapDeriv/.test(di)) {
        // 금리(FEDL01, SOFR 등)를 내는 쪽이면 기초자산 수익을 받는 롱, 금리를 받는 쪽이면 숏
        const rateIdx = (t: string) => { const m = di.match(new RegExp('<' + t + '[^>]*floatingRtIndex="([^"]+)"')); return m && m[1] !== 'N/A' ? m[1] : null; };
        const fixed = (t: string) => new RegExp('<' + t + '[^>]*fixedOrFloating="Fixed"').test(di);
        if (rateIdx('floatingPmntDesc') || fixed('fixedPmntDesc')) p = 'Long';
        else if (rateIdx('floatingRecDesc') || fixed('fixedRecDesc')) p = 'Short';
        else p = 'Long';
      }
      deriv = { cat, notional: isFinite(notional) ? notional : undefined, payoff: p, counterparty, ref };
    }
    const assetCat = tag(it, 'assetCat') ?? it.match(/<assetConditional[^>]*assetCat="([^"]+)"/)?.[1] ?? (deriv ? 'DE' : '?');
    return {
      name: unesc(tag(it, 'name')),
      title: (() => { const t0 = unesc(tag(it, 'title')); const mat = tag(it, 'maturityDt'); const cpn = tag(it, 'annualizedRt'); return mat ? `${t0} ${cpn ? Number(cpn).toFixed(2) + '% ' : ''}${mat.slice(0, 7)} 만기` : t0; })(),
      cusip: tag(it, 'cusip'), isin: it.match(/<isin value="([^"]+)"/)?.[1],
      ticker: it.match(/<ticker value="([^"]+)"/)?.[1],
      value: Number(tag(it, 'valUSD') ?? 0), pct: Number(tag(it, 'pctVal') ?? 0) / 100,
      assetCat, issuerCat: tag(it, 'issuerCat') ?? it.match(/issuerCat="([^"]+)"/)?.[1],
      country: tag(it, 'invCountry'), currency: tag(it, 'curCd') ?? it.match(/<currencyConditional curCd="([^"]+)"/)?.[1],
      payoff: tag(it, 'payoffProfile'), deriv,
    };
  });
  return {
    seriesName: unesc(tag(xml, 'seriesName')), seriesId: tag(xml, 'seriesId'),
    reportDate: tag(xml, 'repPdDate') ?? '', filedUrl,
    netAssets: Number(tag(xml, 'netAssets') ?? 0), holdings,
    dv100: (() => { const bl = xml.match(/<intrstRtRiskdv100[^>]*>/g); if (!bl) return null; let t = 0; for (const b of bl) for (const m of b.matchAll(/period\w+="(-?[\d.]+)"/g)) t += Math.abs(Number(m[1])); return t || null; })(),
  };
}

export async function latestNport(cik: number, seriesId?: string): Promise<Nport | null> {
  let filings: { url: string }[] = [];
  if (seriesId) {
    const atom = await secText(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${seriesId}&type=NPORT-P&dateb=&owner=include&count=5&output=atom`, 21600);
    filings = [...atom.matchAll(/<filing-href>([^<]+)<\/filing-href>/g)].map(m => ({ url: m[1].replace(/-index\.htm$/, '').replace(/\/[^/]+$/, '/primary_doc.xml') }));
  } else {
    const s = await submissions(cik);
    const r = s.filings.recent;
    for (let i = 0; i < r.form.length && filings.length < 3; i++) if (r.form[i] === 'NPORT-P') filings.push({ url: filingUrl(cik, r.accessionNumber[i], 'primary_doc.xml') });
  }
  for (const f of filings) {
    try {
      const xml = await secText(f.url, 7 * 86400);
      const np = parseNport(xml, f.url.replace(/primary_doc\.xml$/, ''));
      if (!seriesId || !np.seriesId || np.seriesId === seriesId) return np;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

// ---------- SIC → 섹터 ----------
export function sicSector(sic?: number | string): string {
  const n = Number(sic);
  if (!n) return '기타';
  if (n === 6770) return '스팩(SPAC)';
  if (n >= 3670 && n <= 3679) return '반도체·전자부품';
  if ((n >= 3570 && n <= 3579) || n === 3661 || n === 3663 || n === 3669) return 'IT 하드웨어';
  if (n >= 7370 && n <= 7379) return '소프트웨어·인터넷';
  if (n >= 4800 && n <= 4899) return '통신·미디어';
  if (n >= 2830 && n <= 2836 || n >= 8000 && n <= 8099 || n >= 3841 && n <= 3851) return '헬스케어';
  if (n >= 6000 && n <= 6799) return '금융';
  if (n >= 5000 && n <= 5199) return '도매·유통';
  if (n >= 5200 && n <= 5999 || n >= 7000 && n <= 7099) return '소비재·소매';
  if (n >= 2000 && n <= 2199) return '음식료';
  if (n >= 1300 && n <= 1399 || n >= 2900 && n <= 2999) return '에너지';
  if (n >= 4900 && n <= 4999) return '유틸리티';
  if (n >= 3710 && n <= 3716) return '자동차';
  if (n >= 3720 && n <= 3729 || n >= 3760 && n <= 3769) return '항공·방산';
  if (n >= 2800 && n <= 2899) return '화학·소재';
  if (n >= 1000 && n <= 1499 || n >= 3300 && n <= 3399) return '금속·광업';
  if (n >= 4000 && n <= 4799) return '운송';
  if (n >= 1500 && n <= 1799 || n === 6798) return '건설·리츠';
  if (n >= 3400 && n <= 3599 || n >= 3600 && n <= 3699 || n >= 3800 && n <= 3899) return '산업재·장비';
  if (n >= 2200 && n <= 2799 || n >= 3000 && n <= 3299 || n >= 3900 && n <= 3999) return '생활소재·제조';
  if (n >= 7800 && n <= 7999) return '미디어·레저';
  if (n >= 7200 && n <= 7799 || n >= 8100 && n <= 8999) return '비즈니스·전문 서비스';
  if (n >= 100 && n <= 999) return '농림·어업';
  return '기타';
}

// ---------- 10-Q: 올해 누적(YTD)과 작년 같은 기간 ----------
export function latestQuarterEnd(facts: any, annualEnd: string): string | null {
  const g = facts?.facts?.['us-gaap'] ?? {};
  const u: Fact[] = g.Assets?.units?.USD ?? g.StockholdersEquity?.units?.USD ?? [];
  const ends = u.filter(r => r.form === '10-Q' && r.end > annualEnd).map(r => r.end).sort();
  return ends.length ? ends[ends.length - 1] : null;
}
export function quarterValue(facts: any, tags: string[], kind: 'flow' | 'instant', qEnd: string): { cur?: number; prev?: number; months?: number } {
  const g = facts?.facts?.['us-gaap'] ?? {};
  for (const tag of tags) {
    const u: Fact[] | undefined = g[tag]?.units?.USD;
    if (!u) continue;
    if (kind === 'instant') {
      const c = u.filter(r => r.end === qEnd && !r.start && /^10-Q/.test(r.form)).sort((a, b) => b.filed.localeCompare(a.filed))[0];
      if (c) return { cur: c.val };
      continue;
    }
    const cs = u.filter(r => r.end === qEnd && r.start && /^10-Q/.test(r.form)).sort((a, b) => days(b.start!, b.end) - days(a.start!, a.end));
    const c = cs[0]; if (!c) continue;
    const dur = days(c.start!, c.end);
    if (dur > 300) continue;
    const target = Date.parse(qEnd) - 365 * 86400e3;
    const p = u.filter(r => r.start && Math.abs(Date.parse(r.end) - target) < 16 * 86400e3 && Math.abs(days(r.start, r.end) - dur) < 16)
      .sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { cur: c.val, prev: p?.val, months: Math.round(dur / 30.4) };
  }
  return {};
}
