import { NextResponse } from 'next/server';
import { searchCorps } from '../../../lib/dart';
import { usTickers } from '../../../lib/sec';
import { KR_US } from '../../../lib/krnames';

type Item = { key: string; name: string; code: string; tag: string; href: string };
const KR_ETF = /^(KODEX|TIGER|ACE|SOL|RISE|KBSTAR|HANARO|ARIRANG|KOSEF|PLUS|1Q|TIME|BNK|마이티)/i;

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ items: [] });
  const items: Item[] = [];
  if (KR_ETF.test(q)) return NextResponse.json({ items: [], notice: 'ETF는 기업 재무가 없어 저점판독기에서 지원하지 않아요. 개별 기업을 검색해 주세요.' });
  try {
    // 한글 별칭
    const qn = q.replace(/\s/g, '').toUpperCase();
    for (const [ko, tk, kind] of KR_US) if (ko.toUpperCase().startsWith(qn) || (qn.length >= 2 && ko.toUpperCase().includes(qn)))
      if (!items.some(i => i.code === tk)) items.push({ key: 'a' + tk, name: ko, code: tk, tag: kind === 'etf' ? '미국 ETF' : '미국', href: kind === 'etf' ? '' : `/u/${tk}` });
    // 미국 티커·영문명
    if (/^[A-Za-z][A-Za-z .\-&]*$/.test(q)) {
      const { stocks, funds } = await usTickers();
      const Q = q.toUpperCase();
      const fset = new Set(funds.map(f => f.ticker));
      const exact = stocks.find(s => s.ticker === Q.replace('.', '-'));
      if (exact && !items.some(i => i.code === exact.ticker)) items.push({ key: 'u' + exact.ticker, name: exact.title, code: exact.ticker, tag: '미국', href: `/u/${exact.ticker}` });
      if (fset.has(Q) && !items.some(i => i.code === Q)) items.push({ key: 'e' + Q, name: `${Q} (ETF)`, code: Q, tag: '미국 ETF', href: '' });
      if (Q.length >= 3) for (const s of stocks) { if (items.length >= 8) break; if (s.title.toUpperCase().startsWith(Q) && !items.some(i => i.code === s.ticker)) items.push({ key: 'u' + s.ticker, name: s.title, code: s.ticker, tag: '미국', href: `/u/${s.ticker}` }); }
    }
    // 한국
    if (items.length < 8) for (const c of await searchCorps(q, 8 - items.length)) items.push({ key: 'k' + c.corpCode, name: c.name, code: c.stockCode, tag: '한국', href: `/k/${c.stockCode}` });
    // 미국 ETF/주식 태그 보정 (SPY 등 신탁형)
    for (const it of items) if (it.tag === '미국' && /\bETF\b|SPDR/i.test(it.name)) { it.tag = '미국 ETF'; it.href = ''; }
    const stocks = items.filter(i => i.href);
    return NextResponse.json({ items: stocks.slice(0, 8), notice: !stocks.length && items.length ? 'ETF는 기업 재무가 없어 저점판독기에서 지원하지 않아요. 개별 기업을 검색해 주세요.' : undefined });
  } catch (e) { return NextResponse.json({ items, error: e instanceof Error ? e.message : '검색 실패' }, { status: 200 }); }
}
