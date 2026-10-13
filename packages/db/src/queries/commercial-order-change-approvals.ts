import { formatMinorMoney } from "@ewatrade/utils"
import {
  addExactDecimals,
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { orderAmendmentDigest as digest } from "./commercial-order-amendment-evidence"
import {
  OPEN_ORDER_CHANGE_POLICY,
  type OrderChangeMode,
  type OrderChangePolicyModes,
  endOfBusinessDay,
  orderChangeRequirement,
} from "./commercial-order-change-rules"
import {
  refundCommercialOrderInTransaction,
  returnCommercialOrderItemsInTransaction,
  returnedValueMinor,
} from "./commercial-order-credits"
import type { CommercialPaymentMethodValue } from "./commercial-payments"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"
import { runInOwnTransaction } from "./own-transaction"
import { loadTenantActors } from "./tenant-actors"

type Db = PrismaClient | Prisma.TransactionClient
type Disposition = "damaged" | "no_restock" | "quarantine" | "restock"

export type ReturnApprovalPayload = {
  lines: Array<{
    orderLineId: string
    quantity: string
    disposition: Disposition
  }>
  /** Credit the returned value; any overpayment goes back by this method. */
  money: { method: CommercialPaymentMethodValue } | null
  reason: string
}

export type RefundApprovalPayload = {
  amountMinor: number
  method: CommercialPaymentMethodValue
  /** Overcharged: the total drops by the refund too. */
  lowerTotal: boolean
  reason: string
}

export type OrderChangeApprovalRequest =
  | { kind: "RETURN"; payload: ReturnApprovalPayload }
  | { kind: "REFUND"; payload: RefundApprovalPayload }

/* ---------- policy ---------- */

export async function getCommercialOrderChangePolicy(
  db: Db,
  input: { tenantId: string; storeId: string },
) {
  const row = await db.commercialOrderChangePolicy.findUnique({
    where: { storeId: input.storeId },
  })
  if (!row || row.tenantId !== input.tenantId)
    return {
      ...OPEN_ORDER_CHANGE_POLICY,
      updatedAt: null,
      updatedByUserId: null,
    }
  return {
    returnsMode: row.returnsMode as OrderChangeMode,
    refundsMode: row.refundsMode as OrderChangeMode,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  }
}

export async function updateCommercialOrderChangePolicy(
  db: PrismaClient,
  input: OrderChangePolicyModes & {
    tenantId: string
    storeId: string
    actorUserId: string
  },
) {
  const store = await db.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId },
    select: { id: true },
  })
  if (!store) throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
  const data = {
    returnsMode: input.returnsMode,
    refundsMode: input.refundsMode,
    updatedByUserId: input.actorUserId,
  }
  await db.commercialOrderChangePolicy.upsert({
    where: { storeId: input.storeId },
    create: { ...data, storeId: input.storeId, tenantId: input.tenantId },
    update: data,
  })
  return getCommercialOrderChangePolicy(db, input)
}

/* ---------- order facts ---------- */

const sum = (values: { quantity: { toString(): string } }[]) =>
  values.reduce(
    (total, value) => addExactDecimals(total, value.quantity.toString()),
    "0",
  )

async function orderFacts(
  db: Db,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const order = await db.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: {
      id: true,
      storeId: true,
      status: true,
      currencyCode: true,
      totalMinor: true,
      amountPaidMinor: true,
      creditMinor: true,
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          totalMinor: true,
          snapshot: { select: { catalogItemName: true, variantName: true } },
          productFulfillments: { select: { quantity: true } },
          productReturns: { select: { quantity: true } },
        },
      },
    },
  })
  if (!order || order.storeId !== input.storeId)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  const lines = order.lines.map((line) => {
    const handedOver = sum(line.productFulfillments)
    const returned = sum(line.productReturns)
    return {
      id: line.id,
      quantity: line.quantity.toString(),
      totalMinor: line.totalMinor,
      title:
        [line.snapshot?.catalogItemName, line.snapshot?.variantName]
          .filter(Boolean)
          .join(" · ") || "Item",
      handedOver,
      returned,
      returnable: subtractExactDecimals(handedOver, returned),
    }
  })
  // What the approver saw: recording refuses once money or stock moves.
  const stateHash = digest({
    status: order.status,
    totalMinor: order.totalMinor,
    amountPaidMinor: order.amountPaidMinor,
    creditMinor: order.creditMinor,
    lines: lines.map((line) => [line.id, line.handedOver, line.returned]),
  })
  return { ...order, lines, stateHash }
}

