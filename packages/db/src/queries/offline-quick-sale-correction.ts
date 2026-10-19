import {
  type OfflineCommand,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import {
  acquireOfflineCommandFences,
  assertOfflineCommandFence,
} from "./offline-command-fence"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
} from "./offline-commands"
import {
  type BlankQuickSaleCorrection,
  deriveBlankQuickSaleReplacement,
} from "./offline-quick-sale-correction-input"
import {
  type OfflineQuickSaleCorrectionRecord,
  readOfflineQuickSaleCorrectionRecord,
} from "./offline-quick-sale-correction-record"
import {
  readOfflineRecoveryRecord,
  withoutOfflineRecoveryRecord,
} from "./offline-recovery-record"
import { getOfflineOperationsPolicy } from "./offline-settings"
import { assertOfflineStaffActor } from "./offline-staff-access"
import { assertRetailOpsOfflineDeviceCanSync } from "./retail-ops-subscriptions"

type Scope = {
  actorUserId: string
  tenantId: string
  storeId: string
  deviceId: string
}
export type CorrectBlankQuickSaleInput = Scope &
  BlankQuickSaleCorrection & { envelope: OfflineCommandEnvelope }

function refuse(
  message = "Keep this saved sale and ask management to review it before replacing it.",
) {
  return new CatalogError("INVALID_STOCK_OPERATION", message)
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
function assertOriginal(
  command: OfflineCommand,
  envelope: OfflineCommandEnvelope,
  scope: Scope,
  offlineDeviceId: string,
) {
  const { actorUserId, ...payload } = withoutOfflineRecoveryRecord(
    command.payload as Record<string, unknown>,
  )
  if (
    command.tenantId !== scope.tenantId ||
    command.storeId !== scope.storeId ||
    command.offlineDeviceId !== offlineDeviceId ||
    actorUserId !== scope.actorUserId ||
    command.clientCommandId !== envelope.clientCommandId ||
    command.payloadHash !== offlineCommandEnvelopeHash(envelope) ||
    command.payloadHash !==
      offlineCommandEnvelopeHash({
        clientCommandId: command.clientCommandId,
        createdAtClient: command.createdAtClient,
        dependencyClientIds: command.dependencyClientIds as string[],
        eventVersion: command.eventVersion,
        payload: payload as OfflineCommandEnvelope["payload"],
      })
  )
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "The original saved sale cannot be changed or transferred during correction.",
    )
}

