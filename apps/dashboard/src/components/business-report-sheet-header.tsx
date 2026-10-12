import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
export function BusinessReportSheetHeader({
  target,
}: { target: BusinessReportTarget }) {
  const filters = target.request.filters
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {"before" in filters ? (
        <>
          <p>
            {filters.from} → {filters.before} · end exclusive
          </p>
          <p>
            {filters.timezone} · {filters.currencyCode}
          </p>
        </>
      ) : "through" in filters ? (
        <p>
          {filters.from} → {filters.through} · end inclusive · UTC · Book
          currency
        </p>
      ) : "asOfDate" in filters ? (
        <p>{filters.asOfDate} · UTC as-of date · Book currency</p>
      ) : (
        <p>
          Current snapshot ·{" "}
          {"currencyCode" in filters
            ? filters.currencyCode
            : "original stock units"}
        </p>
      )}
      {"query" in filters && filters.query ? (
        <p>Customer name/phone/email contains: {filters.query}</p>
      ) : null}
      {"catalogItemId" in filters && filters.catalogItemId ? (
        <p className="break-all">Exact catalog item: {filters.catalogItemId}</p>
      ) : null}
    </div>
  )
}