type OrderFacts = Awaited<ReturnType<typeof orderFacts>>

const DISPOSITION_LABELS: Record<Disposition, string> = {
  restock: "back on shelf",
  quarantine: "set aside",
  damaged: "damaged",
  no_restock: "not restocked",
}
const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "transfer",
  card: "card",
  cash: "cash",
  other: "other",
  pos: "POS",
}

function formatQuantity(value: string) {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value
}

/** Checks the request against the order and says what it moves. */
function assessRequest(order: OrderFacts, request: OrderChangeApprovalRequest) {
  const money = (value: number) =>
    formatMinorMoney(value, order.currencyCode).replace(/\.00$/, "")
  if (["CANCELLED", "REFUNDED"].includes(order.status))
    throw new CatalogError("INVALID_ORDER", "This order is closed.")
  if (request.kind === "REFUND") {
    const { amountMinor, method, lowerTotal } = request.payload
    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0 ||
      amountMinor > order.amountPaidMinor
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "Refund cannot exceed the amount collected.",
      )
    return {
      amountMinor,
      cashBack: true,
      withMoney: true,
      summary: `Refund ${money(amountMinor)} by ${METHOD_LABELS[method] ?? method}${lowerTotal ? " · total drops" : ""}`,
    }
  }
  const { lines, money: moneyBack } = request.payload
  if (!lines.length || lines.length > 50)
    throw new CatalogError("INVALID_ORDER", "Choose what came back.")
  if (new Set(lines.map((line) => line.orderLineId)).size !== lines.length)
    throw new CatalogError("INVALID_ORDER", "Each item can appear once.")
  const chosen = lines.map((line) => {
    const orderLine = order.lines.find((row) => row.id === line.orderLineId)
    if (!orderLine)
      throw new CatalogError("ORDER_NOT_FOUND", "Order item not found.")
    if (
      compareExactDecimals(line.quantity, "0") <= 0 ||
      compareExactDecimals(line.quantity, orderLine.returnable) > 0
    )
      throw new CatalogError(
        "INVALID_ORDER",
        `At most ${formatQuantity(orderLine.returnable)} of ${orderLine.title} can come back.`,
      )
    return { line, orderLine }
  })
  const value = Math.min(
    order.totalMinor,
    returnedValueMinor(
      chosen.map(({ line, orderLine }) => ({
        quantity: orderLine.quantity,
        totalMinor: orderLine.totalMinor,
        returned: line.quantity,
      })),
    ),
  )
  if (moneyBack && value <= 0)
    throw new CatalogError(
      "INVALID_ORDER",
      "These items have no value to credit.",
    )
  const refund = moneyBack
    ? Math.max(0, order.amountPaidMinor - (order.totalMinor - value))
    : 0
  const items = chosen
    .map(
      ({ line, orderLine }) =>
        `${formatQuantity(line.quantity)} × ${orderLine.title} (${DISPOSITION_LABELS[line.disposition]})`,
    )
    .join(", ")
  return {
    amountMinor: moneyBack ? (refund > 0 ? refund : value) : 0,
    cashBack: refund > 0,
    withMoney: Boolean(moneyBack),
    summary: `${items} · ${
      !moneyBack
        ? "stock only"
        : refund > 0
          ? `${money(refund)} back`
          : `${money(value)} off the total`
    }`,
  }
}

/* ---------- request and decide ---------- */

type Status = "PENDING" | "APPROVED" | "REJECTED" | "USED" | "CANCELLED"
const LIVE: Status[] = ["PENDING", "APPROVED"]

