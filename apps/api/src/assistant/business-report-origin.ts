import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
import { TRPCError } from "@trpc/server"

/** An origin is a stale-link guard, never authority to select another scope. */
export function assertBusinessReportOrigin(
  target: BusinessReportTarget,
  current: { tenantId: string; storeId: string | null },
) {
  const storeReport = ["item_sales", "payment_collections", "stock"].includes(
    target.request.report,
  )
  if (
    target.origin.tenantId !== current.tenantId ||
    (storeReport
      ? !target.origin.storeId || target.origin.storeId !== current.storeId
      : target.origin.storeId !== null)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This report belongs to a different business or Store. Return to its original scope or request a fresh report.",
    })
  }
}
