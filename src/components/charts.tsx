import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useWidth } from './ui';
import { Icon } from './Icon';

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

const fmt = (v: number, d: number) => (Number.isInteger(v) ? String(v) : v.toFixed(d));

// ─────────────────────────── Línea con cruz y tooltip ───────────────────────────

export interface LinePoint {
  key: string;
  label: string;
  value: number;
  /** posición en el tiempo (ms) para espaciar proporcionalmente */
  x?: number;
  detail?: string;
}

export function LineChart({
  data,
  unit,
  refLine,
  height = 230,
  ariaLabel,
  decimals = 1,
}: {
  data: LinePoint[];
  unit: string;
  refLine?: { value: number; label: string } | null;
  height?: number;
  ariaLabel: string;
  decimals?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(width || 320, 260);
  const pad = { l: 40, r: 58, t: 18, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = data.length;

  const vals = data.map((d) => d.value);
  if (refLine) vals.push(refLine.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep((hi - lo) / 4);
  const d0 = Math.floor(lo / step) * step;
  const d1 = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = d0; v <= d1 + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);

  const y = (v: number) => pad.t + ih - ((v - d0) / (d1 - d0 || 1)) * ih;
  const hasX = data.every((d) => d.x != null);
  const xmin = hasX ? Math.min(...data.map((d) => d.x!)) : 0;
  const xmax = hasX ? Math.max(...data.map((d) => d.x!)) : 0;
  const xs = data.map((d, i) => {
    if (n === 1) return pad.l + iw / 2;
    if (hasX && xmax > xmin) return pad.l + ((d.x! - xmin) / (xmax - xmin)) * iw;
    return pad.l + (i * iw) / (n - 1);
  });

  const path = data.map((d, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(d.value).toFixed(1)}`).join('');
  const maxLabels = Math.max(2, Math.floor(iw / 64));
  const labelStep = Math.ceil(n / maxLabels);
  const showDots = n <= 24;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    setHover(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
  };

  const h = hover != null ? data[hover] : null;
  const last = data[n - 1];

  return (
    <div className="chart" ref={ref}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r + 8} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="axis-text">
              {fmt(t, 1)}
            </text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={pad.l} x2={W - pad.r + 8} y1={y(refLine.value)} y2={y(refLine.value)} className="ref-line" />
            <text x={pad.l + 6} y={y(refLine.value) - 6} className="axis-text ref-text">
              {refLine.label}
            </text>
          </g>
        )}
        {data.map((d, i) =>
          (n - 1 - i) % labelStep === 0 ? (
            <text key={d.key} x={xs[i]} y={height - 8} textAnchor="middle" className="axis-text">
              {d.label}
            </text>
          ) : null,
        )}
        {hover != null && <line x1={xs[hover]} x2={xs[hover]} y1={pad.t - 6} y2={pad.t + ih} className="crosshair" />}
        <path d={path} className="series-line" />
        {data.map((d, i) =>
          showDots || i === n - 1 || i === hover ? (
            <circle key={d.key} cx={xs[i]} cy={y(d.value)} r={i === hover ? 6 : 4} className="series-dot" />
          ) : null,
        )}
        {last && (
          <text x={xs[n - 1] + 10} y={y(last.value) + 4} className="end-label">
            {fmt(last.value, decimals)} {unit}
          </text>
        )}
      </svg>
      {h && hover != null && (
        <div className="tooltip" style={{ left: `${(xs[hover] / W) * 100}%`, top: `${(y(h.value) / height) * 100}%` }}>
          <strong>
            {fmt(h.value, decimals)} {unit}
          </strong>
          <span>{h.detail ?? h.label}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Columnas ───────────────────────────

export interface Column {
  key: string;
  label: string;
  value: number;
  cap: string;
  tip: string;
  current?: boolean;
}

export function ColumnChart({ data, height = 170, ariaLabel }: { data: Column[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(width || 320, 260);
  const pad = { l: 8, r: 8, t: 22, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = iw / data.length;
  const bw = Math.min(24, band * 0.6);
  const base = pad.t + ih;

  return (
    <div className="chart" ref={ref}>
      <svg width="100%" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}>
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="baseline" />
        {data.map((d, i) => {
          const x = pad.l + i * band + (band - bw) / 2;
          const hgt = (d.value / max) * ih;
          const top = base - hgt;
          const r = Math.min(4, hgt, bw / 2);
          const p = hgt > 0 ? `M${x},${base}L${x},${top + r}Q${x},${top} ${x + r},${top}L${x + bw - r},${top}Q${x + bw},${top} ${x + bw},${top + r}L${x + bw},${base}Z` : '';
          return (
            <g
              key={d.key}
              tabIndex={0}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="col-hit"
            >
              <rect x={pad.l + i * band} y={pad.t - 20} width={band} height={ih + 20} fill="transparent" />
              {p && <path d={p} className={`col ${hover === i ? 'col-hover' : ''} ${d.current ? 'col-current' : ''}`} />}
              <text x={x + bw / 2} y={top - 6} textAnchor="middle" className="cap-text">
                {d.cap}
              </text>
              <text x={x + bw / 2} y={height - 8} textAnchor="middle" className={`axis-text ${d.current ? 'axis-strong' : ''}`}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: `${((pad.l + hover * band + band / 2) / W) * 100}%`, top: `${((base - (data[hover].value / max) * ih) / height) * 100}%` }}>
          <strong>{data[hover].cap}</strong>
          <span>{data[hover].tip}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Volumen por músculo ───────────────────────────

export interface VolumeRow {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  status: 'bajo' | 'ok' | 'alto' | 'pend';
}

const STATUS = {
  bajo: { label: 'Bajo', icon: 'alert' as const },
  ok: { label: 'Bien', icon: 'check' as const },
  alto: { label: 'Alto', icon: 'info' as const },
  pend: { label: 'Falta', icon: 'edit' as const },
};

export function VolumeBars({ rows }: { rows: VolumeRow[] }) {
  const scale = Math.max(...rows.map((r) => Math.max(r.max, r.value))) * 1.05 || 1;
  return (
    <div className="vbars" role="table" aria-label="Series por semana y músculo">
      <div className="vb-legend" aria-hidden="true">
        <span>
          <i className="vb-legend-bar" /> Tus series por semana
        </span>
        <span>
          <i className="vb-legend-band" /> Rango recomendado
        </span>
      </div>
      <div className="vb-row vb-head" role="row">
        <span role="columnheader">Músculo</span>
        <span role="columnheader" />
        <span role="columnheader" className="vb-val">Series</span>
        <span role="columnheader" className="vb-status">Estado</span>
      </div>
      {rows.map((r) => (
        <div className="vb-row" role="row" key={r.key}>
          <span role="cell" className="vb-label">
            {r.label}
          </span>
          <span role="cell" className="vb-track" title={`Recomendado: ${r.min}–${r.max} series por semana`}>
            <span className="vb-band" style={{ left: `${(r.min / scale) * 100}%`, width: `${((r.max - r.min) / scale) * 100}%` }} />
            {r.value > 0 && <span className="vb-bar" style={{ width: `${(r.value / scale) * 100}%` }} />}
          </span>
          <span role="cell" className="vb-val">
            {r.value}
          </span>
          <span role="cell" className={`vb-status st-${r.status}`}>
            <Icon name={STATUS[r.status].icon} size={14} />
            {STATUS[r.status].label}
          </span>
        </div>
      ))}
    </div>
  );
}
