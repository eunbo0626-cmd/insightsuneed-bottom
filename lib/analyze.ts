import { auditOpinion, companyInfo, Corp, Disclosure, findCorp, FsRow, fullStatements, recentDisclosures } from './dart';
import { Price } from './price';
import { bench, Dist, Group, industryKeyKR, peerGroup, rankPct } from './bench';
import { money, pct, times, won, yeyo } from './format';

// ======================= 타입 =======================
export type YearData = {
  year: number;
  revenue?: number; cogs?: number; op?: number; ni?: number;
  assets?: number; liab?: number; equity?: number; ca?: number; cl?: number;
  cash?: number; capital?: number; interest?: number; interestApprox?: boolean;
  ocf?: number; capex?: number; borrowings?: number;
};
export type Level = '낮음' | '보통' | '높음' | '매우 높음';
export type Scenario = {
  id: string; title: string; level: Level; story: string; now: string; watch: string; approx?: boolean;
};
export type Axis = { key: string; label: string; score: number | null; summary: string };
export type Grade = '매우 긍정' | '긍정' | '중립' | '주의' | '고위험';
export type Flag = { level: 'critical' | 'warning'; label: string; title: string; date: string; url: string };

export type Report = {
  market: 'KR' | 'US'; currency: 'KRW' | 'USD'; filingLabel: string; auditLabel: string; reportName: string;
  corp: Corp;
  info: { ceo?: string; industry?: string; established?: string; homepage?: string; market?: string };
  baseYear: number;
  years: YearData[];
  metrics: Record<string, number | null>;
  price: Price | null;
  audit: string | null;
  axes: Axis[];
  total: number; grade: Grade; gradeReason: string; capped: boolean;
  scenarios: Scenario[]; mainPath: Scenario | null;
  flags: Flag[]; recent: { title: string; date: string; url: string }[];
  strengths: string[]; weaknesses: string[]; questions: string[];
  annualReportUrl: string | null;
  isFinancial: boolean;
  industry: Industry | null;
  latest: Latest | null;
  generatedAt: string;
};
export type IndRow = { key: string; label: string; you: number | null; med: number | null; q1: number | null; q3: number | null; p: number | null; lowerBetter?: boolean };
export type Industry = {
  label: string; scope: 'industry' | 'market'; n: number; source: string; builtAt: string; market: 'KR' | 'US';
  rows: IndRow[]; aggGrowth: number | null; aggOpm: number | null; lossShare: number | null; share: number | null; key?: string;
  top: Group['top'];
};

// ======================= 계정 매칭 =======================
const ACC: Record<string, { div: string[]; ids: string[]; names: string[] }> = {
  revenue: { div: ['IS', 'CIS'], ids: ['ifrs-full_Revenue', 'ifrs_Revenue'], names: ['매출액', '수익(매출액)', '영업수익', '매출', '수익'] },
  cogs: { div: ['IS', 'CIS'], ids: ['ifrs-full_CostOfSales', 'ifrs_CostOfSales'], names: ['매출원가', '영업비용'] },
  op: { div: ['IS', 'CIS'], ids: ['dart_OperatingIncomeLoss'], names: ['영업이익', '영업이익(손실)', '영업손익', '영업손실'] },
  ni: { div: ['IS', 'CIS'], ids: ['ifrs-full_ProfitLoss', 'ifrs_ProfitLoss'], names: ['당기순이익', '당기순이익(손실)', '당기순손익', '당기순손실', '연결당기순이익'] },
  interest: { div: ['IS', 'CIS'], ids: ['ifrs-full_InterestExpense', 'dart_InterestExpense'], names: ['이자비용'] },
  financeCost: { div: ['IS', 'CIS'], ids: ['ifrs-full_FinanceCosts', 'dart_FinanceCosts'], names: ['금융원가', '금융비용'] },
  assets: { div: ['BS'], ids: ['ifrs-full_Assets', 'ifrs_Assets'], names: ['자산총계'] },
  liab: { div: ['BS'], ids: ['ifrs-full_Liabilities', 'ifrs_Liabilities'], names: ['부채총계'] },
  equity: { div: ['BS'], ids: ['ifrs-full_Equity', 'ifrs_Equity'], names: ['자본총계'] },
  ca: { div: ['BS'], ids: ['ifrs-full_CurrentAssets', 'ifrs_CurrentAssets'], names: ['유동자산'] },
  cl: { div: ['BS'], ids: ['ifrs-full_CurrentLiabilities', 'ifrs_CurrentLiabilities'], names: ['유동부채'] },
  cash: { div: ['BS'], ids: ['ifrs-full_CashAndCashEquivalents', 'ifrs_CashAndCashEquivalents'], names: ['현금및현금성자산'] },
  capital: { div: ['BS'], ids: ['ifrs-full_IssuedCapital', 'ifrs_IssuedCapital'], names: ['자본금'] },
  stb: { div: ['BS'], ids: ['ifrs-full_ShortTermBorrowings', 'dart_ShortTermBorrowings'], names: ['단기차입금'] },
  cpltb: { div: ['BS'], ids: ['ifrs-full_CurrentPortionOfLongtermBorrowings', 'dart_CurrentPortionOfLongTermBorrowings'], names: ['유동성장기부채', '유동성장기차입금'] },
  ltb: { div: ['BS'], ids: ['ifrs-full_LongtermBorrowings', 'dart_LongTermBorrowingsGross'], names: ['장기차입금'] },
  bonds: { div: ['BS'], ids: ['dart_BondsIssued', 'ifrs-full_BondsIssued', 'ifrs-full_NoncurrentPortionOfNoncurrentBondsIssued'], names: ['사채'] },
  ocf: { div: ['CF'], ids: ['ifrs-full_CashFlowsFromUsedInOperatingActivities', 'ifrs_CashFlowsFromUsedInOperatingActivities'], names: ['영업활동현금흐름', '영업활동으로인한현금흐름', '영업활동순현금흐름'] },
  capex: { div: ['CF'], ids: ['ifrs-full_PurchaseOfPropertyPlantAndEquipment', 'ifrs_PurchaseOfPropertyPlantAndEquipment'], names: ['유형자산의취득'] },
  interestPaid: { div: ['CF'], ids: ['ifrs-full_InterestPaidClassifiedAsOperatingActivities', 'ifrs-full_InterestPaidClassifiedAsFinancingActivities'], names: ['이자의지급', '이자지급'] },
};

const norm = (s: string) => (s || '').replace(/\s|\u00a0/g, '');
function num(s?: string): number | undefined {
  if (s === undefined || s === null) return undefined;
  const t = String(s).replace(/,/g, '').trim();
  if (!t || t === '-') return undefined;
  const n = Number(t);
  return isFinite(n) ? n : undefined;
}

