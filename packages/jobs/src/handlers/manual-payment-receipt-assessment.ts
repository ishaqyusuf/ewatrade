import type { ReceiptCheckContext } from "@ewatrade/payments/receipt-assessment"
import type {
  ReceiptExtractor,
  ReceiptExtractorResult,
  ReceiptPage,
} from "@ewatrade/payments/receipt-extractor"

export type ManualReceiptAssessmentPayload = {
  tenantId: string
  assessmentId: string
}
type Claim = { leaseToken: string | null }
export type ManualReceiptAssessmentDependencies = {
  claim(input: ManualReceiptAssessmentPayload): Promise<Claim | null>
  prepare(
    input: ManualReceiptAssessmentPayload & { leaseToken: string },
  ): Promise<{
    pages: ReceiptPage[]
    context: ReceiptCheckContext
    extractor: ReceiptExtractor
  } | null>
  start(
    input: ManualReceiptAssessmentPayload & {
      leaseToken: string
      imageCount: number
    },
  ): Promise<boolean>
  finish(
    input: ManualReceiptAssessmentPayload & {
      leaseToken: string
      result: ReceiptExtractorResult
      context: ReceiptCheckContext
    },
  ): Promise<boolean>
  unavailable(
    input: ManualReceiptAssessmentPayload & { leaseToken: string },
  ): Promise<unknown>
}

/** IDs only, bounded one-shot extraction, durable fencing; never invokes a financial command. */
export async function runManualReceiptAssessment(
  payload: ManualReceiptAssessmentPayload,
  dependencies: ManualReceiptAssessmentDependencies,
) {
  if (
    Object.keys(payload).length !== 2 ||
    !payload.tenantId ||
    !payload.assessmentId ||
    payload.tenantId.length > 128 ||
    payload.assessmentId.length > 128
  )
    throw new Error("Invalid receipt assessment identity.")
  const claim = await dependencies.claim(payload)
  if (!claim?.leaseToken) return { status: "skipped" as const }
  const input = { ...payload, leaseToken: claim.leaseToken }
  let prepared: Awaited<
    ReturnType<ManualReceiptAssessmentDependencies["prepare"]>
  >
  try {
    prepared = await dependencies.prepare(input)
  } catch {
    prepared = null
  }
  if (!prepared) {
    await dependencies.unavailable(input)
    return { status: "unavailable" as const }
  }
  let started = false
  try {
    started = await dependencies.start({
      ...input,
      imageCount: prepared.pages.length,
    })
  } catch {
    await dependencies.unavailable(input)
    return { status: "unavailable" as const }
  }
  if (!started) return { status: "skipped" as const }
  let result: ReceiptExtractorResult
  try {
    result = await prepared.extractor({
      pages: prepared.pages,
      abortSignal: AbortSignal.timeout(30_000),
    })
  } catch {
    await dependencies.unavailable(input)
    return { status: "unavailable" as const }
  }
  // A persistence failure is recovered from the durable provider-start marker, never another dispatch.
  const saved = await dependencies.finish({
    ...input,
    result,
    context: prepared.context,
  })
  return { status: saved ? ("complete" as const) : ("stale" as const) }
}
