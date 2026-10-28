import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { type TRPCClient, TRPCClientError } from "@trpc/client"
import type { RefundDestination } from "./refund-destination"
import type { StoredReport } from "./report-storage"

export type SendStep = "preparing" | "uploading" | "submitting"
type Banking = TRPCClient<AppRouter>["businessBanking"]
type PrepareClient = {
  businessBanking: Pick<Banking, "reportPayment" | "reportPaymentWithRefund">
}
type SubmitClient = { businessBanking: Pick<Banking, "submitReport"> }
type PaymentReportClient = PrepareClient & SubmitClient

/** The server's answer to preparing a report: a DRAFT until the explicit final submit. */
export type PreparedReport = Pick<
  Awaited<ReturnType<Banking["reportPayment"]["mutate"]>>,
  "reportToken" | "status" | "receiptUploadPath"
>

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
  /** Refund bank details need this order's customer signed in. */
  | "verify"
  /** Finishing a report whose refund bank details must be entered again. */
  | "refund_details_needed"
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

export function fromTrpc(error: unknown): ReportFlowError {
  const code = trpcErrorCode(error)
  const message = error instanceof Error ? error.message : NETWORK_MESSAGE
  if (code === "CONFLICT") return new ReportFlowError("conflict", message)
  if (code === "UNAUTHORIZED") return new ReportFlowError("verify", message)
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
 * Prepares (or replays) the report as a DRAFT. Nothing is told to the business yet. Refund bank
 * details go only through the verified refund report, which carries the customer's session; an
 * ordinary report never carries them. A report saved with bank details replays only with them.
 */
export async function prepareReport(input: {
  client: PrepareClient
  linkToken: string
  report: StoredReport
  refundDestination: RefundDestination | null
}): Promise<PreparedReport> {
  const { client, report, refundDestination } = input
  if (Boolean(report.refundDetails) !== Boolean(refundDestination))
    throw new ReportFlowError(
      "refund_details_needed",
      "Enter the refund bank details you gave for this report again to finish.",
    )
  const allocation = report.allocation
    ? {
        allocationPreference: report.allocation.allocationPreference,
        requestedApplyMinor: report.allocation.requestedApplyMinor,
        ...(refundDestination ? { refundDestination } : {}),
      }
    : null
  const details = {
    token: input.linkToken,
    clientReportId: report.clientReportId,
    payerName: report.payerName,
    claimedAmountMinor: report.claimedAmountMinor,
    // The exact reference the customer was shown; the server refuses it once it is not current.
    ...(report.paymentAttemptId
      ? { paymentAttemptId: report.paymentAttemptId }
      : {}),
    // Part of the same idempotent report: a retry sends exactly the proposal first saved.
    ...(allocation ? { allocation } : {}),
    ...(report.receipt
      ? {
          receipt: {
            contentType: report.receipt.contentType,
            contentDigest: report.receipt.contentDigest,
            sizeBytes: report.receipt.sizeBytes,
          },
        }
      : {}),
  }
  try {
    const prepared = refundDestination
      ? await client.businessBanking.reportPaymentWithRefund.mutate(details)
      : await client.businessBanking.reportPayment.mutate(details)
    return {
      reportToken: prepared.reportToken,
      status: prepared.status,
      receiptUploadPath: prepared.receiptUploadPath,
    }
  } catch (error) {
    const failure = fromTrpc(error)
    // The refund report needs this order's customer; the server says so before saving anything.
    if (refundDestination && trpcErrorCode(error) === "FORBIDDEN")
      throw new ReportFlowError(
        "verify",
        "Sign in as this order's customer to add refund bank details.",
      )
    throw failure
  }
}

/**
 * Uploads the selected private receipt to a prepared DRAFT. Uploading the same bytes again is
 * idempotent; it never submits the report. Returns whether bytes were sent.
 */
export async function uploadPreparedReceipt(input: {
  prepared: PreparedReport
  report: StoredReport
  file: File | null
}) {
  const { prepared, report, file } = input
  if (
    prepared.status !== "DRAFT" ||
    !prepared.receiptUploadPath ||
    !file ||
    !report.receipt
  )
    return false
  await uploadReceipt({
    path: prepared.receiptUploadPath,
    reportToken: prepared.reportToken,
    contentType: report.receipt.contentType,
    file,
  })
  return true
}

/** The explicit final step: tells the business. Only the customer's own action calls this. */
export async function submitPreparedReport(input: {
  client: SubmitClient
  prepared: PreparedReport
  /** Whether this visit still has the receipt bytes. */
  hasFile: boolean
}) {
  try {
    return await input.client.businessBanking.submitReport.mutate({
      reportToken: input.prepared.reportToken,
    })
  } catch (error) {
    const failure = fromTrpc(error)
    if (
      failure.kind === "conflict" &&
      input.prepared.receiptUploadPath &&
      !input.hasFile
    )
      throw new ReportFlowError(
        "receipt_needed",
        "Add the same receipt again to finish telling them.",
      )
    throw failure
  }
}

/**
 * reportPayment → (PUT receipt bytes) → submitReport, all from one explicit final action. Every
 * step is idempotent for the same clientReportId and details, so a retry after any failure is safe.
 */
export async function sendPaymentReport(input: {
  client: PaymentReportClient
  linkToken: string
  report: StoredReport
  refundDestination?: RefundDestination | null
  file: File | null
  onStep: (step: SendStep) => void
  onPrepared: (reportToken: string) => void
}): Promise<void> {
  input.onStep("preparing")
  const prepared = await prepareReport({
    client: input.client,
    linkToken: input.linkToken,
    report: input.report,
    refundDestination: input.refundDestination ?? null,
  })
  input.onPrepared(prepared.reportToken)
  // Without the file (a later visit), submit anyway: an earlier upload may have
  // finished, and the server says so if it didn't.
  if (prepared.status === "DRAFT" && prepared.receiptUploadPath && input.file)
    input.onStep("uploading")
  await uploadPreparedReceipt({
    prepared,
    report: input.report,
    file: input.file,
  })
  input.onStep("submitting")
  await submitPreparedReport({
    client: input.client,
    prepared,
    hasFile: Boolean(input.file),
  })
}
