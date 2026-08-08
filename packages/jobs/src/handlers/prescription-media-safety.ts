import { prisma } from "@ewatrade/db/client"
import {
  listPendingPrescriptionMediaForSafety,
  recordPrescriptionMediaSafety,
} from "@ewatrade/db/queries"
import {
  type PrescriptionMediaSafetyProvider,
  createDeterministicMediaSafetyProvider,
} from "@ewatrade/prescriptions"

export type PrescriptionMediaSafetyPayload = { requestId: string }

type PendingMedia = {
  id: string
  objectKey: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  list(input: PrescriptionMediaSafetyPayload): Promise<PendingMedia[]>
  provider: PrescriptionMediaSafetyProvider
  record(input: {
    mediaId: string
    outcome: "quarantined" | "rejected" | "safe"
    providerEventId: string
    safetyMetadata?: Record<string, unknown>
    storeId: string
    tenantId: string
  }): Promise<unknown>
}

function configuredProvider() {
  const provider = process.env.PRESCRIPTION_MEDIA_SAFETY_PROVIDER?.trim()
  if (
    process.env.NODE_ENV !== "production" &&
    (!provider || provider === "deterministic-fake")
  ) {
    return createDeterministicMediaSafetyProvider()
  }
  throw new Error(
    "A production Prescription media-safety provider is not configured; scanning fails closed.",
  )
}

function defaultDependencies(): Dependencies {
  return {
    list: (input) => listPendingPrescriptionMediaForSafety(prisma, input),
    provider: configuredProvider(),
    record: (input) => recordPrescriptionMediaSafety(prisma, input),
  }
}

export async function runPrescriptionMediaSafety(
  payload: PrescriptionMediaSafetyPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const media = await dependencies.list(payload)
  for (const item of media) {
    const result = await dependencies.provider.scan({
      mediaId: item.id,
      objectKey: item.objectKey,
    })
    await dependencies.record({
      mediaId: item.id,
      outcome: result.outcome,
      providerEventId: result.providerEventId,
      safetyMetadata: result.safetyMetadata,
      storeId: item.storeId,
      tenantId: item.tenantId,
    })
  }
}

export async function prescriptionMediaSafetyHandler(
  payload: PrescriptionMediaSafetyPayload,
) {
  return runPrescriptionMediaSafety(payload)
}
