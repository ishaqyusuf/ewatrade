import { createHash } from "node:crypto"
import { z } from "zod"
import type { PrismaClient } from "../../generated/prisma/client"
import { getApprovedAccountPrivacyRecordPolicy } from "./account-privacy-record-policy"
import {
  AccountPrivacyRecordRetentionError,
  accountPrivacyRecordProcessingContext,
} from "./account-privacy-record-retention"
import { runInOwnSerializableTransaction } from "./own-transaction"

export const minimizeAccountPrivacyCustomersSchema = z
  .object({
    requestId: z.string().min(1),
    customers: z
      .array(
        z
          .object({
            customerId: z.string().min(1),
            expectedUpdatedAt: z.coerce.date(),
            controllerEvidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
            subjectOwnershipReviewed: z.literal(true),
            controllerInstructionsReviewed: z.literal(true),
            optionalProfileFieldsReviewed: z.literal(true),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
/** Verified email is only a scope check; explicit genuine subject-ownership and controller review are also required. Financial/customer IDs and ledger amounts stay intact. */
export async function minimizeAccountPrivacyCustomers(
  db: PrismaClient,
  input: z.infer<typeof minimizeAccountPrivacyCustomersSchema> & {
    operatorUserId: string
    now?: Date
  },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyRecordRetentionError("DISABLED")
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyRecordPolicy(process.env, now)
  if (!policy)
    throw new AccountPrivacyRecordRetentionError("POLICY_NOT_APPROVED")
  if (
    !minimizeAccountPrivacyCustomersSchema.safeParse({
      requestId: input.requestId,
      customers: input.customers,
    }).success ||
    new Set(input.customers.map((row) => row.customerId)).size !==
      input.customers.length
  )
    throw new AccountPrivacyRecordRetentionError("CONTROLLER_EVIDENCE_REQUIRED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { request } = await accountPrivacyRecordProcessingContext(
      tx,
      input,
      now,
    )
    const email = request.contactEmail?.trim().toLowerCase()
    if (!email) throw new AccountPrivacyRecordRetentionError("NOT_READY")
    const previous =
      request.outcome &&
      typeof request.outcome === "object" &&
      !Array.isArray(request.outcome)
        ? request.outcome
        : {}
    const evidenceDigest = createHash("sha256")
      .update(
        JSON.stringify({
          requestId: request.id,
          operatorUserId: input.operatorUserId,
          policyDigest: policy.digest,
          customers: [...input.customers].sort((a, b) =>
            a.customerId.localeCompare(b.customerId),
          ),
        }),
      )
      .digest("hex")
    const receipt = previous.customerProfileCleanup
    const replay = Boolean(
      receipt &&
        typeof receipt === "object" &&
        !Array.isArray(receipt) &&
        receipt.evidenceDigest === evidenceDigest &&
        receipt.policyDigest === policy.digest,
    )
    const receipts = []
    for (const item of input.customers) {
      const customer = await tx.customer.findUnique({
        where: { id: item.customerId },
        select: {
          id: true,
          tenantId: true,
          email: true,
          normalizedEmail: true,
          name: true,
          phone: true,
          normalizedPhone: true,
          updatedAt: true,
        },
      })
      if (replay) {
        if (
          !customer ||
          customer.name !== "Deleted customer" ||
          customer.email ||
          customer.normalizedEmail ||
          customer.phone ||
          customer.normalizedPhone
        )
          throw new AccountPrivacyRecordRetentionError("CLAIM_CONFLICT")
        continue
      }
      if (
        !customer ||
        !(
          customer.email?.trim().toLowerCase() === email ||
          customer.normalizedEmail === email
        )
      )
        throw new AccountPrivacyRecordRetentionError("NOT_READY")
      if (customer.updatedAt.getTime() !== item.expectedUpdatedAt.getTime())
        throw new AccountPrivacyRecordRetentionError("SOURCE_CHANGED")
      // Preserve lookup until duplicated order contact and notes have a controller disposition.
      if (
        await tx.commercialOrder.count({
          where: {
            tenantId: customer.tenantId,
            customerId: customer.id,
            OR: [
              { customerName: { not: null } },
              { customerEmail: { not: null } },
              { customerPhone: { not: null } },
              { notes: { not: null } },
            ],
          },
        })
      )
        throw new AccountPrivacyRecordRetentionError(
          "CONTROLLER_EVIDENCE_REQUIRED",
        )
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          name: "Deleted customer",
          email: null,
          normalizedEmail: null,
          phone: null,
          normalizedPhone: null,
        },
      })
      receipts.push({
        customerId: customer.id,
        tenantId: customer.tenantId,
        controllerEvidenceDigest: item.controllerEvidenceDigest,
      })
    }
    if (replay)
      return {
        requestId: request.id,
        profilesMinimized: input.customers.length,
        financialRecordsDeleted: 0,
        replay: true,
      }
    await tx.accountPrivacyRequest.update({
      where: { id: request.id },
      data: {
        outcome: {
          ...previous,
          customerProfileCleanup: {
            processor: "account-privacy-customer-profile-v1",
            policyDigest: policy.digest,
            evidenceDigest,
            processedAt: now.toISOString(),
            removedProfiles: receipts.length,
          },
        },
      },
    })
    return {
      requestId: request.id,
      profilesMinimized: receipts.length,
      financialRecordsDeleted: 0,
      replay: false,
    }
  })
}
