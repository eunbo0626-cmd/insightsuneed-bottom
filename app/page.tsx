import Link from 'next/link';
import SearchBox from './components/SearchBox';
import Hero from './components/Hero';
import Criteria from './components/Criteria';

const EXAMPLES: [string, string][] = [['삼성전자', '/k/005930'], ['SK하이닉스', '/k/000660'], ['NAVER', '/k/035420'], ['카카오', '/k/035720'], ['엔비디아', '/u/NVDA'], ['테슬라', '/u/TSLA'], ['나이키', '/u/NKE']];

export default function Home() {
  return (
    <main className="wrap">
      <Hero
        tag="저점판독기"
        title={<>기업 상태:<br /><span className="hl">싸진 건가,</span> 망가진 건가?</>}
        sub="주가가 얼마나 내려왔는지, 내려온 만큼 기업이 싸졌는지, 하락이 멈추고 있는지. 공시와 차트로 지금의 저점을 판독해요."
        foot={<>투자 엔진 EPISODE 02 · 국내·미국 상장사</>}
      />
      <SearchBox />
      <div className="chips">
        {EXAMPLES.map(([n, h]) => <Link key={h} href={h} className="chip">{n}</Link>)}
      </div>
      <section className="card how">
        <h3>무엇을 보여주나요?</h3>
        <ol>
          <li><b>저점 판독 결과</b> 저점 형성 후보 · 떨어지는 칼 · 가치 함정 의심 등</li>
          <li><b>3가지 판독 축</b> 가격 위치 · 기업 상태 · 차트 흐름</li>
          <li><b>근거와 위험을 함께</b> 저점 근거 · 위험 요인 · 다음에 확인할 것</li>
          <li><b>관점 선택</b> 단기 반등 관점 / 중장기 저평가 관점</li>
        </ol>
      </section>
      <Criteria />
      <a href="https://insightsuneed-check.vercel.app" className="card ep1" target="_blank" rel="noreferrer">
        <span><small>EPISODE 01</small><b>오를 이유보다 망할 이유를 먼저</b></span><span>투자 전 체크 →</span>
      </a>
      <p className="notice">본 서비스는 공개 공시·시세 자료를 규칙에 따라 계산한 참고 정보이며, 특정 종목의 매수·매도를 권유하지 않습니다. ‘저점’은 미래 가격을 예측한 것이 아니라 현재 근거를 정리한 판독이에요. 투자 판단과 결과의 책임은 투자자 본인에게 있습니다.</p>
    </main>
  );
}
