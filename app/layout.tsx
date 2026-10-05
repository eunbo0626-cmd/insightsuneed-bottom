import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: '저점판독기 | 너에게 필요한 인사이트', description: '싸진 건가, 망가진 건가? 공시와 차트로 지금의 저점을 판독해요.' };
export const viewport = { width: 'device-width', initialScale: 1 };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="ko"><body>{children}</body></html>; }
