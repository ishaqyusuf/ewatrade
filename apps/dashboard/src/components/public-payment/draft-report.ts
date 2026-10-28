import type { PublicReportStatus } from "./payment-format"
import {
  type PreparedReport,
  ReportFlowError,
  fromTrpc,
  receiptUploadUrl,
} from "./send-payment-report"

type DraftSnapshot = Pick<
  PublicReportStatus,
  "reportId" | "status" | "state" | "revision"
>
type DraftClient = {
  businessBanking: {
    reportStatus: {
      query: (input: { reportToken: string }) => Promise<DraftSnapshot>
    }
    cancelDraftReport: {
      mutate: (input: {
        reportToken: string
        expectedRevision: number
      }) => Promise<{ state: "draft_cancelled" }>
    }
  }
}

/** Never replace a report until its current proof confirms the old DRAFT is closed. */
export async function closeDraftForReplacement(
  client: DraftClient,
  reportToken: string,
) {
  try {
    const current = await client.businessBanking.reportStatus.query({
      reportToken,
    })
    if (current.state === "draft_cancelled") return
    if (current.status !== "DRAFT")
      throw new ReportFlowError(
        "conflict",
        "This report already reached the business. Reload to see its status before starting another.",
      )
    await client.businessBanking.cancelDraftReport.mutate({
      reportToken,
      expectedRevision: current.revision,
    })
  } catch (error) {
    if (error instanceof ReportFlowError) throw error
    throw fromTrpc(error)
  }
}

/** A saved proof can resume its existing private upload without resending bank details. */
export function preparedFromStatus(
  reportToken: string,
  status: DraftSnapshot,
  hasReceipt: boolean,
): PreparedReport {
  if (status.state === "draft_cancelled")
    throw new ReportFlowError(
      "stale",
      "This draft was cancelled. Check your details and start a fresh report.",
    )
  return {
    reportToken,
    status: status.status,
    receiptUploadPath:
      hasReceipt && status.status === "DRAFT"
        ? receiptUploadUrl(
            `/api/manual-payments/reports/${status.reportId}/receipt`,
          )
        : null,
  }
}
