export const STEPS: { step: string; title: string; q: string; body: string; rules: string[] }[] = [
  { step: '0', title: '판독 보류 조건', q: '버틸 수 있는 회사인가?', body: '저점을 따지기 전에, 망가진 회사부터 걸러요.',
    rules: ['최근 1년 중대 공시(상장폐지·관리종목·회생·횡령·감사의견 등)', '투자 전 체크 등급 고위험', '망하는 시나리오 중 ‘매우 높음’이 있는 경우', '하나라도 해당하면 점수를 내지 않고 ‘판독 보류’'] },
  { step: '1', title: '가격 위치', q: '얼마나 내려왔나?', body: '같은 −30%라도 원래 많이 출렁이는 종목이면 평범할 수 있어요.',
    rules: ['52주 고점 대비 하락률', '3년 가격 범위에서 현재 위치', '평소 변동성 대비 낙폭 (1배 이상이면 이례적)', '시장 지수 대비 6개월 성과 (회사만의 문제인지 구분)'] },
  { step: '2', title: '기업 상태', q: '싸진 건가, 망가진 건가?', body: '핵심은 주가 하락폭과 이익 하락폭의 비교예요.',
    rules: ['주가가 이익보다 15%p 이상 더 빠졌으면 → 할인', '이익도 30% 넘게 줄었다면 → 싸진 게 아니라 작아진 것', 'PER·PBR을 이 회사의 최근 결산 시점과 비교', '적자 전환, 현금흐름 마이너스, 이자 감당 불가, 재무안정성 40점 미만 → 하자', '금융사는 순이익·PBR, 적자 기업은 PBR과 현금 체력 기준'] },
  { step: '3', title: '차트 흐름', q: '하락이 멈추고 있나?', body: '진정 신호 5개 중 3개 이상이면 ‘진정’, 최근 5일 안에 신저가면 ‘하락 중’.',
    rules: ['신저가 멈춤: 52주 최저가가 20거래일 이전', '저점 높아짐: 최근 20일 저점 > 이전 저점', '거래량 균형: 오른 날 거래량 > 내린 날 거래량', 'RSI 다이버전스: 가격 저점은 비슷해도 하락 힘은 약해짐', '이동평균 회복: 20일선 상승 전환 또는 60일선 회복'] },
  { step: '4', title: '수급·이벤트', q: '시장의 시선이 바뀌었나?', body: '보조 근거예요. 판독 결과를 바꾸지 않아요.',
    rules: ['자사주 취득 공시', '임원·대주주 지분 변동 보고', '투매성 거래(평소 3배 거래량 + 5% 급락) 이후 가격 유지'] },
];

export const MATRIX: [string, string, string, string][] = [
  ['할인', '진정', '저점 형성 후보', 'good'],
  ['할인', '확인 중', '할인 구간, 바닥 확인 중', 'good'],
  ['할인', '하락 중', '싸지만 아직 떨어지는 칼', 'mid'],
  ['애매', '진정', '반등 신호, 할인 근거는 약함', 'mid'],
  ['애매', '확인 중·하락 중', '내려왔지만, 싸졌는지 불분명', 'mid'],
  ['하자', '진정', '반등은 있지만 근거 약함', 'mid'],
  ['하자', '확인 중·하락 중', '저점 아님, 가치 함정 의심', 'bad'],
];

export default function Criteria({ compact = false }: { compact?: boolean }) {
  const body = (
    <>
      <div className="steps">
        {STEPS.map(s => (
          <div key={s.step} className="stepCard">
            <div className="stepHead"><span className="stepNo">{s.step}단계</span><b>{s.title}</b></div>
            <p className="stepQ">{s.q}</p>
            <p className="stepBody">{s.body}</p>
            <ul>{s.rules.map(x => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </div>
      <h4>판독 결과는 이렇게 정해요</h4>
      <table className="matrix">
        <thead><tr><th>기업 상태</th><th>차트</th><th>판독</th></tr></thead>
        <tbody>
          {MATRIX.map(([a, b, c, t]) => <tr key={a + b}><td>{a}</td><td>{b}</td><td><span className={'vt ' + t}>{c}</span></td></tr>)}
          <tr><td colSpan={2}>고점 대비 15% 미만 하락</td><td><span className="vt na">저점을 논하기엔 일러요</span></td></tr>
          <tr><td colSpan={2}>0단계 조건 해당</td><td><span className="vt bad">판독 보류</span></td></tr>
        </tbody>
      </table>
      <p className="muted small">‘바닥 확률’ 같은 숫자는 쓰지 않아요. 검증되지 않은 확률보다, 근거가 드러나는 판독을 보여드려요. 기준값은 과거 데이터 검증 결과에 따라 계속 다듬습니다.</p>
    </>
  );
  if (compact) return <details className="card criteria"><summary><b>판단 기준 보기</b><span>0~4단계 · 판독 결과표</span></summary>{body}</details>;
  return <section className="card criteria"><h3>이렇게 판독해요</h3>{body}</section>;
}
