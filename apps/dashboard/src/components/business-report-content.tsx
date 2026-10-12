import {
  type BusinessReport,
  businessReportRowValue,
  businessReportSummary,
} from "@ewatrade/db/business-reporting"
import { Button } from "@ewatrade/ui"
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
      <div className="grid gap-2 rounded-lg border p-4">
        <p className="font-medium">{businessReportSummary(report)}</p>
        <p className="text-xs text-muted-foreground">
          {report.scope} · {report.dateBasis}
        </p>
        <p className="text-xs text-muted-foreground">
          {report.period
            ? `${report.period.from} → ${report.period.to} · end ${report.period.end} · ${report.period.timezone}`
            : "Current snapshot or canonical as-of date"}
          {` · ${report.currencyCode ?? "Original stock units; no currency total"}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Request as of <time dateTime={report.asOf}>{report.asOf}</time>
        </p>
      </div>
      {report.pagination ? (
        <p className="text-xs text-muted-foreground">
          {report.rows.length} details shown of {report.pagination.totalRows}.
          Summary covers all matching sources; never add detail pages.
        </p>
      ) : null}
      {!report.complete ? (
        <p role="alert">
          No partial total is shown. Refine the report’s supported filters in
          the assistant, then open a new report.
        </p>
      ) : report.rows.length === 0 ? (
        <p>
          {report.pagination && report.pagination.totalRows !== "0"
            ? "No detail rows on this page. Return to the first page to view matching records; the summary covers all matching sources."
            : "No matching records in this report’s declared sources. Read the coverage gaps below before interpreting this result."}
        </p>
      ) : (
        <div className="grid divide-y rounded-lg border">
          {report.rows.map((row) => (
            <div className="grid gap-2 p-4" key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-medium">{row.label}</p>
                {row.target ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (row.target) onOpen(row.target)
                    }}
                  >
                    Open original
                  </Button>
                ) : null}
              </div>
              <p className="tabular-nums">
                {businessReportRowValue(row, report.currencyCode)}
              </p>
              {currency
                ? row.moneyDetails?.map((metric) => (
                    <p key={metric.label} className="tabular-nums text-xs">
                      {metric.label}:{" "}
                      {formatFinanceMoney(metric.amountMinor, currency)}
                    </p>
                  ))
                : null}
              <p className="break-words text-xs text-muted-foreground">
                {row.detail}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2 border-t pt-4 text-xs text-muted-foreground">
        <p className="font-medium">Source coverage and known gaps</p>
        {report.gaps.map((gap, index) => (
          <p key={`${index}_${gap}`}>{gap}</p>
        ))}
      </div>
    </div>
  )
}
