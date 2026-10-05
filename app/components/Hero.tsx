import type { ReactNode } from 'react';

export default function Hero({ tag, title, sub, foot }: { tag: string; title: ReactNode; sub: ReactNode; foot?: ReactNode }) {
  return (
    <section className="hero2">
      <span className="hpill">{tag}</span>
      <h1>{title}</h1>
      <div className="hdiv" />
      <p>{sub}</p>
      <div className="hfoot">
        <span>{foot}</span>
        <b>@insightsuneed</b>
      </div>
    </section>
  );
}