async function activeOrigin(tx: Prisma.TransactionClient, scope: Scope) {
  await assertOfflineStaffActor(tx, scope)
  const member = await tx.membership.findUniqueOrThrow({
    where: {
      tenantId_userId: { tenantId: scope.tenantId, userId: scope.actorUserId },
    },
    select: { role: true },
  })
  const stores = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Store" WHERE "id"=${scope.storeId} AND "tenantId"=${scope.tenantId} AND "status"='ACTIVE' FOR SHARE
  `
  if (stores.length !== 1) throw refuse()
  // Same registration coordination key/order as ordinary registration/recovery.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([scope.tenantId, scope.deviceId])}, 0))`
  const devices = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "OfflineDevice"
    WHERE "tenantId"=${scope.tenantId} AND "storeId"=${scope.storeId}
      AND "deviceId"=${scope.deviceId} AND "registeredByUserId"=${scope.actorUserId}
      AND "status"='ACTIVE' FOR UPDATE
  `
  if (devices.length !== 1 || !devices[0]) throw refuse()
  await assertRetailOpsOfflineDeviceCanSync(tx, scope)
  return { deviceId: devices[0].id, role: member.role }
}

/**
 * Stage a description-only replacement after server proof of non-application.
 * No replacement Order/payment/stock command runs. A historical matching Order
 * reconciles instead. The exact original remains durable under its old identity.
 */
export async function correctBlankQuickSale(
  db: PrismaClient,
  request: CorrectBlankQuickSaleInput,
) {
  const input = structuredClone(request)
  if (
    Object.hasOwn(input.envelope.payload, "actorUserId") ||
    Object.keys(input.envelope.payload).some((key) =>
      key.startsWith("_offline"),
    )
  )
    throw refuse()
  const replacement = deriveBlankQuickSaleReplacement(input.envelope, input)
  const originalHash = offlineCommandEnvelopeHash(input.envelope)
  const replacementHash = offlineCommandEnvelopeHash(replacement)
  return db.$transaction(
    async (tx) => {
      const fence = await acquireOfflineCommandFences(tx, {
        tenantId: input.tenantId,
        clientCommandIds: [
          input.envelope.clientCommandId,
          replacement.clientCommandId,
        ],
      })
      const tenants = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true AND "qaPurgeStartedAt" IS NULL FOR UPDATE
    `
      if (tenants.length !== 1) throw refuse()
      const origin = await activeOrigin(tx, input)
      const policy = await getOfflineOperationsPolicy(tx, input)
      if (!policy) throw refuse()
      const commandWhere = (clientCommandId: string) => ({
        tenantId_clientCommandId: { tenantId: input.tenantId, clientCommandId },
      })
      const original = await tx.offlineCommand.findUnique({
        where: commandWhere(input.envelope.clientCommandId),
      })
      if (original) {
        assertOriginal(original, input.envelope, input, origin.deviceId)
        if (readOfflineRecoveryRecord(original.payload))
          throw refuse("Use Owner/Admin recovery for this held saved sale.")
      }
      const receipt = (
        old: OfflineCommand,
        next: OfflineCommand,
        record: OfflineQuickSaleCorrectionRecord,
      ) => {
        assertOriginal(next, replacement, input, origin.deviceId)
        const recoveryHeld = Boolean(readOfflineRecoveryRecord(next.payload))
        return {
          outcome: "replaced" as const,
          originalClientCommandId: old.clientCommandId,
          originalPayloadHash: old.payloadHash,
          replacement: {
            id: next.id,
            envelope: replacement,
            payloadHash: next.payloadHash,
            status: next.status,
            recoveryHeld,
            result: recoveryHeld ? null : next.result,
          },
          replacedAt: record.replacedAt,
        }
      }
      const previous = readOfflineQuickSaleCorrectionRecord(
        original?.authoritativeState,
      )
      if (previous) {
        if (
          !original ||
          original.status !== "DISCARDED" ||
          previous.originalClientCommandId !== input.envelope.clientCommandId ||
          previous.originalPayloadHash !== originalHash ||
          previous.replacementClientCommandId !== replacement.clientCommandId ||
          previous.replacementPayloadHash !== replacementHash ||
          previous.replacedByUserId !== input.actorUserId
        )
          throw new CatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This saved sale already has a different correction. Reconcile that attempt.",
          )
        const next = await tx.offlineCommand.findUnique({
          where: commandWhere(replacement.clientCommandId),
        })
        if (!next) throw refuse()
        return receipt(original, next, previous)
      }

      const existingOrder = await tx.commercialOrder.findUnique({
        where: {
          tenantId_clientOrderId: {
            tenantId: input.tenantId,
            clientOrderId: input.envelope.clientCommandId,
          },
        },
        select: { id: true },
      })
      if (existingOrder) {
        // This call must take its historical same-hash return. The held Tenant
        // excludes a new insertion; never invoke it for an absent Order here.
        const result = await createCommercialOrderInTransaction(tx, {
          ...input.envelope.payload,
          actorUserId: input.actorUserId,
          tenantId: input.tenantId,
          storeId: input.storeId,
          schemaVersion: 1,
          clientOrderId: input.envelope.clientCommandId,
        })
        const data = {
          status: "APPLIED" as const,
          result: json(result),
          authoritativeState: Prisma.JsonNull,
          attemptedState: Prisma.JsonNull,
          conflictCode: null,
          conflictMessage: null,
          processedAt: new Date(),
        }
        if (original)
          await tx.offlineCommand.update({ where: { id: original.id }, data })
        else
          await tx.offlineCommand.create({
            data: {
              ...data,
              clientCommandId: input.envelope.clientCommandId,
              tenantId: input.tenantId,
              storeId: input.storeId,
              offlineDeviceId: origin.deviceId,
              type: "COMMERCIAL_ORDER",
              createdAtClient: input.envelope.createdAtClient,
              dependencyClientIds: json(input.envelope.dependencyClientIds),
              eventVersion: input.envelope.eventVersion,
              payload: json({
                ...input.envelope.payload,
                actorUserId: input.actorUserId,
              }),
              payloadHash: originalHash,
            },
          })
        return {
          outcome: "already_applied" as const,
          originalClientCommandId: input.envelope.clientCommandId,
          result,
        }
      }
      if (
        !policy.enabled ||
        (original &&
          (original.status === "APPLIED" ||
            original.status === "DISCARDED" ||
            original.result !== null))
      )
        throw refuse()

      const descendant = await tx.offlineCommand.findFirst({
        where: {
          tenantId: input.tenantId,
          dependencyClientIds: {
            array_contains: [input.envelope.clientCommandId],
          },
        },
        select: { id: true },
      })
      if (descendant)
        throw refuse(
          "Other saved records depend on this sale. Ask management to review them together.",
        )
      if (
        (await tx.offlineCommand.findUnique({
          where: commandWhere(replacement.clientCommandId),
          select: { id: true },
        })) ||
        (await tx.commercialOrder.findUnique({
          where: {
            tenantId_clientOrderId: {
              tenantId: input.tenantId,
              clientOrderId: replacement.clientCommandId,
            },
          },
          select: { id: true },
        }))
      )
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "The correction identity is already in use.",
        )
      for (const clientPaymentId of [
        input.envelope.payload.initialPayment?.clientPaymentId,
        replacement.payload.initialPayment?.clientPaymentId,
      ]) {
        if (
          clientPaymentId &&
          (await tx.commercialOrderPayment.findUnique({
            where: {
              tenantId_clientPaymentId: {
                tenantId: input.tenantId,
                clientPaymentId,
              },
            },
            select: { id: true },
          }))
        )
          throw new CatalogError(
            "IDEMPOTENCY_MISMATCH",
            "A saved payment identity is already in use. Ask management to reconcile it.",
          )
      }

      // A real tuple version change makes an older Repeatable Read canonical
      // allocation fail serialization rather than miss the committed tombstone.
      await tx.$executeRaw`UPDATE "Tenant" SET "updatedAt"=clock_timestamp() WHERE "id"=${input.tenantId}`
      if (
        await tx.commercialOrder.findUnique({
          where: {
            tenantId_clientOrderId: {
              tenantId: input.tenantId,
              clientOrderId: input.envelope.clientCommandId,
            },
          },
          select: { id: true },
        })
      )
        throw refuse()
      const hadReview = original
        ? (await tx.offlineConflictReview.count({
            where: { commandId: original.id },
          })) > 0
        : false
      const requiresApproval =
        (original !== null && original.status !== "PENDING") ||
        hadReview ||
        (policy.approvalRequired &&
          !["OWNER", "ADMIN", "MANAGER"].includes(origin.role))
      const next = await tx.offlineCommand.create({
        data: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          offlineDeviceId: origin.deviceId,
          clientCommandId: replacement.clientCommandId,
          createdAtClient: replacement.createdAtClient,
          dependencyClientIds: json(replacement.dependencyClientIds),
          eventVersion: replacement.eventVersion,
          payload: json({
            ...replacement.payload,
            actorUserId: input.actorUserId,
          }),
          payloadHash: replacementHash,
          type: "COMMERCIAL_ORDER",
          status: requiresApproval ? "REVIEW_REQUIRED" : "PENDING",
          conflictMessage: requiresApproval
            ? "Corrected saved sale awaiting management approval."
            : null,
        },
      })
      const record: OfflineQuickSaleCorrectionRecord = {
        version: 1,
        kind: "blank_quick_sale_replaced",
        originalClientCommandId: input.envelope.clientCommandId,
        originalPayloadHash: originalHash,
        replacementClientCommandId: replacement.clientCommandId,
        replacementPayloadHash: replacementHash,
        replacedByUserId: input.actorUserId,
        replacedAt: new Date().toISOString(),
      }
      const oldState = original?.authoritativeState
      const authoritativeState = json({
        ...(oldState && typeof oldState === "object" && !Array.isArray(oldState)
          ? oldState
          : {}),
        _offlineQuickSaleCorrection: record,
      })
      const retired = {
        status: "DISCARDED" as const,
        authoritativeState,
        attemptedState: Prisma.JsonNull,
        conflictMessage:
          "Replaced by a corrected saved sale. Original facts are retained.",
        processedAt: new Date(),
      }
      assertOfflineCommandFence(tx, fence, {
        tenantId: input.tenantId,
        clientCommandId: input.envelope.clientCommandId,
      })
      const old = original
        ? await tx.offlineCommand.update({
            where: { id: original.id },
            data: retired,
          })
        : await tx.offlineCommand.create({
            data: {
              ...retired,
              tenantId: input.tenantId,
              storeId: input.storeId,
              offlineDeviceId: origin.deviceId,
              clientCommandId: input.envelope.clientCommandId,
              createdAtClient: input.envelope.createdAtClient,
              dependencyClientIds: json(input.envelope.dependencyClientIds),
              eventVersion: input.envelope.eventVersion,
              payload: json({
                ...input.envelope.payload,
                actorUserId: input.actorUserId,
              }),
              payloadHash: originalHash,
              type: "COMMERCIAL_ORDER",
            },
          })
      await tx.offlineConflictReview.create({
        data: {
          commandId: old.id,
          reviewedByUserId: input.actorUserId,
          decision: "DISCARD",
          dependentClientIds: json([]),
          reason: `[author-description-correction] Replaced by ${replacement.clientCommandId}; original facts retained.`,
        },
      })
      return receipt(old, next, record)
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  )
}
