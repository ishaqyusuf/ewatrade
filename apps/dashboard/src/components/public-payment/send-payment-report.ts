import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { type TRPCClient, TRPCClientError } from "@trpc/client"
import type { StoredReport } from "./report-storage"

export type SendStep = "preparing" | "uploading" | "submitting"
type PaymentReportClient = {
  businessBanking: Pick<
    TRPCClient<AppRouter>["businessBanking"],
    "reportPayment" | "submitReport"
  >
}

export type ReportFlowErrorKind =
  /** One report is already being checked, or this request was used with other details. */
  | "conflict"
  /** The link expired, closed or can't be found any more. */
  | "unavailable"
  /** The server rejected the details; the message says why. */
  | "invalid"
  /** A prepared report needs its receipt bytes, which this visit no longer has. */
  | "receipt_needed"
  /** The prepared report is too old to finish; start a fresh report. */
  | "stale"
  | "network"

export class ReportFlowError extends Error {
  constructor(
    readonly kind: ReportFlowErrorKind,
    message: string,
  ) {
    super(message)
    this.name = "ReportFlowError"
  }
}

const NETWORK_MESSAGE =
  "We couldn't reach the payment page. Check your connection and try again."

export function trpcErrorCode(error: unknown) {
  if (!(error instanceof TRPCClientError)) return null
  const data = error.data as { code?: unknown } | undefined
  return typeof data?.code === "string" ? data.code : null
}

function fromTrpc(error: unknown): ReportFlowError {
  const code = trpcErrorCode(error)
  const message = error instanceof Error ? error.message : NETWORK_MESSAGE
  if (code === "CONFLICT") return new ReportFlowError("conflict", message)
  if (code === "NOT_FOUND")
    return new ReportFlowError(
      "unavailable",
      "This payment link no longer takes reports.",
    )
  if (code === "BAD_REQUEST") return new ReportFlowError("invalid", message)
  if (code === "PRECONDITION_FAILED" || code === "FORBIDDEN")
    return new ReportFlowError(
      "unavailable",
      "This page can't take reports right now. Try again later.",
    )
  return new ReportFlowError("network", NETWORK_MESSAGE)
}

export function receiptUploadUrl(path: string) {
  // A report proof must only go to the same-origin, exact receipt endpoint.
  if (
    !/^\/api\/manual-payments\/reports\/[a-zA-Z0-9_-]{1,128}\/receipt$/.test(
      path,
    )
  )
    throw new ReportFlowError(
      "invalid",
      "This receipt upload address isn't valid.",
    )
  return path
}

async function uploadReceipt(input: {
  path: string
  reportToken: string
  contentType: string
  file: File
}) {
  const url = receiptUploadUrl(input.path)
  let response: Response
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${input.reportToken}`,
        "Content-Type": input.contentType,
      },
      body: input.file,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new ReportFlowError(
      "network",
      "The receipt didn't upload. Check your connection and try again.",
    )
  }
  if (response.ok) return
  const body = (await response.json().catch(() => null)) as {
    error?: unknown
  } | null
  const message =
    typeof body?.error === "string"
      ? body.error
      : "The receipt didn't upload. Try again."
  if (response.status === 410 || response.status === 401)
    throw new ReportFlowError(
      "stale",
      "This report took too long to finish. Tell them again to send a fresh one.",
    )
  if (response.status === 409) throw new ReportFlowError("conflict", message)
  if (response.status === 404)
    throw new ReportFlowError("unavailable", "This report can't be found.")
  if (response.status >= 500) throw new ReportFlowError("network", message)
  throw new ReportFlowError("invalid", message)
}

/**
 * reportPayment → (PUT receipt bytes) → submitReport. Every step is idempotent for
 * the same clientReportId and details, so a retry after any failure is safe.
 */
export async function sendPaymentReport(input: {
  client: PaymentReportClient
  linkToken: string
  report: StoredReport
  file: File | null
  onStep: (step: SendStep) => void
  onPrepared: (reportToken: string) => void
}): Promise<void> {
  const { client, report } = input
  input.onStep("preparing")
  let prepared: Awaited<
    ReturnType<typeof client.businessBanking.reportPayment.mutate>
  >
  try {
    prepared = await client.businessBanking.reportPayment.mutate({
      token: input.linkToken,
      clientReportId: report.clientReportId,
      payerName: report.payerName,
      claimedAmountMinor: report.claimedAmountMinor,
      ...(report.receipt
        ? {
            receipt: {
              contentType: report.receipt.contentType,
              contentDigest: report.receipt.contentDigest,
              sizeBytes: report.receipt.sizeBytes,
            },
          }
        : {}),
    })
  } catch (error) {
    throw fromTrpc(error)
  }
  input.onPrepared(prepared.reportToken)

  // Without the file (a later visit), submit anyway: an earlier upload may have
  // finished, and the server says so if it didn't.
  if (
    prepared.status === "DRAFT" &&
    prepared.receiptUploadPath &&
    input.file &&
    report.receipt
  ) {
    input.onStep("uploading")
    await uploadReceipt({
      path: prepared.receiptUploadPath,
      reportToken: prepared.reportToken,
      contentType: report.receipt.contentType,
      file: input.file,
    })
  }

  input.onStep("submitting")
  try {
    await client.businessBanking.submitReport.mutate({
      reportToken: prepared.reportToken,
    })
  } catch (error) {
    const failure = fromTrpc(error)
    if (
      failure.kind === "conflict" &&
      prepared.receiptUploadPath &&
      !input.file
    )
      throw new ReportFlowError(
        "receipt_needed",
        "Add the same receipt again to finish telling them.",
      )
    throw failure
  }
}
