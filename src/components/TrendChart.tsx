import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyMetric } from '../types'
import { formatMonthLabel, formatNumber, formatUsd } from '../data/performanceData'

interface TrendChartProps {
  data: MonthlyMetric[]
}

function shortMonth(month: string) {
  const [y, m] = month.split('-')
  const names = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const idx = Number(m) - 1
  // Show year on Jan ticks for long ranges
  if (m === '01') return `Jan ${y.slice(2)}`
  return names[idx] ?? m
}

export function TrendChart({ data }: TrendChartProps) {
  const chartData = data.map((row) => ({
    ...row,
    label: shortMonth(row.month),
  }))

  const tickInterval = chartData.length > 24 ? 2 : chartData.length > 14 ? 1 : 0

  return (
    <div className="chart-panel trend-chart">
      <div className="chart-panel__head">
        <h3>Performance trend</h3>
        <p>Impressions · Clicks · GGR USD</p>
      </div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#6b7389"
              tick={{ fill: '#8b93a7', fontSize: 10 }}
              interval={tickInterval}
              minTickGap={8}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="#6b7389"
              width={44}
              tick={{ fill: '#8b93a7', fontSize: 10 }}
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
              stroke="#6b7389"
              width={48}
              tick={{ fill: '#8b93a7', fontSize: 10 }}
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
              contentStyle={{
                background: '#141a27',
                border: '1px solid #2a3348',
                borderRadius: 10,
                color: '#e8ecf4',
                boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
              }}
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
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="impressions"
              name="Impressions"
              stroke="#5b8def"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="clicks"
              name="Clicks"
              stroke="#3dd6c3"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="ggrUsd"
              name="GGR USD"
              stroke="#f0b429"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
