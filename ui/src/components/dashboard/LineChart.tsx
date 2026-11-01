import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface ChartSeries {
  id: string;
  label: string;
  /** CSS color, normally a `var(--series-n)` token. */
  color: string;
  values: (number | null)[];
}

interface LineChartProps {
  ariaLabel: string;
  times: number[];
  series: ChartSeries[];
  rangeMs: number;
  /** Line is broken between samples further apart than this, so outages show as gaps. */
  gapMs: number;
  /** Fixed scale (e.g. 100 for percentages). Omit to derive a rounded scale from the data. */
  yMax?: number;
  /** Smallest derived scale, so a flat-zero series doesn't get a meaningless axis. */
  minYMax?: number;
  /** Base of the display unit used when rounding a derived scale (1024 for bytes). */
  unitBase?: number;
  /** Horizontal room for axis ticks and end labels; depends on how long formatted values get. */
  gutters?: { left: number; right: number };
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  formatAxisTime: (time: number) => string;
  formatCursorTime: (time: number) => string;
  emptyLabel: string;
}

const PAD = { top: 12, bottom: 24 };
const X_TICK_STEPS_MS = [60_000, 300_000, 900_000, 1_800_000];
const MIN_X_TICK_SPACING_PX = 72;
const END_LABEL_MIN_GAP_PX = 14;

function niceMax(value: number, unitBase: number): number {
  if (value <= 0) return 1;
  // Round within the display unit so byte axes read 2.5 / 5 / 7.5 MB rather than 2.4 / 4.8 / 7.2.
  const unit = unitBase > 1 ? unitBase ** Math.floor(Math.log(value) / Math.log(unitBase)) : 1;
  return niceDecimal(value / unit) * unit;
}

function niceDecimal(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((s) => normalized <= s) ?? 10;
  return step * magnitude;
}

