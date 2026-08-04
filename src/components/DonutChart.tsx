import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatNumber, formatUsd } from '../data/performanceData'

const COLORS = [
  '#5b8def',
  '#3dd6c3',
  '#f0b429',
  '#ff6b8a',
  '#a78bfa',
  '#38bdf8',
  '#fb923c',
  '#4ade80',
  '#f472b6',
  '#94a3b8',
  '#22d3ee',
  '#e879f9',
  '#86efac',
  '#fdba74',
  '#c4b5fd',
  '#67e8f9',
  '#fca5a5',
  '#bef264',
]

interface Slice {
  name: string
  value: number
}

interface DonutChartProps {
  title: string
  data: Slice[]
  mode: 'usd' | 'count'
  /** Optional blended credit inside the panel (bottom-right). */
  credit?: string
}

/** Keep chart readable: top slices + Other */
function compactSlices(data: Slice[], limit = 7): Slice[] {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const positive = sorted.filter((d) => d.value > 0)
  if (positive.length <= limit) return positive.length ? positive : sorted.slice(0, 1)
  const top = positive.slice(0, limit - 1)
  const rest = positive.slice(limit - 1).reduce((s, d) => s + d.value, 0)
  return [...top, { name: 'Other', value: rest }]
}

export function DonutChart({ title, data, mode, credit }: DonutChartProps) {
  const slices = compactSlices(data)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className={`chart-panel donut-panel${credit ? ' donut-panel--credit' : ''}`}>
      <div className="chart-panel__head">
        <h3>{title}</h3>
        <p>{mode === 'usd' ? 'Share of GGR USD' : 'Share of impressions'}</p>
      </div>
      <div className="donut-layout">
        <div className="donut-body">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="transparent"
              >
                {slices.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#141a27',
                  border: '1px solid #2a3348',
                  borderRadius: 10,
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
            <strong>
              {mode === 'usd' ? formatUsd(total) : formatNumber(total)}
            </strong>
          </div>
        </div>
        <ul className="donut-legend">
          {slices.map((d, i) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0
            return (
              <li key={d.name}>
                <i style={{ background: COLORS[i % COLORS.length] }} />
                <span className="donut-legend__name">{d.name}</span>
                <span className="donut-legend__pct">{pct.toFixed(0)}%</span>
              </li>
            )
          })}
        </ul>
      </div>
      {credit ? <p className="panel-credit">{credit}</p> : null}
    </div>
  )
}
