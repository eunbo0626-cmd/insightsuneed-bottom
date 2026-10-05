import type { Metadata } from 'next';
import { Result, runUS } from '../../../lib/run';
import BottomReport, { ErrorView } from '../../components/BottomReport';

export const revalidate = 3600;

async function load(tk: string): Promise<{ res?: Result; err?: string }> {
  try { return { res: await runUS(decodeURIComponent(tk).toUpperCase()) }; }
  catch (e) { return { err: e instanceof Error ? e.message : '판독 실패' }; }
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { res } = await load((await params).ticker);
  if (!res) return { title: '저점판독기' };
  return { title: `${res.r.corp.name} 저점판독 | ${res.b.verdict.title}`, description: res.b.verdict.line };
}

export default async function Page({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { ticker } = await params;
  const mode = (await searchParams).mode === 'long' ? 'long' : 'short';
  const { res, err } = await load(ticker);
  return res ? <BottomReport res={res} mode={mode} base={`/u/${ticker}`} /> : <ErrorView err={err} />;
}
