import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  ServiceCommerceCustomerActionCapabilityStatus,
  ServiceCommerceCustomerNotificationAttemptStatus,
  ServiceCommerceCustomerNotificationReceiptStatus,
  ServiceCommerceCustomerNotificationStatus,
} from "../../../generated/prisma/enums"
import { revalidateCustomerActionCapabilityInTransaction } from "./projection"
import {
  CUSTOMER_ACTION_TRANSACTION_OPTIONS,
  type CustomerActionTransaction,
  ServiceCommerceCustomerActionError,
  customerActionValues,
  resolveCustomerActionWhatsAppConnectionInTransaction,
} from "./shared"

const CLAIM_MINUTES = 5

export async function listDueServiceCommerceCustomerNotificationIntents(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const rows = await db.serviceCommerceCustomerNotificationIntent.findMany({
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    select: {
      createdByUserId: true,
      id: true,
      storeId: true,
      tenantId: true,
    },
    take: limit,
    where: {
      attemptCount: {
        lt: db.serviceCommerceCustomerNotificationIntent.fields.maxAttempts,
      },
      nextAttemptAt: { lte: now },
      OR: [
        {
          status: {
            in: [
              ServiceCommerceCustomerNotificationStatus.PENDING,
              ServiceCommerceCustomerNotificationStatus.FAILED,
            ],
          },
        },
        {
          claimExpiresAt: { lte: now },
          status: ServiceCommerceCustomerNotificationStatus.CLAIMED,
        },
      ],
    },
  })
  return rows.map((row) => ({
    actorUserId: row.createdByUserId,
    intentId: row.id,
    storeId: row.storeId,
    tenantId: row.tenantId,
  }))
}

