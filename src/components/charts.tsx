import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../auth/AuthProvider'
import { useActivity, useToday } from '../hooks/queries'
import { dailySeries, type DayPoint } from '../lib/reports'
import { MOOD_LEVELS } from '../lib/constants'
import { Skeleton } from './ui'

// Validated with the dataviz palette checker (lightness, chroma, CVD, contrast).
export const SERIES = { mood: '#0a80a8', energy: '#cf6d50', bar: '#0a80a8' }
const AXIS = { fontSize: 11, fill: '#4d716b' }
const tooltipStyle = { borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 12 }

/** Chart with an accessible summary and a toggleable data table. */
export function ChartFrame({ title, description, table, children, empty }: {
  title: string; description: string; table: { headers: string[]; rows: (string | number)[][] }; children: ReactNode; empty?: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}. {description}</figcaption>
      {empty ?? (showTable ? (
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead><tr>{table.headers.map(h => <th key={h} className="text-left font-semibold text-muted-foreground py-1 pr-3">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="py-1 pr-3">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <div aria-hidden="true">{children}</div>)}
      {!empty && (
        <button type="button" onClick={() => setShowTable(s => !s)} className="mt-2 text-xs font-semibold text-primary-strong hover:underline">
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      )}
    </figure>
  )
}

function NoData({ children }: { children: ReactNode }) {
  return <div className="h-40 grid place-items-center text-sm text-muted-foreground text-center px-4 rounded-xl bg-muted/60">{children}</div>
}

const moodName = (v: number | null) => (v == null ? '—' : `${v} (${MOOD_LEVELS[Math.round(v) - 1]?.label ?? ''})`)

export function MoodTrendChart({ points, height = 200 }: { points: DayPoint[]; height?: number }) {
  const hasData = points.some(p => p.mood !== null)
  return (
    <ChartFrame
      title="Mood and energy trend"
      description={hasData ? `Daily average mood and energy on a 1 to 5 scale over ${points.length} days. Days without a check-in are left blank.` : 'No check-ins in this period.'}
      table={{ headers: ['Date', 'Mood', 'Energy'], rows: points.filter(p => p.mood !== null).map(p => [p.date, moodName(p.mood), p.energy ?? '—']) }}
      empty={hasData ? undefined : <NoData>No check-ins yet in this period. Your trend will appear after your first check-in.</NoData>}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke="#e8f2ef" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === 'Mood' ? moodName(Number(v)) : v, name]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="mood" name="Mood" stroke={SERIES.mood} strokeWidth={2} dot={{ r: 4, fill: SERIES.mood, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
          <Line type="monotone" dataKey="energy" name="Energy" stroke={SERIES.energy} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: SERIES.energy, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** Last 7 days of mood & energy (used on the check-in summary). */
export function MoodWeekChart() {
  const { timezone } = useAuth()
  const today = useToday()
  const { data, isPending } = useActivity(7)
  if (isPending || !data) return <Skeleton className="h-40" />
  return <MoodTrendChart points={dailySeries(data, today, 7, timezone)} height={170} />
}

export function SimpleBarChart({ data, dataKey, name, unit, title, description, emptyText, xKey = 'label', height = 200 }: {
  data: object[]; dataKey: string; name: string; unit?: string; title: string; description: string; emptyText: string; xKey?: string; height?: number
}) {
  const hasData = (data as Record<string, unknown>[]).some(d => Number(d[dataKey]) > 0)
  return (
    <ChartFrame title={title} description={description}
      table={{ headers: [xKey === 'label' ? 'Period' : xKey, name], rows: (data as Record<string, unknown>[]).map(d => [String(d[xKey]), `${d[dataKey] ?? 0}${unit ?? ''}`]) }}
      empty={hasData ? undefined : <NoData>{emptyText}</NoData>}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -24, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="#e8f2ef" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(91,159,172,0.08)' }} contentStyle={tooltipStyle} formatter={v => [`${v}${unit ?? ''}`, name]} />
          <Bar dataKey={dataKey} name={name} fill={SERIES.bar} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
