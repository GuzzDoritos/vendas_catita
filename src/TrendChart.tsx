import { useEffect, useId, useRef, useState } from 'react';
import type { Month } from './domain';
import { money, prodLabel } from './domain';

export default function TrendChart({ month, today }: { month: Month; today: string }) {
  const [metric, setMetric] = useState<'amount' | 'prod'>('amount');
  const titleId = useId();
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(700);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, entries[0].contentRect.width)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const points = Object.entries(month.days).sort(([a], [b]) => a.localeCompare(b))
    .filter(([date, day]) => date <= today && day[metric] !== null)
    .map(([date, day]) => ({ date, value: day[metric]! }));
  const label = metric === 'amount' ? money : prodLabel;
  const max = Math.max(100, ...points.map(p => p.value));
  const dayCount = Object.keys(month.days).length;
  const left = 88, plotWidth = width - left - 16;
  const x = (date: string) => left + (Number(date.slice(8)) - 1) * plotWidth / (dayCount - 1);
  const y = (value: number) => 170 - value / max * 140;
  return <section ref={container} className="trend-section" aria-labelledby={titleId}>
    <div className="section-heading"><div><h2 id={titleId}>Ritmo do mês</h2><p>{metric === 'amount' ? 'Vendas por dia' : 'Prod por dia'} · somente valores registrados</p></div>
      <div className="segmented" aria-label="Indicador do gráfico"><button aria-pressed={metric === 'amount'} onClick={() => setMetric('amount')}>Vendas</button><button aria-pressed={metric === 'prod'} onClick={() => setMetric('prod')}>Prod</button></div></div>
    {!points.length ? <p className="empty-chart">O gráfico aparece quando você registrar {metric === 'amount' ? 'uma venda' : 'um valor de Prod'}.</p> : <>
      <svg className="trend-chart" viewBox={`0 0 ${width} 210`} role="img" aria-label={`Tendência de ${metric === 'amount' ? 'vendas' : 'Prod'}: ${points.length} dias registrados. Valores disponíveis na tabela abaixo.`}>
        {[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - 8} y1={y(max * fraction)} y2={y(max * fraction)} className="chart-grid" /><text x={left - 8} y={y(max * fraction) + 4} textAnchor="end">{metric === 'amount' ? new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(max * fraction / 100) : label(max * fraction)}</text></g>)}
        {points.map((point, i) => <g key={point.date}>
          {i > 0 && Number(point.date.slice(8)) === Number(points[i - 1].date.slice(8)) + 1 && <line x1={x(points[i - 1].date)} y1={y(points[i - 1].value)} x2={x(point.date)} y2={y(point.value)} className="chart-line" />}
          <circle cx={x(point.date)} cy={y(point.value)} r="4" className="chart-dot"><title>{point.date.slice(8)}: {label(point.value)}</title></circle>
        </g>)}
        {[1, 5, 10, 15, 20, 25, dayCount].map(day => <text key={day} x={left + (day - 1) * plotWidth / (dayCount - 1)} y="198" textAnchor="middle">{String(day).padStart(2, '0')}</text>)}
      </svg>
      <details className="chart-values"><summary>Ver valores do gráfico</summary><table><thead><tr><th>Dia</th><th>{metric === 'amount' ? 'Vendas' : 'Prod'}</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{point.date.slice(8)}</td><td>{label(point.value)}</td></tr>)}</tbody></table></details>
    </>}
  </section>;
}