export async function claimServiceCommerceCustomerNotificationIntent(
  db: PrismaClient,
  input: {
    actorUserId: string
    intentId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "ServiceCommerceCustomerNotificationIntent"
      WHERE "id" = ${input.intentId}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `)
    const intent = await tx.serviceCommerceCustomerNotificationIntent.findFirst(
      {
        include: {
          actionCapabilities: {
            where: {
              expiresAt: { gt: now },
              status: ServiceCommerceCustomerActionCapabilityStatus.ACTIVE,
            },
          },
        },
        where: {
          id: input.intentId,
          nextAttemptAt: { lte: now },
          OR: [
            {
              status: {
                in: [
                  ServiceCommerceCustomerNotificationStatus.PENDING,
                  ServiceCommerceCustomerNotificationStatus.FAILED,
                ],
              },
            },
            {
              claimExpiresAt: { lte: now },
              status: ServiceCommerceCustomerNotificationStatus.CLAIMED,
            },
          ],
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    )
    if (!intent || intent.attemptCount >= intent.maxAttempts) return null
    if (intent.createdByUserId !== input.actorUserId) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_FORBIDDEN",
        "Customer notification actor is unavailable.",
      )
    }
    if (intent.templateRequired && !intent.templateKey) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_PROVIDER_UNAVAILABLE",
        "An approved message template is required outside the service window.",
      )
    }
    if (
      !intent.templateRequired &&
      intent.serviceWindowExpiresAt &&
      intent.serviceWindowExpiresAt <= now
    ) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_PROVIDER_UNAVAILABLE",
        "The customer service window expired before notification delivery.",
      )
    }
    const currentCapabilities = []
    for (const capability of intent.actionCapabilities) {
      if (
        await revalidateCustomerActionCapabilityInTransaction(tx, capability)
      ) {
        currentCapabilities.push(capability)
      }
    }
    if (currentCapabilities.length === 0) {
      await tx.serviceCommerceCustomerNotificationIntent.updateMany({
        data: {
          lastFailureCode: "no_current_customer_actions",
          status: ServiceCommerceCustomerNotificationStatus.CANCELLED,
        },
        where: {
          id: intent.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      return null
    }
    const connection =
      await resolveCustomerActionWhatsAppConnectionInTransaction(tx, {
        storeId: input.storeId,
        templateKey: intent.templateKey ?? "",
        tenantId: input.tenantId,
      })
    const attemptNumber = intent.attemptCount + 1
    const attempt = await tx.serviceCommerceCustomerNotificationAttempt.create({
      data: {
        attemptNumber,
        notificationIntentId: intent.id,
        status: ServiceCommerceCustomerNotificationAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.serviceCommerceCustomerNotificationIntent.updateMany({
      data: {
        attemptCount: attemptNumber,
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + CLAIM_MINUTES * 60_000),
        lastFailureCode: null,
        status: ServiceCommerceCustomerNotificationStatus.CLAIMED,
      },
      where: {
        id: intent.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return {
      actions: currentCapabilities.map((capability) => ({
        action: customerActionValues[capability.action],
        clientCapabilityId: capability.clientCapabilityId,
        label: capability.label,
      })),
      attemptId: attempt.id,
      attemptNumber,
      channel: intent.channel.toLowerCase() as "whatsapp",
      connectionId: connection.connectionId,
      credentialReference: connection.credentialReference,
      intentId: intent.id,
      maxAttempts: intent.maxAttempts,
      phoneNumberId: connection.phoneNumberId,
      protectedRecipient: intent.protectedRecipient,
      templateKey: connection.templateKey,
    }
  }, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
}

export async function authorizeServiceCommerceCustomerNotificationAttempt(
  db: PrismaClient,
  input: {
    actorUserId: string
    attemptId: string
    connectionId: string
    intentId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    const attempt =
      await tx.serviceCommerceCustomerNotificationAttempt.findFirst({
        include: {
          notificationIntent: {
            include: {
              actionCapabilities: {
                where: {
                  expiresAt: { gt: now },
                  status: ServiceCommerceCustomerActionCapabilityStatus.ACTIVE,
                },
              },
            },
          },
        },
        where: {
          id: input.attemptId,
          notificationIntentId: input.intentId,
          notificationIntent: {
            status: ServiceCommerceCustomerNotificationStatus.CLAIMED,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
          status: ServiceCommerceCustomerNotificationAttemptStatus.CLAIMED,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    if (
      !attempt ||
      attempt.notificationIntent.createdByUserId !== input.actorUserId ||
      !attempt.notificationIntent.templateKey
    ) {
      return false
    }
    try {
      const connection =
        await resolveCustomerActionWhatsAppConnectionInTransaction(tx, {
          storeId: input.storeId,
          templateKey: attempt.notificationIntent.templateKey,
          tenantId: input.tenantId,
        })
      if (connection.connectionId !== input.connectionId) return false
      for (const capability of attempt.notificationIntent.actionCapabilities) {
        if (
          await revalidateCustomerActionCapabilityInTransaction(tx, capability)
        ) {
          return true
        }
      }
      return false
    } catch (error) {
      if (error instanceof ServiceCommerceCustomerActionError) return false
      throw error
    }
  }, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
}

export async function completeServiceCommerceCustomerNotificationIntent(
  db: PrismaClient,
  input: {
    attemptId: string
    intentId: string
    now?: Date
    providerConnectionId: string
    providerKey: string
    providerOperationId?: string
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await tx.serviceCommerceCustomerNotificationAttempt.updateMany({
      data: {
        completedAt: now,
        providerConnectionId: input.providerConnectionId,
        providerKey: input.providerKey,
        providerOperationId: input.providerOperationId,
        status: ServiceCommerceCustomerNotificationAttemptStatus.SENT,
      },
      where: {
        id: input.attemptId,
        notificationIntentId: input.intentId,
        status: ServiceCommerceCustomerNotificationAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return tx.serviceCommerceCustomerNotificationIntent.updateMany({
      data: {
        claimExpiresAt: null,
        sentAt: now,
        status: ServiceCommerceCustomerNotificationStatus.SENT,
      },
      where: {
        id: input.intentId,
        status: ServiceCommerceCustomerNotificationStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
  }, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
}

export async function failServiceCommerceCustomerNotificationIntent(
  db: PrismaClient,
  input: {
    attemptId: string
    failureCode: string
    intentId: string
    now?: Date
    retryAt?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await tx.serviceCommerceCustomerNotificationAttempt.updateMany({
      data: {
        completedAt: now,
        failureCode: input.failureCode.slice(0, 80),
        status: ServiceCommerceCustomerNotificationAttemptStatus.FAILED,
      },
      where: {
        id: input.attemptId,
        notificationIntentId: input.intentId,
        status: ServiceCommerceCustomerNotificationAttemptStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return tx.serviceCommerceCustomerNotificationIntent.updateMany({
      data: {
        claimExpiresAt: null,
        lastFailureCode: input.failureCode.slice(0, 80),
        nextAttemptAt: input.retryAt ?? now,
        status: input.retryAt
          ? ServiceCommerceCustomerNotificationStatus.PENDING
          : ServiceCommerceCustomerNotificationStatus.FAILED,
      },
      where: {
        id: input.intentId,
        status: ServiceCommerceCustomerNotificationStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
  }, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
}

export async function recordServiceCommerceCustomerNotificationReceipt(
  db: PrismaClient,
  input: {
    intentId: string
    now?: Date
    occurredAt: Date
    providerReceiptId: string
    status: "delivered" | "failed" | "read"
    storeId: string
    tenantId: string
  },
) {
  const receiptStatus = {
    delivered: ServiceCommerceCustomerNotificationReceiptStatus.DELIVERED,
    failed: ServiceCommerceCustomerNotificationReceiptStatus.FAILED,
    read: ServiceCommerceCustomerNotificationReceiptStatus.READ,
  }[input.status]
  return db.$transaction(async (tx) => {
    const intent = await tx.serviceCommerceCustomerNotificationIntent.findFirst(
      {
        select: { id: true },
        where: {
          id: input.intentId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    )
    if (!intent) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_NOT_FOUND",
        "Customer notification is unavailable.",
      )
    }
    await tx.serviceCommerceCustomerNotificationReceipt.upsert({
      create: {
        notificationIntentId: intent.id,
        occurredAt: input.occurredAt,
        providerReceiptId: input.providerReceiptId,
        status: receiptStatus,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {},
      where: {
        tenantId_providerReceiptId: {
          providerReceiptId: input.providerReceiptId,
          tenantId: input.tenantId,
        },
      },
    })
    return tx.serviceCommerceCustomerNotificationIntent.updateMany({
      data:
        input.status === "delivered"
          ? {
              deliveredAt: input.occurredAt,
              status: ServiceCommerceCustomerNotificationStatus.DELIVERED,
            }
          : input.status === "read"
            ? {
                readAt: input.occurredAt,
                status: ServiceCommerceCustomerNotificationStatus.READ,
              }
            : {
                lastFailureCode: "provider_receipt_failed",
                status: ServiceCommerceCustomerNotificationStatus.FAILED,
              },
      where: {
        id: intent.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
  }, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
}
