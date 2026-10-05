import Link from 'next/link';
import type { Result } from '../../lib/run';
import type { Mode } from '../../lib/bottom';
import { price } from '../../lib/format';
import SearchBox from './SearchBox';
import PriceChart from './PriceChart';
import Criteria from './Criteria';

const EP1 = 'https://insightsuneed-check.vercel.app';

export default function BottomReport({ res, mode, base }: { res: Result; mode: Mode; base: string }) {
  const { r, b } = res;
  const cur = r.currency;
  const ep1 = r.market === 'KR' ? `${EP1}/c/${r.corp.stockCode}` : `${EP1}/us/${r.corp.stockCode}`;
  const [pAx, vAx, cAx, fAx] = b.axes;
  return (
    <main className="wrap">
      <Link href="/" className="back">← 저점판독기</Link>
      <section className="hero small">
        <span className="eyebrow">{r.market === 'KR' ? (r.info.market ?? '국내') : '미국'} · {r.corp.stockCode}</span>
        <h1>{r.corp.name}</h1>
        <p>현재가 <b className="hl">{price(b.stats.last, cur)}</b> · 52주 고점 대비 <b className="hl">{(b.stats.dd52 * 100).toFixed(1)}%</b> · {b.stats.asOf} 종가 기준</p>
      </section>

      <div className="seg">
        <Link href={`${base}?mode=short`} className={mode === 'short' ? 'on' : ''} scroll={false}>단기 반등 관점</Link>
        <Link href={`${base}?mode=long`} className={mode === 'long' ? 'on' : ''} scroll={false}>중장기 저평가 관점</Link>
      </div>

      <section className={`card verdict v-${b.verdict.tone}`}>
        <small>저점 판독 결과</small>
        <div className="vTitle">{b.verdict.title}</div>
        <p className="vLine">{b.verdict.line}</p>
        <p className="vMode"><b>{mode === 'short' ? '단기 반등 관점' : '중장기 저평가 관점'}</b> {b.verdict.modeNote[mode]}</p>
        <div className="trio">
          {[pAx, vAx, cAx].map(a => (
            <div key={a.key} className={'tri t-' + a.tone}>
              <small>{a.label}</small><b>{a.state}</b>
            </div>
          ))}
        </div>
        {b.hold.on && <ul className="holdList">{b.hold.reasons.map(h => <li key={h}>{h}</li>)}</ul>}
      </section>

      <section className="card">
        <div className="shead"><h3>최근 1년 주가</h3><span>{b.chart.lastDate} 기준</span></div>
        <PriceChart d={b.chart} cur={cur} />
      </section>

      <section className="card two">
        <div><h4>저점 근거</h4>{b.pros.length ? <ul>{b.pros.map(x => <li key={x}>{x}</li>)}</ul> : <p className="muted small">뚜렷한 근거가 없어요.</p>}</div>
        <div><h4>위험 요인</h4>{b.cons.length ? <ul>{b.cons.map(x => <li key={x}>{x}</li>)}</ul> : <p className="muted small">큰 위험 요인은 보이지 않아요.</p>}</div>
      </section>

      {b.next.length > 0 && (
        <section className="card nextBox">
          <h3>다음에 확인할 것</h3>
          <ol>{b.next.map(x => <li key={x}>{x}</li>)}</ol>
        </section>
      )}

      {(mode === 'short' ? [cAx, pAx, vAx, fAx] : [vAx, pAx, cAx, fAx]).map(a => (
        <section key={a.key} className="card axisCard">
          <div className="axTop">
            <div><span className="stepNo">{a.step}</span> <b className="axLabel">{a.label}</b><p className="axQ">{a.question}</p></div>
            <span className={'pillState t-' + a.tone}>{a.state}</span>
          </div>
          <p className="axSum">{a.summary}</p>
          <div className="kgrid">
            {a.items.map(it => (
              <div key={it.k} className={'kc t-' + (it.tone ?? 'na')}>
                <small>{it.k}</small><b>{it.v}</b>{it.note && <em>{it.note}</em>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <a href={ep1} className="card ep1" target="_blank" rel="noreferrer">
        <span><small>EPISODE 01</small><b>이 회사가 망할 이유도 확인하기</b></span><span>투자 전 체크 →</span>
      </a>

      <Criteria compact />
      <SearchBox compact />
      <p className="notice">자료: {b.sources.join(' · ')}. 가치평가의 과거 비교는 현재 주식 수를 적용한 근사치예요. 본 서비스는 공개 자료를 규칙에 따라 계산한 참고 정보이며, 특정 종목의 매수·매도를 권유하지 않습니다. 투자 판단과 결과의 책임은 투자자 본인에게 있습니다.</p>
      <p className="foot">저점판독기 · 투자 엔진 EPISODE 02 · @insightsuneed</p>
    </main>
  );
}

export function ErrorView({ err }: { err?: string }) {
  return (
    <main className="wrap">
      <Link href="/" className="back">← 저점판독기</Link>
      <section className="card error"><h3>판독하지 못했어요</h3><p>{err}</p></section>
      <SearchBox compact />
    </main>
  );
}
