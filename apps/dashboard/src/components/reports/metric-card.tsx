import type { ReactNode } from "react"

export function MetricCard({
  label,
  value,
}: { label: string; value: ReactNode }) {
  return (
    <dl className="flex min-w-0 flex-col gap-3 border border-border bg-background p-6">
      <dt className="text-sm font-normal text-muted-foreground">{label}</dt>
      <dd className="break-words text-3xl font-normal tabular-nums">{value}</dd>
    </dl>
  )
}
