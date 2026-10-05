import type { Report, YearData } from './analyze';
import type { Bar } from './market';
import { price as money } from './format';

// ======================= 타입 =======================
export type Tone = 'good' | 'mid' | 'bad' | 'na';
export type Mode = 'short' | 'long';
export type Item = { k: string; v: string; note?: string; tone?: Tone };
export type AxisResult = { key: 'price' | 'value' | 'chart' | 'flow'; step: string; label: string; question: string; state: string; tone: Tone; score: number | null; summary: string; items: Item[] };
export type Verdict = { code: string; title: string; line: string; tone: Tone; modeNote: Record<Mode, string> };
export type ChartData = { bars: Bar[]; ma60: (number | null)[]; hi52: number; lo52: number; last: number; lastDate: string };
export type Bottom = {
  verdict: Verdict;
  hold: { on: boolean; reasons: string[] };
  axes: AxisResult[];
  pros: string[]; cons: string[]; next: string[];
  chart: ChartData;
  stats: { dd52: number; last: number; hi52: number; lo52: number; asOf: string };
  sources: string[];
};
export type Input = {
  r: Report; bars: Bar[]; priceSource: string;
  index: { name: string; bars: Bar[] } | null;
  shares: { shares: number; basis: string } | null;
  disclosures180?: { title: string; date: string; url: string }[];
};

