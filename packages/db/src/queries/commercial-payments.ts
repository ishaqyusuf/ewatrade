import {
  type MoneyAccountPurpose,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CommercialPaymentMethod,
  CommercialPaymentType,
  PaymentStatus,
  ServiceWorkEventType,
  WorkAuthorizationPolicy,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { lockCustomerLedgerAccount } from "./customer-ledger/accounts"
import {
  assertHeldCommerceFinancialOrder,
  lockCommerceFinancialOrder,
} from "./customer-ledger/commerce-locks"
import { lockFinanceBook } from "./finance/access"
import { assertOrderPaymentAccountInTransaction } from "./finance/order-payment-accounts"
import { postOrderCollectionInTransaction } from "./finance/posting"
import { FinanceError } from "./finance/rules"
import { reconcileServiceCommerceBookingPaymentInTransaction } from "./service-commerce-bookings"
import { loadTenantActors } from "./tenant-actors"

export type CommercialPaymentMethodValue =
  | "bank_transfer"
  | "card"
  | "cash"
  | "other"
  | "pos"

function paymentMethod(value: CommercialPaymentMethodValue) {
  if (value === "bank_transfer") return CommercialPaymentMethod.BANK_TRANSFER
  if (value === "card") return CommercialPaymentMethod.CARD
  if (value === "pos") return CommercialPaymentMethod.POS
  if (value === "other") return CommercialPaymentMethod.OTHER
  return CommercialPaymentMethod.CASH
}

export function summarizeCommercialPayment(input: {
  amountPaidMinor: number
  totalMinor: number
}) {
  const amountPaidMinor = Math.max(0, input.amountPaidMinor)
  const balanceDueMinor = Math.max(0, input.totalMinor - amountPaidMinor)
  return {
    amountPaidMinor,
    balanceDueMinor,
    paymentStatus:
      amountPaidMinor >= input.totalMinor
        ? ("paid" as const)
        : amountPaidMinor > 0
          ? ("partially_paid" as const)
          : ("pending" as const),
  }
}

function assertPaymentAmount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Payment amount must be a positive minor-unit amount.",
    )
  }
}

function serializePaymentStatus(status: PaymentStatus) {
  if (status === PaymentStatus.PARTIALLY_PAID) return "partially_paid" as const
  if (status === PaymentStatus.PAID) return "paid" as const
  if (status === PaymentStatus.REFUNDED) return "refunded" as const
  if (status === PaymentStatus.AUTHORIZED) return "authorized" as const
  if (status === PaymentStatus.FAILED) return "failed" as const
  return "pending" as const
}

export function effectiveCommercialAmountPaid(input: {
  amountPaidMinor: number
  paymentCount?: number
  paymentStatus: PaymentStatus
  totalMinor: number
}) {
  if (
    input.amountPaidMinor === 0 &&
    input.paymentStatus === PaymentStatus.PAID &&
    (input.paymentCount ?? 0) === 0
  ) {
    return input.totalMinor
  }
  return input.amountPaidMinor
}

/**
 * For clients that don't send a refund account yet: when every payment on the
 * order went into one account that takes the refund's method, the money came
 * back out of it. Several destinations need an explicit choice.
 */
async function originalPaymentAccount(
  tx: Prisma.TransactionClient,
  input: {
    bookId: string
    method: CommercialPaymentMethodValue
    orderId: string
    tenantId: string
  },
) {
  const payments = await tx.commercialOrderPayment.findMany({
    where: {
      orderId: input.orderId,
      tenantId: input.tenantId,
      type: CommercialPaymentType.PAYMENT,
      method: { not: CommercialPaymentMethod.CUSTOMER_CREDIT },
    },
    select: { moneyAccountId: true },
  })
  const ids = [...new Set(payments.map((row) => row.moneyAccountId))]
  if (ids.length > 1 && !ids.includes(null))
    throw new CatalogError(
      "INVALID_ORDER",
      "Choose the account the refund was paid from.",
    )
  const [only] = ids
  if (ids.length !== 1 || !only) return undefined
  const account = await tx.financeAccount.findFirst({
    where: { id: only, bookId: input.bookId, archivedAt: null },
    select: { purpose: true, paymentMethods: true },
  })
  return account &&
    moneyAccountPaymentMethods({
      purpose: account.purpose as MoneyAccountPurpose,
      paymentMethods: account.paymentMethods,
    }).includes(input.method)
    ? only
    : undefined
}

