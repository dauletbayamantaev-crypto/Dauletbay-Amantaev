import React, { useState } from 'react';

/** Rang ko'rish buzilishiga (CVD) tekshirilgan kategorik palitra — tartib o'zgarmaydi */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
export const OTHER_COLOR = '#94a3b8';

// ---------------- Donut (toifalar ulushi) ----------------

export function DonutChart({
  items,
  format,
  formatCenter = format,
  centerLabel,
}: {
  items: { label: string; value: number }[];
  format: (n: number) => string;
  /** Markazda qisqa ko'rinish (uzun summalar halqaga sig'ishi uchun) */
  formatCenter?: (n: number) => string;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  // 7 tadan ortig'i "Boshqalar"ga yig'iladi — rang hech qachon takrorlanmaydi
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((a, b) => a + b.value, 0);
  const slices = [
    ...top.map((s, i) => ({ ...s, color: SERIES[i] })),
    ...(rest > 0 ? [{ label: 'Boshqalar', value: rest, color: OTHER_COLOR }] : []),
  ];
  const total = slices.reduce((a, b) => a + b.value, 0);
  const size = 180;
  const r = 70;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const active = hover !== null ? slices[hover] : null;

  if (total <= 0) return <p className="py-8 text-center text-sm text-slate-500">Ma'lumot yo'q</p>;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={centerLabel}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s, i) => {
            const len = (s.value / total) * c;
            const gap = slices.length > 1 ? Math.min(2, len / 2) : 0;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? stroke + 4 : stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="46%" textAnchor="middle" className="fill-slate-500 text-[11px]">
          {(active ? active.label : centerLabel).slice(0, 16)}
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="fill-slate-900 text-[13px] font-bold">
          {formatCenter(active ? active.value : total)}
        </text>
      </svg>
      <ul className="w-full space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${hover === i ? 'bg-slate-100' : ''}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 truncate text-slate-700">{s.label}</span>
            <span className="tabular-nums text-slate-900">{format(s.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Guruhlangan ustunlar (daromad / xarajat) ----------------

export function BarPairChart({
  data,
  series,
  format,
  formatAxis,
}: {
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  format: (n: number) => string;
  formatAxis: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const group = innerW / Math.max(1, data.length);
  const barW = Math.min(18, (group - 10) / series.length);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => f * max);

  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Oylar bo'yicha daromad va xarajat">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[10px]">
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, gi) => {
          const gx = pad.l + gi * group + (group - barW * series.length - 2 * (series.length - 1)) / 2;
          return (
            <g key={d.label} onMouseEnter={() => setHover(gi)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + gi * group} y={pad.t} width={group} height={innerH} fill={hover === gi ? '#f1f5f9' : 'transparent'} />
              {d.values.map((v, si) => {
                const h = Math.max(0, pad.t + innerH - y(v));
                const x = gx + si * (barW + 2);
                const rr = Math.min(4, h, barW / 2);
                return (
                  <path
                    key={si}
                    d={`M${x},${pad.t + innerH} V${pad.t + innerH - h + rr} Q${x},${pad.t + innerH - h} ${x + rr},${pad.t + innerH - h} H${x + barW - rr} Q${x + barW},${pad.t + innerH - h} ${x + barW},${pad.t + innerH - h + rr} V${pad.t + innerH} Z`}
                    fill={series[si].color}
                  />
                );
              })}
              <text x={pad.l + gi * group + group / 2} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="#cbd5e1" />
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
          <p className="mb-1 font-semibold text-slate-800">{data[hover].label}</p>
          {series.map((s, i) => (
            <p key={s.name} className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.name}: <span className="font-medium tabular-nums text-slate-900">{format(data[hover].values[i])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Radar (hayot g'ildiragi) ----------------

export function RadarChart({
  axes,
  values,
  compare,
  max = 10,
  size = 300,
}: {
  axes: string[];
  values: number[];
  compare?: number[];
  max?: number;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 58;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rr = (Math.max(0, Math.min(max, v)) / max) * R;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[340px]" role="img" aria-label="Hayot g'ildiragi">
      {[2, 4, 6, 8, 10].map((lv) => (
        <polygon key={lv} points={poly(Array(n).fill(lv))} fill="none" stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, max);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" />;
      })}
      {compare && <polygon points={poly(compare)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />}
      <polygon points={poly(values)} fill="#2a78d6" fillOpacity="0.18" stroke="#2a78d6" strokeWidth="2" strokeLinejoin="round" />
      {values.map((v, i) => {
        const [x, y] = pt(i, v);
        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x} cy={y} r="12" fill="transparent" />
            <circle cx={x} cy={y} r={hover === i ? 6 : 4} fill="#2a78d6" stroke="#fff" strokeWidth="2" />
          </g>
        );
      })}
      {axes.map((label, i) => {
        const [x, y] = pt(i, max + 1.6);
        const anchor = Math.abs(x - cx) < 10 ? 'middle' : x > cx ? 'start' : 'end';
        const words = label.split(' ');
        const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [label];
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className={`text-[10px] ${hover === i ? 'fill-slate-900 font-semibold' : 'fill-slate-600'}`}>
            {lines.map((l, li) => (
              <tspan key={li} x={x} dy={li === 0 ? (lines.length > 1 ? '-0.5em' : 0) : '1.1em'}>
                {l}
              </tspan>
            ))}
            <tspan x={x} dy="1.15em" className="fill-slate-900 font-bold">
              {values[i] ?? '—'}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

// ---------------- Chiziqli grafik (uyqu, vazn) ----------------

export function LineChart({
  points,
  color = '#2a78d6',
  format = (n: number) => String(n),
  height = 140,
  goal,
}: {
  points: { label: string; value: number | null }[];
  color?: string;
  format?: (n: number) => string;
  height?: number;
  goal?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = height;
  const pad = { l: 36, r: 10, t: 12, b: 22 };
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Ma'lumot yo'q</p>;
  const all = goal ? [...vals, goal.value] : vals;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segs.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${x(i)},${y(p.value)} `;
  });
  if (cur) segs.push(cur);
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
      >
        {[min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#f1f5f9" />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[10px]">
              {format(Math.round(t * 10) / 10)}
            </text>
          </g>
        ))}
        {goal && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(goal.value)} y2={y(goal.value)} stroke="#94a3b8" strokeDasharray="4 4" />
            <text x={W - pad.r} y={y(goal.value) - 4} textAnchor="end" className="fill-slate-500 text-[10px]">
              {goal.label}
            </text>
          </g>
        )}
        {segs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          p.value !== null ? <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3} fill={color} stroke="#fff" strokeWidth="1.5" /> : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#cbd5e1" />}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow">
          <span className="text-slate-500">{points[hover].label}: </span>
          <span className="font-semibold tabular-nums text-slate-900">
            {points[hover].value === null ? '—' : format(points[hover].value!)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------- Odat xaritasi (so'nggi kunlar) ----------------

export function DotStrip({ days, color = '#1baf7a' }: { days: { date: string; state: 'done' | 'miss' | 'off' }[]; color?: string }) {
  return (
    <div className="flex gap-1">
      {days.map((d) => (
        <span
          key={d.date}
          title={`${d.date}: ${d.state === 'done' ? 'bajarildi' : d.state === 'miss' ? 'bajarilmadi' : 'rejada emas'}`}
          className="h-3 w-3 rounded-[3px]"
          style={{
            background: d.state === 'done' ? color : d.state === 'miss' ? '#e2e8f0' : 'transparent',
            border: d.state === 'off' ? '1px dashed #cbd5e1' : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function MiniBars({ values, color = '#2a78d6' }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-10 items-end gap-0.5">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 1, background: v > 0 ? color : '#e2e8f0' }} />
      ))}
    </div>
  );
}

