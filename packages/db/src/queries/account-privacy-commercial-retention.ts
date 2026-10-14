import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  type CommercialInventoryClient,
  getAccountPrivacyCommercialInventory,
} from "./account-privacy-commercial-inventory"
import { confirmNoAccountPrivacyCommercialRecords } from "./account-privacy-commercial-outcome"
import {
  AccountPrivacyRecordRetentionError,
  accountPrivacyRecordProcessingContext,
} from "./account-privacy-record-retention"
import { assessAccountPrivacyRetainedRecordScope } from "./account-privacy-record-scope"
import { runInOwnSerializableTransaction } from "./own-transaction"

/** Current supported core is money-preserving actor retention. Other service/contact/clinical facts remain genuine review blockers. */
export async function confirmAccountPrivacyRetainedCommercialRecords(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (process.env.ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED !== "true")
    return confirmNoAccountPrivacyCommercialRecords(db, input)
  const now = input.now ?? new Date()
  const result = await runInOwnSerializableTransaction(db, async (tx) => {
    const { request, subjectId } = await accountPrivacyRecordProcessingContext(
      tx,
      input,
      now,
    )
    const inventory = await getAccountPrivacyCommercialInventory(
      tx,
      subjectId,
      request.contactEmail,
    )
    if (Object.values(inventory).every((value) => value === 0)) return null
    if (
      Object.entries(inventory).some(
        ([key, value]) =>
          value > 0 &&
          ![
            "createdOrders",
            "recordedPayments",
            "fulfillmentCommands",
            "returns",
          ].includes(key),
      )
    )
      throw new AccountPrivacyRecordRetentionError(
        "CONTROLLER_EVIDENCE_REQUIRED",
      )
    const scope = await assessAccountPrivacyRetainedRecordScope(tx, {
      requestId: request.id,
      subjectId,
      families: [
        "commercialOrder",
        "commercialPayment",
        "commercialFulfillment",
        "productReturn",
      ],
      now,
    })
    if (!scope.valid || !scope.records || !scope.nextReviewAt)
      throw new AccountPrivacyRecordRetentionError(
        "CONTROLLER_EVIDENCE_REQUIRED",
      )
    const policyVersion =
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
    if (!policyVersion)
      throw new AccountPrivacyRecordRetentionError("POLICY_NOT_APPROVED")
    const evidenceDigest = createHash("sha256")
      .update(
        JSON.stringify({
          processor: "account-privacy-commercial-retention-v1",
          requestId: request.id,
          subjectId,
          policyVersion,
          plans: scope.digests,
        }),
      )
      .digest("hex")
    const existing = await tx.accountPrivacyDomainOutcome.findUnique({
      where: {
        requestId_domain: {
          requestId: request.id,
          domain: "COMMERCIAL_RECORDS",
        },
      },
    })
    if (existing) {
      if (
        existing.processor !== "account-privacy-commercial-retention-v1" ||
        existing.userId !== subjectId ||
        existing.policyVersion !== policyVersion ||
        existing.disposition !== "RETENTION_APPROVED"
      )
        throw new AccountPrivacyRecordRetentionError("CLAIM_CONFLICT")
      const replay =
        existing.evidenceDigest === evidenceDigest &&
        existing.nextReviewAt?.getTime() === scope.nextReviewAt.getTime()
      if (!replay)
        await tx.accountPrivacyDomainOutcome.update({
          where: { id: existing.id },
          data: {
            evidenceDigest,
            nextReviewAt: scope.nextReviewAt,
            processedAt: now,
          },
        })
      return { requestId: request.id, recordsRetained: scope.records, replay }
    }
    await tx.accountPrivacyDomainOutcome.create({
      data: {
        requestId: request.id,
        userId: subjectId,
        domain: "COMMERCIAL_RECORDS",
        disposition: "RETENTION_APPROVED",
        processor: "account-privacy-commercial-retention-v1",
        policyVersion,
        evidenceDigest,
        nextReviewAt: scope.nextReviewAt,
        processedAt: now,
      },
    })
    return {
      requestId: request.id,
      recordsRetained: scope.records,
      replay: false,
    }
  })
  return result ?? confirmNoAccountPrivacyCommercialRecords(db, input)
}

/** Recheck retained commercial rows before profile processing, replay and completion. */
export async function accountPrivacyCommercialRetentionIsConfirmed(
  db: CommercialInventoryClient &
    Pick<PrismaClient, "$queryRaw" | "accountPrivacyRecordRetention">,
  input: {
    requestId: string
    subjectId: string
    contactEmail: string | null
    outcome: {
      processor: string
      evidenceDigest: string
      policyVersion: string
      disposition: string
      nextReviewAt: Date | null
    }
    now: Date
  },
) {
  if (input.outcome.processor !== "account-privacy-commercial-retention-v1")
    return true
  const inventory = await getAccountPrivacyCommercialInventory(
    db,
    input.subjectId,
    input.contactEmail,
  )
  if (
    Object.entries(inventory).some(
      ([key, count]) =>
        count > 0 &&
        ![
          "createdOrders",
          "recordedPayments",
          "fulfillmentCommands",
          "returns",
        ].includes(key),
    )
  )
    return false
  const scope = await assessAccountPrivacyRetainedRecordScope(db, {
    requestId: input.requestId,
    subjectId: input.subjectId,
    families: [
      "commercialOrder",
      "commercialPayment",
      "commercialFulfillment",
      "productReturn",
    ],
    now: input.now,
  })
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        processor: "account-privacy-commercial-retention-v1",
        requestId: input.requestId,
        subjectId: input.subjectId,
        policyVersion: input.outcome.policyVersion,
        plans: scope.digests,
      }),
    )
    .digest("hex")
  return (
    scope.valid &&
    Boolean(scope.records) &&
    input.outcome.disposition === "RETENTION_APPROVED" &&
    input.outcome.evidenceDigest === digest &&
    input.outcome.policyVersion ===
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim() &&
    input.outcome.nextReviewAt?.getTime() === scope.nextReviewAt?.getTime()
  )
}
