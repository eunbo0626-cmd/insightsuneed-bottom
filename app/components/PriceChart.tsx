import type { ChartData } from '../../lib/bottom';
import { price as money } from '../../lib/format';

export default function PriceChart({ d, cur }: { d: ChartData; cur: 'KRW' | 'USD' }) {
  const W = 640, H = 220, P = { l: 8, r: 8, t: 16, b: 22 };
  const vals = [...d.bars.map(b => b.c), ...d.ma60.filter((x): x is number => x !== null)];
  const max = Math.max(...vals), min = Math.min(...vals);
  const x = (i: number) => P.l + (i / Math.max(1, d.bars.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  const line = d.bars.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.c).toFixed(1)}`).join('');
  const area = `${line}L${x(d.bars.length - 1).toFixed(1)},${H - P.b}L${x(0).toFixed(1)},${H - P.b}Z`;
  let ma = '';
  d.ma60.forEach((v, i) => { if (v !== null) ma += `${ma ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  const loI = d.bars.findIndex(b => b.c === d.lo52), hiI = d.bars.findIndex(b => b.c === d.hi52);
  const lastI = d.bars.length - 1;
  const months: { i: number; t: string }[] = [];
  d.bars.forEach((b, i) => { if (i && b.d.slice(5, 7) !== d.bars[i - 1].d.slice(5, 7) && ['01', '04', '07', '10'].includes(b.d.slice(5, 7))) months.push({ i, t: `${b.d.slice(2, 4)}.${b.d.slice(5, 7)}` }); });
  return (
    <div className="chartBox">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 1년 주가 차트">
        <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#14b8a6" stopOpacity=".22" /><stop offset="1" stopColor="#14b8a6" stopOpacity="0" /></linearGradient></defs>
        <line x1={P.l} x2={W - P.r} y1={y(d.hi52)} y2={y(d.hi52)} className="refHi" />
        <line x1={P.l} x2={W - P.r} y1={y(d.lo52)} y2={y(d.lo52)} className="refLo" />
        <path d={area} fill="url(#ga)" />
        {ma && <path d={ma} className="ma" />}
        <path d={line} className="px" />
        <circle cx={x(hiI)} cy={y(d.hi52)} r="3.5" className="dotHi" />
        <circle cx={x(loI)} cy={y(d.lo52)} r="3.5" className="dotLo" />
        <circle cx={x(lastI)} cy={y(d.last)} r="4.5" className="dotNow" />
        {months.filter(m => x(m.i) > 24 && x(m.i) < W - 24).map(m => <text key={m.i} x={x(m.i)} y={H - 6} className="tick">{m.t}</text>)}
      </svg>
      <div className="legend">
        <span><i className="lg px" />종가</span><span><i className="lg ma" />60일 이동평균</span>
        <span><i className="lg hi" />52주 고점 {money(d.hi52, cur)}</span><span><i className="lg lo" />52주 저점 {money(d.lo52, cur)}</span>
      </div>
    </div>
  );
}
