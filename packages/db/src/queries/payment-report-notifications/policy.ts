import { createHash } from "node:crypto"
import {
  type PaymentNotificationPolicyWrite,
  emptyPaymentNotificationPolicy,
  paymentNotificationPolicySchema,
  paymentNotificationPolicyWriteSchema,
} from "@ewatrade/utils/payment-report-notification-policy"
import { z } from "zod"
import type { PrismaClient } from "../../../generated/prisma/client"
import { runInOwnTransaction } from "../own-transaction"
import type { DbClient } from "../types"

export const paymentNotificationPolicyKey = "payment-report-notifications:v1"
export class PaymentNotificationError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "BAD_REQUEST"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message)
  }
}
export async function loadPaymentNotificationPolicy(db: DbClient) {
  const row = await db.systemConfiguration.findUnique({
    where: { key: paymentNotificationPolicyKey },
  })
  if (!row)
    return { policy: emptyPaymentNotificationPolicy(), configured: false }
  const policy = paymentNotificationPolicySchema.safeParse(row.value)
  if (!policy.success || policy.data.revision !== row.revision)
    throw new PaymentNotificationError(
      "UNAVAILABLE",
      "Payment notification policy is invalid.",
    )
  return { policy: policy.data, configured: true }
}
export async function readPaymentNotificationPolicy(db: DbClient) {
  const state = await loadPaymentNotificationPolicy(db)
  const changeJobs = await db.paymentNotificationPolicyChange.findMany({
    orderBy: { revision: "desc" },
    take: 10,
    select: { revision: true, status: true, cursor: true },
  })
  return { ...state, changeJobs }
}
/** Called only by the authenticated Oversight write adapter; actorId is its freshly authorized office identity. */
export async function savePaymentNotificationPolicy(
  db: PrismaClient,
  input: PaymentNotificationPolicyWrite & { actorId: string },
) {
  const actorId = z.string().trim().min(1).max(128).parse(input.actorId)
  const write = paymentNotificationPolicyWriteSchema.parse({
    commandId: input.commandId,
    expectedRevision: input.expectedRevision,
    tiers: input.tiers,
    reason: input.reason,
  })
  const digest = createHash("sha256")
    .update(JSON.stringify({ actorId, ...write }))
    .digest("hex")
  return runInOwnTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(28410302)`
    const priorCommand = await tx.paymentNotificationPolicyCommand.findUnique({
      where: { id: write.commandId },
    })
    if (priorCommand) {
      if (priorCommand.digest !== digest || priorCommand.actorId !== actorId)
        throw new PaymentNotificationError(
          "CONFLICT",
          "This command was already used for different settings.",
        )
      return {
        policy: paymentNotificationPolicySchema.parse(priorCommand.result),
        configured: true,
        changeJobs: await tx.paymentNotificationPolicyChange.findMany({
          orderBy: { revision: "desc" },
          take: 10,
          select: { revision: true, status: true, cursor: true },
        }),
      }
    }
    const old = await loadPaymentNotificationPolicy(tx)
    if (old.policy.revision !== write.expectedRevision)
      throw new PaymentNotificationError(
        "CONFLICT",
        "Settings changed. Review latest before saving.",
      )
    const policy = paymentNotificationPolicySchema.parse({
      schemaVersion: 1,
      revision: old.policy.revision + 1,
      tiers: write.tiers,
    })
    await tx.systemConfiguration.upsert({
      where: { key: paymentNotificationPolicyKey },
      create: {
        key: paymentNotificationPolicyKey,
        revision: policy.revision,
        value: policy,
      },
      update: { revision: policy.revision, value: policy },
    })
    await tx.paymentNotificationPolicyCommand.create({
      data: {
        id: write.commandId,
        actorId,
        digest,
        revision: policy.revision,
        reason: write.reason,
        before: old.policy,
        result: policy,
      },
    })
    await tx.paymentNotificationPolicyChange.create({
      data: { revision: policy.revision, before: old.policy, after: policy },
    })
    return {
      policy,
      configured: true,
      changeJobs: [
        { revision: policy.revision, status: "PENDING", cursor: null },
      ],
    }
  })
}
