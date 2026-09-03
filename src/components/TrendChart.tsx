import { useEffect, useState, type CSSProperties } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyMetric } from '../types'
import { formatMonthLabel, formatNumber, formatUsd } from '../data/performanceData'
import {
  chartAxisColor,
  chartGridColor,
  chartTooltipStyle,
} from '../utils/chartTheme'

interface TrendChartProps {
  data: MonthlyMetric[]
  zoomedMonth?: string | null
  zoomLabel?: string | null
  theme?: 'dark' | 'light'
}

type ChartRow = MonthlyMetric & { label: string }
type SeriesKey = 'clicks' | 'impressions' | 'ggrUsd'

const SERIES: { key: SeriesKey; name: string; color: string }[] = [
  { key: 'clicks', name: 'Clicks', color: '#3dd6c3' },
  { key: 'impressions', name: 'Impressions', color: '#5b8def' },
  { key: 'ggrUsd', name: 'GGR USD', color: '#f0b429' },
]

function compactNumber(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`
  return String(v)
}

function compactUsd(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`
  return `$${v}`
}

function axisLabel(month: string) {
  const [y, m] = month.split('-')
  const names = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ]
  const idx = Number(m) - 1
  return `${names[idx] ?? m} ${y.slice(2)}`
}

function useIsMobile(maxWidth = 900) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])

  return mobile
}

