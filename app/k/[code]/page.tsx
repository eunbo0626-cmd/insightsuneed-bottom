import type { Metadata } from 'next';
import { Result, runKR } from '../../../lib/run';
import BottomReport, { ErrorView } from '../../components/BottomReport';

export const revalidate = 3600;

async function load(code: string): Promise<{ res?: Result; err?: string }> {
  try { return { res: await runKR(decodeURIComponent(code)) }; }
  catch (e) { return { err: e instanceof Error ? e.message : '판독 실패' }; }
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { res } = await load((await params).code);
  if (!res) return { title: '저점판독기' };
  return { title: `${res.r.corp.name} 저점판독 | ${res.b.verdict.title}`, description: res.b.verdict.line };
}

export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { code } = await params;
  const mode = (await searchParams).mode === 'long' ? 'long' : 'short';
  const { res, err } = await load(code);
  return res ? <BottomReport res={res} mode={mode} base={`/k/${code}`} /> : <ErrorView err={err} />;
}
