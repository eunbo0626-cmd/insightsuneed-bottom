import { annualSeries, companyFacts, filingUrl, fiscalYearEnds, goingConcernHits, ITEM_CRIT, ITEM_WARN, latestQuarterEnd, quarterValue, sicSector, submissions, UsTicker } from './sec';
import { buildTtm, Flag, Latest, Report, scoreCompany, YearData } from './analyze';

const T = {
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'RevenuesNetOfInterestExpense'],
  cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  op: ['OperatingIncomeLoss'],
  ni: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  assets: ['Assets'], liab: ['Liabilities'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  ca: ['AssetsCurrent'], cl: ['LiabilitiesCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'],
  ocf: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  interest: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestAndDebtExpense'],
  interestPaid: ['InterestPaidNet', 'InterestPaid'],
  ltd: ['LongTermDebt'], ltdNc: ['LongTermDebtNoncurrent'], ltdC: ['LongTermDebtCurrent', 'DebtCurrent'],
  stb: ['ShortTermBorrowings', 'CommercialPaper'],
  liabEq: ['LiabilitiesAndStockholdersEquity'],
};
const FLOW = new Set(['revenue', 'cogs', 'op', 'ni', 'ocf', 'capex', 'interest', 'interestPaid']);

function firstVals(facts: any, key: keyof typeof T, ends: string[]) {
  const res = annualSeries(facts, T[key], FLOW.has(key) ? 'flow' : 'instant', ends);
  return ends.map((_, i) => { for (const r of res) if (r.vals[i] !== undefined) return r.vals[i]; return undefined; });
}