async function recordCommercialOrderPaymentCore(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    amountMinor: number
    moneyAccountId?: string
    clientPaymentId: string
    method: CommercialPaymentMethodValue
    note?: string
    orderId: string
    reference?: string
    /** Actual receipt date for a merchant-confirmed manual payment. */
    effectiveAt?: Date
    tenantId: string
    type?: "payment" | "refund"
  },
  creditSource?: { allocationId?: string; releaseId?: string },
  heldOrder?: NonNullable<
    Awaited<ReturnType<typeof lockCommerceFinancialOrder>>
  >,
  options: PaymentOptions = {},
) {
  assertPaymentAmount(input.amountMinor)
  if (
    input.effectiveAt &&
    (!Number.isFinite(input.effectiveAt.getTime()) ||
      input.effectiveAt > new Date())
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "Choose a valid payment date that is not in the future.",
    )
  if (heldOrder) assertHeldCommerceFinancialOrder(tx, heldOrder, input)
  const financialOrder =
    heldOrder ?? (await lockCommerceFinancialOrder(tx, input))
  if (!financialOrder) {
    throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
  }
  const expectedMethod = creditSource
    ? CommercialPaymentMethod.CUSTOMER_CREDIT
    : paymentMethod(input.method)
  if (input.moneyAccountId && creditSource)
    throw new CatalogError(
      "INVALID_ORDER",
      "Customer credit cannot be collected into a money account.",
    )
  const bookId = financialOrder.context?.bookId
  if (input.moneyAccountId && !bookId)
    throw new FinanceError(
      "CONFLICT",
      "Set up Finance before choosing a receiving account.",
    )
  const moneyAccountId =
    input.moneyAccountId ??
    (input.type === "refund" && !creditSource && bookId
      ? await originalPaymentAccount(tx, { ...input, bookId })
      : undefined)
  const expectedNote = input.note?.trim() || null
  const expectedReference = input.reference?.trim() || null
  const expectedType =
    input.type === "refund"
      ? CommercialPaymentType.REFUND
      : CommercialPaymentType.PAYMENT

  async function serializePrevious(
    previous: NonNullable<
      Awaited<ReturnType<typeof tx.commercialOrderPayment.findUnique>>
    >,
  ) {
    if (
      previous.orderId !== input.orderId ||
      (input.effectiveAt !== undefined &&
        previous.recordedAt.getTime() !== input.effectiveAt.getTime()) ||
      previous.amountMinor !== input.amountMinor ||
      previous.method !== expectedMethod ||
      previous.moneyAccountId !== (moneyAccountId ?? null) ||
      previous.reference !== expectedReference ||
      previous.note !== expectedNote ||
      previous.type !== expectedType ||
      previous.customerAllocationId !== (creditSource?.allocationId ?? null) ||
      previous.customerAllocationReleaseId !== (creditSource?.releaseId ?? null)
    ) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This payment identity was already used with different details.",
      )
    }
    const order = await tx.commercialOrder.findUniqueOrThrow({
      include: { payments: { select: { id: true } } },
      where: { id: previous.orderId },
    })
    const amountPaidMinor = effectiveCommercialAmountPaid({
      amountPaidMinor: order.amountPaidMinor,
      paymentCount: order.payments.length,
      paymentStatus: order.paymentStatus,
      totalMinor: order.totalMinor,
    })
    return {
      amountPaidMinor,
      balanceDueMinor: Math.max(0, order.totalMinor - amountPaidMinor),
      id: previous.id,
      paymentStatus: serializePaymentStatus(order.paymentStatus),
    }
  }

  const previous = await tx.commercialOrderPayment.findUnique({
    where: {
      tenantId_clientPaymentId: {
        clientPaymentId: input.clientPaymentId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    return serializePrevious(previous)
  }

  // The Order lock serializes its receipts; the unique payment key also guards
  // collisions originating from a different Order.
  // F01: while an online payment link can still be paid, a manual receipt
  // could settle the same balance twice. Only that link's own settlement passes.
  if (input.type !== "refund" && !creditSource) {
    const openLink = await tx.collectionIntent.findFirst({
      where: {
        tenantId: input.tenantId,
        orderId: input.orderId,
        status: { in: ["CREATED", "PENDING"] },
        expiresAt: { gt: new Date() },
        ...(options.collectionSettlementIntentId
          ? { id: { not: options.collectionSettlementIntentId } }
          : {}),
      },
      select: { id: true },
    })
    if (openLink)
      throw new CatalogError(
        "INVALID_ORDER",
        "An online payment link for this order is still open. Cancel it or wait for it to expire before recording a manual payment.",
      )
  }
  // Checked only for new payments: an exact retry still succeeds after the
  // account is paused or its methods change.
  if (moneyAccountId && bookId)
    await assertOrderPaymentAccountInTransaction(tx, {
      bookId,
      accountId: moneyAccountId,
      method: input.method,
      refund: input.type === "refund",
    })

  const order = await tx.commercialOrder.findFirst({
    include: {
      payments: {
        select: { id: true, amountMinor: true, method: true, type: true },
      },
    },
    where: { id: input.orderId, tenantId: input.tenantId },
  })
  if (!order) throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
  const currentPaid = effectiveCommercialAmountPaid({
    amountPaidMinor: order.amountPaidMinor,
    paymentCount: order.payments.length,
    paymentStatus: order.paymentStatus,
    totalMinor: order.totalMinor,
  })
  const isRefund = input.type === "refund"
  if (
    isRefund &&
    !creditSource &&
    order.payments.some(
      (payment) => payment.method === CommercialPaymentMethod.CUSTOMER_CREDIT,
    )
  ) {
    const refundableCollections = order.payments.reduce((total, payment) => {
      if (payment.method === CommercialPaymentMethod.CUSTOMER_CREDIT)
        return total
      return (
        total +
        (payment.type === CommercialPaymentType.PAYMENT
          ? payment.amountMinor
          : -payment.amountMinor)
      )
    }, 0)
    if (input.amountMinor > refundableCollections)
      throw new CatalogError(
        "INVALID_ORDER",
        "Cash refunds cannot include settlement from customer credit. Release that allocation before refunding the customer's funds.",
      )
  }
  const nextPaid = isRefund
    ? currentPaid - input.amountMinor
    : currentPaid + input.amountMinor
  if (nextPaid < 0) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Refund cannot exceed the amount collected.",
    )
  }
  if (nextPaid > order.totalMinor) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Payment cannot exceed the outstanding balance.",
    )
  }
  const summary = summarizeCommercialPayment({
    amountPaidMinor: nextPaid,
    totalMinor: order.totalMinor,
  })
  const nextStatus =
    isRefund && !creditSource && nextPaid === 0
      ? PaymentStatus.REFUNDED
      : summary.paymentStatus === "paid"
        ? PaymentStatus.PAID
        : summary.paymentStatus === "partially_paid"
          ? PaymentStatus.PARTIALLY_PAID
          : PaymentStatus.PENDING

  const payment = await tx.commercialOrderPayment.create({
    data: {
      amountMinor: input.amountMinor,
      clientPaymentId: input.clientPaymentId,
      method: expectedMethod,
      moneyAccountId,
      note: expectedNote,
      orderId: order.id,
      recordedByUserId: input.actorUserId,
      reference: expectedReference,
      storeId: order.storeId,
      tenantId: input.tenantId,
      type: expectedType,
      customerAllocationId: creditSource?.allocationId,
      customerAllocationReleaseId: creditSource?.releaseId,
      ...(input.effectiveAt ? { recordedAt: input.effectiveAt } : {}),
    },
  })
  if (moneyAccountId) {
    await postOrderCollectionInTransaction(
      tx,
      {
        tenantId: input.tenantId,
        orderId: order.id,
        paymentId: payment.id,
      },
      financialOrder,
    )
  }
  await tx.commercialOrder.update({
    data: {
      amountPaidMinor: nextPaid,
      paymentStatus: nextStatus,
    },
    where: { id: order.id },
  })
  await reconcileServiceCommerceBookingPaymentInTransaction(tx, {
    actorUserId: input.actorUserId,
    amountPaidMinor: nextPaid,
    commercialPaymentId: payment.id,
    isRefund: isRefund && !creditSource,
    orderId: order.id,
    storeId: order.storeId,
    tenantId: input.tenantId,
  })

  if (nextStatus === PaymentStatus.PAID) {
    const awaitingPayment = await tx.serviceJobLine.findMany({
      include: { serviceJob: true },
      where: {
        authorizationPolicy: WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT,
        authorizationStatus: WorkAuthorizationStatus.PENDING_PAYMENT,
        commercialOrderLine: { orderId: order.id },
      },
    })
    for (const line of awaitingPayment) {
      await tx.serviceJobLine.update({
        data: {
          authorizationSource: "payment",
          authorizationStatus: WorkAuthorizationStatus.AUTHORIZED,
          authorizedAt: new Date(),
          revision: { increment: 1 },
        },
        where: { id: line.id },
      })
      await tx.serviceWorkEvent.create({
        data: {
          actorUserId: input.actorUserId,
          reason: "Commercial Order payment completed",
          serviceJobId: line.serviceJobId,
          serviceJobLineId: line.id,
          source: "commercial_payment",
          tenantId: input.tenantId,
          type: ServiceWorkEventType.AUTHORIZED,
        },
      })
      await tx.serviceJob.update({
        data: { revision: { increment: 1 } },
        where: { id: line.serviceJob.id },
      })
    }
  }

  return {
    amountPaidMinor: nextPaid,
    balanceDueMinor: summary.balanceDueMinor,
    id: payment.id,
    paymentStatus: serializePaymentStatus(nextStatus),
  }
}