export async function requestCommercialOrderChangeApproval(
  db: PrismaClient,
  input: OrderChangeApprovalRequest & {
    tenantId: string
    storeId: string
    orderId: string
    actorUserId: string
    clientRequestId: string
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const reason = input.payload.reason.trim()
  if (!reason || reason.length > 500)
    throw new CatalogError("INVALID_ORDER", "Give a short reason.")
  const payload = { ...input.payload, reason }
  const payloadHash = digest({
    kind: input.kind,
    orderId: input.orderId,
    payload,
  })
  return runInOwnTransaction(db, async (tx) => {
    const previous = await tx.commercialOrderChangeApproval.findUnique({
      where: {
        tenantId_clientRequestId: {
          tenantId: input.tenantId,
          clientRequestId: input.clientRequestId,
        },
      },
    })
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This request identity was already used with different details.",
        )
      return { approvalId: previous.id, replayed: true as const }
    }
    const order = await orderFacts(tx, input)
    const assessed = assessRequest(order, {
      kind: input.kind,
      payload,
    } as OrderChangeApprovalRequest)
    const policy = await getCommercialOrderChangePolicy(tx, input)
    const requirement = orderChangeRequirement(policy, {
      action: input.kind === "RETURN" ? "return" : "refund",
      canManageMoney: false,
      cashBack: assessed.cashBack,
      isApprover: false,
      withMoney: assessed.withMoney,
    })
    if (requirement.kind === "blocked")
      throw new CatalogError("INVALID_ORDER", requirement.reason)
    if (requirement.kind === "direct")
      throw new CatalogError(
        "INVALID_ORDER",
        "This store doesn't need approval for this. Record it directly.",
      )
    const tenant = await tx.tenant.findUnique({
      where: { id: input.tenantId },
      select: { timezone: true },
    })
    // One live request per order, kind and person: asking again replaces it.
    await tx.commercialOrderChangeApproval.updateMany({
      where: {
        tenantId: input.tenantId,
        orderId: input.orderId,
        kind: input.kind,
        requestedByUserId: input.actorUserId,
        status: { in: LIVE },
      },
      data: { status: "CANCELLED" },
    })
    const created = await tx.commercialOrderChangeApproval.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        orderId: input.orderId,
        clientRequestId: input.clientRequestId,
        kind: input.kind,
        payload: payload as Prisma.InputJsonValue,
        payloadHash,
        orderStateHash: order.stateHash,
        summary: assessed.summary,
        amountMinor: assessed.amountMinor,
        reason,
        requestedByUserId: input.actorUserId,
        requestedAt: now,
        expiresAt: endOfBusinessDay(now, tenant?.timezone ?? "Africa/Lagos"),
      },
    })
    return { approvalId: created.id, replayed: false as const }
  })
}

