import {
  type OfflineCommand,
  type OfflineDevice,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import { isAccountPrivacyAccessBlocked } from "./account-privacy-access"
import { CatalogError } from "./catalog-errors"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { lockCommerceFinancialContext } from "./customer-ledger/commerce-locks"
import { FinanceError } from "./finance/rules"
import { isLegalSignupSessionBlocked } from "./legal-session-access"
import {
  type OfflineCommandFence,
  acquireOfflineCommandFences,
  assertOfflineCommandFence,
} from "./offline-command-fence"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
  offlineOperationConflictCode,
} from "./offline-commands"
import { readOfflineQuickSaleCorrectionRecord } from "./offline-quick-sale-correction-record"
import { authorizeRecoveryFulfillment } from "./offline-recovery-fulfillment-authorization"
import {
  type OfflineRecoveryRecord,
  readOfflineRecoveryRecord,
  withoutOfflineRecoveryRecord,
} from "./offline-recovery-record"
import { assertRetailOpsOfflineDeviceNotRevoked } from "./retail-ops-subscriptions"
import { getCustomerAccountAgeStatus } from "./store-conversation-age-authority"

type Scope = {
  actorUserId: string
  tenantId: string
  storeId: string
  deviceId: string
}

function refuse() {
  return new CatalogError(
    "INVALID_STOCK_OPERATION",
    "Keep this offline record for management recovery. Its current identity, access or device proof is unavailable.",
  )
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** No business graph or privileged facts are returned to the suspended author. */
function receipt(command: OfflineCommand) {
  return {
    clientCommandId: command.clientCommandId,
    status:
      command.status === "APPLIED"
        ? ("approved" as const)
        : command.status === "DISCARDED"
          ? ("rejected" as const)
          : ("held" as const),
  }
}

async function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string; metadata: Prisma.JsonValue | null }>
  >`
    SELECT "id", "metadata" FROM "Tenant" WHERE "id"=${tenantId} AND "isActive"=true AND "qaPurgeStartedAt" IS NULL FOR UPDATE
  `
  const [tenant] = rows
  if (rows.length !== 1 || !tenant) throw refuse()
  return tenant
}

async function membership(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
) {
  const [row] = await tx.$queryRaw<
    Array<{
      id: string
      role: string
      status: string
      staffAccessMode: string
      staffAccessRevision: number
      updatedAt: Date
    }>
  >`SELECT "id", "role", "status", "staffAccessMode", "staffAccessRevision", "updatedAt"
    FROM "Membership" WHERE "tenantId"=${tenantId} AND "userId"=${userId} FOR SHARE`
  if (!row) throw refuse()
  return row
}

