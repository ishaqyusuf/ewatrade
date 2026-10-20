"use client"

import { useId, useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export type DailyBarSeries = {
  key: string
  label: string
  /** A CSS colour, usually a theme variable such as `var(--report-product)`. */
  color: string
}

export type DailyBarDatum = { date: string } & Record<string, number | string>

type Prepared = {
  __bottom: string | null
  __top: string | null
  __total: number
  date: string
  [key: string]: unknown
}

const GAP = 2
const RADIUS = 4

function seriesValue(datum: { [key: string]: unknown }, key: string) {
  const value = datum[key]
  return typeof value === "number" ? value : 0
}

/** Round only the topmost non-zero segment; leave a 2px surface gap above lower ones. */
function Segment(props: {
  fill?: string
  height?: number
  payload?: Prepared
  seriesKey: string
  width?: number
  x?: number
  y?: number
}) {
  const { fill, payload, seriesKey } = props
  const x = props.x ?? 0
  const width = props.width ?? 0
  const y = props.y ?? 0
  let height = props.height ?? 0
  if (!payload || height <= 0 || width <= 0) return null
  if (payload.__bottom !== seriesKey) {
    height = Math.max(0.5, height - GAP)
  }
  const top = payload.__top === seriesKey
  const radius = top ? Math.min(RADIUS, width / 2, height) : 0
  const right = x + width
  const bottom = y + height
  const d = radius
    ? `M${x},${bottom} V${y + radius} Q${x},${y} ${x + radius},${y} H${right - radius} Q${right},${y} ${right},${y + radius} V${bottom} Z`
    : `M${x},${bottom} V${y} H${right} V${bottom} Z`
  return <path d={d} fill={fill} />
}

type TooltipPayload = {
  payload?: Prepared
}

/**
 * One bar per day, stacked when there is more than one series. Values are
 * read from the hover/focus tooltip (recharts' keyboard layer moves with the
 * arrow keys); callers must also offer a table of the same rows.
 */
export function DailyBarChart({
  data,
  formatDay,
  formatDayLong,
  formatTick,
  formatValue,
  height = 220,
  label,
  series,
  totalLabel = "Total",
}: {
  data: DailyBarDatum[]
  formatDay: (date: string) => string
  formatDayLong: (date: string) => string
  formatTick: (value: number) => string
  formatValue: (value: number) => string
  height?: number
  label: string
  series: DailyBarSeries[]
  totalLabel?: string
}) {
  const id = useId()
  const prepared = useMemo<Prepared[]>(
    () =>
      data.map((datum) => {
        const nonZero = series.filter(
          (entry) => seriesValue(datum, entry.key) > 0,
        )
        return {
          ...datum,
          __bottom: nonZero[0]?.key ?? null,
          __top: nonZero.at(-1)?.key ?? null,
          __total: series.reduce(
            (total, entry) => total + seriesValue(datum, entry.key),
            0,
          ),
        }
      }),
    [data, series],
  )
  const peakIndex = useMemo(() => {
    let index = -1
    let peak = 0
    prepared.forEach((datum, position) => {
      if (datum.__total > peak) {
        peak = datum.__total
        index = position
      }
    })
    return index
  }, [prepared])

  return (
    <figure aria-label={label} className="m-0 min-w-0" id={id}>
      <ResponsiveContainer height={height} width="100%">
        <BarChart
          accessibilityLayer
          barCategoryGap={1}
          data={prepared}
          margin={{ bottom: 0, left: 0, right: 4, top: 22 }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            axisLine={{ stroke: "var(--border)" }}
            dataKey="date"
            interval="preserveEnd"
            minTickGap={28}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
            tickFormatter={formatDay}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
            tickCount={3}
            tickFormatter={formatTick}
            tickLine={false}
            width={52}
          />
          <Tooltip
            content={({ active, payload }) => {
              const datum = (
                payload as unknown as TooltipPayload[] | undefined
              )?.[0]?.payload
              if (!active || !datum) return null
              return (
                <div className="grid min-w-40 gap-1 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
                  <div className="text-muted-foreground">
                    {formatDayLong(datum.date)}
                  </div>
                  {series.map((entry) => (
                    <div
                      className="grid grid-cols-[0.75rem_auto_1fr] items-center gap-2"
                      key={entry.key}
                    >
                      <span
                        aria-hidden="true"
                        className="h-0.5 rounded-full"
                        style={{ background: entry.color }}
                      />
                      <span className="text-sm font-semibold tabular-nums">
                        {formatValue(seriesValue(datum, entry.key))}
                      </span>
                      <span className="text-muted-foreground">
                        {entry.label}
                      </span>
                    </div>
                  ))}
                  {series.length > 1 ? (
                    <div className="flex justify-between gap-3 border-t border-border pt-1">
                      <span>{totalLabel}</span>
                      <span className="font-semibold tabular-nums">
                        {formatValue(datum.__total)}
                      </span>
                    </div>
                  ) : null}
                </div>
              )
            }}
            cursor={{ fill: "var(--muted)" }}
            isAnimationActive={false}
          />
          {series.map((entry) => (
            <Bar
              dataKey={entry.key}
              fill={entry.color}
              isAnimationActive={false}
              key={entry.key}
              maxBarSize={24}
              name={entry.label}
              shape={(props: unknown) => (
                <Segment
                  {...(props as Parameters<typeof Segment>[0])}
                  seriesKey={entry.key}
                />
              )}
              stackId="day"
            >
              {peakIndex >= 0 && prepared[peakIndex]?.__top === entry.key ? (
                <LabelList
                  content={(props: {
                    index?: number
                    width?: number | string
                    x?: number | string
                    y?: number | string
                  }) => {
                    if (props.index !== peakIndex) return null
                    const datum = prepared[peakIndex]
                    if (!datum) return null
                    const x =
                      Number(props.x ?? 0) + Number(props.width ?? 0) / 2
                    const y = Number(props.y ?? 0) - 7
                    return (
                      <text
                        className="fill-foreground text-xs font-semibold"
                        textAnchor="middle"
                        x={x}
                        y={y}
                      >
                        {formatTick(datum.__total)}
                      </text>
                    )
                  }}
                  dataKey={entry.key}
                />
              ) : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