// ======================= 도구 =======================
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
function interp(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0); }
  return pts[pts.length - 1][1];
}
const pc = (x: number | null | undefined, d = 1) => x === null || x === undefined || !isFinite(x) ? '-' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const pp = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(0)}%p`;
const mult = (x: number | null) => x === null || !isFinite(x) ? '-' : `${x.toFixed(1)}배`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sma = (xs: number[], n: number, i: number) => i + 1 < n ? null : xs.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n;
function rsiSeries(c: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = c.map(() => null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function priceAt(bars: Bar[], date: string): number | null {
  // date 이전 마지막 종가
  let p: number | null = null;
  for (const b of bars) { if (b.d <= date) p = b.c; else break; }
  return p;
}
const argmin = (xs: number[], from: number, to: number) => { let k = from; for (let i = from; i <= to; i++) if (xs[i] < xs[k]) k = i; return k; };

// ======================= 메인 =======================
export function readBottom(inp: Input): Bottom {
  const { r, bars } = inp;
  if (bars.length < 130) throw new Error('판독에 필요한 주가 기록(최소 6개월)이 부족해요. 최근 상장한 종목일 수 있어요.');
  const cur = r.currency;
  const c = bars.map(b => b.c), v = bars.map(b => b.v);
  const N = c.length, last = c[N - 1], lastDate = bars[N - 1].d;
  const y1from = Math.max(0, N - 252);
  const y1 = c.slice(y1from);
  const hi52 = Math.max(...y1), lo52 = Math.min(...y1);
  const lo52Idx = y1from + y1.indexOf(lo52);
  const dd52 = last / hi52 - 1;

  // ---------------- 0단계: 판독 보류 ----------------
  const holdReasons: string[] = [];
  const crit = r.flags.filter(f => f.level === 'critical');
  if (crit.length) holdReasons.push(`최근 1년 중대 공시: ${[...new Set(crit.map(f => f.label))].join(', ')}`);
  if (r.grade === '고위험') holdReasons.push(`투자 전 체크 등급 '고위험' (${r.gradeReason || '부실 징후'})`);
  const severe = r.scenarios.filter(s => s.level === '매우 높음');
  if (severe.length) holdReasons.push(`망하는 시나리오 '매우 높음': ${severe.map(s => s.title.replace(' 시나리오', '')).join(', ')}`);
  const hold = holdReasons.length > 0;

  // ---------------- 1단계: 가격 위치 ----------------
  const y3from = Math.max(0, N - 756);
  const y3 = c.slice(y3from);
  const min3 = Math.min(...y3), max3 = Math.max(...y3);
  const pos3 = max3 > min3 ? (last - min3) / (max3 - min3) : 0.5;
  const rets: number[] = [];
  for (let i = Math.max(1, N - 252); i < N; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
  const ddSig = vol > 0 ? -dd52 / vol : 0;
  const ret6 = N > 126 ? last / c[N - 127] - 1 : null;
  const ret1y = N > 252 ? last / c[N - 253] - 1 : last / c[0] - 1;
  let idx6: number | null = null;
  if (inp.index && inp.index.bars.length > 126) { const ib = inp.index.bars; idx6 = ib[ib.length - 1].c / ib[ib.length - 127].c - 1; }
  const rel6 = ret6 !== null && idx6 !== null ? ret6 - idx6 : null;
  const depth = Math.round(0.4 * interp(-dd52, [[0, 0], [0.1, 20], [0.2, 45], [0.35, 75], [0.5, 95]]) + 0.3 * interp(1 - pos3, [[0, 0], [0.5, 30], [0.8, 70], [1, 100]]) + 0.3 * interp(ddSig, [[0, 0], [0.5, 35], [1, 70], [1.5, 95]]));
  const depthLv = Math.max(depth >= 65 ? 2 : depth >= 40 ? 1 : 0, dd52 <= -0.35 ? 2 : dd52 <= -0.2 ? 1 : 0);
  const depthState = ['얕은 하락', '조정 구간', '깊은 하락'][depthLv];
  const priceAxis: AxisResult = {
    key: 'price', step: '1단계', label: '가격 위치', question: '얼마나 내려왔나?', state: depthState,
    tone: depthLv === 2 ? 'good' : depthLv === 1 ? 'mid' : 'na', score: depth,
    summary: `52주 고점 대비 ${pc(dd52, 0)}, 3년 가격 범위의 ${pos3 < 0.2 ? '하단' : pos3 < 0.5 ? '중하단' : pos3 < 0.8 ? '중상단' : '상단'}(${Math.round(pos3 * 100)}%)이에요. 평소 변동성(연 ${(vol * 100).toFixed(0)}%)을 감안하면 ${ddSig >= 1 ? '이례적으로 깊은' : ddSig >= 0.6 ? '꽤 큰' : '흔히 있는 수준의'} 하락이에요.`,
    items: [
      { k: '52주 고점 대비', v: pc(dd52, 1), note: `고점 ${money(hi52, cur)}` },
      { k: '3년 범위 내 위치', v: `${Math.round(pos3 * 100)}%`, note: '0%가 3년 최저가' },
      { k: '변동성 대비 낙폭', v: `${ddSig.toFixed(2)}배`, note: '1배 이상이면 이례적' },
      { k: `6개월 ${inp.index?.name ?? '시장'} 대비`, v: rel6 === null ? '-' : pp(rel6), note: rel6 === null ? '지수 미연결' : rel6 < -0.15 ? '이 회사만의 이유 확인' : rel6 > 0.05 ? '시장보다 선방' : '시장과 비슷', tone: rel6 === null ? 'na' : rel6 < -0.15 ? 'bad' : 'mid' },
    ],
  };

  // ---------------- 2단계: 기업 상태 ----------------
  const fin = r.isFinancial;
  const L = r.latest;
  const a0 = r.years[0], a1 = r.years[1];
  const y0: YearData = L ? L.ttm : a0;
  const key = fin ? 'ni' : 'op';
  const keyName = fin ? '순이익' : '영업이익';
  // 같은 기간 비교: 올해 누적 vs 작년 같은 기간 (없으면 직전 2개 결산 비교)
  let eNow: number | undefined, ePrev: number | undefined, eBasis = '';
  if (L?.ytd && (L.ytd as any)[key] !== undefined && (L.ytd as any)[key + 'Prev'] !== undefined) { eNow = (L.ytd as any)[key]; ePrev = (L.ytd as any)[key + 'Prev']; eBasis = `${L.label} 누적, 전년 같은 기간 대비`; }
  else if (a0?.[key] !== undefined && a1?.[key] !== undefined) { eNow = a0[key] as number; ePrev = a1[key] as number; eBasis = `${a0.year}년 vs ${a1.year}년`; }
  const earnChg = eNow !== undefined && ePrev !== undefined && ePrev > 0 ? eNow / ePrev - 1 : null;
  const turnedLoss = eNow !== undefined && ePrev !== undefined && ePrev > 0 && eNow <= 0;
  const lossBoth = eNow !== undefined && ePrev !== undefined && ePrev <= 0 && eNow <= 0;
  const revChg = L?.ytd?.revenue !== undefined && L?.ytd?.revenuePrev ? L.ytd.revenue / L.ytd.revenuePrev - 1 : (a0?.revenue && a1?.revenue ? a0.revenue / a1.revenue - 1 : null);
  const gap = earnChg !== null ? earnChg - ret1y : null; // +면 주가가 이익보다 더 많이 빠짐

  // 가치평가: 현재 vs 최근 결산 시점들
  const S = inp.shares?.shares ?? null;
  const mcap = S ? last * S : null;
  const perNow = mcap && y0.ni && y0.ni > 0 ? mcap / y0.ni : null;
  const pbrNow = mcap && y0.equity && y0.equity > 0 ? mcap / y0.equity : null;
  const histPer: number[] = [], histPbr: number[] = [];
  if (S) for (const y of r.years) {
    const p = priceAt(bars, `${y.year}-12-31`);
    if (!p || bars[0].d > `${y.year}-12-31`) continue;
    if (y.ni && y.ni > 0) histPer.push((p * S) / y.ni);
    if (y.equity && y.equity > 0) histPbr.push((p * S) / y.equity);
  }
  const perMed = median(histPer), pbrMed = median(histPbr);
  const useMetric = fin || !perNow || !perMed ? 'PBR' : 'PER';
  const vNow = useMetric === 'PER' ? perNow : pbrNow, vMed = useMetric === 'PER' ? perMed : pbrMed;
  const vRel = vNow && vMed ? vNow / vMed : null;

  const stab = r.axes.find(a => a.key === 'stability')?.score ?? null;
  const riskS = r.axes.find(a => a.key === 'risk')?.score ?? null;
  const icr = r.metrics.icr ?? null;
  const ocfNeg = !fin && y0.ocf !== undefined && y0.ocf < 0;
  const damage: string[] = [];
  if (turnedLoss) damage.push(`${keyName}이 적자로 돌아섬`);
  if (earnChg !== null && earnChg <= -0.3 && (gap === null || gap < 0.1)) damage.push(`${keyName}이 ${pc(earnChg, 0)} 줄어 주가 하락만큼 기업도 작아짐`);
  if (stab !== null && stab < 40) damage.push(`재무안정성 점수 ${stab}점`);
  if (ocfNeg) damage.push('본업 현금흐름 마이너스');
  if (icr !== null && icr < 1) damage.push('영업이익으로 이자도 감당 못 함');
  const cheapByHist = vRel !== null && vRel <= 0.85;
  const pricierByHist = vRel !== null && vRel >= 1.15;
  let valueState: '할인' | '애매' | '하자';
  if (damage.length) valueState = '하자';
  else if ((gap !== null && gap >= 0.15 && !pricierByHist) || (cheapByHist && (earnChg === null || earnChg > -0.15))) valueState = '할인';
  else valueState = '애매';
  if (lossBoth && valueState === '할인') valueState = '애매';
  const valueScore = clamp(Math.round(50 + (gap !== null ? clamp(gap * 120, -40, 40) : 0) + (vRel !== null ? clamp((1 - vRel) * 60, -25, 25) : 0) - damage.length * 15));
  const valueAxis: AxisResult = {
    key: 'value', step: '2단계', label: '기업 상태', question: '싸진 건가, 망가진 건가?',
    state: valueState === '할인' ? '싸졌다 (할인)' : valueState === '하자' ? '망가졌다 (하자 의심)' : '판단 애매',
    tone: valueState === '할인' ? 'good' : valueState === '하자' ? 'bad' : 'mid', score: valueScore,
    summary: valueState === '할인'
      ? `${ret1y < 0 ? `주가(1년 ${pc(ret1y, 0)})가 ${keyName}(${earnChg === null ? '-' : pc(earnChg, 0)})보다 더 많이 빠졌어요.` : `${keyName}(${earnChg === null ? '-' : pc(earnChg, 0)})이 주가(1년 ${pc(ret1y, 0)})보다 더 많이 늘었어요.`}${vRel !== null ? ` ${useMetric}도 최근 결산 시점 평균의 ${Math.round(vRel * 100)}% 수준이에요.` : ''} 기업보다 가격이 더 줄어든 상태예요.`
      : valueState === '하자'
        ? `${damage.join(', ')}. 가격만 내려온 게 아니라 기업도 함께 약해졌어요.`
        : lossBoth ? `적자가 이어져 이익 기준으로 싸다·비싸다를 말하기 어려워요. ${pbrNow ? `PBR ${mult(pbrNow)}과 현금 체력을 함께 보세요.` : ''}`
          : `주가와 ${keyName}의 변화가 비슷하거나, 가치평가가 과거보다 확실히 낮지 않아요.`,
    items: [
      { k: '주가 1년 변화', v: pc(ret1y, 0) },
      { k: `${keyName} 변화`, v: earnChg === null ? (lossBoth ? '적자 지속' : turnedLoss ? '적자 전환' : '-') : pc(earnChg, 0), note: eBasis, tone: earnChg === null ? (turnedLoss || lossBoth ? 'bad' : 'na') : earnChg < -0.3 ? 'bad' : earnChg < 0 ? 'mid' : 'good' },
      { k: '주가−이익 격차', v: gap === null ? '-' : pp(gap), note: gap === null ? '' : gap >= 0.15 ? (ret1y < 0 ? '이익보다 주가가 더 약함' : '이익이 주가보다 더 늘어남') : gap <= -0.15 ? '이익이 더 많이 빠짐' : '비슷하게 움직임', tone: gap === null ? 'na' : gap >= 0.15 ? 'good' : gap <= -0.15 ? 'bad' : 'mid' },
      { k: `${useMetric} 현재 / 과거 중앙값`, v: `${mult(vNow)} / ${mult(vMed)}`, note: vRel === null ? '주식 수·이익 부족' : cheapByHist ? '과거보다 낮음' : pricierByHist ? '과거보다 높음' : '과거와 비슷', tone: vRel === null ? 'na' : cheapByHist ? 'good' : pricierByHist ? 'bad' : 'mid' },
      { k: '매출 변화', v: pc(revChg, 0), tone: revChg === null ? 'na' : revChg < -0.1 ? 'bad' : revChg < 0 ? 'mid' : 'good' },
      { k: '재무안정성 · 리스크', v: `${stab ?? '-'}점 · ${riskS ?? '-'}점`, note: 'EPISODE 01 점검 점수', tone: stab === null ? 'na' : stab < 40 ? 'bad' : stab < 60 ? 'mid' : 'good' },
    ],
  };

  // ---------------- 3단계: 차트 진정 ----------------
  const recentLowAge = N - 1 - lo52Idx;
  const sig: { k: string; on: boolean; note: string }[] = [];
  sig.push({ k: '신저가 멈춤', on: recentLowAge >= 20, note: recentLowAge >= 20 ? `52주 최저가가 ${recentLowAge}거래일 전` : recentLowAge === 0 ? '오늘 52주 최저가' : `최근 ${recentLowAge}거래일 안에 52주 최저가` });
  const lowA = Math.min(...c.slice(N - 20)), lowB = Math.min(...c.slice(N - 60, N - 20));
  sig.push({ k: '저점 높아짐', on: lowA > lowB * 1.01, note: `최근 20일 저점 ${money(lowA, cur)} vs 이전 저점 ${money(lowB, cur)}` });
  let upV = 0, upN = 0, dnV = 0, dnN = 0;
  for (let i = N - 20; i < N; i++) { if (c[i] > c[i - 1]) { upV += v[i]; upN++; } else if (c[i] < c[i - 1]) { dnV += v[i]; dnN++; } }
  const upAvg = upN ? upV / upN : 0, dnAvg = dnN ? dnV / dnN : 0;
  const volOk = upN >= 3 && dnN >= 1 && upAvg > dnAvg * 1.1;
  sig.push({ k: '거래량 균형', on: volOk, note: dnAvg ? `오른 날 거래량이 내린 날의 ${(upAvg / dnAvg).toFixed(2)}배` : '-' });
  const rsi = rsiSeries(c);
  const iA = argmin(c, N - 40, N - 1), iB = argmin(c, Math.max(0, N - 100), N - 41);
  const div = c[iA] <= c[iB] * 1.03 && rsi[iA] !== null && rsi[iB] !== null && (rsi[iA] as number) > (rsi[iB] as number) + 5;
  sig.push({ k: 'RSI 다이버전스', on: div, note: `현재 RSI ${rsi[N - 1]?.toFixed(0) ?? '-'}${div ? ', 가격 저점은 낮아도 하락 힘은 약해짐' : ''}` });
  const ma20 = sma(c, 20, N - 1), ma20p = sma(c, 20, N - 6), ma60 = sma(c, 60, N - 1);
  const maOk = !!(ma20 && ma20p && ((last > ma20 && ma20 > ma20p) || (ma60 && last > ma60)));
  sig.push({ k: '이동평균 회복', on: maOk, note: `20일선 ${ma20 ? money(ma20, cur) : '-'}, 60일선 ${ma60 ? money(ma60, cur) : '-'}` });
  const on = sig.filter(s => s.on).length;
  const falling = recentLowAge < 5 || on === 0;
  const nearLow = last <= lo52 * 1.03 && !(lowA > lowB * 1.01);
  const chartState: '진정' | '확인 중' | '하락 중' = falling ? '하락 중' : on >= 3 && !nearLow ? '진정' : '확인 중';
  const chartAxis: AxisResult = {
    key: 'chart', step: '3단계', label: '차트 흐름', question: '하락이 멈추고 있나?',
    state: chartState === '진정' ? '진정 신호' : chartState === '확인 중' ? '바닥 확인 중' : '하락 진행 중',
    tone: chartState === '진정' ? 'good' : chartState === '확인 중' ? 'mid' : 'bad', score: Math.round((on / 5) * 100),
    summary: `진정 신호 5개 중 ${on}개가 켜져 있어요.${recentLowAge < 5 ? ' 최근 5거래일 안에 52주 최저가를 새로 썼어요.' : nearLow ? ` 다만 주가가 52주 최저가(${money(lo52, cur)})에서 3% 안쪽이라, 바닥은 아직 확인 중이에요.` : ''}`,
    items: sig.map(s => ({ k: s.k, v: s.on ? '켜짐' : '꺼짐', note: s.note, tone: s.on ? 'good' : 'na' })),
  };

  // ---------------- 4단계: 수급·이벤트 (보조) ----------------
  const flowItems: Item[] = [];
  const disc = inp.disclosures180 ?? [];
  const buyback = disc.find(d => /자기주식\s*취득|자사주\s*취득/.test(d.title) && !/처분|소각/.test(d.title));
  const insider = disc.filter(d => /임원ㆍ주요주주특정증권등소유상황보고서|최대주주등소유주식변동/.test(d.title)).length;
  if (r.market === 'KR') {
    flowItems.push({ k: '자사주 취득', v: buyback ? '있음' : '없음', note: buyback ? `${buyback.date.slice(0, 4)}.${buyback.date.slice(4, 6)}.${buyback.date.slice(6)} ${buyback.title}` : '최근 6개월', tone: buyback ? 'good' : 'na' });
    flowItems.push({ k: '임원·대주주 지분 변동 보고', v: `${insider}건`, note: '매수·매도 여부는 원문 확인', tone: 'na' });
  }
  let capit = -1;
  const v60 = v.slice(N - 120, N - 60); const vAvg = v60.length ? v60.reduce((a, b) => a + b, 0) / v60.length : 0;
  for (let i = N - 60; i < N; i++) if (vAvg && v[i] > vAvg * 3 && c[i] / c[i - 1] - 1 < -0.05) capit = i;
  const capitRecovered = capit > 0 && Math.min(...c.slice(capit + 1)) >= c[capit] * 0.97 && capit < N - 3;
  flowItems.push({ k: '투매성 거래', v: capit > 0 ? bars[capit].d.slice(5).replace('-', '/') : '없음', note: capit > 0 ? (capitRecovered ? '대량 하락 후 그 가격을 지키는 중' : '대량 하락 후에도 약세') : '최근 60일 평소 3배 이상 거래 + 5% 급락', tone: capit > 0 ? (capitRecovered ? 'good' : 'bad') : 'na' });
  const flowGood = flowItems.filter(i => i.tone === 'good').length, flowBad = flowItems.filter(i => i.tone === 'bad').length;
  const flowAxis: AxisResult = {
    key: 'flow', step: '4단계', label: '수급·이벤트', question: '시장의 시선이 바뀌었나?',
    state: flowGood > flowBad ? '긍정 신호 있음' : flowBad > flowGood ? '부정 신호' : '특이 신호 없음',
    tone: flowGood > flowBad ? 'good' : flowBad > flowGood ? 'bad' : 'na', score: null,
    summary: '보조 근거예요. 판독 결과를 바꾸지 않고, 참고로만 보여드려요.',
    items: flowItems,
  };

  // ---------------- 종합 판독 ----------------
  const ddTxt = pc(dd52, 0);
  let verdict: Verdict;
  const shallow = depthLv === 0 && dd52 > -0.15;
  if (hold) verdict = { code: 'hold', title: '판독 보류', tone: 'bad', line: '저점을 따지기 전에, 회사가 버틸 수 있는지부터 확인해야 해요.', modeNote: { short: '중대 위험 신호가 있는 종목은 반등 여부와 관계없이 판독하지 않아요.', long: '위험 신호가 해소되는지 공시로 먼저 확인하세요.' } };
  else if (shallow) verdict = { code: 'early', title: '저점을 논하기엔 일러요', tone: 'na', line: `고점 대비 ${ddTxt}. 아직 ‘많이 내려온 가격’이라고 보기 어려워요.`, modeNote: { short: '평소 변동 범위 안의 움직임이에요.', long: '가치 측면의 할인 폭도 크지 않을 가능성이 높아요.' } };
  else if (valueState === '할인' && chartState === '진정') verdict = { code: 'candidate', title: '저점 형성 후보', tone: 'good', line: `고점 대비 ${ddTxt}. 기업보다 가격이 더 줄었고, 하락도 진정되고 있어요.`, modeNote: { short: '진정 신호가 켜졌어요. 최근 저점을 지키는지가 핵심이에요.', long: '할인과 진정이 함께 보이는 구간이에요. 다음 실적으로 이익 유지를 확인하세요.' } };
  else if (valueState === '할인' && chartState === '확인 중') verdict = { code: 'watch', title: '할인 구간, 바닥 확인 중', tone: 'good', line: `고점 대비 ${ddTxt}. 싸진 근거는 있지만, 바닥은 아직 확인 중이에요.`, modeNote: { short: '진정 신호가 더 켜지기 전까진 반등을 단정하기 어려워요.', long: '가치 측면 근거는 있어요. 저점이 더 낮아지지 않는지 지켜볼 구간이에요.' } };
  else if (valueState === '할인') verdict = { code: 'knife', title: '싸지만 아직 떨어지는 칼', tone: 'mid', line: `고점 대비 ${ddTxt}. 기업보다 가격이 더 빠졌지만, 하락이 아직 멈추지 않았어요.`, modeNote: { short: '하락 추세가 살아 있어 단기 반등을 노리기엔 이른 구간이에요.', long: '할인 근거는 있어요. 신저가 갱신이 멈추는지 확인하며 관찰할 구간이에요.' } };
  else if (valueState === '하자' && chartState === '진정') verdict = { code: 'weak', title: '반등은 있지만 근거 약함', tone: 'mid', line: `고점 대비 ${ddTxt}. 차트는 진정됐지만, 기업도 함께 약해졌어요.`, modeNote: { short: '기술적 반등일 수 있어요. 실적이 받쳐주지 않으면 다시 밀릴 수 있어요.', long: '기업 상태가 회복되기 전까진 저점이라 보기 어려워요.' } };
  else if (valueState === '하자') verdict = { code: 'trap', title: '저점 아님, 가치 함정 의심', tone: 'bad', line: `고점 대비 ${ddTxt}. 싸진 게 아니라, 기업이 작아진 만큼 내려왔을 수 있어요.`, modeNote: { short: '하락 추세와 실적 악화가 겹쳐 있어요.', long: '이익이 다시 늘어나는 근거가 나오기 전까진 저점 판단을 미루세요.' } };
  else if (chartState === '진정') verdict = { code: 'rebound', title: '반등 신호, 할인 근거는 약함', tone: 'mid', line: `고점 대비 ${ddTxt}. 하락은 진정되고 있지만, 싸졌다고 보기엔 근거가 약해요.`, modeNote: { short: '차트 근거는 있어요. 다만 가격 매력보다는 흐름에 기댄 반등이에요.', long: '가치 측면의 할인 폭이 크지 않아요.' } };
  else verdict = { code: 'unclear', title: '내려왔지만, 싸졌는지 불분명', tone: 'mid', line: `고점 대비 ${ddTxt}. 가격은 내려왔지만, 기업 가치 대비 싸졌는지는 아직 분명하지 않아요.`, modeNote: { short: '하락 진정 신호도 충분하지 않아요.', long: '다음 실적에서 이익 방향을 확인한 뒤 다시 판독해 보세요.' } };

  // ---------------- 근거·위험·다음 확인 ----------------
  const pros: string[] = [], cons: string[] = [], next: string[] = [];
  if (depthLv === 2) pros.push(`고점 대비 ${ddTxt}의 깊은 하락${pos3 < 0.25 ? ", 3년 가격 범위 하단" : ""}`);
  if (gap !== null && gap >= 0.15) pros.push(ret1y < 0 && earnChg !== null && earnChg >= 0 ? `주가는 1년 ${pc(ret1y, 0)}인데 ${keyName}은 ${pc(earnChg, 0)}` : ret1y < 0 ? `주가(1년 ${pc(ret1y, 0)})가 ${keyName}(${pc(earnChg, 0)})보다 ${pp(gap).replace('+', '')} 더 빠짐` : `${keyName} 증가(${pc(earnChg, 0)})가 주가 상승(${pc(ret1y, 0)})보다 큼`);
  if (cheapByHist) pros.push(`${useMetric} ${mult(vNow)}로 최근 결산 시점 중앙값(${mult(vMed)})보다 낮음`);
  if (earnChg !== null && earnChg > 0 && !(gap !== null && gap >= 0.15)) pros.push(`${keyName}은 ${pc(earnChg, 0)} 증가`);
  sig.filter(s => s.on).slice(0, 2).forEach(s => pros.push(`차트: ${s.k} (${s.note})`));
  if (buyback) pros.push('최근 6개월 자사주 취득 공시');
  if (capitRecovered) pros.push('투매성 거래 이후 그 가격을 지키는 중');
  damage.forEach(d => cons.push(d));
  if (pricierByHist) cons.push(`${useMetric}가 과거 결산 시점보다 높아 가격 매력은 크지 않음`);
  if (rel6 !== null && rel6 < -0.15) cons.push(`최근 6개월 ${inp.index?.name ?? '시장'}보다 ${pp(-rel6).replace('+', '')} 더 하락: 이 회사만의 이유가 있을 수 있음`);
  if (recentLowAge < 20) cons.push(recentLowAge === 0 ? '오늘 52주 최저가 갱신' : `최근 ${recentLowAge}거래일 안에 52주 최저가 갱신`);
  if (revChg !== null && revChg < -0.1) cons.push(`매출 ${pc(revChg, 0)} 감소`);
  r.flags.filter(f => f.level === 'warning').slice(0, 2).forEach(f => cons.push(`주의 공시: ${f.label}`));
  if (hold) holdReasons.forEach(h => cons.unshift(h));
  if (hold) next.push('중대 공시의 원문과 이후 후속 공시(해소·정정 여부)', '투자 전 체크에서 망하는 시나리오 상세 확인');
  else {
    if (chartState !== '진정') next.push(`최근 저점 ${money(Math.min(...c.slice(N - 20)), cur)}을 다시 깨지 않는지`);
    if (valueState !== '할인' || (earnChg !== null && earnChg < 0)) next.push(`다음 분기 실적에서 ${keyName} 감소가 멈추는지`);
    if (valueState === '할인') next.push(`${keyName}이 유지되는지 (줄면 할인이 아니라 하자로 바뀔 수 있음)`);
    if (rel6 !== null && rel6 < -0.15) next.push('시장보다 더 빠진 이유: 업황인지, 회사 고유 문제인지');
    if (ma60 && last < ma60) next.push(`60일 이동평균(${money(ma60, cur)}) 위로 회복하는지`);
  }

  // ---------------- 차트 데이터 ----------------
  const cb = bars.slice(y1from);
  const ma60s = cb.map((_, i) => sma(c, 60, y1from + i));

  return {
    verdict, hold: { on: hold, reasons: holdReasons },
    axes: [priceAxis, valueAxis, chartAxis, flowAxis],
    pros: pros.slice(0, 4), cons: cons.slice(0, 4), next: next.slice(0, 4),
    chart: { bars: cb, ma60: ma60s, hi52, lo52, last, lastDate },
    stats: { dd52, last, hi52, lo52, asOf: lastDate },
    sources: [inp.priceSource, r.filingLabel, inp.shares ? `주식 수: ${inp.shares.basis}` : '주식 수 미확인: 가치평가 일부 제외', ...(inp.index ? [`비교 지수: ${inp.index.name}`] : [])],
  };
}