function pick(rows: FsRow[], k: string): FsRow | undefined {
  const a = ACC[k];
  const cand = rows.filter(r => a.div.includes(r.sj_div));
  for (const id of a.ids) { const r = cand.find(x => x.account_id === id); if (r) return r; }
  for (const nm of a.names) { const r = cand.find(x => norm(x.account_nm) === nm); if (r) return r; }
  return undefined;
}

function yearsFrom(rows: FsRow[], year: number): YearData[] {
  const ys: YearData[] = [{ year }, { year: year - 1 }, { year: year - 2 }];
  const fields: (keyof typeof ACC)[] = Object.keys(ACC) as any;
  const tmp: Record<string, (number | undefined)[]> = {};
  for (const f of fields) {
    const r = pick(rows, f as string);
    tmp[f as string] = r ? [num(r.thstrm_amount), num(r.frmtrm_amount), num(r.bfefrmtrm_amount)] : [undefined, undefined, undefined];
  }
  for (let i = 0; i < 3; i++) {
    const y = ys[i] as any;
    for (const f of ['revenue', 'cogs', 'op', 'ni', 'assets', 'liab', 'equity', 'ca', 'cl', 'cash', 'capital', 'ocf']) y[f] = tmp[f][i];
    const capex = tmp.capex[i]; y.capex = capex !== undefined ? Math.abs(capex) : undefined;
    const borrow = ['stb', 'cpltb', 'ltb', 'bonds'].map(f => tmp[f][i]).filter(v => v !== undefined) as number[];
    y.borrowings = borrow.length ? borrow.reduce((a, b) => a + b, 0) : undefined;
    const ie = tmp.interest[i], ip = tmp.interestPaid[i], fc = tmp.financeCost[i];
    if (ie !== undefined) { y.interest = Math.abs(ie); }
    else if (ip !== undefined) { y.interest = Math.abs(ip); y.interestApprox = true; }
    else if (fc !== undefined) { y.interest = Math.abs(fc); y.interestApprox = true; }
  }
  return ys;
}

function merge(primary: YearData[], older: YearData[]): YearData[] {
  // primary(최근 보고서)를 우선, 비어 있는 값만 이전 보고서로 채움
  return primary.map(p => {
    const o = older.find(x => x.year === p.year);
    if (!o) return p;
    const out: any = { ...o };
    for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = v;
    return out;
  });
}

