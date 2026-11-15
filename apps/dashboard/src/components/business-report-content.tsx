import type { BusinessReport } from "@ewatrade/db/business-reporting"
// Client-safe entry: the business-reporting barrel also exports server queries
// (Prisma, node:async_hooks), which break the browser bundle.
import {
  businessReportRowValue,
  businessReportSummary,
} from "@ewatrade/db/business-reporting/presentation"
import { Button, Disclosure } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

/** Read-only bounded report rows. No selection/bulk/edit controls apply. */
export function BusinessReportContent({
  report,
  onOpen,
}: {
  report: BusinessReport
  onOpen: (
    target: NonNullable<BusinessReport["rows"][number]["target"]>,
  ) => void
}) {
  const currency = report.currencyCode
  return (
    <div className="grid gap-4 text-sm">
      <p className="rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 text-base font-semibold">
        {businessReportSummary(report)}
      </p>
      {report.pagination ? (
        <p className="text-muted-foreground">
          Showing {report.rows.length} of {report.pagination.totalRows}. The
          total above covers all of them.
        </p>
      ) : null}
      {!report.complete ? (
        <p role="alert">
          This report is too big to total. Ask the assistant for a narrower one.
        </p>
      ) : report.rows.length === 0 ? (
        <p>
          {report.pagination && report.pagination.totalRows !== "0"
            ? "Nothing on this page. Go back to the first page."
            : "Nothing matched."}
        </p>
      ) : (
        <div className="grid divide-y rounded-[var(--ui-radius-surface)] border">
          {report.rows.map((row) => (
            <div className="grid gap-2 p-4" key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-medium">{row.label}</p>
                {row.target ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (row.target) onOpen(row.target)
                    }}
                  >
                    Open
                  </Button>
                ) : null}
              </div>
              <p className="tabular-nums">
                {businessReportRowValue(row, report.currencyCode)}
              </p>
              {currency
                ? row.moneyDetails?.map((metric) => (
                    <p key={metric.label} className="tabular-nums">
                      {metric.label}:{" "}
                      {formatFinanceMoney(metric.amountMinor, currency)}
                    </p>
                  ))
                : null}
              <p className="break-words text-muted-foreground">{row.detail}</p>
            </div>
          ))}
        </div>
      )}
      {report.gaps.length ? (
        <Disclosure title={<>What this report leaves out</>}>
          <div className="mt-2 grid gap-2 text-muted-foreground">
            {report.gaps.map((gap, index) => (
              <p key={`${index}_${gap}`}>{gap}</p>
            ))}
          </div>
        </Disclosure>
      ) : null}
    </div>
  )
}
