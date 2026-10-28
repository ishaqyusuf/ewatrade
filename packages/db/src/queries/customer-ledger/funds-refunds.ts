import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { assertFinanceManager } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import {
  FinanceError,
  assertFinancePostingDate,
  financeAmount,
} from "../finance/rules"
import { runInOwnTransaction } from "../own-transaction"
import { customerLedgerDocumentCommand } from "./commands"
import {
  decryptCustomerRefundDestination,
  encryptCustomerRefundDestination,
} from "./funds-destination"
import { assertCustomerFundsNotReserved } from "./funds-reservations"
import { refundCustomerLedgerCreditInTransaction } from "./refunds"
import { assertExactHeldCreditSource } from "./reversal-sources"

export type CustomerFundsRefundCommand = {
  tenantId: string
  actorUserId: string
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
}
export type RequestCustomerFundsRefundInput = CustomerFundsRefundCommand & {
  creditEntryId: string
  amountMinor: string
  destinationCiphertext: string
  destinationFingerprint: string
  reason: string
}
export type ChangeCustomerFundsRefundInput = CustomerFundsRefundCommand & {
  requestId: string
  expectedVersion: number
}
export type CustomerFundsRefundNeedDetailsInput =
  ChangeCustomerFundsRefundInput & { note: string }
export type ReserveCustomerFundsRefundInput = ChangeCustomerFundsRefundInput & {
  expectedDestinationFingerprint: string
  identityReviewAttested: true
}
export type CompleteCustomerFundsRefundInput =
  ChangeCustomerFundsRefundInput & {
    moneyAccountId: string
    outgoingReference: string
    effectiveAt: Date
  }

function assertRevision(input: CustomerFundsRefundCommand, current: bigint) {
  if (
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    current.toString() !== input.expectedRevision
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer funds changed. Review this refund again.",
    )
}
async function reviewSource(
  tx: Prisma.TransactionClient,
  input: {
    accountId: string
    creditEntryId: string
    bookId: string
    amountMinor: string
  },
) {
  const amount = financeAmount(input.amountMinor)
  const [credit, advance] = await Promise.all([
    tx.customerLedgerEntry.findFirst({
      where: {
        id: input.creditEntryId,
        accountId: input.accountId,
        side: "CREDIT",
        kind: { in: ["RECEIPT", "OPENING_CREDIT"] },
        reversals: { none: {} },
      },
    }),
    tx.financeAccount.findFirst({
      where: {
        bookId: input.bookId,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
      select: { id: true },
    }),
  ])
  if (
    !credit ||
    !advance ||
    !(await assertExactHeldCreditSource(tx, input, credit, advance.id))
  )
    throw new FinanceError(
      "CONFLICT",
      "The refund source does not reconcile to held customer funds.",
    )
  const [allocated, released] = await Promise.all([
    tx.customerLedgerAllocation.aggregate({
      where: { accountId: input.accountId, creditEntryId: credit.id },
      _sum: { amountMinor: true },
    }),
    tx.customerLedgerAllocationRelease.aggregate({
      where: {
        allocation: { accountId: input.accountId, creditEntryId: credit.id },
      },
      _sum: { amountMinor: true },
    }),
  ])
  const used =
    (allocated._sum.amountMinor ?? 0n) - (released._sum.amountMinor ?? 0n)
  if (used < 0n || used > credit.amountMinor)
    throw new FinanceError(
      "CONFLICT",
      "Reconcile this source before reserving a refund.",
    )
  await assertCustomerFundsNotReserved(
    tx,
    input,
    credit.amountMinor - used,
    amount,
  )
}
function publicResult(row: {
  id: string
  version: number
  status: string
  amountMinor: bigint
  creditEntryId: string
  createdAt: Date
  approvedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  outgoingReference: string | null
  refundEntryId: string | null
}) {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    amountMinor: row.amountMinor.toString(),
    creditEntryId: row.creditEntryId,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    outgoingReference: row.outgoingReference,
    refundEntryId: row.refundEntryId,
  }
}

