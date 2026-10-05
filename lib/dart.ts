import JSZip from 'jszip';
import nodeFs from 'node:fs';
import nodePath from 'node:path';

const BASE = 'https://opendart.fss.or.kr/api';

export type Corp = { corpCode: string; name: string; stockCode: string };

function key() {
  const k = process.env.DART_API_KEY;
  if (!k) throw new Error('DART_API_KEY가 설정되지 않았습니다.');
  return k;
}

async function getJson(path: string, params: Record<string, string>, revalidate = 21600) {
  const qs = new URLSearchParams({ crtfc_key: key(), ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`, { next: { revalidate }, signal: AbortSignal.timeout(20000) }).catch(e => { throw new Error('금감원 DART 서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.'); });
  if (!res.ok) throw new Error(`DART 호출 실패 (${path}, HTTP ${res.status})`);
  return res.json();
}

// ---------- 상장사 목록 (종목코드/회사명 -> 고유번호) ----------
let corpCache: Corp[] | null = null;
let corpCacheAt = 0;

export async function listedCorps(): Promise<Corp[]> {
  if (corpCache && Date.now() - corpCacheAt < 24 * 3600 * 1000) return corpCache;
  // 매달 자동 갱신되는 내장 상장사 목록 우선 사용 (대용량 다운로드 방지)
  try {
    const rows: [string, string, string][] = JSON.parse(nodeFs.readFileSync(nodePath.join(process.cwd(), 'data', 'kr-corps.json'), 'utf8'));
    corpCache = rows.map(([corpCode, name, stockCode]) => ({ corpCode, name, stockCode }));
    corpCacheAt = Date.now();
    return corpCache;
  } catch { /* 없으면 아래에서 DART 목록 다운로드 */ }
  const res = await fetch(`${BASE}/corpCode.xml?crtfc_key=${key()}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('DART 기업코드 조회 실패');
  const buf = await res.arrayBuffer();
  const head = new TextDecoder().decode(buf.slice(0, 200));
  if (head.includes('<status>')) {
    const msg = head.match(/<message>([^<]+)/)?.[1] ?? '알 수 없는 오류';
    throw new Error(`DART 오류: ${msg}`);
  }
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(/\.xml$/i)[0];
  const xml = await file.async('text');
  const best = new Map<string, Corp & { md: string }>();
  const re = /<list>\s*<corp_code>([^<]*)<\/corp_code>\s*<corp_name>([^<]*)<\/corp_name>(?:\s*<corp_eng_name>[^<]*<\/corp_eng_name>)?\s*<stock_code>([^<]*)<\/stock_code>\s*<modify_date>([^<]*)<\/modify_date>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const stock = m[3].trim();
    if (!stock) continue;
    const c = { corpCode: m[1].trim(), name: m[2].trim(), stockCode: stock, md: m[4] };
    const prev = best.get(c.name);
    if (!prev || c.md > prev.md) best.set(c.name, c); // 같은 이름이면 최근 갱신된(현재 상장) 법인 우선
  }
  const out: Corp[] = [...best.values()].map(({ md, ...c }) => c);
  corpCache = out;
  corpCacheAt = Date.now();
  return out;
}

const POPULAR_LIST = ['삼성전자','SK하이닉스','LG에너지솔루션','삼성바이오로직스','현대자동차','기아','셀트리온','KB금융','신한지주','NAVER','카카오','POSCO홀딩스','삼성SDI','LG화학','삼성물산','현대모비스','한화에어로스페이스','HD현대중공업','삼성생명','삼성전기','에코프로','에코프로비엠','알테오젠','하나금융지주','LG전자','SK텔레콤','KT','대한항공','한국전력공사','크래프톤'];
const POPULAR = new Map(POPULAR_LIST.map((n, i) => [n, POPULAR_LIST.length - i] as [string, number]));
export async function searchCorps(q: string, limit = 8): Promise<Corp[]> {
  const query = q.trim().toLowerCase().replace(/\s/g, '');
  if (!query) return [];
  const corps = await listedCorps();
  const scored = corps
    .map(c => {
      const n = c.name.toLowerCase().replace(/\s/g, '');
      let s = -1;
      if (c.stockCode === query) s = 100;
      else if (n === query) s = 90;
      else if (n.startsWith(query)) s = 70 - n.length / 100;
      else if (n.includes(query)) s = 50 - n.length / 100;
      else if (c.stockCode.startsWith(query)) s = 40;
      if (s >= 0 && POPULAR.has(c.name)) s += 25 + POPULAR.get(c.name)! * 0.1;
      return { c, s };
    })
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.c);
}

export async function findCorp(input: string): Promise<Corp | null> {
  const corps = await listedCorps();
  const code = input.replace(/\D/g, '');
  if (code.length === 6) return corps.find(c => c.stockCode === code) ?? null;
  const r = await searchCorps(input, 1);
  return r[0] ?? null;
}

// ---------- 기업 개황 ----------
export async function companyInfo(corpCode: string) {
  const j = await getJson('company.json', { corp_code: corpCode }, 86400);
  if (j.status !== '000') throw new Error(`기업개황 조회 실패: ${j.message}`);
  return j as Record<string, string>;
}

// ---------- 재무제표 (전체) ----------
export type FsRow = {
  sj_div: string; account_id: string; account_nm: string; ord?: string;
  thstrm_amount?: string; frmtrm_amount?: string; bfefrmtrm_amount?: string;
  thstrm_add_amount?: string; frmtrm_add_amount?: string; frmtrm_q_amount?: string;
};

export async function fullStatements(corpCode: string, year: number, reprt = '11011', only?: 'CFS' | 'OFS'): Promise<{ rows: FsRow[]; fsDiv: 'CFS' | 'OFS' } | null> {
  for (const fsDiv of (only ? [only] : ['CFS', 'OFS']) as ('CFS' | 'OFS')[]) {
    const j = await getJson('fnlttSinglAcntAll.json', {
      corp_code: corpCode, bsns_year: String(year), reprt_code: reprt, fs_div: fsDiv,
    });
    if (j.status === '000' && Array.isArray(j.list) && j.list.length) return { rows: j.list, fsDiv };
  }
  return null;
}

// ---------- 감사의견 ----------
export async function auditOpinion(corpCode: string, year: number): Promise<string | null> {
  try {
    const j = await getJson('accnutAdtorNmNdAdtOpinion.json', {
      corp_code: corpCode, bsns_year: String(year), reprt_code: '11011',
    });
    if (j.status !== '000' || !Array.isArray(j.list)) return null;
    const cur = j.list.find((r: any) => /당기/.test(r.bsns_year ?? '')) ?? j.list[0];
    const op = (cur?.adt_opinion ?? '').trim();
    return op && op !== '-' ? op : null;
  } catch { return null; }
}

// ---------- 최근 공시 ----------
export type Disclosure = { report_nm: string; rcept_dt: string; rcept_no: string; flr_nm: string };

export async function recentDisclosures(corpCode: string, days = 365): Promise<Disclosure[]> {
  const end = new Date();
  const bgn = new Date(end.getTime() - days * 86400000);
  const f = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const j = await getJson('list.json', {
    corp_code: corpCode, bgn_de: f(bgn), end_de: f(end), page_count: '100',
  }, 3600);
  if (j.status !== '000' || !Array.isArray(j.list)) return [];
  return j.list;
}