async function ownedDevice(
  tx: Prisma.TransactionClient,
  input: Scope,
  tenantMetadata: Prisma.JsonValue | null,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.tenantId, input.deviceId])}, 0))`
  const [device] = await tx.$queryRaw<
    OfflineDevice[]
  >`SELECT * FROM "OfflineDevice" WHERE "tenantId"=${input.tenantId} AND "deviceId"=${input.deviceId} FOR UPDATE`
  // Read the tombstone AFTER acquiring the device lock: its statement snapshot
  // must not predate a wait on a concurrent revocation.
  const revocation = await tx.offlineDeviceRevocation.findFirst({
    where: {
      tenantId: input.tenantId,
      deviceId: input.deviceId.trim(),
      restoredAt: null,
    },
    select: { id: true },
  })
  assertRetailOpsOfflineDeviceNotRevoked({
    deviceId: input.deviceId,
    deviceStatus: device?.status ?? null,
    durableRevocation: Boolean(revocation),
    tenantMetadata,
  })
  if (
    !device ||
    device.status !== "ACTIVE" ||
    device.registeredByUserId !== input.actorUserId ||
    device.storeId !== input.storeId
  )
    throw refuse()
  return device
}

async function activeStore(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string },
) {
  const [store] = await tx.$queryRaw<
    Array<{ id: string; currencyCode: string }>
  >`SELECT "id", "currencyCode" FROM "Store" WHERE "tenantId"=${input.tenantId} AND "id"=${input.storeId} AND "status"='ACTIVE' FOR SHARE`
  if (!store) throw refuse()
  return store
}

function assertOriginal(
  command: OfflineCommand,
  envelope: OfflineCommandEnvelope,
  input: Omit<Scope, "deviceId">,
  offlineDeviceId: string,
) {
  const { actorUserId, ...payload } = withoutOfflineRecoveryRecord(
    command.payload as Record<string, unknown>,
  )
  if (
    command.tenantId !== input.tenantId ||
    command.storeId !== input.storeId ||
    command.offlineDeviceId !== offlineDeviceId ||
    actorUserId !== input.actorUserId ||
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
      "The original offline record cannot be changed or transferred during recovery.",
    )
}

/** Stage exact drafts only. No Order, payment, stock or customer command runs here. */
export async function recoverSuspendedOfflineCommands(
  db: PrismaClient,
  request: Scope & { sessionId: string; commands: OfflineCommandEnvelope[] },
) {
  const input = structuredClone(request)
  if (input.commands.length < 1 || input.commands.length > 250) throw refuse()
  const hashes = new Map<string, string>()
  for (const envelope of input.commands) {
    const digest = offlineCommandEnvelopeHash(envelope)
    const prior = hashes.get(envelope.clientCommandId)
    if (prior !== undefined && prior !== digest)
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "An offline identity cannot contain different saved records.",
      )
    hashes.set(envelope.clientCommandId, digest)
  }
  return db.$transaction(
    async (tx) => {
      const fence = await acquireOfflineCommandFences(tx, {
        tenantId: input.tenantId,
        clientCommandIds: input.commands.map(
          (command) => command.clientCommandId,
        ),
      })
      const tenant = await lockTenant(tx, input.tenantId)
      const author = await membership(tx, input.tenantId, input.actorUserId)
      if (
        !["ACTIVE", "SUSPENDED"].includes(author.status) ||
        !["CASHIER", "OPERATOR", "MANAGER"].includes(author.role) ||
        author.staffAccessMode !== "LEGACY"
      )
        throw refuse()
      // Do not trust a cached cookie/session or accept QA credentials for recovery.
      const session = await tx.session.findFirst({
        where: {
          id: input.sessionId,
          userId: input.actorUserId,
          expiresAt: { gt: new Date() },
          qaAuthorizationId: null,
          qaTenantId: null,
          qaMembershipId: null,
          qaStoreId: null,
          NOT: { token: { startsWith: "qas_" } },
        },
        select: { id: true },
      })
      if (
        !session ||
        (await isAccountPrivacyAccessBlocked(tx, input.actorUserId)) ||
        (await isLegalSignupSessionBlocked(tx, input.actorUserId)) ||
        !(await getCustomerAccountAgeStatus(tx, input.actorUserId)).eligible
      )
        throw refuse()
      await activeStore(tx, input)
      const device = await ownedDevice(tx, input, tenant.metadata)
      const results: Array<ReturnType<typeof receipt>> = []
      for (const envelope of input.commands) {
        assertOfflineCommandFence(tx, fence, {
          tenantId: input.tenantId,
          clientCommandId: envelope.clientCommandId,
        })
        // The tenant lock serializes creation with other recovery requests.
        await tx.$queryRaw`SELECT "id" FROM "OfflineCommand" WHERE "tenantId"=${input.tenantId} AND "clientCommandId"=${envelope.clientCommandId} FOR UPDATE`
        let command = await tx.offlineCommand.findUnique({
          where: {
            tenantId_clientCommandId: {
              tenantId: input.tenantId,
              clientCommandId: envelope.clientCommandId,
            },
          },
        })
        if (command) {
          assertOriginal(command, envelope, input, device.id)
          if (
            readOfflineQuickSaleCorrectionRecord(command.authoritativeState) &&
            command.status !== "DISCARDED"
          )
            throw refuse()
          const recovery = readOfflineRecoveryRecord(command.payload)
          if (
            recovery ||
            command.status === "APPLIED" ||
            command.status === "DISCARDED"
          ) {
            results.push(receipt(command))
            continue
          }
        }
        // Reactivation can reconcile held work, never admit a new recovery draft.
        if (author.status !== "SUSPENDED") throw refuse()
        const change = await tx.retailOpsStaffLifecycleEvent.findFirst({
          where: {
            tenantId: input.tenantId,
            membershipId: author.id,
            staffUserId: input.actorUserId,
            type: "SUSPENDED",
            toStatus: "SUSPENDED",
          },
          orderBy: { happenedAt: "desc" },
          select: { id: true, happenedAt: true },
        })
        if (!change || device.registeredAt > change.happenedAt) throw refuse()
        const recovery: OfflineRecoveryRecord = {
          kind: "suspended_staff",
          version: 1,
          membershipId: author.id,
          accessRevision: author.staffAccessRevision,
          accessChangedAt: change.happenedAt.toISOString(),
          lifecycleEventId: change.id,
          receivedAt: new Date().toISOString(),
        }
        const payload = json({
          ...envelope.payload,
          actorUserId: input.actorUserId,
          _offlineRecovery: recovery,
        })
        command = command
          ? await tx.offlineCommand.update({
              where: { id: command.id },
              data: {
                payload,
                status: "REVIEW_REQUIRED",
                conflictCode: null,
                conflictMessage:
                  "Suspended staff record awaiting Owner/Admin review.",
                processedAt: null,
                attemptedState: Prisma.JsonNull,
              },
            })
          : await tx.offlineCommand.create({
              data: {
                clientCommandId: envelope.clientCommandId,
                tenantId: input.tenantId,
                storeId: input.storeId,
                offlineDeviceId: device.id,
                createdAtClient: envelope.createdAtClient,
                dependencyClientIds: json(envelope.dependencyClientIds),
                eventVersion: envelope.eventVersion,
                payload,
                payloadHash: offlineCommandEnvelopeHash(envelope),
                type: "COMMERCIAL_ORDER",
                status: "REVIEW_REQUIRED",
                conflictMessage:
                  "Suspended staff record awaiting Owner/Admin review.",
              },
            })
        results.push(receipt(command))
      }
      return results
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

type Decision = {
  actorUserId: string
  tenantId: string
  commandId: string
  decision: "approve" | "reject"
  reason: string
  // Strictly parsed by admission, then compared to the immutable stored digest.
  envelope: OfflineCommandEnvelope
}

class RecoveryApplyConflict extends Error {
  constructor(
    readonly operationError: CatalogError | FinanceError,
    readonly commandUpdatedAt: Date,
  ) {
    super(operationError.message)
  }
}

async function prepareTerminalOrRejection(
  tx: Prisma.TransactionClient,
  input: Decision,
) {
  await lockTenant(tx, input.tenantId)
  const admin = await membership(tx, input.tenantId, input.actorUserId)
  if (admin.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(admin.role))
    throw refuse()
  await tx.$queryRaw`SELECT "id" FROM "OfflineCommand" WHERE "id"=${input.commandId} AND "tenantId"=${input.tenantId} FOR UPDATE`
  const command = await tx.offlineCommand.findFirst({
    where: { id: input.commandId, tenantId: input.tenantId },
  })
  if (!command || !readOfflineRecoveryRecord(command.payload)) throw refuse()
  if (
    input.decision !== "reject" &&
    command.status !== "APPLIED" &&
    command.status !== "DISCARDED"
  )
    throw refuse()
  const { actorUserId } = command.payload as Record<string, unknown>
  if (typeof actorUserId !== "string" || actorUserId === input.actorUserId)
    throw refuse()
  const scope = {
    actorUserId,
    tenantId: input.tenantId,
    storeId: command.storeId,
  }
  // Rejecting an immutable held draft has no business effects. Never require
  // restoring a revoked device, removed rep or inactive Store merely to close it.
  assertOriginal(command, input.envelope, scope, command.offlineDeviceId)
  return { command, scope }
}

async function prepareDecision(
  tx: Prisma.TransactionClient,
  input: Decision,
  fence: OfflineCommandFence,
) {
  const planned = await tx.offlineCommand.findFirst({
    include: {
      store: { select: { tenantId: true, currencyCode: true, status: true } },
      offlineDevice: { select: { deviceId: true } },
    },
    where: { id: input.commandId, tenantId: input.tenantId },
  })
  if (!planned) throw refuse()
  // Validate the caller-supplied fence against the real immutable identity
  // BEFORE Book/Tenant/Command locks, including rejection and terminal reads.
  assertOfflineCommandFence(tx, fence, {
    tenantId: input.tenantId,
    clientCommandId: planned.clientCommandId,
  })
  if (readOfflineQuickSaleCorrectionRecord(planned.authoritativeState))
    throw refuse()
  if (
    input.decision === "reject" ||
    planned.status === "APPLIED" ||
    planned.status === "DISCARDED"
  )
    return prepareTerminalOrRejection(tx, input)
  const recovery = readOfflineRecoveryRecord(planned.payload)
  const { actorUserId } = planned.payload as Record<string, unknown>
  if (!recovery || typeof actorUserId !== "string") throw refuse()
  // These joined values plan locks only; locked Store/device/command checks below
  // remain the authority. relationJoins keeps this in the command planning read.
  const storePlan = planned.store
  if (storePlan.tenantId !== input.tenantId || storePlan.status !== "ACTIVE")
    throw refuse()
  // Canonical Order creation locks Book before incrementing the Tenant sequence.
  // Pre-acquire that same context before staff/device/command locks, not after.
  const financialContext = await lockCommerceFinancialContext(tx, {
    tenantId: input.tenantId,
    currencyCode: storePlan.currencyCode,
  })
  const tenant = await lockTenant(tx, input.tenantId)
  if (!financialContext) {
    const appeared = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinanceBook" WHERE "tenantId"=${input.tenantId} AND "currencyCode"=${storePlan.currencyCode}
    `
    // Finance setup takes this Tenant lock. Recheck a previously absent Book
    // without acquiring a new Book lock after Tenant/Membership coordination.
    if (appeared.length) throw refuse()
  }
  const admin = await membership(tx, input.tenantId, input.actorUserId)
  if (
    admin.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(admin.role) ||
    input.actorUserId === actorUserId
  )
    throw refuse()
  const author = await membership(tx, input.tenantId, actorUserId)
  if (
    author.id !== recovery.membershipId ||
    !["ACTIVE", "SUSPENDED"].includes(author.status) ||
    !["CASHIER", "OPERATOR", "MANAGER"].includes(author.role) ||
    author.staffAccessMode !== "LEGACY"
  )
    throw refuse()
  const store = await activeStore(tx, {
    tenantId: input.tenantId,
    storeId: planned.storeId,
  })
  if (store.currencyCode !== storePlan.currencyCode) throw refuse()
  const scope = {
    actorUserId,
    tenantId: input.tenantId,
    storeId: planned.storeId,
    deviceId: planned.offlineDevice.deviceId,
  }
  const device = await ownedDevice(tx, scope, tenant.metadata)
  const [command] = await tx.$queryRaw<
    OfflineCommand[]
  >`SELECT * FROM "OfflineCommand" WHERE "id"=${input.commandId} AND "tenantId"=${input.tenantId} FOR UPDATE`
  if (!command) throw refuse()
  const lockedRecovery = readOfflineRecoveryRecord(command.payload)
  if (
    !lockedRecovery ||
    JSON.stringify(lockedRecovery) !== JSON.stringify(recovery)
  )
    throw refuse()
  assertOriginal(command, input.envelope, scope, device.id)
  const change = await tx.retailOpsStaffLifecycleEvent.findFirst({
    where: {
      id: lockedRecovery.lifecycleEventId,
      tenantId: input.tenantId,
      membershipId: author.id,
      staffUserId: actorUserId,
      type: "SUSPENDED",
      toStatus: "SUSPENDED",
      happenedAt: new Date(lockedRecovery.accessChangedAt),
    },
    select: { id: true },
  })
  if (!change) throw refuse()
  return { command, scope }
}