export async function analyzeUs(t: UsTicker): Promise<Report> {
  const [facts, sub, gc] = await Promise.all([companyFacts(t.cik), submissions(t.cik), goingConcernHits(t.cik)]);
  if (!facts?.facts?.['us-gaap']) throw new Error('미국 회계기준(US-GAAP) 재무가 없어요. 해외기업(20-F 제출사)은 아직 지원하지 않아요.');
  const ends = fiscalYearEnds(facts);
  if (!ends.length) throw new Error('연간 보고서(10-K) 재무를 찾지 못했어요.');
  while (ends.length < 3) { const last = ends[ends.length - 1]; const d = new Date(last); d.setFullYear(d.getFullYear() - 1); ends.push(d.toISOString().slice(0, 10)); }

  const v: Record<string, (number | undefined)[]> = {};
  for (const k of Object.keys(T) as (keyof typeof T)[]) v[k] = firstVals(facts, k, ends);

  const years: YearData[] = ends.map((end, i) => {
    let liab = v.liab[i];
    if (liab === undefined && v.liabEq[i] !== undefined && v.equity[i] !== undefined) liab = v.liabEq[i]! - v.equity[i]!;
    let borrowings: number | undefined;
    if (v.ltd[i] !== undefined) borrowings = v.ltd[i]! + (v.stb[i] ?? 0);
    else if (v.ltdNc[i] !== undefined || v.ltdC[i] !== undefined) borrowings = (v.ltdNc[i] ?? 0) + (v.ltdC[i] ?? 0) + (v.stb[i] ?? 0);
    let interest = v.interest[i], interestApprox = false;
    if (interest === undefined && v.interestPaid[i] !== undefined) { interest = v.interestPaid[i]; interestApprox = true; }
    return {
      year: Number(end.slice(0, 4)),
      revenue: v.revenue[i], cogs: v.cogs[i], op: v.op[i], ni: v.ni[i],
      assets: v.assets[i], liab, equity: v.equity[i], ca: v.ca[i], cl: v.cl[i], cash: v.cash[i],
      ocf: v.ocf[i], capex: v.capex[i] !== undefined ? Math.abs(v.capex[i]!) : undefined,
      borrowings, interest: interest !== undefined ? Math.abs(interest) : undefined, interestApprox,
    };
  });

  // ---- 최근 분기(10-Q) ----
  let latest: Latest | null = null;
  const qEnd = latestQuarterEnd(facts, ends[0]);
  if (qEnd) {
    const cur: any = {}, prev: any = {}, bs: any = {};
    let months = 0;
    for (const k of ['revenue', 'cogs', 'op', 'ni', 'ocf', 'capex', 'interest'] as (keyof typeof T)[]) {
      const q = quarterValue(facts, T[k], 'flow', qEnd);
      if (q.cur !== undefined) { cur[k] = k === 'capex' ? Math.abs(q.cur) : q.cur; prev[k] = q.prev !== undefined && k === 'capex' ? Math.abs(q.prev) : q.prev; months = Math.max(months, q.months ?? 0); }
    }
    for (const k of ['assets', 'liab', 'equity', 'ca', 'cl', 'cash'] as (keyof typeof T)[]) { const q = quarterValue(facts, T[k], 'instant', qEnd); if (q.cur !== undefined) bs[k] = q.cur; }
    if (bs.liab === undefined) { const le = quarterValue(facts, T.liabEq, 'instant', qEnd).cur; if (le !== undefined && bs.equity !== undefined) bs.liab = le - bs.equity; }
    const ltd = quarterValue(facts, T.ltd, 'instant', qEnd).cur, ltdNc = quarterValue(facts, T.ltdNc, 'instant', qEnd).cur, ltdC = quarterValue(facts, T.ltdC, 'instant', qEnd).cur, stb = quarterValue(facts, T.stb, 'instant', qEnd).cur;
    if (ltd !== undefined) bs.borrowings = ltd + (stb ?? 0); else if (ltdNc !== undefined || ltdC !== undefined) bs.borrowings = (ltdNc ?? 0) + (ltdC ?? 0) + (stb ?? 0);
    if ((cur.revenue !== undefined || cur.op !== undefined) && months > 0) {
      latest = {
        label: `${qEnd.slice(0, 7).replace('-', '.')} 분기`, asOf: qEnd.slice(0, 7).replace('-', '.'), months, source: `10-Q(${qEnd} 분기말)`,
        ttm: buildTtm(years[0], cur, prev, bs, Number(qEnd.slice(0, 4))),
        ytd: { revenue: cur.revenue, revenuePrev: prev.revenue, op: cur.op, opPrev: prev.op, ni: cur.ni, niPrev: prev.ni },
      };
    }
  }

  // ---- 공시 위험 신호 (최근 1년) ----
  const r = sub.filings.recent;
  const since = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  const flags: Flag[] = [];
  let count = 0;
  const recent: Report['recent'] = [];
  let annualUrl: string | null = null;
  for (let i = 0; i < r.form.length; i++) {
    const form: string = r.form[i]; const date: string = r.filingDate[i];
    const url = filingUrl(t.cik, r.accessionNumber[i], r.primaryDocument[i] || '');
    if (!annualUrl && form === '10-K') annualUrl = url;
    if (date < since) continue;
    if (/^(10-K|10-Q|8-K|NT 10-K|NT 10-Q|25-NSE|15-12B|DEF 14A|S-1|S-3)/.test(form)) {
      count++;
      if (recent.length < 6 && /^(10-K|10-Q|8-K|NT)/.test(form)) recent.push({ title: `${form}${r.items[i] ? ` (Item ${r.items[i]})` : ''}`, date: date.replace(/-/g, ''), url });
    }
    const d8 = date.replace(/-/g, '');
    if (form === '8-K' && r.items[i]) {
      for (const it of String(r.items[i]).split(',')) {
        if (ITEM_CRIT[it]) flags.push({ level: 'critical', label: ITEM_CRIT[it], title: `8-K Item ${it}: ${ITEM_CRIT[it]}`, date: d8, url });
        else if (ITEM_WARN[it]) flags.push({ level: 'warning', label: ITEM_WARN[it], title: `8-K Item ${it}: ${ITEM_WARN[it]}`, date: d8, url });
      }
    }
    if (/^NT 10-[KQ]/.test(form)) flags.push({ level: 'warning', label: '정기보고서 제출 지연', title: `${form}: 보고서 기한 내 제출 못함`, date: d8, url });
  }
  // 같은 종류 중복 제거
  const seen = new Set<string>();
  const uniq = flags.filter(f => { const k = f.label + f.date; if (seen.has(k)) return false; seen.add(k); return true; });

  const y0 = years[0];
  const losing = (y0.ocf ?? 0) < 0 || ((y0.op ?? 0) < 0 && (years[1].op ?? 0) < 0);
  const gcFlag = gc.hits > 0;
  if (gcFlag) uniq.unshift({ level: losing ? 'critical' : 'warning', label: '계속기업 불확실성 문구', title: '10-K에 "substantial doubt … going concern" 문구', date: '', url: gc.url ?? annualUrl ?? '' });

  const sic = Number(sub.sic);
  const fy = ends[0];
  return scoreCompany({
    market: 'US', currency: 'USD',
    corp: { corpCode: String(t.cik), name: sub.name || t.title, stockCode: t.ticker },
    years, baseYear: years[0].year,
    info: { ceo: undefined, industry: sub.sicDescription, established: undefined, homepage: sub.website || undefined, market: (sub.exchanges?.[0] ?? '미국') as string },
    filingLabel: `10-K(회계연도 말 ${fy})${latest ? ` + ${latest.source}` : ''} 기준`,
    latest,
    reportName: '10-K',
    isFinancial: sic >= 6000 && sic <= 6411 && y0.ca === undefined,
    audit: null, auditBad: gcFlag && losing,
    auditLabel: gcFlag ? '10-K 계속기업 불확실성 문구 있음' : '10-K 계속기업 불확실성 문구 없음',
    flags: uniq, disclosureCount: count, recent, annualReportUrl: annualUrl,
    price: null,
    govWatch: '10-K 제출 지연(NT 10-K), 감사인 교체(8-K 4.01), 신주 발행(8-K 3.02), 내부자 대량 매도',
    industryKey: sicSector(sic),
  });
}