export const LineChart: React.FC<LineChartProps> = ({
  ariaLabel,
  times,
  series,
  rangeMs,
  gapMs,
  yMax,
  minYMax = 1,
  unitBase = 1,
  gutters = { left: 44, right: 62 },
  formatValue,
  formatTick,
  formatAxisTime,
  formatCursorTime,
  emptyLabel,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const padLeft = gutters.left;
  const plotW = Math.max(0, width - padLeft - gutters.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);
  const endTime = times.length > 0 ? times[times.length - 1] : 0;
  const startTime = endTime - rangeMs;
  const firstVisible = useMemo(() => {
    const idx = times.findIndex((t) => t >= startTime);
    return idx === -1 ? times.length : idx;
  }, [times, startTime]);

  const scaleMax = useMemo(() => {
    if (yMax !== undefined) return yMax;
    let peak = 0;
    for (const s of series) {
      for (let i = firstVisible; i < s.values.length; i++) {
        const v = s.values[i];
        if (v !== null && v > peak) peak = v;
      }
    }
    return Math.max(minYMax, niceMax(peak, unitBase));
  }, [series, yMax, minYMax, unitBase, firstVisible]);

  const x = (t: number) => padLeft + ((t - startTime) / rangeMs) * plotW;
  const y = (v: number) => PAD.top + plotH - (Math.min(v, scaleMax) / scaleMax) * plotH;

  const paths = series.map((s) => {
    let d = '';
    let penDown = false;
    for (let i = firstVisible; i < times.length; i++) {
      const v = s.values[i];
      if (v === null) {
        penDown = false;
        continue;
      }
      const brokenByGap = i > firstVisible && times[i] - times[i - 1] > gapMs;
      d += `${penDown && !brokenByGap ? 'L' : 'M'}${x(times[i]).toFixed(1)} ${y(v).toFixed(1)}`;
      penDown = true;
    }
    return d;
  });

  const lastValues = series.map((s) => {
    for (let i = s.values.length - 1; i >= firstVisible; i--) {
      const v = s.values[i];
      if (v !== null) return { value: v, index: i };
    }
    return null;
  });

  // Keep end labels readable when two series finish close together.
  const endLabelY = useMemo(() => {
    const placed = series
      .map((_, i) => ({ i, pos: lastValues[i] ? y(lastValues[i]!.value) : 0 }))
      .filter(({ i }) => lastValues[i])
      .sort((a, b) => a.pos - b.pos);
    for (let k = 1; k < placed.length; k++) {
      if (placed[k].pos - placed[k - 1].pos < END_LABEL_MIN_GAP_PX) {
        placed[k].pos = placed[k - 1].pos + END_LABEL_MIN_GAP_PX;
      }
    }
    return new Map(placed.map(({ i, pos }) => [i, pos]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, plotH, scaleMax, firstVisible]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * scaleMax);
  const stepMs =
    X_TICK_STEPS_MS.find((s) => (s / rangeMs) * plotW >= MIN_X_TICK_SPACING_PX) ??
    X_TICK_STEPS_MS[X_TICK_STEPS_MS.length - 1];
  const xTicks: number[] = [];
  for (let t = Math.ceil(startTime / stepMs) * stepMs; t <= endTime; t += stepMs) xTicks.push(t);

  const hasData = series.some(
    (s) => s.values.slice(firstVisible).filter((v) => v !== null).length >= 2
  );
  const activeCursor = cursor !== null && cursor >= firstVisible && cursor < times.length ? cursor : null;

  const nearestIndex = (clientX: number): number | null => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || times.length === firstVisible) return null;
    const target = startTime + ((clientX - rect.left - padLeft) / plotW) * rangeMs;
    let best = firstVisible;
    for (let i = firstVisible; i < times.length; i++) {
      if (Math.abs(times[i] - target) < Math.abs(times[best] - target)) best = i;
    }
    return best;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -1 : 1;
    const current = activeCursor ?? times.length - 1;
    setCursor(Math.min(times.length - 1, Math.max(firstVisible, current + delta)));
  };

  const cursorX = activeCursor !== null ? x(times[activeCursor]) : 0;
  const tooltipOnLeft = cursorX > width * 0.6;

  return (
    <div
      ref={wrapperRef}
      className="line-chart"
      role="img"
      aria-label={ariaLabel}
      tabIndex={hasData ? 0 : -1}
      onPointerMove={(e) => hasData && setCursor(nearestIndex(e.clientX))}
      onPointerLeave={() => setCursor(null)}
      onBlur={() => setCursor(null)}
      onKeyDown={handleKeyDown}
    >
      {hasData && width > 0 && height > 0 && (
        <svg width={width} height={height} aria-hidden="true">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="chart-grid"
                x1={padLeft}
                x2={padLeft + plotW}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className="chart-tick" x={padLeft - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <text key={tick} className="chart-tick" x={x(tick)} y={height - 6} textAnchor="middle">
              {formatAxisTime(tick)}
            </text>
          ))}

          {series.map((s, i) => (
            <path key={s.id} className="chart-line" d={paths[i]} style={{ stroke: s.color }} />
          ))}

          {series.map((s, i) => {
            const last = lastValues[i];
            if (!last) return null;
            return (
              <g key={s.id}>
                <circle
                  className="chart-dot"
                  cx={x(times[last.index])}
                  cy={y(last.value)}
                  r={4}
                  style={{ fill: s.color }}
                />
                <text
                  className="chart-end-label"
                  x={padLeft + plotW + 10}
                  y={endLabelY.get(i)}
                  dy="0.32em"
                >
                  {formatValue(last.value)}
                </text>
              </g>
            );
          })}

          {activeCursor !== null && (
            <g>
              <line
                className="chart-crosshair"
                x1={cursorX}
                x2={cursorX}
                y1={PAD.top}
                y2={PAD.top + plotH}
              />
              {series.map((s) => {
                const v = s.values[activeCursor];
                if (v === null) return null;
                return (
                  <circle
                    key={s.id}
                    className="chart-dot"
                    cx={cursorX}
                    cy={y(v)}
                    r={4}
                    style={{ fill: s.color }}
                  />
                );
              })}
            </g>
          )}
        </svg>
      )}

      {!hasData && <div className="chart-empty">{emptyLabel}</div>}

      {hasData && activeCursor !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: tooltipOnLeft ? undefined : cursorX + 12,
            right: tooltipOnLeft ? width - cursorX + 12 : undefined,
            top: PAD.top,
          }}
        >
          <div className="chart-tooltip-time">{formatCursorTime(times[activeCursor])}</div>
          {series.map((s) => {
            const v = s.values[activeCursor];
            return (
              <div key={s.id} className="chart-tooltip-row">
                <span className="chart-line-key" style={{ background: s.color }} />
                <span className="chart-tooltip-value">{v === null ? '—' : formatValue(v)}</span>
                <span className="chart-tooltip-label">{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ChartLegend: React.FC<{ series: Pick<ChartSeries, 'id' | 'label' | 'color'>[] }> = ({
  series,
}) => (
  <div className="chart-legend">
    {series.map((s) => (
      <span key={s.id} className="chart-legend-item">
        <span className="chart-line-key" style={{ background: s.color }} />
        {s.label}
      </span>
    ))}
  </div>
);