/** Owner/Admin decision on a pending request in their Store. */
export async function decideCommercialOrderChangeApproval(
  db: PrismaClient,
  input: {
    tenantId: string
    storeId: string
    approvalId: string
    actorUserId: string
    decision: "APPROVE" | "REJECT"
    note?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const note = input.note?.trim() || null
  const decided = await db.commercialOrderChangeApproval.updateMany({
    where: {
      id: input.approvalId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    data: {
      status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      decidedByUserId: input.actorUserId,
      decidedAt: now,
      decisionNote: note,
    },
  })
  if (decided.count === 1) return { approvalId: input.approvalId }
  const row = await db.commercialOrderChangeApproval.findFirst({
    where: {
      id: input.approvalId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: { status: true, expiresAt: true },
  })
  if (!row) throw new CatalogError("ORDER_NOT_FOUND", "Request not found.")
  throw new CatalogError(
    "REVISION_CONFLICT",
    row.status === "PENDING" && row.expiresAt <= now
      ? "This request ran out at the end of its day."
      : row.status === "CANCELLED"
        ? "This request was replaced or withdrawn."
        : "This request was already decided.",
  )
}

/** The requester withdraws a live request. */
export async function cancelCommercialOrderChangeApproval(
  db: PrismaClient,
  input: { tenantId: string; approvalId: string; actorUserId: string },
) {
  const cancelled = await db.commercialOrderChangeApproval.updateMany({
    where: {
      id: input.approvalId,
      tenantId: input.tenantId,
      requestedByUserId: input.actorUserId,
      status: { in: LIVE },
    },
    data: { status: "CANCELLED" },
  })
  if (!cancelled.count)
    throw new CatalogError("REVISION_CONFLICT", "Nothing to withdraw.")
  return { approvalId: input.approvalId }
}

/* ---------- reads ---------- */

const viewSelect = {
  id: true,
  orderId: true,
  kind: true,
  status: true,
  payload: true,
  summary: true,
  amountMinor: true,
  reason: true,
  requestedByUserId: true,
  requestedAt: true,
  expiresAt: true,
  decidedByUserId: true,
  decidedAt: true,
  decisionNote: true,
  usedAt: true,
  order: {
    select: { orderNumber: true, customerName: true, currencyCode: true },
  },
} satisfies Prisma.CommercialOrderChangeApprovalSelect

type ViewRow = Prisma.CommercialOrderChangeApprovalGetPayload<{
  select: typeof viewSelect
}>

async function toViews(
  db: PrismaClient,
  tenantId: string,
  rows: ViewRow[],
  now: Date,
) {
  const actors = await loadTenantActors(db, {
    tenantId,
    userIds: rows.flatMap((row) =>
      [row.requestedByUserId, row.decidedByUserId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  })
  const name = (id: string | null) =>
    id ? (actors.get(id)?.name ?? "A team member") : null
  return rows.map((row) => {
    const lapsed = LIVE.includes(row.status) && row.expiresAt <= now
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      customerName: row.order.customerName,
      currencyCode: row.order.currencyCode,
      kind: row.kind === "RETURN" ? ("return" as const) : ("refund" as const),
      status: lapsed
        ? ("expired" as const)
        : (row.status.toLowerCase() as
            | "pending"
            | "approved"
            | "rejected"
            | "used"
            | "cancelled"),
      payload: row.payload as ReturnApprovalPayload | RefundApprovalPayload,
      summary: row.summary,
      amountMinor: row.amountMinor,
      reason: row.reason,
      requestedBy: name(row.requestedByUserId),
      requestedByUserId: row.requestedByUserId,
      requestedAt: row.requestedAt,
      expiresAt: row.expiresAt,
      decidedBy: name(row.decidedByUserId),
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
    }
  })
}

export type CommercialOrderChangeApprovalView = Awaited<
  ReturnType<typeof toViews>
>[number]

/** Requests waiting for an Owner/Admin in one Store, oldest first. */
export async function listPendingCommercialOrderChangeApprovals(
  db: PrismaClient,
  input: { tenantId: string; storeId: string; now?: Date },
) {
  const now = input.now ?? new Date()
  const rows = await db.commercialOrderChangeApproval.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    orderBy: { requestedAt: "asc" },
    take: 50,
    select: viewSelect,
  })
  return toViews(db, input.tenantId, rows, now)
}

/**
 * This order's requests for the Change menu: the actor's latest request of
 * each kind from today, and (for approvers) everything still pending.
 */
export async function getCommercialOrderChangeApprovalsForOrder(
  db: PrismaClient,
  input: {
    tenantId: string
    orderId: string
    actorUserId: string
    isApprover: boolean
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const rows = await db.commercialOrderChangeApproval.findMany({
    where: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      expiresAt: { gt: now },
      status: { in: ["PENDING", "APPROVED", "REJECTED"] },
      ...(input.isApprover ? {} : { requestedByUserId: input.actorUserId }),
    },
    orderBy: { requestedAt: "desc" },
    take: 20,
    select: viewSelect,
  })
  const views = await toViews(db, input.tenantId, rows, now)
  const mine = views.filter(
    (view) => view.requestedByUserId === input.actorUserId,
  )
  return {
    return: mine.find((view) => view.kind === "return") ?? null,
    refund: mine.find((view) => view.kind === "refund") ?? null,
    pending: input.isApprover
      ? views.filter((view) => view.status === "pending")
      : [],
  }
}

/* ---------- record ---------- */

/**
 * The requester records exactly what was approved: the approval is used in
 * the same transaction as the return or refund. A retry with the same
 * command identity replays.
 */
export async function recordApprovedCommercialOrderChange(
  db: PrismaClient,
  input: {
    tenantId: string
    storeId: string
    approvalId: string
    actorUserId: string
    clientOperationId: string
    moneyAccountId?: string
    reference?: string
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return runInOwnTransaction(db, async (tx) => {
    const approval = await tx.commercialOrderChangeApproval.findFirst({
      where: {
        id: input.approvalId,
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
    })
    if (!approval)
      throw new CatalogError("ORDER_NOT_FOUND", "Request not found.")
    const replay =
      approval.status === "USED" &&
      approval.usedClientOperationId === input.clientOperationId
    if (!replay) {
      if (approval.requestedByUserId !== input.actorUserId)
        throw new CatalogError(
          "FORBIDDEN",
          "Only the person who asked can record this.",
        )
      if (approval.status !== "APPROVED")
        throw new CatalogError(
          "REVISION_CONFLICT",
          approval.status === "PENDING"
            ? "This is still waiting for approval."
            : approval.status === "REJECTED"
              ? "This request was rejected."
              : approval.status === "USED"
                ? "This approval was already used."
                : "This request was withdrawn.",
        )
      if (approval.expiresAt <= now)
        throw new CatalogError(
          "REVISION_CONFLICT",
          "This approval ran out at the end of its day. Ask again.",
        )
      const locked = await lockCommerceFinancialOrder(tx, {
        tenantId: input.tenantId,
        orderId: approval.orderId,
      })
      if (!locked) throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
      const order = await orderFacts(tx, {
        tenantId: input.tenantId,
        storeId: input.storeId,
        orderId: approval.orderId,
      })
      if (order.stateHash !== approval.orderStateHash)
        throw new CatalogError(
          "REVISION_CONFLICT",
          "The order changed after approval. Ask again.",
        )
      const used = await tx.commercialOrderChangeApproval.updateMany({
        where: { id: approval.id, status: "APPROVED" },
        data: {
          status: "USED",
          usedAt: now,
          usedClientOperationId: input.clientOperationId,
        },
      })
      if (used.count !== 1)
        throw new CatalogError(
          "REVISION_CONFLICT",
          "This approval was already used.",
        )
    }
    const scope = {
      tenantId: input.tenantId,
      storeId: input.storeId,
      orderId: approval.orderId,
    }
    // Switching a setting Off after approval still stops the change.
    const policy = await getCommercialOrderChangePolicy(tx, scope)
    if (!replay) {
      const off =
        approval.kind === "REFUND"
          ? policy.refundsMode === "OFF" && "Refunds are off for this store"
          : policy.returnsMode === "OFF" && "Returns are off for this store"
      if (off) throw new CatalogError("INVALID_ORDER", off)
    }
    if (approval.kind === "REFUND") {
      const payload = approval.payload as RefundApprovalPayload
      const result = await refundCommercialOrderInTransaction(tx, {
        ...scope,
        actorUserId: approval.requestedByUserId,
        amountMinor: payload.amountMinor,
        clientOperationId: input.clientOperationId,
        lowerTotal: payload.lowerTotal,
        method: payload.method,
        moneyAccountId: input.moneyAccountId,
        reason: payload.reason,
        reference: input.reference,
      })
      return { kind: "refund" as const, ...result }
    }
    const payload = approval.payload as ReturnApprovalPayload
    const result = await returnCommercialOrderItemsInTransaction(tx, {
      ...scope,
      actorUserId: approval.requestedByUserId,
      clientOperationId: input.clientOperationId,
      lines: payload.lines,
      money: payload.money
        ? {
            method: payload.money.method,
            moneyAccountId: input.moneyAccountId,
            reference: input.reference,
          }
        : null,
      reason: payload.reason,
      cashBackBlockedReason:
        !replay && policy.refundsMode === "OFF"
          ? "Refunds are off for this store, so no money can go back"
          : null,
    })
    return { kind: "return" as const, ...result }
  })
}