type PaymentOptions = {
  /** Set only by collection settlement for the link being settled. */
  collectionSettlementIntentId?: string
}
/** A caller already holding this Order's lock passes it to skip re-locking. */
export async function recordCommercialOrderPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof recordCommercialOrderPaymentCore>[1],
  heldOrder?: Parameters<typeof recordCommercialOrderPaymentCore>[3],
  options: PaymentOptions = {},
) {
  return recordCommercialOrderPaymentCore(
    tx,
    input,
    undefined,
    heldOrder,
    options,
  )
}

/** Consumes a posted allocation under book -> customer -> Order lock ordering. */
export async function recordCommercialCreditSettlementInTransaction(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof recordCommercialOrderPaymentCore>[1],
  source: { bookId: string; allocationId?: string; releaseId?: string },
) {
  assertPaymentAmount(input.amountMinor)
  if (Boolean(source.allocationId) === Boolean(source.releaseId))
    throw new CatalogError(
      "INVALID_ORDER",
      "One durable credit settlement source is required.",
    )
  const book = await lockFinanceBook(tx, { ...input, bookId: source.bookId })
  const release = source.releaseId
    ? await tx.customerLedgerAllocationRelease.findUnique({
        where: { id: source.releaseId },
      })
    : null
  const allocation = await tx.customerLedgerAllocation.findFirst({
    where: {
      id: source.allocationId ?? release?.allocationId ?? "",
      credit: { tenantId: input.tenantId },
    },
    include: { charge: true },
  })
  if (!allocation || (source.releaseId && !release))
    throw new CatalogError(
      "INVALID_ORDER",
      "Customer allocation source not found.",
    )
  const account = await lockCustomerLedgerAccount(tx, {
    ...input,
    accountId: allocation.accountId,
  })
  await tx.$queryRaw`SELECT id FROM "CommercialOrder" WHERE id = ${input.orderId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  const order = await tx.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
  })
  const sourceId = release?.id ?? allocation.id
  const expectedCommand = release
    ? `customer-allocation-release:${sourceId}`
    : `customer-allocation:${sourceId}`
  if (
    !order ||
    allocation.charge.orderId !== order.id ||
    allocation.charge.kind !== "ORDER_CHARGE" ||
    order.customerId !== account.customerId ||
    order.currencyCode !== account.currencyCode ||
    book.currencyCode !== account.currencyCode ||
    BigInt(input.amountMinor) !==
      (release?.amountMinor ?? allocation.amountMinor) ||
    input.clientPaymentId !== expectedCommand ||
    (input.type === "refund") !== Boolean(release)
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "Order settlement must match its customer allocation source.",
    )
  const posting = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceId,
        sourceKind: release
          ? "CUSTOMER_ALLOCATION_RELEASE"
          : "CUSTOMER_CREDIT_ALLOCATION",
      },
    },
  })
  if (!posting)
    throw new CatalogError(
      "INVALID_ORDER",
      "The customer allocation must be posted before Order settlement.",
    )
  return recordCommercialOrderPaymentCore(tx, input, source)
}

export async function recordCommercialOrderPayment(
  db: PrismaClient,
  input: Parameters<typeof recordCommercialOrderPaymentInTransaction>[1],
) {
  return db.$transaction(
    (tx) => recordCommercialOrderPaymentInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function listCommercialOrderPaymentsPage(
  db: PrismaClient,
  input: {
    createdByUserId?: string
    cursor?: string
    defaultCurrencyCode: string
    limit?: number
    query?: string
    storeId?: string
    tenantId: string
  },
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const query = input.query?.trim()
  const matchingActors = query
    ? await db.user.findMany({
        select: { id: true },
        where: {
          memberships: { some: { tenantId: input.tenantId } },
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      })
    : []
  const baseWhere: Prisma.CommercialOrderPaymentWhereInput = {
    tenantId: input.tenantId,
    order: {
      is: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        createdByUserId: input.createdByUserId,
      },
    },
    type: CommercialPaymentType.PAYMENT,
    method: { not: CommercialPaymentMethod.CUSTOMER_CREDIT },
  }
  const where: Prisma.CommercialOrderPaymentWhereInput = query
    ? {
        ...baseWhere,
        OR: [
          { reference: { contains: query, mode: "insensitive" } },
          {
            recordedByUserId: {
              in: matchingActors.map((actor) => actor.id),
            },
          },
          {
            order: {
              is: {
                OR: [
                  {
                    customerEmail: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  {
                    customerName: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  {
                    customerPhone: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  {
                    orderNumber: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          },
        ],
      }
    : baseWhere
  const [records, currencyTotalRows] = await Promise.all([
    db.commercialOrderPayment.findMany({
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      select: {
        amountMinor: true,
        id: true,
        method: true,
        order: {
          select: {
            currencyCode: true,
            customerName: true,
            id: true,
            orderNumber: true,
          },
        },
        recordedAt: true,
        recordedByUserId: true,
        reference: true,
      },
      skip: input.cursor ? 1 : 0,
      take: limit + 1,
      where,
    }),
    db.$queryRaw<
      Array<{
        currencyCode: string
        totalAmountMinor: bigint
        totalCount: bigint
      }>
    >(Prisma.sql`
      SELECT
        orders."currencyCode" AS "currencyCode",
        COALESCE(SUM(payments."amountMinor"), 0)::bigint AS "totalAmountMinor",
        COUNT(*)::bigint AS "totalCount"
      FROM "CommercialOrderPayment" AS payments
      JOIN "CommercialOrder" AS orders
        ON orders."id" = payments."orderId"
        AND orders."tenantId" = payments."tenantId"
      WHERE payments."tenantId" = ${input.tenantId}
        AND payments."type" = ${CommercialPaymentType.PAYMENT}
        AND payments."method" <> ${CommercialPaymentMethod.CUSTOMER_CREDIT}
        ${input.storeId ? Prisma.sql`AND orders."storeId" = ${input.storeId}` : Prisma.empty}
        ${input.createdByUserId ? Prisma.sql`AND orders."createdByUserId" = ${input.createdByUserId}` : Prisma.empty}
      GROUP BY orders."currencyCode"
      ORDER BY orders."currencyCode" ASC
    `),
  ])
  const hasNextPage = records.length > limit
  const pageRecords = hasNextPage ? records.slice(0, limit) : records
  const actors = await loadTenantActors(db, {
    tenantId: input.tenantId,
    userIds: pageRecords.map((payment) => payment.recordedByUserId),
  })
  const totalCount = currencyTotalRows.reduce(
    (count, total) => count + Number(total.totalCount),
    0,
  )

  return {
    currencyTotals: currencyTotalRows.map((total) => ({
      currencyCode: total.currencyCode,
      totalAmountMinor: Number(total.totalAmountMinor),
    })),
    defaultCurrencyCode: input.defaultCurrencyCode,
    items: pageRecords.map((payment) => ({
      ...payment,
      recordedBy: actors.get(payment.recordedByUserId) ?? null,
    })),
    nextCursor: hasNextPage ? pageRecords.at(-1)?.id : undefined,
    totalCount,
  }
}