export function requestCustomerFundsRefund(
  db: PrismaClient,
  input: RequestCustomerFundsRefundInput,
) {
  return runInOwnTransaction(db, (tx) =>
    requestCustomerFundsRefundInTransaction(tx, input),
  )
}
/** Trusted server composition only: ciphertext must come from funds-destination's source-bound AEAD. */
export async function requestCustomerFundsRefundInTransaction(
  tx: Prisma.TransactionClient,
  input: RequestCustomerFundsRefundInput,
) {
  const amount = financeAmount(input.amountMinor)
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(
      input.destinationCiphertext,
    ) ||
    input.destinationCiphertext.length > 2048 ||
    !/^[a-f0-9]{64}$/.test(input.destinationFingerprint)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the encrypted refund destination and reason first.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  // Random AEAD nonces must not break retries of the same reviewed destination.
  const { destinationCiphertext: _ciphertext, ...stablePayload } = payload
  const result = await customerLedgerDocumentCommand(
    tx,
    input,
    "FUNDS_REFUND_REQUEST",
    { ...stablePayload, reason },
    async (_book, account) => {
      assertRevision(input, account.revision)
      await reviewSource(tx, input)
      const row = await tx.customerFundsRefundRequest.create({
        data: {
          tenantId: input.tenantId,
          accountId: input.accountId,
          bookId: input.bookId,
          creditEntryId: input.creditEntryId,
          amountMinor: amount,
          destinationCiphertext: input.destinationCiphertext,
          destinationFingerprint: input.destinationFingerprint,
          requestedByUserId: input.actorUserId,
          reason,
        },
      })
      await tx.customerLedgerAccount.update({
        where: { id: account.id },
        data: { revision: { increment: 1 } },
      })
      return { id: row.id }
    },
  )
  const row = await tx.customerFundsRefundRequest.findFirstOrThrow({
    where: {
      id: result.id,
      tenantId: input.tenantId,
      accountId: input.accountId,
      bookId: input.bookId,
    },
  })
  return publicResult(row)
}

