import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
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

function axisLabel(month: string) {
  const [y, m] = month.split('-')
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
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

  const chartData = data.map((row) => ({
    ...row,
    label: axisLabel(row.month),
  }))

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
            : 'All months · Impressions · Clicks · GGR USD'}
        </p>
      </div>

      {isMobile && activeRow ? (
        <div className="trend-chart__readout" aria-live="polite">
          <strong>{formatMonthLabel(activeRow.month)}</strong>
          <span className="trend-chart__readout-clicks">
            Clicks {formatNumber(activeRow.clicks)}
          </span>
          <span className="trend-chart__readout-ggr">
            GGR USD {formatUsd(activeRow.ggrUsd)}
          </span>
          <span className="trend-chart__readout-impr">
            Impressions {formatNumber(activeRow.impressions)}
          </span>
        </div>
      ) : null}

      <div className="chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 8, left: 0, bottom: zoomed ? 8 : 4 }}
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
              tick={{ fill: axis, fontSize: 10 }}
              interval={zoomed ? 0 : chartData.length > 24 ? 2 : chartData.length > 14 ? 1 : 0}
              minTickGap={4}
              axisLine={false}
              tickLine={false}
              angle={zoomed ? -30 : 0}
              textAnchor={zoomed ? 'end' : 'middle'}
              height={zoomed ? 48 : 28}
            />
            <YAxis
              yAxisId="left"
              stroke={axis}
              width={44}
              tick={{ fill: axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                Math.abs(v) >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : Math.abs(v) >= 1000
                    ? `${Math.round(v / 1000)}k`
                    : String(v)
              }
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke={axis}
              width={48}
              tick={{ fill: axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                Math.abs(v) >= 1_000_000
                  ? `$${(v / 1_000_000).toFixed(1)}M`
                  : Math.abs(v) >= 1000
                    ? `$${Math.round(v / 1000)}k`
                    : `$${v}`
              }
            />
            <Tooltip
              // Mobile: hide floating overlay — data shows in readout strip above chart
              content={isMobile ? () => null : undefined}
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
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
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
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="impressions"
              name="Impressions"
              stroke="#5b8def"
              strokeWidth={2.5}
              dot={zoomed ? { r: 3.5, fill: '#5b8def' } : false}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="clicks"
              name="Clicks"
              stroke="#3dd6c3"
              strokeWidth={2.5}
              dot={zoomed ? { r: 3.5, fill: '#3dd6c3' } : false}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="ggrUsd"
              name="GGR USD"
              stroke="#f0b429"
              strokeWidth={2.5}
              dot={zoomed ? { r: 3.5, fill: '#f0b429' } : false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