export function TrendChart({
  data,
  zoomedMonth = null,
  zoomLabel = null,
  theme = 'dark',
}: TrendChartProps) {
  const zoomed = Boolean(zoomLabel) || Boolean(zoomedMonth)
  const axis = chartAxisColor(theme)
  const isMobile = useIsMobile()
  const [activeRow, setActiveRow] = useState<ChartRow | null>(null)
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    clicks: false,
    impressions: false,
    ggrUsd: false,
  })

  function toggleSeries(key: string) {
    if (key !== 'clicks' && key !== 'impressions' && key !== 'ggrUsd') return
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const showCounts = !hidden.clicks || !hidden.impressions
  const showGgr = !hidden.ggrUsd
  const dualAxis = showCounts && showGgr

  const chartData = data.map((row) => ({
    ...row,
    label: axisLabel(row.month),
  }))

  const rotateX = zoomed || isMobile
  const xInterval = zoomed
    ? isMobile && chartData.length > 8
      ? 1
      : 0
    : isMobile
      ? Math.max(0, Math.ceil(chartData.length / 6) - 1)
      : chartData.length > 24
        ? 2
        : chartData.length > 14
          ? 1
          : 0

  const focusLabel =
    zoomedMonth != null
      ? chartData.find((d) => d.month === zoomedMonth)?.label
      : undefined

  // Clear sticky mobile readout when data set changes
  useEffect(() => {
    setActiveRow(null)
  }, [data, zoomedMonth, zoomLabel])

  return (
    <div className="chart-panel trend-chart">
      <div className="chart-panel__head">
        <h3>Performance trend</h3>
        <p>
          {zoomed
            ? `Zoomed · ${zoomLabel ?? formatMonthLabel(zoomedMonth!)}`
            : 'All months · Clicks · Impressions · GGR USD'}
        </p>
      </div>

      {isMobile && activeRow ? (
        <div className="trend-chart__readout" aria-live="polite">
          <strong>{formatMonthLabel(activeRow.month)}</strong>
          {hidden.clicks ? null : (
            <span className="trend-chart__readout-clicks">
              Clicks {formatNumber(activeRow.clicks)}
            </span>
          )}
          {hidden.impressions ? null : (
            <span className="trend-chart__readout-impr">
              Impressions {formatNumber(activeRow.impressions)}
            </span>
          )}
          {hidden.ggrUsd ? null : (
            <span className="trend-chart__readout-ggr">
              GGR USD {formatUsd(activeRow.ggrUsd)}
            </span>
          )}
        </div>
      ) : null}

      <div className="chart-body">
        <ul className="trend-chart__legend">
          {SERIES.map((series) => {
            const off = hidden[series.key]
            return (
              <li key={series.key}>
                <button
                  type="button"
                  className={off ? 'is-off' : undefined}
                  style={
                    {
                      '--series-color': series.color,
                    } as CSSProperties
                  }
                  aria-pressed={!off}
                  onClick={() => toggleSeries(series.key)}
                >
                  <i aria-hidden />
                  {series.name}
                </button>
              </li>
            )
          })}
        </ul>
        <div
          className={
            isMobile
              ? 'trend-chart__plot'
              : 'trend-chart__plot trend-chart__plot--hover-only'
          }
          onMouseDown={
            isMobile
              ? undefined
              : (e) => {
                  e.preventDefault()
                }
          }
          onClick={
            isMobile
              ? undefined
              : (e) => {
                  e.preventDefault()
                }
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 8,
                right: isMobile ? 4 : 8,
                left: 0,
                bottom: rotateX ? 10 : 4,
              }}
              style={{ cursor: 'default', userSelect: 'none' }}
              onMouseMove={(state) => {
                if (!isMobile) return
                const idx = state?.activeTooltipIndex ?? state?.activeIndex
                if (typeof idx === 'number' && chartData[idx]) {
                  setActiveRow(chartData[idx]!)
                  return
                }
                if (state?.activeLabel != null) {
                  const row = chartData.find((d) => d.label === String(state.activeLabel))
                  if (row) setActiveRow(row)
                }
              }}
              onMouseLeave={() => {
                if (isMobile) setActiveRow(null)
              }}
            >
            <CartesianGrid stroke={chartGridColor(theme)} vertical={false} />
            <XAxis
              dataKey="label"
              stroke={axis}
              tick={{ fill: axis, fontSize: isMobile ? 9 : 10 }}
              interval={xInterval}
              minTickGap={isMobile ? 22 : 8}
              axisLine={false}
              tickLine={false}
              angle={rotateX ? -40 : 0}
              textAnchor={rotateX ? 'end' : 'middle'}
              height={rotateX ? 48 : 28}
            />
            <YAxis
              yAxisId="left"
              hide={!showCounts}
              stroke={axis}
              width={44}
              tick={{ fill: axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={compactNumber}
            />
            <YAxis
              yAxisId="right"
              orientation={dualAxis ? 'right' : 'left'}
              hide={!showGgr}
              stroke={axis}
              width={48}
              tick={{ fill: axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={compactUsd}
            />
            <Tooltip
              // Mobile: hide floating overlay — data shows in readout strip above chart
              content={isMobile ? () => null : undefined}
              cursor={{ stroke: axis, strokeWidth: 1, strokeDasharray: '4 4' }}
              contentStyle={chartTooltipStyle(theme)}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as MonthlyMetric | undefined
                return row ? formatMonthLabel(row.month) : ''
              }}
              formatter={(value, name) => {
                const n = typeof value === 'number' ? value : Number(value) || 0
                if (name === 'GGR USD') return [formatUsd(n), name]
                return [formatNumber(n), name]
              }}
            />
            {focusLabel ? (
              <ReferenceLine
                x={focusLabel}
                stroke="rgba(240, 180, 41, 0.65)"
                strokeWidth={2}
                strokeDasharray="5 4"
                label={{
                  value: 'Selected',
                  fill: '#f0b429',
                  fontSize: 11,
                  position: 'insideTopRight',
                }}
              />
            ) : null}
            {SERIES.map((series) =>
              hidden[series.key] ? null : (
                <Line
                  key={series.key}
                  yAxisId={series.key === 'ggrUsd' ? 'right' : 'left'}
                  type="monotone"
                  dataKey={series.key}
                  name={series.name}
                  stroke={series.color}
                  strokeWidth={2.5}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                  dot={zoomed ? { r: 3.5, fill: series.color } : false}
                  activeDot={
                    isMobile
                      ? { r: 5 }
                      : { r: 5, style: { pointerEvents: 'none' } }
                  }
                />
              ),
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