async function change(
  tx: Prisma.TransactionClient,
  input:
    | ChangeCustomerFundsRefundInput
    | CompleteCustomerFundsRefundInput
    | ReserveCustomerFundsRefundInput
    | CustomerFundsRefundNeedDetailsInput,
  action: "RESERVE" | "CANCEL" | "COMPLETE" | "NEED_DETAILS",
  destinationEncryptionKey?: string,
) {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A current refund review is required.",
    )
  if (
    action === "COMPLETE" &&
    (!("outgoingReference" in input) ||
      !input.outgoingReference.trim() ||
      input.outgoingReference.trim().length > 160 ||
      !Number.isFinite(input.effectiveAt.getTime()))
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Record the actual outgoing transfer reference and date.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const result = await customerLedgerDocumentCommand(
    tx,
    input,
    `FUNDS_REFUND_${action}`,
    payload,
    async (book, account) => {
      assertRevision(input, account.revision)
      const row = await tx.customerFundsRefundRequest.findFirst({
        where: {
          id: input.requestId,
          tenantId: input.tenantId,
          accountId: input.accountId,
          bookId: input.bookId,
        },
      })
      if (
        !row ||
        row.version !== input.expectedVersion ||
        row.status === "COMPLETED" ||
        row.status === "CANCELLED"
      )
        throw new FinanceError(
          "CONFLICT",
          "This refund has changed or is already finished. Review it again.",
        )
      const now = new Date()
      if (action === "NEED_DETAILS") {
        if (
          row.status !== "REQUESTED" ||
          !("note" in input) ||
          !input.note.trim() ||
          input.note.trim().length > 400
        )
          throw new FinanceError(
            "INVALID_JOURNAL",
            "Explain what details are needed on this requested refund.",
          )
        await tx.customerFundsRefundRequest.update({
          where: { id: row.id },
          data: { version: { increment: 1 } },
        })
      } else if (action === "RESERVE") {
        if (
          !("identityReviewAttested" in input) ||
          input.identityReviewAttested !== true ||
          input.expectedDestinationFingerprint !== row.destinationFingerprint
        )
          throw new FinanceError(
            "CONFLICT",
            "Review the customer's identity and exact refund destination before reserving funds.",
          )
        if (row.status !== "REQUESTED")
          throw new FinanceError("CONFLICT", "This refund is already reserved.")
        // Trusted server key stays outside public input, command hashes and audit.
        // Recheck the current exact source-bound destination while Book/account
        // locks are held; a prior fingerprint/read is not write authority.
        const key =
          destinationEncryptionKey ??
          process.env.CUSTOMER_FUNDS_DESTINATION_KEY ??
          ""
        const destination = decryptCustomerRefundDestination(
          row.destinationCiphertext,
          row,
          key,
        )
        if (
          encryptCustomerRefundDestination(destination, row, key)
            .destinationFingerprint !== row.destinationFingerprint
        )
          throw new FinanceError(
            "CONFLICT",
            "The saved refund destination changed. Review the exact destination again.",
          )
        assertFinancePostingDate({
          effectiveAt: now,
          startsAt: book.startsAt,
          closedThrough: book.closedThrough,
          now,
        })
        await reviewSource(tx, {
          ...input,
          creditEntryId: row.creditEntryId,
          amountMinor: row.amountMinor.toString(),
        })
        await tx.customerFundsRefundRequest.update({
          where: { id: row.id },
          data: {
            status: "RESERVED",
            version: { increment: 1 },
            approvedByUserId: input.actorUserId,
            approvedAt: now,
          },
        })
      } else if (action === "CANCEL") {
        await tx.customerFundsRefundRequest.update({
          where: { id: row.id },
          data: {
            status: "CANCELLED",
            version: { increment: 1 },
            cancelledAt: now,
          },
        })
      } else {
        if (row.status !== "RESERVED" || !("outgoingReference" in input))
          throw new FinanceError(
            "CONFLICT",
            "Approve and reserve this refund before recording its return.",
          )
        if (!row.approvedAt || input.effectiveAt < row.approvedAt)
          throw new FinanceError(
            "CONFLICT",
            "The outgoing return cannot predate its approval.",
          )
        // Release only this source's reservation inside the same locked transaction.
        // Canonical refund checks subtract all other reservations; a child failure
        // rolls back this state change together with every accounting effect.
        await tx.customerFundsRefundRequest.update({
          where: { id: row.id },
          data: { status: "COMPLETED" },
        })
        const refund = await refundCustomerLedgerCreditInTransaction(tx, {
          ...input,
          clientCommandId: financePostingCommandId(
            input.clientCommandId,
            "completed-funds-refund",
          ),
          creditEntryId: row.creditEntryId,
          amountMinor: row.amountMinor.toString(),
          method: "BANK_TRANSFER",
          reference: input.outgoingReference.trim(),
          reason: row.reason,
        })
        await tx.customerFundsRefundRequest.update({
          where: { id: row.id },
          data: {
            version: { increment: 1 },
            completedByUserId: input.actorUserId,
            completedAt: now,
            outgoingReference: input.outgoingReference.trim(),
            refundEntryId: refund.id,
          },
        })
      }
      await tx.customerLedgerAccount.update({
        where: { id: account.id },
        data: { revision: { increment: 1 } },
      })
      return {
        id: row.id,
        audit: {
          action,
          creditEntryId: row.creditEntryId,
          amountMinor: row.amountMinor.toString(),
          destinationFingerprint: row.destinationFingerprint,
          identityReviewAttested: action === "RESERVE",
          reviewNote:
            action === "NEED_DETAILS" && "note" in input
              ? input.note.trim()
              : null,
          requestVersion: row.version + 1,
        },
      }
    },
  )
  return publicResult(
    await tx.customerFundsRefundRequest.findFirstOrThrow({
      where: {
        id: result.id,
        tenantId: input.tenantId,
        accountId: input.accountId,
        bookId: input.bookId,
      },
    }),
  )
}
export const reserveCustomerFundsRefundInTransaction = (
  tx: Prisma.TransactionClient,
  input: ReserveCustomerFundsRefundInput,
  destinationEncryptionKey?: string,
) => change(tx, input, "RESERVE", destinationEncryptionKey)
export const cancelCustomerFundsRefundInTransaction = (
  tx: Prisma.TransactionClient,
  input: ChangeCustomerFundsRefundInput,
) => change(tx, input, "CANCEL")
export const completeCustomerFundsRefundInTransaction = (
  tx: Prisma.TransactionClient,
  input: CompleteCustomerFundsRefundInput,
) => change(tx, input, "COMPLETE")
export const reserveCustomerFundsRefund = (
  db: PrismaClient,
  input: ReserveCustomerFundsRefundInput,
  destinationEncryptionKey?: string,
) =>
  runInOwnTransaction(db, (tx) =>
    reserveCustomerFundsRefundInTransaction(
      tx,
      input,
      destinationEncryptionKey,
    ),
  )
