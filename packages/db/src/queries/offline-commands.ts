import { createHash, randomUUID } from "node:crypto"
import { saleEligibleCatalogItem } from "./product-usage"

import {
  type OfflineCommand,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import {
  OfflineCommandStatus,
  OfflineCommandType,
  OfflineConflictCode,
  OfflineDeviceStatus,
  OfflineReviewDecision,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import {
  type CommercialOrderCustomLineInput,
  isCustomOrderLineInput,
} from "./catalog-free-lines"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { lockCommerceFinancialContext } from "./customer-ledger/commerce-locks"
import { FinanceError } from "./finance/rules"
import { acquireOfflineCommandFences } from "./offline-command-fence"
import { readOfflineQuickSaleCorrectionRecord } from "./offline-quick-sale-correction-record"
import {
  readOfflineRecoveryRecord,
  withoutOfflineRecoveryRecord,
} from "./offline-recovery-record"
import {
  OfflineStaffAccessError,
  assertOfflineStaffActor,
} from "./offline-staff-access"
import { assertRetailOpsOfflineDeviceCanSync } from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

type CommercialOrderPayload = {
  customerId?: string
  customerMode?: "contact_only" | "create"
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  deliveryDueAt?: Date | string
  discountMinor?: number
  fulfillNow?: boolean
  initialPayment?: {
    amountMinor: number
    clientPaymentId: string
    moneyAccountId?: string
    method: "bank_transfer" | "card" | "cash" | "other" | "pos"
    note?: string
    reference?: string
  }
  kind: "commercial_order"
  lines: Array<
    | {
        approvedQuotePriceMinor?: number
        enteredTotalMinor?: number
        expectedBalanceRevision?: number
        expectedConfigurationVersionId?: string
        expectedFixedPriceMinor?: number
        offeringId: string
        note?: string
        quantity: string
      }
    | CommercialOrderCustomLineInput
  >
  notes?: string
  serviceChargeMinor?: number
  taxMinor?: number
}

export type OfflineCommandPayload = CommercialOrderPayload
type StoredOfflineCommandPayload = CommercialOrderPayload & {
  actorUserId: string
}

type OfflineOperationError = CatalogError | FinanceError

export type OfflineCommandEnvelope = {
  clientCommandId: string
  createdAtClient: Date
  dependencyClientIds: string[]
  eventVersion: number
  payload: OfflineCommandPayload
}

export type ReplayOfflineCommandsInput = {
  acceptNewCommands: boolean
  actorUserId: string
  capabilities: {
    operateOrders: boolean
  }
  commands: OfflineCommandEnvelope[]
  deviceId: string
  requiresApproval: boolean
  storeId: string
  tenantId: string
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

/** Shared by ordinary replay and recovery; server annotations never enter it. */
export function offlineCommandEnvelopeHash(envelope: OfflineCommandEnvelope) {
  return hash(envelope)
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function storedCommandPayload(value: unknown) {
  const { actorUserId, ...payload } = withoutOfflineRecoveryRecord(
    value as Partial<StoredOfflineCommandPayload> & CommercialOrderPayload,
  )
  return {
    actorUserId,
    payload: payload as CommercialOrderPayload,
  }
}

function commandType(_payload: OfflineCommandPayload) {
  return OfflineCommandType.COMMERCIAL_ORDER
}

export function offlineOperationConflictCode(error: OfflineOperationError) {
  if (error instanceof FinanceError)
    return error.code === "FORBIDDEN"
      ? OfflineConflictCode.PERMISSION_CHANGED
      : OfflineConflictCode.INVALID_COMMAND
  if (error instanceof OfflineStaffAccessError)
    return OfflineConflictCode.PERMISSION_CHANGED
  if (error.code === "STALE_CONFIGURATION") {
    return OfflineConflictCode.STALE_CONFIGURATION
  }
  if (error.code === "OFFERING_UNAVAILABLE") {
    return OfflineConflictCode.OFFERING_OR_PRICE_CHANGED
  }
  if (error.code === "REVISION_CONFLICT") {
    return OfflineConflictCode.BALANCE_REVISION_CHANGED
  }
  if (error.code === "RESERVATION_NOT_FOUND") {
    return OfflineConflictCode.RESERVATION_CHANGED
  }
  if (error.code === "IDEMPOTENCY_MISMATCH") {
    return OfflineConflictCode.IDEMPOTENCY_MISMATCH
  }
  if (error.code === "INVALID_SERVICE_TRANSITION") {
    return OfflineConflictCode.SERVICE_TRANSITION_CHANGED
  }
  if (error.code === "INVALID_ASSIGNEE") {
    return OfflineConflictCode.SERVICE_ASSIGNMENT_CHANGED
  }
  if (error.code === "SERVICE_EVIDENCE_UNAVAILABLE") {
    return OfflineConflictCode.SERVICE_EVIDENCE_CHANGED
  }
  return OfflineConflictCode.INVALID_COMMAND
}

function hasCapability(
  _payload: OfflineCommandPayload,
  capabilities: ReplayOfflineCommandsInput["capabilities"],
) {
  return capabilities.operateOrders
}

async function authoritativeState(
  db: DbClient,
  input: {
    payload: OfflineCommandPayload
    storeId: string
    tenantId: string
  },
) {
  const offerings = await db.sellableOffering.findMany({
    include: {
      productUnitOffering: {
        include: { inventoryUnit: true },
      },
      storeAvailability: { where: { storeId: input.storeId } },
    },
    where: {
      id: {
        in: input.payload.lines.flatMap((line) =>
          isCustomOrderLineInput(line) ? [] : [line.offeringId],
        ),
      },
      catalogItem: saleEligibleCatalogItem,
      tenantId: input.tenantId,
    },
  })
  return {
    offerings: offerings.map((offering) => ({
      configurationVersionId:
        offering.productUnitOffering?.inventoryUnit.configurationVersionId ??
        null,
      fixedPriceMinor: offering.fixedPriceMinor,
      id: offering.id,
      isAvailable: offering.storeAvailability[0]?.isAvailable ?? false,
      status: offering.status,
    })),
  }
}

type OrdinaryScope = Pick<
  ReplayOfflineCommandsInput,
  "actorUserId" | "tenantId" | "storeId" | "deviceId"
>
type Attempt = { id: string; kind: "replay" | "approve" }
const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const

function refusal(message = "Offline review item not found.") {
  return new CatalogError("INVALID_STOCK_OPERATION", message)
}

function record(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {}
}

function attemptId(command: OfflineCommand) {
  const value = record(command.attemptedState)._offlineCommandAttempt
  const attempt = record(value ?? null)
  return attempt.version === 1 && typeof attempt.id === "string"
    ? attempt.id
    : null
}

function attemptedState(payload: OfflineCommandPayload, attempt: Attempt) {
  return json({ payload, _offlineCommandAttempt: { version: 1, ...attempt } })
}

async function lockIdentity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clientCommandId: string,
) {
  return acquireOfflineCommandFences(tx, {
    tenantId,
    clientCommandIds: [clientCommandId],
  })
}

async function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  const [tenant] = await tx.$queryRaw<
    Array<{ id: string; metadata: Prisma.JsonValue | null }>
  >`
    SELECT "id", "metadata" FROM "Tenant"
    WHERE "id"=${tenantId} AND "isActive"=true AND "qaPurgeStartedAt" IS NULL FOR UPDATE
  `
  if (!tenant)
    throw refusal("This business is unavailable for offline operations.")
  return {
    enabled: record(tenant.metadata).offlineOperationsEnabled !== false,
    approvalRequired: record(tenant.metadata).offlineApprovalRequired === true,
  }
}

async function lockCommand(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clientCommandId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "OfflineCommand"
    WHERE "tenantId"=${tenantId} AND "clientCommandId"=${clientCommandId} FOR UPDATE`
  return tx.offlineCommand.findUnique({
    where: { tenantId_clientCommandId: { tenantId, clientCommandId } },
  })
}

async function lockStore(
  tx: Prisma.TransactionClient,
  scope: Pick<OrdinaryScope, "tenantId" | "storeId">,
) {
  const [store] = await tx.$queryRaw<
    Array<{ id: string; currencyCode: string }>
  >`
    SELECT "id", "currencyCode" FROM "Store" WHERE "id"=${scope.storeId}
    AND "tenantId"=${scope.tenantId} AND "status"='ACTIVE' FOR SHARE
  `
  if (!store)
    throw refusal("The original Store is unavailable for offline operations.")
  return store
}

async function lockOwnedDevice(
  tx: Prisma.TransactionClient,
  scope: OrdinaryScope,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([scope.tenantId, scope.deviceId])}, 0))`
  await tx.$queryRaw`SELECT "id" FROM "OfflineDevice" WHERE "tenantId"=${scope.tenantId}
    AND "deviceId"=${scope.deviceId} FOR UPDATE`
  const device = await tx.offlineDevice.findFirst({
    where: {
      deviceId: scope.deviceId,
      registeredByUserId: scope.actorUserId,
      status: OfflineDeviceStatus.ACTIVE,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    },
  })
  if (!device) throw refusal("The offline device is not active for this Store.")
  await assertRetailOpsOfflineDeviceCanSync(tx, scope)
  return device
}

async function activeRole(
  tx: Prisma.TransactionClient,
  scope: Pick<OrdinaryScope, "actorUserId" | "tenantId">,
) {
  const [actor] = await tx.$queryRaw<Array<{ role: string; status: string }>>`
    SELECT "role", "status" FROM "Membership" WHERE "tenantId"=${scope.tenantId}
    AND "userId"=${scope.actorUserId} FOR SHARE
  `
  if (!actor || actor.status !== "ACTIVE")
    throw refusal("Current staff access is unavailable.")
  return actor.role
}

async function assertReviewer(
  tx: Prisma.TransactionClient,
  scope: Pick<OrdinaryScope, "actorUserId" | "tenantId">,
) {
  if (!["OWNER", "ADMIN", "MANAGER"].includes(await activeRole(tx, scope)))
    throw refusal("Only business management can review offline records.")
}

async function requiresCurrentApproval(
  tx: Prisma.TransactionClient,
  scope: OrdinaryScope,
  required: boolean,
) {
  return (
    required &&
    !["OWNER", "ADMIN", "MANAGER"].includes(await activeRole(tx, scope))
  )
}

async function financialPlan(
  tx: Prisma.TransactionClient,
  scope: Pick<OrdinaryScope, "tenantId" | "storeId">,
  payload: OfflineCommandPayload,
) {
  const store = await tx.store.findFirst({
    where: { id: scope.storeId, tenantId: scope.tenantId, status: "ACTIVE" },
    select: { currencyCode: true },
  })
  if (!store)
    throw refusal("The original Store is unavailable for offline operations.")
  const context = await lockCommerceFinancialContext(tx, {
    tenantId: scope.tenantId,
    currencyCode: store.currencyCode,
    customerId: payload.customerId,
  })
  return { currencyCode: store.currencyCode, hadBook: context !== null }
}

async function assertFinancialPlan(
  tx: Prisma.TransactionClient,
  tenantId: string,
  plan: Awaited<ReturnType<typeof financialPlan>>,
) {
  if (plan.hadBook) return
  // An absent row cannot be locked during planning. Recheck after Tenant FOR
  // UPDATE: its conflicting FK key-share blocks a later Book insertion. If an
  // insertion committed while we waited for Tenant, restart with that Book first.
  const books = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceBook" WHERE "tenantId"=${tenantId}
    AND "currencyCode"=${plan.currencyCode}
  `
  if (books.length)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Finance setup changed. Review and retry this saved sale.",
    )
}

function assertOrdinary(command: OfflineCommand) {
  if (readOfflineRecoveryRecord(command.payload))
    throw refusal(
      "Use management recovery to reconcile this held offline record.",
    )
  const retirement = readOfflineQuickSaleCorrectionRecord(
    command.authoritativeState,
  )
  if (retirement && command.status !== OfflineCommandStatus.DISCARDED)
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "This saved sale was replaced. Reconcile its corrected record.",
    )
  return retirement
}

function assertReplayOrigin(
  command: OfflineCommand,
  envelope: OfflineCommandEnvelope,
  scope: OrdinaryScope,
  deviceId: string,
) {
  if (command.payloadHash !== offlineCommandEnvelopeHash(envelope))
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "This offline command identity was already used with different input.",
    )
  if (
    command.tenantId !== scope.tenantId ||
    command.offlineDeviceId !== deviceId ||
    command.storeId !== scope.storeId ||
    storedCommandPayload(command.payload).actorUserId !== scope.actorUserId
  )
    throw refusal(
      "This offline record belongs to another account, device or Store. Keep the original record for management recovery.",
    )
  assertOrdinary(command)
  immutableEnvelope(command)
}

function terminal(command: OfflineCommand) {
  return (
    command.status === OfflineCommandStatus.APPLIED ||
    command.status === OfflineCommandStatus.DISCARDED
  )
}

async function dependents(
  tx: Prisma.TransactionClient,
  command: OfflineCommand,
) {
  const candidates = await tx.offlineCommand.findMany({
    select: { clientCommandId: true, dependencyClientIds: true },
    where: { tenantId: command.tenantId },
  })
  return candidates
    .filter(
      (candidate) =>
        Array.isArray(candidate.dependencyClientIds) &&
        candidate.dependencyClientIds.includes(command.clientCommandId),
    )
    .map((candidate) => candidate.clientCommandId)
}

async function dependencies(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ids: readonly string[],
) {
  const rows = ids.length
    ? await tx.offlineCommand.findMany({
        where: { tenantId, clientCommandId: { in: [...ids] } },
      })
    : []
  return {
    rows,
    accepted:
      rows.length === ids.length &&
      rows.every((row) => row.status === OfflineCommandStatus.APPLIED),
  }
}

function immutableEnvelope(command: OfflineCommand): OfflineCommandEnvelope {
  if (
    !Array.isArray(command.dependencyClientIds) ||
    !command.dependencyClientIds.every((id) => typeof id === "string")
  )
    throw refusal("The saved offline dependencies are invalid.")
  const envelope = {
    clientCommandId: command.clientCommandId,
    createdAtClient: new Date(command.createdAtClient),
    dependencyClientIds: command.dependencyClientIds as string[],
    eventVersion: command.eventVersion,
    payload: storedCommandPayload(command.payload).payload,
  }
  if (offlineCommandEnvelopeHash(envelope) !== command.payloadHash)
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "The saved offline command no longer matches its original envelope.",
    )
  return envelope
}

async function audit(
  tx: Prisma.TransactionClient,
  command: OfflineCommand,
  actorUserId: string,
  decision: "RETRY" | "DISCARD",
  reason?: string,
) {
  const dependentClientIds = await dependents(tx, command)
  await tx.offlineConflictReview.create({
    data: {
      commandId: command.id,
      decision,
      dependentClientIds: json(dependentClientIds),
      reason: reason?.trim() || null,
      reviewedByUserId: actorUserId,
    },
  })
  return dependentClientIds
}

function serializeCommand(command: {
  authoritativeState: Prisma.JsonValue | null
  clientCommandId: string
  conflictCode: OfflineConflictCode | null
  conflictMessage: string | null
  createdAtClient: Date
  dependencyClientIds: Prisma.JsonValue
  id: string
  payload: Prisma.JsonValue
  processedAt: Date | null
  result: Prisma.JsonValue | null
  status: OfflineCommandStatus
  type: OfflineCommandType
}) {
  return {
    authoritativeState: command.authoritativeState,
    clientCommandId: command.clientCommandId,
    conflictCode: command.conflictCode,
    conflictMessage: command.conflictMessage,
    createdAtClient: command.createdAtClient,
    dependencyClientIds: command.dependencyClientIds,
    id: command.id,
    payload: command.payload,
    processedAt: command.processedAt,
    result: command.result,
    status: command.status,
    type: command.type,
  }
}

export async function replayOfflineCommands(
  db: PrismaClient,
  supplied: ReplayOfflineCommandsInput,
) {
  // Capture every caller-owned Date, array and runtime payload field before awaiting.
  const input = structuredClone(supplied)
  const device = await db.offlineDevice.findFirst({
    where: {
      deviceId: input.deviceId,
      registeredByUserId: input.actorUserId,
      status: OfflineDeviceStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!device) throw refusal("The offline device is not active for this Store.")
  await assertRetailOpsOfflineDeviceCanSync(db, input)
  const results: Array<ReturnType<typeof serializeCommand>> = []
  for (const envelope of input.commands) {
    // Read-only fast refusal is not authority: every writer rereads under its fence.
    const existing = await db.offlineCommand.findUnique({
      where: {
        tenantId_clientCommandId: {
          tenantId: input.tenantId,
          clientCommandId: envelope.clientCommandId,
        },
      },
    })
    if (existing) assertReplayOrigin(existing, envelope, input, device.id)
    const attempt: Attempt = { id: randomUUID(), kind: "replay" }
    const staged = await db.$transaction(
      async (tx) => {
        await lockIdentity(tx, input.tenantId, envelope.clientCommandId)
        const policy = await lockTenant(tx, input.tenantId)
        await assertOfflineStaffActor(tx, input)
        await lockStore(tx, input)
        const owned = await lockOwnedDevice(tx, input)
        let command = await lockCommand(
          tx,
          input.tenantId,
          envelope.clientCommandId,
        )
        if (command) assertReplayOrigin(command, envelope, input, owned.id)
        const enabled = policy.enabled && input.acceptNewCommands
        if (!command && !enabled)
          throw refusal(
            "Offline operations are disabled. Existing records may still reconcile.",
          )
        const requiresApproval =
          input.requiresApproval ||
          (await requiresCurrentApproval(tx, input, policy.approvalRequired))
        if (!command)
          command = await tx.offlineCommand.create({
            data: {
              clientCommandId: envelope.clientCommandId,
              createdAtClient: envelope.createdAtClient,
              dependencyClientIds: json(envelope.dependencyClientIds),
              eventVersion: envelope.eventVersion,
              offlineDeviceId: owned.id,
              payload: json({
                ...envelope.payload,
                actorUserId: input.actorUserId,
              }),
              payloadHash: offlineCommandEnvelopeHash(envelope),
              storeId: input.storeId,
              tenantId: input.tenantId,
              type: commandType(envelope.payload),
              ...(requiresApproval
                ? {
                    status: OfflineCommandStatus.REVIEW_REQUIRED,
                    conflictMessage: "Awaiting management approval.",
                  }
                : {}),
            },
          })
        if (
          terminal(command) ||
          command.status !== OfflineCommandStatus.PENDING
        )
          return { command, execute: false }
        if (!enabled) {
          if (attemptId(command))
            command = await tx.offlineCommand.update({
              where: { id: command.id },
              data: { attemptedState: Prisma.JsonNull },
            })
          return { command, execute: false }
        }
        const pending = await dependencies(
          tx,
          input.tenantId,
          envelope.dependencyClientIds,
        )
        const conflict =
          envelope.eventVersion !== 1
            ? {
                conflictCode: OfflineConflictCode.UNSUPPORTED_CLIENT,
                conflictMessage: `Offline event version ${envelope.eventVersion} is unsupported.`,
                status: OfflineCommandStatus.REVIEW_REQUIRED,
              }
            : !pending.accepted
              ? {
                  conflictCode: OfflineConflictCode.DEPENDENCY_BLOCKED,
                  conflictMessage:
                    "One or more required offline commands have not been accepted.",
                  status: OfflineCommandStatus.BLOCKED,
                  authoritativeState: json({
                    dependencies: pending.rows.map((row) => ({
                      clientCommandId: row.clientCommandId,
                      status: row.status,
                    })),
                  }),
                }
              : !hasCapability(envelope.payload, input.capabilities)
                ? {
                    conflictCode: OfflineConflictCode.PERMISSION_CHANGED,
                    conflictMessage:
                      "Your current permissions no longer allow this offline action.",
                    status: OfflineCommandStatus.REVIEW_REQUIRED,
                  }
                : requiresApproval
                  ? {
                      conflictCode: null,
                      conflictMessage: "Awaiting management approval.",
                      status: OfflineCommandStatus.REVIEW_REQUIRED,
                    }
                  : null
        if (conflict) {
          command = await tx.offlineCommand.update({
            where: { id: command.id },
            data: {
              ...conflict,
              attemptedState: Prisma.JsonNull,
              processedAt: new Date(),
            },
          })
          return { command, execute: false }
        }
        command = await tx.offlineCommand.update({
          where: { id: command.id },
          data: { attemptedState: attemptedState(envelope.payload, attempt) },
        })
        return { command, execute: true }
      },
      { ...transactionOptions },
    )
    if (!staged.execute) {
      results.push(serializeCommand(staged.command))
      continue
    }
    try {
      const applied = await db.$transaction(
        async (tx) => {
          await lockIdentity(tx, input.tenantId, envelope.clientCommandId)
          const currency = await financialPlan(tx, input, envelope.payload)
          const policy = await lockTenant(tx, input.tenantId)
          await assertFinancialPlan(tx, input.tenantId, currency)
          await assertOfflineStaffActor(tx, input)
          const store = await lockStore(tx, input)
          if (store.currencyCode !== currency.currencyCode)
            throw refusal(
              "The original Store currency changed. Review this saved sale.",
            )
          const owned = await lockOwnedDevice(tx, input)
          const command = await lockCommand(
            tx,
            input.tenantId,
            envelope.clientCommandId,
          )
          if (!command) throw refusal()
          assertReplayOrigin(command, envelope, input, owned.id)
          if (
            terminal(command) ||
            command.status !== OfflineCommandStatus.PENDING ||
            attemptId(command) !== attempt.id
          )
            return command
          if (!policy.enabled || !input.acceptNewCommands)
            return tx.offlineCommand.update({
              where: { id: command.id },
              data: { attemptedState: Prisma.JsonNull },
            })
          if (
            input.requiresApproval ||
            (await requiresCurrentApproval(tx, input, policy.approvalRequired))
          )
            return tx.offlineCommand.update({
              where: { id: command.id },
              data: {
                status: OfflineCommandStatus.REVIEW_REQUIRED,
                conflictCode: null,
                conflictMessage: "Awaiting management approval.",
                attemptedState: Prisma.JsonNull,
                processedAt: null,
              },
            })
          const pending = await dependencies(
            tx,
            input.tenantId,
            envelope.dependencyClientIds,
          )
          if (
            envelope.eventVersion !== 1 ||
            !pending.accepted ||
            !hasCapability(envelope.payload, input.capabilities)
          )
            throw refusal(
              "Review this saved sale and its dependencies before retrying.",
            )
          const result = await createCommercialOrderInTransaction(tx, {
            ...storedCommandPayload(command.payload).payload,
            actorUserId: input.actorUserId,
            tenantId: input.tenantId,
            storeId: input.storeId,
            clientOrderId: command.clientCommandId,
            schemaVersion: 1,
          })
          return tx.offlineCommand.update({
            where: { id: command.id },
            data: {
              authoritativeState: Prisma.JsonNull,
              attemptedState: Prisma.JsonNull,
              conflictCode: null,
              conflictMessage: null,
              processedAt: new Date(),
              result: json(result),
              status: OfflineCommandStatus.APPLIED,
            },
          })
        },
        { ...transactionOptions },
      )
      results.push(serializeCommand(applied))
    } catch (error) {
      if (!(error instanceof CatalogError || error instanceof FinanceError))
        throw error
      const failed = await db.$transaction(
        async (tx) => {
          await lockIdentity(tx, input.tenantId, envelope.clientCommandId)
          await lockTenant(tx, input.tenantId)
          const command = await lockCommand(
            tx,
            input.tenantId,
            envelope.clientCommandId,
          )
          if (!command) throw refusal()
          assertReplayOrigin(command, envelope, input, device.id)
          if (
            terminal(command) ||
            command.status !== OfflineCommandStatus.PENDING ||
            attemptId(command) !== attempt.id
          )
            return command
          const state = await authoritativeState(tx, {
            payload: envelope.payload,
            storeId: input.storeId,
            tenantId: input.tenantId,
          })
          return tx.offlineCommand.update({
            where: { id: command.id },
            data: {
              attemptedState: json(envelope.payload),
              authoritativeState: json(state),
              conflictCode: offlineOperationConflictCode(error),
              conflictMessage: error.message,
              processedAt: new Date(),
              status: OfflineCommandStatus.REVIEW_REQUIRED,
            },
          })
        },
        { ...transactionOptions },
      )
      results.push(serializeCommand(failed))
    }
  }
  return results
}

export async function listOfflineConflictReviews(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const commands = await db.offlineCommand.findMany({
    orderBy: { createdAtClient: "asc" },
    where: {
      status: {
        in: [
          OfflineCommandStatus.BLOCKED,
          OfflineCommandStatus.REVIEW_REQUIRED,
        ],
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const all = await db.offlineCommand.findMany({
    select: { clientCommandId: true, dependencyClientIds: true, status: true },
    where: { tenantId: input.tenantId },
  })
  const actorUserIds = commands.flatMap((command) => {
    const payload =
      command.payload as unknown as Partial<StoredOfflineCommandPayload>
    return payload.actorUserId ? [payload.actorUserId] : []
  })
  const actors = await db.user.findMany({
    select: { displayName: true, email: true, id: true, name: true },
    where: { id: { in: actorUserIds } },
  })
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]))
  const recoveryCommands = commands.filter((command) =>
    Boolean(readOfflineRecoveryRecord(command.payload)),
  )
  const recoveryDevices = recoveryCommands.length
    ? await db.offlineDevice.findMany({
        where: {
          tenantId: input.tenantId,
          id: {
            in: recoveryCommands.map((command) => command.offlineDeviceId),
          },
        },
        select: {
          id: true,
          deviceId: true,
          deviceName: true,
          platform: true,
          registeredAt: true,
        },
      })
    : []
  const recoveryStores = recoveryCommands.length
    ? await db.store.findMany({
        where: {
          tenantId: input.tenantId,
          id: { in: recoveryCommands.map((command) => command.storeId) },
        },
        select: { id: true, name: true, currencyCode: true, status: true },
      })
    : []
  const devicesById = new Map(
    recoveryDevices.map((device) => [device.id, device]),
  )
  const storesById = new Map(recoveryStores.map((store) => [store.id, store]))
  const recoveryAccountScopes = recoveryCommands.flatMap((command) => {
    const store = storesById.get(command.storeId)
    const moneyAccountId = storedCommandPayload(command.payload).payload
      .initialPayment?.moneyAccountId
    return store && typeof moneyAccountId === "string" && moneyAccountId
      ? [
          {
            id: moneyAccountId,
            book: {
              tenantId: input.tenantId,
              currencyCode: store.currencyCode,
            },
          },
        ]
      : []
  })
  const recoveryAccounts = recoveryAccountScopes.length
    ? await db.financeAccount.findMany({
        where: { OR: recoveryAccountScopes },
        select: {
          id: true,
          name: true,
          book: { select: { currencyCode: true } },
        },
      })
    : []
  const accountsByCurrencyAndId = new Map(
    recoveryAccounts.map((account) => [
      JSON.stringify([account.book.currencyCode, account.id]),
      { id: account.id, name: account.name },
    ]),
  )
  return commands.map((command) => {
    const recovery = readOfflineRecoveryRecord(command.payload)
    const recoveryDependencies =
      Array.isArray(command.dependencyClientIds) &&
      command.dependencyClientIds.every((entry) => typeof entry === "string")
        ? command.dependencyClientIds
        : null
    return {
      ...serializeCommand(command),
      actor:
        actorsById.get(
          (command.payload as unknown as Partial<StoredOfflineCommandPayload>)
            .actorUserId ?? "",
        ) ?? null,
      recovery,
      recoveryOrigin: recovery
        ? {
            store: storesById.get(command.storeId) ?? null,
            device: devicesById.get(command.offlineDeviceId) ?? null,
            moneyAccount:
              accountsByCurrencyAndId.get(
                JSON.stringify([
                  storesById.get(command.storeId)?.currencyCode,
                  storedCommandPayload(command.payload).payload.initialPayment
                    ?.moneyAccountId,
                ]),
              ) ?? null,
          }
        : null,
      recoveryEnvelope:
        recovery && recoveryDependencies
          ? {
              clientCommandId: command.clientCommandId,
              createdAtClient: command.createdAtClient,
              dependencyClientIds: recoveryDependencies,
              eventVersion: command.eventVersion,
              payload: storedCommandPayload(command.payload).payload,
            }
          : null,
      dependentCommands: all
        .filter((candidate) =>
          Array.isArray(candidate.dependencyClientIds)
            ? candidate.dependencyClientIds.includes(command.clientCommandId)
            : false,
        )
        .map((candidate) => ({
          clientCommandId: candidate.clientCommandId,
          status: candidate.status,
        })),
      reviewKind: recovery
        ? ("suspended_recovery" as const)
        : command.status === OfflineCommandStatus.REVIEW_REQUIRED &&
            command.conflictCode === null
          ? ("approval" as const)
          : ("conflict" as const),
      safeActions: recovery
        ? (["approve", "reject"] as const)
        : command.status === OfflineCommandStatus.REVIEW_REQUIRED &&
            command.conflictCode === null
          ? (["approve", "reject"] as const)
          : (["retry", "discard"] as const),
    }
  })
}

export async function reviewOfflineConflict(
  db: PrismaClient,
  supplied: {
    actorUserId: string
    commandId: string
    decision: "approve" | "discard" | "reject" | "retry"
    reason?: string
    tenantId: string
  },
) {
  const input = structuredClone(supplied)
  // This read plans the immutable key/origin only. It grants no write authority.
  const found = await db.offlineCommand.findFirst({
    where: { id: input.commandId, tenantId: input.tenantId },
    include: { offlineDevice: { select: { deviceId: true } } },
  })
  if (!found) throw refusal()
  const plan = structuredClone(found)
  assertOrdinary(plan)
  const envelope = immutableEnvelope(plan)
  const authorUserId = storedCommandPayload(plan.payload).actorUserId
  if (!authorUserId)
    throw refusal("The staff member for this offline record is unavailable.")
  const scope: OrdinaryScope = {
    actorUserId: authorUserId,
    tenantId: input.tenantId,
    storeId: plan.storeId,
    deviceId: plan.offlineDevice.deviceId,
  }
  const attempt: Attempt = { id: randomUUID(), kind: "approve" }
  const assertSnapshot = (command: OfflineCommand) => {
    assertOrdinary(command)
    if (
      command.id !== plan.id ||
      command.tenantId !== input.tenantId ||
      command.clientCommandId !== plan.clientCommandId ||
      command.offlineDeviceId !== plan.offlineDeviceId ||
      command.storeId !== plan.storeId ||
      command.payloadHash !== plan.payloadHash ||
      stableJson(command.payload) !== stableJson(plan.payload)
    )
      throw refusal("The saved offline record changed. Review it again.")
    immutableEnvelope(command)
  }
  const staged = await db.$transaction(
    async (tx) => {
      await lockIdentity(tx, input.tenantId, plan.clientCommandId)
      await lockTenant(tx, input.tenantId)
      await assertReviewer(tx, input)
      const command = await lockCommand(
        tx,
        input.tenantId,
        plan.clientCommandId,
      )
      if (!command) throw refusal()
      assertSnapshot(command)
      if (terminal(command))
        return {
          command,
          dependentClientIds: await dependents(tx, command),
          execute: false,
        }
      const approvalDecision =
        input.decision === "approve" || input.decision === "reject"
      if (
        approvalDecision
          ? command.status !== OfflineCommandStatus.REVIEW_REQUIRED ||
            command.conflictCode !== null
          : ![
              OfflineCommandStatus.BLOCKED,
              OfflineCommandStatus.REVIEW_REQUIRED,
            ].some((status) => status === command.status) ||
            command.conflictCode === null
      )
        throw refusal()
      if (input.decision === "approve") {
        const reserved = await tx.offlineCommand.update({
          where: { id: command.id },
          data: { attemptedState: attemptedState(envelope.payload, attempt) },
        })
        return {
          command: reserved,
          dependentClientIds: [] as string[],
          execute: true,
        }
      }
      const dependentClientIds = await audit(
        tx,
        command,
        input.actorUserId,
        input.decision === "retry" ? "RETRY" : "DISCARD",
        input.reason,
      )
      const updated = await tx.offlineCommand.update({
        where: { id: command.id },
        data: {
          attemptedState: Prisma.JsonNull,
          reviewedAt: new Date(),
          reviewedByUserId: input.actorUserId,
          status:
            input.decision === "retry"
              ? OfflineCommandStatus.PENDING
              : OfflineCommandStatus.DISCARDED,
        },
      })
      return { command: updated, dependentClientIds, execute: false }
    },
    { ...transactionOptions },
  )
  if (!staged.execute)
    return {
      ...serializeCommand(staged.command),
      dependentClientIds: staged.dependentClientIds,
    }
  try {
    return await db.$transaction(
      async (tx) => {
        await lockIdentity(tx, input.tenantId, plan.clientCommandId)
        const currency = await financialPlan(tx, scope, envelope.payload)
        const policy = await lockTenant(tx, input.tenantId)
        await assertFinancialPlan(tx, input.tenantId, currency)
        await assertReviewer(tx, input)
        await assertOfflineStaffActor(tx, scope)
        const store = await lockStore(tx, scope)
        if (store.currencyCode !== currency.currencyCode)
          throw refusal(
            "The original Store currency changed. Review this saved sale.",
          )
        const device = await lockOwnedDevice(tx, scope)
        const command = await lockCommand(
          tx,
          input.tenantId,
          plan.clientCommandId,
        )
        if (!command) throw refusal()
        assertSnapshot(command)
        assertReplayOrigin(command, envelope, scope, device.id)
        if (
          terminal(command) ||
          command.status !== OfflineCommandStatus.REVIEW_REQUIRED ||
          command.conflictCode !== null ||
          attemptId(command) !== attempt.id
        )
          return {
            ...serializeCommand(command),
            dependentClientIds: await dependents(tx, command),
          }
        if (!policy.enabled)
          throw refusal(
            "Offline operations have been disabled by the business owner.",
          )
        const pending = await dependencies(
          tx,
          input.tenantId,
          envelope.dependencyClientIds,
        )
        if (envelope.eventVersion !== 1 || !pending.accepted)
          throw refusal(
            "Review this saved sale and its dependencies before approval.",
          )
        const result = await createCommercialOrderInTransaction(tx, {
          ...envelope.payload,
          actorUserId: authorUserId,
          tenantId: input.tenantId,
          storeId: command.storeId,
          clientOrderId: command.clientCommandId,
          schemaVersion: 1,
        })
        const dependentClientIds = await audit(
          tx,
          command,
          input.actorUserId,
          "RETRY",
          input.reason,
        )
        const applied = await tx.offlineCommand.update({
          where: { id: command.id },
          data: {
            authoritativeState: Prisma.JsonNull,
            attemptedState: Prisma.JsonNull,
            conflictCode: null,
            conflictMessage: null,
            processedAt: new Date(),
            result: json(result),
            reviewedAt: new Date(),
            reviewedByUserId: input.actorUserId,
            status: OfflineCommandStatus.APPLIED,
          },
        })
        return { ...serializeCommand(applied), dependentClientIds }
      },
      { ...transactionOptions },
    )
  } catch (error) {
    if (!(error instanceof CatalogError || error instanceof FinanceError))
      throw error
    return db.$transaction(
      async (tx) => {
        await lockIdentity(tx, input.tenantId, plan.clientCommandId)
        await lockTenant(tx, input.tenantId)
        await assertReviewer(tx, input)
        const command = await lockCommand(
          tx,
          input.tenantId,
          plan.clientCommandId,
        )
        if (!command) throw refusal()
        assertSnapshot(command)
        if (
          terminal(command) ||
          command.status !== OfflineCommandStatus.REVIEW_REQUIRED ||
          command.conflictCode !== null ||
          attemptId(command) !== attempt.id
        )
          return {
            ...serializeCommand(command),
            dependentClientIds: await dependents(tx, command),
          }
        const state = await authoritativeState(tx, {
          payload: envelope.payload,
          storeId: command.storeId,
          tenantId: command.tenantId,
        })
        const dependentClientIds = await audit(
          tx,
          command,
          input.actorUserId,
          "RETRY",
          input.reason,
        )
        const conflicted = await tx.offlineCommand.update({
          where: { id: command.id },
          data: {
            attemptedState: json(envelope.payload),
            authoritativeState: json(state),
            conflictCode: offlineOperationConflictCode(error),
            conflictMessage: error.message,
            processedAt: new Date(),
            reviewedAt: new Date(),
            reviewedByUserId: input.actorUserId,
            status: OfflineCommandStatus.REVIEW_REQUIRED,
          },
        })
        return { ...serializeCommand(conflicted), dependentClientIds }
      },
      { ...transactionOptions },
    )
  }
}
