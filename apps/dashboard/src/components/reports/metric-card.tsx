import type { ReactNode } from "react"

export function MetricCard({
  label,
  value,
  money,
  hint,
}: { label: string; value: ReactNode; money?: boolean; hint?: ReactNode }) {
  return (
    <dl className="flex min-w-0 flex-col gap-3 border border-border bg-background p-6">
      <dt className="text-sm font-normal text-muted-foreground">{label}</dt>
      <dd
        data-summary-money={money || undefined}
        className="break-words text-3xl font-normal tabular-nums"
      >
        {value}
      </dd>
      {hint ? (
        <dd className="-mt-2 text-sm text-muted-foreground">{hint}</dd>
      ) : null}
    </dl>
  )
}
