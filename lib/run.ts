import { analyze, Report } from './analyze';
import { analyzeUs } from './analyzeUs';
import { recentDisclosures } from './dart';
import { findUs } from './sec';
import { indexSeries, sharesKR, sharesUS, stockSeries } from './market';
import { Bottom, readBottom } from './bottom';

export type Result = { r: Report; b: Bottom };

const dartUrl = (no: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${no}`;

export async function runKR(code: string): Promise<Result> {
  const r = await analyze(code);
  const [s, index, shares, disc] = await Promise.all([
    stockSeries('KR', r.corp.stockCode),
    indexSeries('KR', r.info.market),
    sharesKR(r.corp.corpCode),
    recentDisclosures(r.corp.corpCode, 180).catch(() => []),
  ]);
  const b = readBottom({ r, bars: s.bars, priceSource: s.source, index, shares, disclosures180: disc.map(d => ({ title: d.report_nm.trim(), date: d.rcept_dt, url: dartUrl(d.rcept_no) })) });
  return { r, b };
}

export async function runUS(ticker: string): Promise<Result> {
  const f = await findUs(ticker);
  if (!f) throw new Error(`미국 종목 '${ticker}'을(를) 찾지 못했어요. 티커를 확인해 주세요.`);
  if (f.kind === 'etf' || !f.t) throw new Error('ETF는 기업 재무가 없어 저점판독기에서 지원하지 않아요. 개별 기업을 입력해 주세요.');
  const t = f.t;
  const r = await analyzeUs(t);
  const [s, index, shares] = await Promise.all([stockSeries('US', t.ticker), indexSeries('US'), sharesUS(t.cik)]);
  const b = readBottom({ r, bars: s.bars, priceSource: s.source, index, shares });
  return { r, b };
}