async function recordDecision(
  tx: Prisma.TransactionClient,
  input: Decision,
  command: OfflineCommand,
  outcome: "applied" | "rejected" | "conflict",
  operationError?: CatalogError | FinanceError,
) {
  await tx.offlineConflictReview.create({
    data: {
      commandId: command.id,
      decision: input.decision === "reject" ? "DISCARD" : "RETRY",
      reason: `[suspended_staff:${input.decision}:${outcome}] ${input.reason.trim()}`,
      reviewedByUserId: input.actorUserId,
      dependentClientIds: json([]),
    },
  })
  if (operationError)
    return tx.offlineCommand.update({
      where: { id: command.id },
      data: {
        status: "REVIEW_REQUIRED",
        conflictCode: offlineOperationConflictCode(operationError),
        conflictMessage: operationError.message,
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId,
      },
    })
  return command
}

/** Owner/Admin decision applies the exact draft once, without restoring staff. */
export async function decideSuspendedOfflineCommand(
  db: PrismaClient,
  request: Decision,
) {
  const input = structuredClone(request)
  if (!input.reason.trim() || input.reason.trim().length > 500) throw refuse()
  const transactionOptions = { maxWait: 10_000, timeout: 30_000 }
  try {
    return await db.$transaction(async (tx) => {
      const fence = await acquireOfflineCommandFences(tx, {
        tenantId: input.tenantId,
        clientCommandIds: [input.envelope.clientCommandId],
      })
      const { command, scope } = await prepareDecision(tx, input, fence)
      if (command.status === "APPLIED" || command.status === "DISCARDED")
        return receipt(command)
      if (command.status !== "REVIEW_REQUIRED") throw refuse()
      if (input.decision === "reject") {
        const rejected = await tx.offlineCommand.update({
          where: { id: command.id },
          data: {
            status: "DISCARDED",
            reviewedAt: new Date(),
            reviewedByUserId: input.actorUserId,
            processedAt: new Date(),
            attemptedState: Prisma.JsonNull,
          },
        })
        await recordDecision(tx, input, rejected, "rejected")
        return receipt(rejected)
      }
      const dependencies = input.envelope.dependencyClientIds.length
        ? await tx.offlineCommand.findMany({
            where: {
              tenantId: input.tenantId,
              clientCommandId: { in: input.envelope.dependencyClientIds },
            },
            select: { status: true },
          })
        : []
      if (
        input.envelope.eventVersion !== 1 ||
        dependencies.length !== input.envelope.dependencyClientIds.length ||
        dependencies.some((dependency) => dependency.status !== "APPLIED")
      )
        throw refuse()
      try {
        const creation = {
          // Ordinary offline execution includes kind in its canonical digest.
          ...input.envelope.payload,
          actorUserId: scope.actorUserId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          schemaVersion: 1,
          clientOrderId: command.clientCommandId,
        }
        const authorization = await authorizeRecoveryFulfillment(tx, {
          command,
          creation,
          reviewerUserId: input.actorUserId,
        })
        const result = await createCommercialOrderInTransaction(
          tx,
          creation,
          authorization,
        )
        const applied = await tx.offlineCommand.update({
          where: { id: command.id },
          data: {
            status: "APPLIED",
            result: json(result),
            conflictCode: null,
            conflictMessage: null,
            authoritativeState: Prisma.JsonNull,
            attemptedState: Prisma.JsonNull,
            reviewedAt: new Date(),
            reviewedByUserId: input.actorUserId,
            processedAt: new Date(),
          },
        })
        await recordDecision(tx, input, applied, "applied")
        return receipt(applied)
      } catch (error) {
        if (!(error instanceof CatalogError || error instanceof FinanceError))
          throw error
        throw new RecoveryApplyConflict(error, command.updatedAt)
      }
    }, transactionOptions)
  } catch (error) {
    if (!(error instanceof RecoveryApplyConflict)) throw error
    // Roll back all canonical effects before retaining an actionable conflict.
    return db.$transaction(async (tx) => {
      const fence = await acquireOfflineCommandFences(tx, {
        tenantId: input.tenantId,
        clientCommandIds: [input.envelope.clientCommandId],
      })
      const { command } = await prepareDecision(tx, input, fence)
      if (command.status === "APPLIED" || command.status === "DISCARDED")
        return receipt(command)
      if (
        command.status !== "REVIEW_REQUIRED" ||
        command.updatedAt.getTime() !== error.commandUpdatedAt.getTime()
      )
        throw refuse()
      const conflicted = await recordDecision(
        tx,
        input,
        command,
        "conflict",
        error.operationError,
      )
      return receipt(conflicted)
    }, transactionOptions)
  }
}
