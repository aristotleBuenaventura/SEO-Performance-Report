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
import { formatMonthLabel } from '../data/dummyData'

interface TrendChartProps {
  data: MonthlyMetric[]
}

function shortMonth(month: string) {
  return formatMonthLabel(month).split(' ')[0]
}

export function TrendChart({ data }: TrendChartProps) {
  const chartData = data.map((row) => ({
    ...row,
    label: shortMonth(row.month),
  }))

  return (
    <div className="chart-panel trend-chart">
      <h3>Performance trend</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke="#8b93a7"
              tick={{ fill: '#8b93a7', fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#8b93a7"
              tick={{ fill: '#8b93a7', fontSize: 12 }}
              tickFormatter={(v) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#8b93a7"
              tick={{ fill: '#8b93a7', fontSize: 12 }}
              tickFormatter={(v) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
            />
            <Tooltip
              contentStyle={{
                background: '#1a1f2e',
                border: '1px solid #2a3348',
                borderRadius: 8,
                color: '#e8ecf4',
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as MonthlyMetric | undefined
                return row ? formatMonthLabel(row.month) : ''
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="impressions"
              name="Impressions"
              stroke="#5b8def"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="clicks"
              name="Clicks"
              stroke="#3dd6c3"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="ggrUsd"
              name="GGR USD"
              stroke="#f0b429"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-labels">Labels — Impressions, Clicks, Revenue (GGR USD)</p>
    </div>
  )
}
