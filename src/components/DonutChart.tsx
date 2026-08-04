import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatNumber, formatUsd } from '../data/dummyData'

const COLORS = ['#5b8def', '#3dd6c3', '#f0b429', '#ff6b8a', '#a78bfa', '#38bdf8']

interface Slice {
  name: string
  value: number
}

interface DonutChartProps {
  title: string
  data: Slice[]
  mode: 'usd' | 'count'
}

export function DonutChart({ title, data, mode }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="chart-panel donut-panel">
      <h3>{title}</h3>
      <div className="donut-body">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#1a1f2e',
                border: '1px solid #2a3348',
                borderRadius: 8,
                color: '#e8ecf4',
              }}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value) || 0
                return mode === 'usd' ? formatUsd(n) : formatNumber(n)
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span>Total</span>
          <strong>{mode === 'usd' ? formatUsd(total) : formatNumber(total)}</strong>
        </div>
      </div>
      <ul className="donut-legend">
        {data.map((d, i) => (
          <li key={d.name}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            <span>{d.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