// ======================= 점수 도구 =======================
function interp(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number' && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const div = (a?: number, b?: number) => (a === undefined || b === undefined || b === 0) ? null : a / b;
const LV: Level[] = ['낮음', '보통', '높음', '매우 높음'];
const lvIdx = (l: Level) => LV.indexOf(l);

// ======================= 공시 위험 키워드 =======================
const CRITICAL: [RegExp, string][] = [
  [/상장폐지|상장적격성/, '상장폐지·상장적격성 관련'],
  [/관리종목/, '관리종목 지정 관련'],
  [/회생절차|파산|부도|당좌거래정지/, '회생·파산·부도'],
  [/횡령|배임/, '횡령·배임'],
  [/의견거절|부적정|한정/, '감사의견 비적정'],
  [/불성실공시/, '불성실공시법인 지정'],
  [/^(?!.*중요내용공시).*(매매거래정지|거래정지)/, '매매거래정지'],
  [/영업정지/, '영업정지'],
];
const WARNING: [RegExp, string][] = [
  [/전환사채|신주인수권부사채|교환사채/, '주식으로 바뀔 수 있는 채권 발행(CB·BW·EB)'],
  [/유상증자/, '유상증자'],
  [/감자/, '감자'],
  [/최대주주\s*변경|최대주주변경/, '최대주주 변경'],
  [/소송/, '소송'],
  [/채무보증|담보제공/, '채무보증·담보 제공'],
];
const dartUrl = (no: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${no}`;

function scanDisclosures(list: Disclosure[]): Flag[] {
  const flags: Flag[] = [];
  const seen = new Set<string>();
  for (const d of list) {
    const t = d.report_nm || '';
    if (/철회|중요내용공시|종속회사의주요경영사항|자회사의\s*주요경영사항/.test(t)) continue;
    // 액면병합·분할·감자 등으로 주권을 바꿔 상장하느라 잠깐 멈추는 거래정지는 일상 절차
    if (/거래정지/.test(t) && /병합|분할|변경상장|전자등록|액면/.test(t)) continue;
    const base = t.replace(/\[[^\]]*\]/g, '').replace(/\s/g, '');
    if (seen.has(base)) continue;
    seen.add(base);
    const c = CRITICAL.find(([re]) => re.test(t));
    if (c) { flags.push({ level: 'critical', label: c[1], title: t.trim(), date: d.rcept_dt, url: dartUrl(d.rcept_no) }); continue; }
    const w = WARNING.find(([re]) => re.test(t));
    if (w) flags.push({ level: 'warning', label: w[1], title: t.trim(), date: d.rcept_dt, url: dartUrl(d.rcept_no) });
  }
  return flags;
}

// ======================= 메인 분석 =======================
export async function analyze(input: string): Promise<Report> {
  const corp = await findCorp(input);
  if (!corp) throw new Error('상장 기업을 찾지 못했습니다. 회사명이나 6자리 종목코드를 확인해 주세요.');

  const thisYear = new Date().getFullYear();
  let baseYear = thisYear - 1;
  let fs = await fullStatements(corp.corpCode, baseYear);
  if (!fs) { baseYear -= 1; fs = await fullStatements(corp.corpCode, baseYear); }
  if (!fs) throw new Error('최근 사업보고서 재무제표를 찾지 못했습니다. (신규 상장사이거나 공시가 없을 수 있어요)');

  const [older, info, audit, disclosures, price] = await Promise.all([
    fullStatements(corp.corpCode, baseYear - 2).catch(() => null),
    companyInfo(corp.corpCode).catch(() => ({} as Record<string, string>)),
    auditOpinion(corp.corpCode, baseYear),
    recentDisclosures(corp.corpCode).catch(() => [] as Disclosure[]),
    Promise.resolve(null as Price | null), // 시세 미연결: 밸류에이션 제외
  ]);

  let years = yearsFrom(fs.rows, baseYear);
  if (older) years = merge(years, yearsFrom(older.rows, baseYear - 2));
  const [y0, y1, y2] = years;

  const latest = await latestQuarterKR(corp.corpCode, baseYear, fs.fsDiv, years[0]).catch(() => null);
  const induty = info.induty_code || '';
  const annual = disclosures.find(d => /사업보고서/.test(d.report_nm) && !/정정/.test(d.report_nm));
  return scoreCompany({
    market: 'KR', currency: 'KRW', corp, years, baseYear,
    info: { ceo: info.ceo_nm, industry: induty, established: info.est_dt, homepage: info.hm_url, market: info.corp_cls === 'Y' ? '코스피' : info.corp_cls === 'K' ? '코스닥' : info.corp_cls === 'N' ? '코넥스' : undefined },
    filingLabel: `${baseYear}년 사업보고서${latest ? ` + ${latest.source}` : ''}(${fs.fsDiv === 'CFS' ? '연결' : '별도'}) 기준`,
    latest,
    reportName: '사업보고서',
    isFinancial: /^6[456]/.test(induty) && years[0].ca === undefined && years[0].revenue === undefined,
    audit, auditBad: audit ? (!/적정/.test(audit) || /부적정/.test(audit)) : false,
    auditLabel: `감사의견 ${audit ?? '확인 불가'}`,
    flags: scanDisclosures(disclosures), disclosureCount: disclosures.length,
    recent: disclosures.slice(0, 6).map(d => ({ title: d.report_nm.trim(), date: d.rcept_dt, url: dartUrl(d.rcept_no) })),
    annualReportUrl: annual ? dartUrl(annual.rcept_no) : null,
    price,
    govWatch: '감사보고서 제출 지연, 최대주주 변경, CB·BW 연속 발행',
    industryKey: industryKeyKR(induty, years[0].ca !== undefined),
  });
}

export type Ctx = {
  market: 'KR' | 'US'; currency: 'KRW' | 'USD'; corp: Corp; years: YearData[]; baseYear: number;
  info: Report['info']; filingLabel: string; reportName: string; isFinancial: boolean;
  audit: string | null; auditBad: boolean; auditLabel: string;
  flags: Flag[]; disclosureCount: number; recent: Report['recent']; annualReportUrl: string | null;
  price: Price | null; govWatch: string; industryKey?: string; latest?: Latest | null;
};

// ======================= 공통 채점 (한국·미국) =======================
export function scoreCompany(ctx: Ctx): Report {
  const { years, isFinancial, price, audit, flags, baseYear, corp } = ctx;
  const [a0, a1, a2] = years;
  const L = ctx.latest ?? null;
  // 최근 분기 자료가 있으면 y0 = 최근 4분기 합계(재무상태는 최근 분기말), y1 = 직전 사업연도
  const y0 = L ? L.ttm : a0;
  const y1 = L ? a0 : a1;
  const y2 = a2;
  const trio = L ? [L.ttm, a0, a1] : [a0, a1, a2];
  const span = L ? 2 + L.months / 12 : 2;
  const won = (n: number | null | undefined) => money(n, ctx.currency);
  const KR = ctx.market === 'KR';
  // 미국은 자사주 매입으로 자본이 마이너스인 우량기업이 있어, 적자일 때만 위험 신호로 봄
  const negEquity = y0.equity !== undefined && y0.equity <= 0;
  const negEquityBad = negEquity && (KR || (y0.ni ?? 0) <= 0);

  // ---------- 지표 ----------
  const revCagr = (y0.revenue && y2.revenue && y0.revenue > 0 && y2.revenue > 0) ? Math.pow(y0.revenue / y2.revenue, 1 / span) - 1
    : (y0.revenue && y1.revenue && y1.revenue > 0) ? y0.revenue / y1.revenue - 1 : null;
  const revYoy = (y0.revenue !== undefined && y1.revenue) ? y0.revenue / y1.revenue - 1 : null;
  const opm = div(y0.op, y0.revenue);
  const roe = (y0.ni !== undefined && y0.equity && y0.equity > 0) ? y0.ni / (y1.equity && y1.equity > 0 ? (y0.equity + y1.equity) / 2 : y0.equity) : null;
  const debtRatio = (y0.equity && y0.equity > 0) ? div(y0.liab, y0.equity) : null;
  const currentRatio = div(y0.ca, y0.cl);
  const icr = (!isFinancial && y0.interest && y0.interest > 0 && y0.op !== undefined) ? y0.op / y0.interest : null;
  const equityRatio = div(y0.equity, y0.assets);
  const fcf = (y0.ocf !== undefined) ? y0.ocf - (y0.capex ?? 0) : null;
  const per = price && y0.ni && y0.ni > 0 ? price.marketCap / y0.ni : (price && y0.ni !== undefined && y0.ni <= 0 ? -1 : null);
  const pbr = price && y0.equity && y0.equity > 0 ? price.marketCap / y0.equity : null;
  const lossYears = trio.filter(y => y.op !== undefined && y.op < 0).length;
  // 올해 누적 실적 변화 (분기 신호)
  const ytdRevYoy = L && L.ytd.revenue !== undefined && L.ytd.revenuePrev ? L.ytd.revenue / L.ytd.revenuePrev - 1 : null;
  const ytdOpTurnNeg = !!(L && (L.ytd.op ?? 0) < 0 && (L.ytd.opPrev ?? 0) > 0);
  const ytdOpTurnPos = !!(L && (L.ytd.op ?? 0) > 0 && (L.ytd.opPrev ?? 0) < 0);
  const ytdOpYoy = L && L.ytd.op !== undefined && L.ytd.opPrev && L.ytd.opPrev > 0 ? L.ytd.op / L.ytd.opPrev - 1 : null;
  const impairment = (y0.capital && y0.equity !== undefined) ? (y0.capital - y0.equity) / y0.capital : null; // >0 이면 자본잠식

  const metrics = { revCagr, revYoy, opm, roe, debtRatio, currentRatio, icr, fcf, per, pbr, impairment };

  // ---------- 업종 비교 ----------
  const peer = peerGroup(ctx.market, ctx.industryKey);
  const P = (k: keyof Dist, v: number | null) => peer ? rankPct(peer.g.dist[k], v) : null;
  const pCagr = P('cagr', revCagr), pOpm = P('opm', opm), pRoe = P('roe', roe), pDebt = P('debt', debtRatio), pCur = P('cur', currentRatio);
  // 절대 기준 점수와 업종 내 순위(백분위)를 반반 섞음. 업종 자료가 없으면 절대 기준만 사용
  const blend = (abs: number | null, p: number | null) => abs === null ? null : p === null ? abs : 0.5 * abs + 0.5 * p * 100;
  const rk = (p: number | null, invert = false) => { if (p === null) return ''; const g = invert ? 1 - p : p; const sc = peer!.scope === 'industry' ? '업종' : '전체'; return `, ${sc} ${g >= 0.5 ? `상위 ${Math.max(1, Math.round((1 - g) * 100))}%` : `하위 ${Math.max(1, Math.round(g * 100))}%`}${invert ? '(부채 적은 순)' : ''}`; };

  // ---------- 축별 점수 (엄격 기준) ----------
  const axes: Axis[] = [];
  // 성장성: 매출 0% 성장은 30점, 연 10%는 60점, 연 35%는 92점
  {
    const abs = revCagr === null ? null : interp(revCagr, [[-0.2, 0], [-0.1, 10], [0, 30], [0.05, 45], [0.1, 60], [0.2, 78], [0.35, 92], [0.5, 100]]);
    let s = blend(abs, pCagr);
    if (s !== null && y0.op !== undefined && y1.op !== undefined) {
      if (y0.op > 0 && y0.op > y1.op) s += 4; else if (y0.op < 0 && y1.op >= 0) s -= 12; else if (y0.op < y1.op) s -= 5;
    }
    if (s !== null && ytdRevYoy !== null) { if (ytdRevYoy <= -0.15) s -= 8; else if (ytdRevYoy >= 0.2) s += 4; }
    axes.push({ key: 'growth', label: '성장성', score: s === null ? null : Math.round(clamp(s)),
      summary: revCagr === null ? '매출 추이 자료 부족' : `매출 ${revCagr >= 0 ? '연평균 +' : '연평균 '}${pct(revCagr)}${rk(pCagr)} (최근 3년)${ytdRevYoy !== null ? `, 올해 누적 매출 전년 대비 ${ytdRevYoy >= 0 ? '+' : ''}${pct(ytdRevYoy)}` : ''}, ${y0.op === undefined || y1.op === undefined ? '영업이익 추이 불명' : y0.op < 0 && y1.op < 0 ? (y0.op >= y1.op ? '영업손실 축소' : '영업손실 확대') : y0.op < 0 ? '영업적자 전환' : y1.op < 0 ? '영업흑자 전환' : y0.op >= y1.op ? '영업이익 증가' : '영업이익 감소'}` });
  }
  // 수익성: 영업이익률·ROE 5%는 35점, 10%는 55점, 25%는 85점
  {
    const a = blend(opm === null ? null : interp(opm, [[-0.2, 0], [0, 15], [0.05, 35], [0.1, 55], [0.15, 70], [0.25, 85], [0.4, 100]]), pOpm);
    const b = blend(roe === null ? null : interp(roe, [[-0.2, 0], [0, 15], [0.05, 35], [0.1, 55], [0.15, 70], [0.25, 85], [0.4, 100]]), pRoe);
    const s = avg([a, b]);
    axes.push({ key: 'profit', label: '수익성', score: s === null ? null : Math.round(clamp(s)),
      summary: `영업이익률 ${pct(opm)}${rk(pOpm)}, ROE ${pct(roe)}${rk(pRoe)}` });
  }
  // 재무안정성
  {
    let s: number | null;
    if (negEquityBad) s = 0;
    else if (isFinancial) s = equityRatio === null ? null : interp(equityRatio, [[0.03, 10], [0.05, 30], [0.07, 50], [0.09, 65], [0.12, 80], [0.2, 90]]);
    else {
      const a = debtRatio === null || negEquity ? null : blend(interp(debtRatio, [[0.3, 90], [0.5, 80], [1, 62], [1.5, 48], [2, 35], [3, 18], [5, 5]]), pDebt === null ? null : 1 - pDebt);
      const b = currentRatio === null ? null : blend(interp(currentRatio, [[0.5, 5], [0.8, 20], [1, 35], [1.5, 55], [2, 70], [3, 85], [5, 92]]), pCur);
      const c = icr === null ? ((y0.borrowings ?? 0) <= 0 || !y0.interest ? 85 : null) : interp(icr, [[0, 0], [1, 15], [3, 40], [5, 55], [10, 75], [20, 90], [50, 100]]);
      s = avg([a, b, c]);
    }
    axes.push({ key: 'stability', label: '재무안정성', score: s === null ? null : Math.round(clamp(s)),
      summary: isFinancial ? `금융회사라 예금·보험금이 부채로 잡혀 부채비율 대신 자기자본비율(${pct(equityRatio)})로 평가` : `부채비율 ${debtRatio === null ? '자료 없음' : pct(debtRatio, 0)}${rk(pDebt, true)}, 유동비율 ${currentRatio === null ? '자료 없음' : pct(currentRatio, 0)}, 이자보상배율 ${icr === null ? '해당 없음' : times(icr)}` });
  }

  // ---------- 리스크: 75점(보통)에서 시작해 좋은 신호는 더하고 나쁜 신호는 뺌 ----------
  const auditBad = ctx.auditBad;
  {
    let s = 75;
    const reasons: string[] = [];
    const ocfs = trio.map(y => y.ocf).filter((v): v is number => v !== undefined);
    if (!isFinancial && ocfs.length >= 2 && ocfs.every(v => v > 0)) { s += 10; reasons.push(`${ocfs.length}년 연속 영업현금흐름 플러스(+)`); }
    if (!flags.length && !auditBad) { s += 5; reasons.push('최근 1년 위험 공시 없음(+)'); }
    if (auditBad) { s -= 60; reasons.push(KR ? `감사의견 '${audit}'` : '계속기업 불확실성 + 적자'); }
    if (negEquityBad) { s -= 70; reasons.push(KR ? '완전자본잠식' : '적자 상태에서 자본 마이너스'); }
    else if (negEquity) { s -= 5; reasons.push('자사주 매입 등으로 자본 마이너스'); }
    else if (impairment !== null && impairment > 0) { s -= impairment >= 0.5 ? 50 : 30; reasons.push(`자본잠식 ${pct(impairment, 0)}`); }
    if (ytdOpTurnNeg) { s -= 10; reasons.push('올해 누적 영업적자 전환'); }
    if (lossYears >= 2) { s -= 20; reasons.push(`최근 3년 중 ${lossYears}년 영업적자`); }
    else if (lossYears === 1) { s -= 8; reasons.push('최근 3년 중 1년 영업적자'); }
    if (!isFinancial && y0.ocf !== undefined && y0.ocf < 0) { s -= 12; reasons.push('영업현금흐름 마이너스'); }
    if (icr !== null && icr < 1) { s -= 15; reasons.push('영업이익으로 이자도 못 냄'); }
    const crit = flags.filter(f => f.level === 'critical');
    const warn = flags.filter(f => f.level === 'warning');
    if (crit.length) { s -= Math.min(60, crit.length * 30); reasons.push(`중대 공시 ${crit.length}건`); }
    const warnKinds = new Set(warn.map(f => f.label)).size;
    if (warn.length) {
      const dil = warn.filter(f => /CB|유상증자|감자|신주/.test(f.label)).length;
      const oth = warn.length - dil;
      s -= Math.min(24, dil * 8) + Math.min(10, oth * 3);
      reasons.push(`주의 공시 ${warn.length}건(${warnKinds}종류)`);
    }
    axes.push({ key: 'risk', label: '리스크 안전도', score: Math.round(clamp(s)), summary: `${ctx.auditLabel}. ${reasons.join(', ')}` });
  }

  // ---------- 종합 ----------
  const W: Record<string, number> = { growth: 20, profit: 25, stability: 25, risk: 15 };
  let wsum = 0, ssum = 0;
  for (const a of axes) if (a.score !== null) { ssum += a.score * W[a.key]; wsum += W[a.key]; }
  let total = wsum ? Math.round(ssum / wsum) : 0;
  // 고위험은 중대 신호가 있거나, 점수가 30점 미만이면서 적자 반복·현금 유출·이자 미충당 같은 부실 징후가 있을 때만
  const distress = lossYears >= 2 || ytdOpTurnNeg || (!isFinancial && (y0.ocf ?? 0) < 0) || (icr !== null && icr < 1);
  const toGrade = (t: number): Grade => t >= 85 ? '매우 긍정' : t >= 70 ? '긍정' : t >= 50 ? '중립' : (t < 30 && distress) ? '고위험' : '주의';
  let grade = toGrade(total);
  let capped = false;
  let gradeReason = '';
  const critical = auditBad || negEquityBad || (impairment !== null && impairment >= 0.5) || flags.some(f => f.level === 'critical' && /상장폐지|관리종목|회생|횡령|파산|신뢰 불가/.test(f.label));
  if (critical) { grade = '고위험'; capped = true; gradeReason = '중대 위험 신호가 있어 점수와 관계없이 고위험으로 분류했어요.'; }
  else if (lossYears >= 2 && (grade === '매우 긍정' || grade === '긍정')) { grade = '중립'; capped = true; gradeReason = '최근 적자가 반복돼 등급 상한을 중립으로 제한했어요.'; }
  else {
    const best = [...axes].filter(a => a.score !== null).sort((a, b) => (b.score! - a.score!));
    gradeReason = `가장 좋은 항목은 ${best[0]?.label}, 가장 약한 항목은 ${yeyo(best[best.length - 1]?.label ?? '')}.`;
  }

  // ---------- 망하는 시나리오 ----------
  const scenarios: Scenario[] = [];
  // 1) 현금 고갈
  if (y0.ocf !== undefined && y0.cash !== undefined) {
    const burn = (y0.ocf < 0 ? -y0.ocf : 0) + (y0.capex ?? 0) - (y0.ocf > 0 ? y0.ocf : 0);
    if (isFinancial) {
      // 금융회사는 대출·예금 증감이 영업현금흐름에 섞여 현금 고갈 지표로 쓰기 어려움
    } else if (y0.ocf < 0) {
      const months = burn > 0 ? (y0.cash / burn) * 12 : Infinity;
      const profitable = (y0.op ?? 0) > 0 && (y0.ni ?? 0) > 0;
      let level: Level = months < 12 ? '매우 높음' : months < 24 ? '높음' : '보통';
      if (profitable && lvIdx(level) > 1) level = '보통';
      scenarios.push({ id: 'cash', title: '현금이 바닥나는 시나리오', level,
        story: profitable
          ? `장부상 이익은 나는데 영업현금흐름이 마이너스(${won(y0.ocf)})예요. 금융 자회사의 대출 증가나 재고·외상값이 늘어난 영향일 수 있어요. 일시적이면 괜찮지만, 이익이 현금으로 안 들어오는 상태가 이어지면 빚으로 메워야 해요.`
          : `본업에서 현금이 새고 있어요. 지금 속도(투자 포함 연 ${won(burn)} 유출)가 이어지면 보유 현금 ${won(y0.cash)}으로 약 ${isFinite(months) ? Math.max(1, Math.round(months)) : '-'}개월 버틸 수 있어요. 그 전에 빚을 더 내거나 증자를 해야 합니다.`,
        now: `영업현금흐름 ${won(y0.ocf)}, 설비투자 ${won(y0.capex)}, 현금 ${won(y0.cash)}`,
        watch: '분기 영업현금흐름이 플러스로 돌아서는지, 유상증자·CB 발행 공시가 나오는지' });
    } else if (fcf !== null && fcf < 0) {
      const years = y0.cash / -fcf;
      scenarios.push({ id: 'cash', title: '현금이 바닥나는 시나리오', level: years < 1 ? '높음' : '보통',
        story: `본업으로 돈은 벌지만 투자에 더 많이 쓰고 있어요(잉여현금흐름 ${won(fcf)}). 이 속도면 현금으로 약 ${years.toFixed(1)}년치 투자를 감당할 수 있어요. 투자가 성과를 못 내면 차입이 늘어납니다.`,
        now: `영업현금흐름 ${won(y0.ocf)}, 설비투자 ${won(y0.capex)}, 현금 ${won(y0.cash)}`,
        watch: '대규모 투자가 매출로 이어지는지, 차입금이 늘어나는지' });
    } else {
      scenarios.push({ id: 'cash', title: '현금이 바닥나는 시나리오', level: '낮음',
        story: `본업에서 투자 후에도 현금이 남아요(잉여현금흐름 ${won(fcf)}). 당장 현금이 마를 가능성은 낮아요.`,
        now: `영업현금흐름 ${won(y0.ocf)}, 현금 ${won(y0.cash)}`, watch: '영업현금흐름이 2분기 연속 줄어드는지' });
    }
  }
  // 2) 매출 급감
  if (y0.revenue && y0.op !== undefined && !isFinancial) {
    let gm = y0.cogs !== undefined && y0.revenue > 0 ? (y0.revenue - y0.cogs) / y0.revenue : null;
    const approx = gm === null || gm <= 0;
    if (approx) gm = clamp((opm ?? 0) + 0.25, 0.15, 0.8) / 1;
    const lost = (s: number) => y0.revenue! * s * gm!;
    const op20 = y0.op - lost(0.2), op30 = y0.op - lost(0.3);
    const breakeven = y0.op > 0 ? y0.op / (y0.revenue * gm!) : 0;
    const level: Level = y0.op <= 0 ? '매우 높음' : breakeven < 0.1 ? '높음' : breakeven < 0.25 ? '보통' : '낮음';
    scenarios.push({ id: 'sales', title: '매출이 급감하는 시나리오', level, approx,
      story: y0.op <= 0
        ? `이미 영업적자(${won(y0.op)})예요. 여기서 매출이 20% 더 줄면 적자가 ${won(op20)}까지 커질 수 있어요.`
        : `경기 침체나 주력 제품 부진으로 매출이 ${pct(breakeven, 0)}만 줄어도 영업이익이 0이 돼요. 20% 줄면 영업이익 ${won(op20)}, 30% 줄면 ${won(op30)}으로 추정돼요.`,
      now: `매출 ${won(y0.revenue)}, 영업이익 ${won(y0.op)}, 매출총이익률 ${approx ? '추정 ' : ''}${pct(gm)}`,
      watch: KR ? '분기 매출 감소율, 주요 고객·제품 의존도(사업보고서 \'사업의 내용\')' : '분기 매출 감소율, 주요 고객·제품 의존도(10-K Item 1·1A)' });
  }
  // 3) 이자 부담 (금융회사는 이자비용이 본업 원가라 제외)
  if (isFinancial) {
    scenarios.push({ id: 'rate', title: '건전성이 무너지는 시나리오', level: equityRatio !== null && equityRatio < 0.05 ? '높음' : equityRatio !== null && equityRatio < 0.07 ? '보통' : '낮음',
      story: `금융회사는 빌린 돈(예금·채권)으로 장사하는 구조라, 대출이 부실해지면 자기자본이 먼저 깎여요. 지금 자기자본은 자산의 ${pct(equityRatio)}예요. 부실 대출이 자산의 ${pct(equityRatio)}만큼 생기면 자본이 바닥나는 계산이에요.`,
      now: `자산 ${won(y0.assets)}, 자본 ${won(y0.equity)}, 순이익 ${won(y0.ni)}`,
      watch: '고정이하여신비율·연체율 상승, 부동산PF 등 특정 대출 쏠림, 대손충당금 급증' });
  } else if (y0.op !== undefined) {
    if (y0.interest && y0.interest > 0) {
      const icrUp = y0.op / (y0.interest * 1.5);
      const level: Level = (icr ?? 0) < 1 ? '매우 높음' : icrUp < 1.5 ? '높음' : icrUp < 3 ? '보통' : '낮음';
      scenarios.push({ id: 'rate', title: '이자에 짓눌리는 시나리오', level, approx: y0.interestApprox,
        story: (icr ?? 0) < 1
          ? `지금도 영업이익(${won(y0.op)})으로 이자(${won(y0.interest)})를 못 내고 있어요. 이 상태가 3년 이어지면 흔히 '좀비기업'으로 분류돼요.`
          : `금리가 올라 이자가 50% 늘면 이자보상배율이 ${times(icr)}에서 ${times(icrUp)}로 떨어져요.${icrUp < 1.5 ? ' 영업이익 대부분이 이자로 나가게 돼요.' : ''}`,
        now: `이자비용${y0.interestApprox ? '(추정)' : ''} ${won(y0.interest)}, 차입금 ${won(y0.borrowings)}`,
        watch: '차입금 만기 구조, 금리 변동, 신용등급 하향 공시' });
    } else {
      scenarios.push({ id: 'rate', title: '이자에 짓눌리는 시나리오', level: '낮음',
        story: '확인된 이자비용이 거의 없어 금리 충격 영향이 작아요.', now: `차입금 ${won(y0.borrowings)}`, watch: '새 차입·사채 발행 공시' });
    }
  }
  // 4) 단기 상환 압박
  if (!isFinancial && y0.ca !== undefined && y0.cl !== undefined) {
    const cr = currentRatio!;
    let level: Level = cr < 0.7 ? '매우 높음' : cr < 1 ? '높음' : cr < 1.3 ? '보통' : '낮음';
    // 영업현금흐름이 단기부채의 절반 이상이면 실제 상환 압박은 작음 (애플·맥도날드처럼 일부러 유동비율을 낮게 운영하는 경우)
    const ocfCover = y0.ocf !== undefined && y0.cl ? y0.ocf / y0.cl : null;
    const strongCash = ocfCover !== null && ocfCover >= 0.5;
    if (strongCash && lvIdx(level) > 0) level = LV[lvIdx(level) - 1];
    scenarios.push({ id: 'liquidity', title: '1년 안에 갚을 빚에 막히는 시나리오', level,
      story: cr < 1
        ? (strongCash ? `1년 안에 갚을 빚(${won(y0.cl)})이 단기 자산(${won(y0.ca)})보다 많지만, 본업에서 1년에 ${won(y0.ocf)}의 현금이 들어와 실제 압박은 작아요. 다만 본업 현금이 갑자기 줄면 바로 드러나는 구조예요.` : `1년 안에 갚아야 할 빚(${won(y0.cl)})이 1년 안에 현금화할 수 있는 자산(${won(y0.ca)})보다 ${won(y0.cl - y0.ca)} 많아요. 은행이 만기 연장을 거절하면 바로 자금난이 올 수 있어요.`)
        : `단기 자산이 단기 부채의 ${pct(cr, 0)} 수준이에요. ${cr < 1.3 ? '여유가 크지 않아 재고·매출채권이 묶이면 압박이 생길 수 있어요.' : '당장 상환 압박은 크지 않아요.'}`,
      now: `유동비율 ${pct(cr, 0)}, 현금 ${won(y0.cash)}${ocfCover !== null ? `, 영업현금흐름/단기부채 ${pct(ocfCover, 0)}` : ''}`,
      watch: '유동비율 100% 아래로 하락, 단기차입금 급증' });
  }
  // 5) 자본잠식
  if (y0.equity !== undefined) {
    let level: Level = '낮음'; let story = ''; let now = KR ? `자본총계 ${won(y0.equity)}, 자본금 ${won(y0.capital)}, 당기순이익 ${won(y0.ni)}` : `자본총계 ${won(y0.equity)}, 순이익 ${won(y0.ni)}`;
    if (negEquityBad) { level = '매우 높음'; story = KR ? '이미 완전자본잠식이에요. 자산을 다 팔아도 빚을 못 갚는 상태라 상장폐지 사유에 해당할 수 있어요.' : `적자(${won(y0.ni)})인데 자본도 마이너스(${won(y0.equity)})예요. 자산보다 빚이 많은 상태라 추가 자금 조달이 막히면 파산 절차로 갈 수 있어요.`; }
    else if (negEquity) { level = '보통'; story = `자본이 마이너스(${won(y0.equity)})지만 이익(${won(y0.ni)})은 나고 있어요. 미국에선 자사주 매입·배당을 빚으로 해서 생기는 경우가 많아 그 자체로 부실은 아니에요. 다만 이익이 꺾이면 빚 부담이 바로 드러나요.`; }
    else if (impairment !== null && impairment > 0) { level = impairment >= 0.5 ? '매우 높음' : '높음'; story = `부분 자본잠식(${pct(impairment, 0)})이에요. 잠식률 50% 이상이 이어지면 관리종목, 더 심해지면 상장폐지로 갈 수 있어요.`; }
    else if (y0.ni !== undefined && y0.ni < 0) {
      const yrs = y0.equity / -y0.ni;
      level = yrs < 2 ? '높음' : yrs < 5 ? '보통' : '낮음';
      story = `지금 적자(${won(y0.ni)})가 계속되면 약 ${yrs.toFixed(1)}년 뒤 자본이 바닥나요. 그 전에 증자나 감자로 주주 지분이 희석될 수 있어요.`;
    } else story = '순이익이 나고 있어 자본이 줄어드는 흐름은 아니에요.';
    scenarios.push({ id: 'equity', title: '자본이 녹아내리는 시나리오', level, story, now, watch: KR ? '연속 순손실, 감자·유상증자 공시' : '연속 순손실, 신주 발행(8-K 3.02), 자사주 매입 중단' });
  }
  // 6) 공시·지배구조
  {
    const crit = flags.filter(f => f.level === 'critical');
    const warn = flags.filter(f => f.level === 'warning');
    const kinds = new Set(warn.map(f => f.label)).size;
    const level: Level = auditBad || crit.length ? '매우 높음' : kinds >= 3 ? '높음' : warn.length ? '보통' : '낮음';
    const items = [...crit, ...warn].slice(0, 3).map(f => `${f.label}(${f.date.slice(0, 4)}.${f.date.slice(4, 6)})`);
    scenarios.push({ id: 'governance', title: '신뢰가 무너지는 시나리오', level,
      story: crit.some(f => /회생|파산/.test(f.label)) ? `최근 1년 안에 회생·파산 관련 공시가 있었어요. 이미 법원 관리 아래서 빚을 조정하는 단계일 수 있고, 이 경우 기존 주식은 대폭 감자되는 일이 많아요.${auditBad ? ` ${KR ? `감사의견도 '${audit}'이에요.` : '감사인의 계속기업 불확실성 언급도 있어요.'}` : ''}`
        : auditBad ? (KR ? `감사의견이 '${audit}'이에요. 회계를 믿기 어렵다는 뜻이라 거래정지·상장폐지로 이어질 수 있어요.` : '10-K에 "계속기업으로 존속할 능력에 상당한 의문"이라는 문구가 있고 적자도 이어지고 있어요. 1년 안에 자금을 못 구하면 파산 위험이 있다는 경고예요.')
        : crit.length ? `최근 1년 안에 중대 공시가 있었어요: ${items.join(', ')}. 경영·회계 신뢰가 흔들리면 주가가 회복하기 어려워요.`
        : warn.length ? `최근 1년 공시 중 주의할 신호가 ${warn.length}건 있어요: ${items.join(', ')}. 자금 조달이 반복되면 기존 주주 지분이 희석돼요.`
        : '최근 1년 공시에서 큰 위험 신호는 보이지 않아요.',
      now: `${ctx.auditLabel}, 최근 1년 공시 ${ctx.disclosureCount}건 중 위험 신호 ${flags.length}건`,
      watch: ctx.govWatch });
  }
  const PRI = ['governance', 'equity', 'cash', 'liquidity', 'rate', 'sales'];
  const sorted = [...scenarios].sort((a, b) => lvIdx(b.level) - lvIdx(a.level) || PRI.indexOf(a.id) - PRI.indexOf(b.id));
  scenarios.splice(0, scenarios.length, ...sorted);
  const mainPath = sorted[0] && lvIdx(sorted[0].level) >= 1 ? sorted[0] : null;

  // ---------- 강점/약점/질문 ----------
  const strengths: string[] = [], weaknesses: string[] = [];
  if (revCagr !== null) (revCagr >= 0.08 ? strengths : revCagr < 0 ? weaknesses : []).push(`최근 3년 매출 연평균 ${pct(revCagr)} ${revCagr >= 0 ? '성장' : '감소'}`);
  if (opm !== null) (opm >= 0.1 ? strengths : opm < 0.03 ? weaknesses : []).push(`영업이익률 ${pct(opm)}`);
  if (roe !== null) (roe >= 0.1 ? strengths : roe < 0.03 ? weaknesses : []).push(`ROE ${pct(roe)}`);
  if (!isFinancial && debtRatio !== null) (debtRatio <= 0.8 ? strengths : debtRatio >= 2 ? weaknesses : []).push(`부채비율 ${pct(debtRatio, 0)}`);
  if (fcf !== null) (fcf > 0 ? strengths : weaknesses).push(`잉여현금흐름 ${won(fcf)}`);
  if (isFinancial && equityRatio !== null) (equityRatio >= 0.08 ? strengths : equityRatio < 0.05 ? weaknesses : []).push(`자기자본비율 ${pct(equityRatio)}`);
  if (lossYears >= 1) weaknesses.push(`최근 3년 중 ${lossYears}년 영업적자`);
  if (ytdOpTurnNeg) weaknesses.push(`${L!.label} 누적 영업적자 전환`);
  if (ytdOpTurnPos) strengths.push(`${L!.label} 누적 영업흑자 전환`);
  if (ytdRevYoy !== null && ytdRevYoy <= -0.15) weaknesses.push(`${L!.label} 누적 매출 ${pct(-ytdRevYoy)} 감소`);
  if (ytdOpYoy !== null && ytdOpYoy >= 0.3) strengths.push(`${L!.label} 누적 영업이익 +${pct(ytdOpYoy, 0)}`);
  else if (ytdOpYoy !== null && ytdOpYoy <= -0.3 && !ytdOpTurnNeg) weaknesses.push(`${L!.label} 누적 영업이익 ${pct(ytdOpYoy, 0)}`);
  if (flags.length) weaknesses.push(`최근 1년 위험 신호 공시 ${flags.length}건`);

  const questions = KR ? [
    '매출이 특정 고객·제품·국가에 몰려 있지 않은가? (사업보고서 > 사업의 내용)',
    '영업이익 변화가 일회성 요인(환율, 자산 매각) 때문은 아닌가?',
    '최대주주와 경영진이 최근 지분을 팔고 있지 않은가?',
    mainPath ? `'${mainPath.title}'을 막을 수 있는 계획이 회사에 있는가?` : '가장 큰 위험 요인을 회사가 어떻게 관리하고 있는가?',
  ] : [
    '매출이 특정 고객·제품·국가에 몰려 있지 않은가? (10-K Item 1 Business)',
    '회사가 직접 꼽은 위험요인은 무엇이고, 작년보다 늘었는가? (10-K Item 1A Risk Factors)',
    '경영진·내부자가 최근 주식을 팔고 있지 않은가? (Form 4)',
    mainPath ? `'${mainPath.title}'을 막을 수 있는 계획이 회사에 있는가?` : '가장 큰 위험 요인을 회사가 어떻게 관리하고 있는가?',
  ];

  return {
    market: ctx.market, currency: ctx.currency, filingLabel: ctx.filingLabel, auditLabel: ctx.auditLabel, reportName: ctx.reportName,
    corp, info: ctx.info, baseYear, years, metrics, price, audit, axes, total, grade, gradeReason, capped,
    scenarios, mainPath, flags, recent: ctx.recent,
    strengths, weaknesses, questions,
    annualReportUrl: ctx.annualReportUrl,
    isFinancial,
    latest: L,
    industry: peer ? {
      label: peer.label, scope: peer.scope, n: peer.g.n, market: ctx.market, key: peer.key,
      source: bench(ctx.market)!.source, builtAt: bench(ctx.market)!.builtAt,
      rows: [
        { key: 'cagr', label: '매출 성장률(연평균)', you: revCagr, med: peer.g.med.cagr, q1: peer.g.q1.cagr, q3: peer.g.q3.cagr, p: pCagr },
        { key: 'opm', label: '영업이익률', you: opm, med: peer.g.med.opm, q1: peer.g.q1.opm, q3: peer.g.q3.opm, p: pOpm },
        { key: 'roe', label: 'ROE', you: roe, med: peer.g.med.roe, q1: peer.g.q1.roe, q3: peer.g.q3.roe, p: pRoe },
        ...(isFinancial ? [] : [
          { key: 'debt', label: '부채비율', you: debtRatio, med: peer.g.med.debt, q1: peer.g.q1.debt, q3: peer.g.q3.debt, p: pDebt, lowerBetter: true },
          { key: 'cur', label: '유동비율', you: currentRatio, med: peer.g.med.cur, q1: peer.g.q1.cur, q3: peer.g.q3.cur, p: pCur },
        ]),
      ],
      aggGrowth: peer.g.aggGrowth, aggOpm: peer.g.aggOpm, lossShare: peer.g.lossShare,
      share: peer.scope === 'industry' && y0.revenue && peer.g.totalRev ? y0.revenue / peer.g.totalRev : null,
      top: peer.g.top,
    } : null,
    generatedAt: new Date().toISOString(),
  };
}

// ======================= 최근 분기 (최근 4분기 합산) =======================
export type Latest = {
  label: string; asOf: string; months: number; source: string;
  ttm: YearData;
  ytd: { revenue?: number; revenuePrev?: number; op?: number; opPrev?: number; ni?: number; niPrev?: number };
};

/** 연간 값 + 올해 누적 − 작년 같은 기간 누적 = 최근 4분기 합계. 재무상태는 최근 분기말 값 */
export function buildTtm(annual: YearData, cur: Partial<YearData>, prev: Partial<YearData>, bs: Partial<YearData>, year: number): YearData {
  const flow = (k: keyof YearData) => {
    const a = annual[k] as number | undefined, c = cur[k] as number | undefined, p = prev[k] as number | undefined;
    if (a === undefined || c === undefined) return undefined;
    if (p === undefined) return undefined;
    return a + c - p;
  };
  const t: YearData = { ...annual, year };
  for (const k of ['revenue', 'cogs', 'op', 'ni', 'ocf', 'capex', 'interest'] as (keyof YearData)[]) {
    const v = flow(k); (t as any)[k] = v !== undefined ? (k === 'capex' || k === 'interest' ? Math.abs(v) : v) : (annual as any)[k];
  }
  for (const k of ['assets', 'liab', 'equity', 'ca', 'cl', 'cash', 'capital', 'borrowings'] as (keyof YearData)[]) if (bs[k] !== undefined) (t as any)[k] = bs[k];
  return t;
}

const REPRT: [string, string, number][] = [['11014', '3분기보고서', 9], ['11012', '반기보고서', 6], ['11013', '1분기보고서', 3]];

export async function latestQuarterKR(corpCode: string, baseYear: number, fsDiv: 'CFS' | 'OFS', annual: YearData): Promise<Latest | null> {
  const y = baseYear + 1;
  for (const [code, name, months] of REPRT) {
    const q = await fullStatements(corpCode, y, code, fsDiv).catch(() => null);
    if (!q) continue;
    const cur: any = {}, prev: any = {}, bs: any = {};
    for (const k of ['revenue', 'cogs', 'op', 'ni', 'ocf', 'capex', 'interest', 'interestPaid', 'financeCost']) {
      const r = pick(q.rows, k); if (!r) continue;
      const c = num(r.thstrm_add_amount) ?? num(r.thstrm_amount);
      const p = num(r.frmtrm_add_amount) ?? num(r.frmtrm_q_amount) ?? num(r.frmtrm_amount);
      const key = k === 'interestPaid' || k === 'financeCost' ? 'interest' : k;
      if (cur[key] === undefined && c !== undefined) { cur[key] = c; prev[key] = p; }
    }
    if (cur.capex !== undefined) cur.capex = Math.abs(cur.capex);
    if (prev.capex !== undefined) prev.capex = Math.abs(prev.capex);
    for (const k of ['assets', 'liab', 'equity', 'ca', 'cl', 'cash', 'capital']) { const r = pick(q.rows, k); const v = r ? num(r.thstrm_amount) : undefined; if (v !== undefined) bs[k] = v; }
    const borrow = ['stb', 'cpltb', 'ltb', 'bonds'].map(k => { const r = pick(q.rows, k); return r ? num(r.thstrm_amount) : undefined; }).filter((v): v is number => v !== undefined);
    if (borrow.length) bs.borrowings = borrow.reduce((a, b) => a + b, 0);
    if (cur.revenue === undefined && cur.op === undefined) continue;
    const mm = String(months).padStart(2, '0');
    return {
      label: `${y}년 ${name.replace('보고서', '')}`, asOf: `${y}.${mm}`, months, source: `${y}년 ${name}`,
      ttm: buildTtm(annual, cur, prev, bs, y),
      ytd: { revenue: cur.revenue, revenuePrev: prev.revenue, op: cur.op, opPrev: prev.op, ni: cur.ni, niPrev: prev.ni },
    };
  }
  return null;
}
