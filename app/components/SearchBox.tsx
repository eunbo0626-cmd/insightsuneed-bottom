'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = { key: string; name: string; code: string; tag: string; href: string };

export default function SearchBox({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const t = useRef<any>(null);

  useEffect(() => {
    clearTimeout(t.current);
    if (!q.trim()) { setItems([]); setNotice(''); return; }
    t.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(q));
        const j = await r.json();
        setItems(j.items ?? []); setNotice(j.notice ?? ''); setOpen(true);
      } catch { setItems([]); }
    }, 200);
  }, [q]);

  function go(href: string) { setBusy(true); router.push(href); }
  function submit() {
    const code = q.replace(/\D/g, '');
    if (/^\d{6}$/.test(q.trim())) return go('/k/' + code);
    if (items[0]) return go(items[0].href);
    if (/^[A-Za-z.\-]{1,6}$/.test(q.trim())) return go('/u/' + q.trim().toUpperCase());
  }

  return (
    <div className={compact ? 'search compact' : 'search'}>
      <div className="searchRow">
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)}
          onKeyDown={e => e.key === 'Enter' && submit()} placeholder="회사 이름이나 종목코드·티커" />
        <button className="button" onClick={submit} disabled={busy}>{busy ? '판독 중…' : '판독'}</button>
      </div>
      {open && notice && <p className="searchNotice">{notice}</p>}
      {open && items.length > 0 && (
        <ul className="suggest">
          {items.map(c => (
            <li key={c.key}><button onClick={() => go(c.href)}><b>{c.name}</b><span><em className={'mk ' + (c.tag === '한국' ? 'kr' : c.tag === '미국' ? 'us' : 'etf')}>{c.tag}</em>{c.code}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