export const cancelCustomerFundsRefund = (
  db: PrismaClient,
  input: ChangeCustomerFundsRefundInput,
) =>
  runInOwnTransaction(db, (tx) =>
    cancelCustomerFundsRefundInTransaction(tx, input),
  )
export const completeCustomerFundsRefund = (
  db: PrismaClient,
  input: CompleteCustomerFundsRefundInput,
) =>
  runInOwnTransaction(db, (tx) =>
    completeCustomerFundsRefundInTransaction(tx, input),
  )

export const requestCustomerFundsRefundDetailsInTransaction = (
  tx: Prisma.TransactionClient,
  input: CustomerFundsRefundNeedDetailsInput,
) => change(tx, input, "NEED_DETAILS")
export const requestCustomerFundsRefundDetails = (
  db: PrismaClient,
  input: CustomerFundsRefundNeedDetailsInput,
) =>
  runInOwnTransaction(db, (tx) =>
    requestCustomerFundsRefundDetailsInTransaction(tx, input),
  )

async function refundLifecycle(
  tx: Prisma.TransactionClient,
  rows: Array<{
    id: string
    tenantId: string
    accountId: string
    status: string
    requestedByUserId: string
    approvedByUserId: string | null
    completedByUserId: string | null
  }>,
) {
  const ids = rows.map((row) => row.id)
  const accountIds = [...new Set(rows.map((row) => row.accountId))]
  const latest = ids.length
    ? await tx.$queryRaw<
        Array<{
          requestId: string
          kind: string
          actorUserId: string
          createdAt: Date
          audit: Prisma.JsonValue
        }>
      >`
    SELECT DISTINCT ON (command.result->>'id') command.result->>'id' AS "requestId", command.kind, command."actorUserId", command."createdAt", command.result->'audit' AS audit
    FROM "CustomerLedgerCommand" command
    WHERE command."tenantId" = ${rows[0]?.tenantId ?? ""}
      AND command."accountId" = ANY(${accountIds}::text[])
      AND command.kind IN ('FUNDS_REFUND_RESERVE','FUNDS_REFUND_CANCEL','FUNDS_REFUND_COMPLETE','FUNDS_REFUND_NEED_DETAILS')
      AND command.result->>'id' = ANY(${ids}::text[])
    ORDER BY command.result->>'id', COALESCE((command.result->'audit'->>'requestVersion')::int,0) DESC, command."createdAt" DESC, command.id DESC
  `
    : []
  const userIds = [
    ...new Set(
      [
        ...rows.flatMap((row) => [
          row.requestedByUserId,
          row.approvedByUserId,
          row.completedByUserId,
        ]),
        ...latest.map((row) => row.actorUserId),
      ].filter((id): id is string => typeof id === "string"),
    ),
  ]
  const users = userIds.length
    ? await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const names = new Map(
    users.map((user) => [user.id, user.name.trim() || "Business member"]),
  )
  const byRequest = new Map(latest.map((row) => [row.requestId, row]))
  return new Map(
    rows.map((row) => {
      const event = byRequest.get(row.id)
      const needsDetails =
        row.status === "REQUESTED" &&
        event?.kind === "FUNDS_REFUND_NEED_DETAILS"
      const audit = event?.audit
      const note =
        audit &&
        typeof audit === "object" &&
        !Array.isArray(audit) &&
        typeof audit.reviewNote === "string"
          ? audit.reviewNote
          : null
      return [
        row.id,
        {
          requestedByName:
            names.get(row.requestedByUserId) ?? "Former business member",
          approvedByName: row.approvedByUserId
            ? (names.get(row.approvedByUserId) ?? "Former business member")
            : null,
          completedByName: row.completedByUserId
            ? (names.get(row.completedByUserId) ?? "Former business member")
            : null,
          cancelledByName:
            row.status === "CANCELLED" && event?.kind === "FUNDS_REFUND_CANCEL"
              ? (names.get(event.actorUserId) ?? "Former business member")
              : null,
          needsDetails,
          reviewState: needsDetails ? "NEEDS_DETAILS" : row.status,
          reviewNote: needsDetails ? note : null,
          reviewedAt: needsDetails ? (event?.createdAt ?? null) : null,
          reviewedByName:
            needsDetails && event
              ? (names.get(event.actorUserId) ?? "Former business member")
              : null,
        },
      ]
    }),
  )
}

