import { prisma } from "@ewatrade/db/client"
import {
  claimPrescriptionTranscriptionJob,
  completePrescriptionTranscription,
  retryPrescriptionTranscriptionJob,
} from "@ewatrade/db/queries"
import {
  type OcrInput,
  type OcrMode,
  type OcrResult,
  type PrescriptionOcrProvider,
  createDeterministicOcrProvider,
} from "@ewatrade/prescriptions"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type PrescriptionTranscriptionPayload = { transcriptionId: string }

type ClaimedTranscription = {
  mediaRevision: number
  objectKeys: string[]
  requestId: string
  tenantId: string
  transcriptionId: string
}

type Dependencies = {
  assertProviderAllowed(input: {
    adapter: "live" | "test"
    tenantId: string
  }): Promise<unknown>
  claim(
    input: PrescriptionTranscriptionPayload,
  ): Promise<ClaimedTranscription | null>
  complete(input: {
    failureCode?: string | null
    lines?: Array<{
      confidence?: number | null
      draftText: string
      lineNumber: number
    }>
    providerKey: string
    transcriptionId: string
  }): Promise<unknown>
  provider: PrescriptionOcrProvider
  retry(input: PrescriptionTranscriptionPayload): Promise<unknown>
}

function configuredProvider() {
  const provider = process.env.PRESCRIPTION_OCR_PROVIDER?.trim()
  if (
    process.env.NODE_ENV !== "production" &&
    (!provider || provider === "deterministic-fake")
  ) {
    return createDeterministicOcrProvider()
  }
  throw new Error(
    "A production Prescription OCR provider is not configured; transcription fails closed.",
  )
}

function defaultDependencies(): Dependencies {
  return {
    assertProviderAllowed: ({ adapter, tenantId }) =>
      assertQaJobProviderAllowed({
        adapter,
        operation: "media_analysis",
        tenantId,
      }),
    claim: (input) => claimPrescriptionTranscriptionJob(prisma, input),
    complete: (input) => completePrescriptionTranscription(prisma, input),
    provider: configuredProvider(),
    retry: (input) => retryPrescriptionTranscriptionJob(prisma, input),
  }
}

export async function runPrescriptionTranscription(
  payload: PrescriptionTranscriptionPayload,
  attempt: number,
  dependencies: Dependencies = defaultDependencies(),
  testMode?: OcrMode,
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return
  await dependencies.assertProviderAllowed({
    adapter:
      dependencies.provider.key === "deterministic-fake" ? "test" : "live",
    tenantId: claim.tenantId,
  })

  let result: OcrResult
  try {
    const providerInput: OcrInput = {
      mediaRevision: claim.mediaRevision,
      objectKeys: claim.objectKeys,
      requestId: claim.requestId,
      ...(testMode ? { mode: testMode } : {}),
    }
    result = await dependencies.provider.transcribe(providerInput)
  } catch (error) {
    await dependencies.retry(payload)
    throw error
  }

  if (result.outcome === "failed") {
    if (attempt < 4) {
      await dependencies.retry(payload)
      throw new Error(result.failureCode)
    }
    await dependencies.complete({
      failureCode: result.failureCode,
      providerKey: dependencies.provider.key,
      transcriptionId: claim.transcriptionId,
    })
    return
  }

  await dependencies.complete({
    lines: result.lines,
    providerKey: dependencies.provider.key,
    transcriptionId: claim.transcriptionId,
  })
}

export async function prescriptionTranscriptionHandler(
  payload: PrescriptionTranscriptionPayload,
  attempt: number,
) {
  return runPrescriptionTranscription(payload, attempt)
}