function requiredRefundLifecycle(
  lifecycle: Awaited<ReturnType<typeof refundLifecycle>>,
  requestId: string,
) {
  const value = lifecycle.get(requestId)
  if (!value)
    throw new FinanceError(
      "CONFLICT",
      "The saved refund lifecycle could not be recovered.",
    )
  return value
}

export async function listCustomerFundsRefunds(
  db: PrismaClient,
  input: {
    tenantId: string
    actorUserId: string
    accountId?: string
    status?: "REQUESTED" | "RESERVED" | "COMPLETED" | "CANCELLED"
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a valid refund page size.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const rows = await tx.customerFundsRefundRequest.findMany({
        where: {
          tenantId: input.tenantId,
          ...(input.accountId ? { accountId: input.accountId } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: limit + 1,
        include: {
          account: {
            select: {
              customerId: true,
              currencyCode: true,
              revision: true,
              customer: { select: { name: true } },
            },
          },
        },
      })
      const page = rows.slice(0, limit)
      const lifecycle = await refundLifecycle(tx, page)
      return {
        requests: page.map((row) => ({
          ...publicResult(row),
          ...requiredRefundLifecycle(lifecycle, row.id),
          bookId: row.bookId,
          accountId: row.accountId,
          accountRevision: row.account.revision.toString(),
          customerId: row.account.customerId,
          customerName: row.account.customer.name,
          currencyCode: row.account.currencyCode,
          reason: row.reason,
        })),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}

export async function getCustomerFundsRefundDetail(
  db: PrismaClient,
  input: { tenantId: string; actorUserId: string; requestId: string },
  encryptionKey: string,
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const row = await tx.customerFundsRefundRequest.findFirst({
        where: { id: input.requestId, tenantId: input.tenantId },
        include: {
          account: {
            select: {
              customerId: true,
              currencyCode: true,
              revision: true,
              customer: { select: { name: true } },
            },
          },
        },
      })
      if (!row)
        throw new FinanceError(
          "NOT_FOUND",
          "Refund request not found in this business.",
        )
      let destination: ReturnType<
        typeof decryptCustomerRefundDestination
      > | null = null
      try {
        destination = decryptCustomerRefundDestination(
          row.destinationCiphertext,
          row,
          encryptionKey,
        )
      } catch (error) {
        if (!(error instanceof FinanceError)) throw error
      }
      const lifecycle = await refundLifecycle(tx, [row])
      return {
        ...publicResult(row),
        ...requiredRefundLifecycle(lifecycle, row.id),
        bookId: row.bookId,
        accountId: row.accountId,
        accountRevision: row.account.revision.toString(),
        customerId: row.account.customerId,
        customerName: row.account.customer.name,
        currencyCode: row.account.currencyCode,
        reason: row.reason,
        destination,
        destinationStatus: destination
          ? ("AVAILABLE" as const)
          : ("UNAVAILABLE" as const),
        canCancel: row.status === "REQUESTED" || row.status === "RESERVED",
        canApprove: Boolean(destination) && row.status === "REQUESTED",
        destinationFingerprint: row.destinationFingerprint,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
