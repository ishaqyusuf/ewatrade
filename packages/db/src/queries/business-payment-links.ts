import { createHash, randomBytes } from "node:crypto"
import {
  MANUAL_PAYMENT_SHORT_ID_PREFIX,
  MANUAL_RECEIPT_MAX_BYTES,
  ManualPaymentError,
  manualBankDetails,
  manualPaymentAmount,
  manualPaymentLinkId,
  manualPaymentOutcome,
  manualReceiptTypes,
} from "@ewatrade/utils/manual-payments"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertAttachmentEntitlement } from "./attachment-entitlement"
import { catalogFreeLineKindForRole } from "./catalog-free-lines"
import {
  effectiveCommercialAmountPaid,
  recordCommercialOrderPaymentInTransaction,
} from "./commercial-payments"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"
import { assertFinanceManager, lockFinanceBook } from "./finance/access"
import { createFinanceMoneyAccountInTransaction } from "./finance/accounts"
import { assertOrderPaymentAccountInTransaction } from "./finance/order-payment-accounts"
import { runInOwnTransaction } from "./own-transaction"

type Actor = { tenantId: string; actorUserId: string }
type Proof = { linkId: string; expiresAt: Date }
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
const unavailable = () =>
  new ManualPaymentError("NOT_FOUND", "This payment request is unavailable.")
const orderInclude = { _count: { select: { payments: true } } } as const
const paid = (order: {
  amountPaidMinor: number
  totalMinor: number
  paymentStatus: Parameters<
    typeof effectiveCommercialAmountPaid
  >[0]["paymentStatus"]
  _count: { payments: number }
}) =>
  effectiveCommercialAmountPaid({
    ...order,
    paymentCount: order._count.payments,
  })

async function assertOrderActor(
  tx: Prisma.TransactionClient,
  input: Actor & { storeId: string },
) {
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${input.tenantId} AND "userId"=${input.actorUserId} FOR SHARE`
  const member = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    include: {
      staffStoreAssignments: {
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: "ACTIVE",
        },
      },
    },
  })
  if (
    !member ||
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(member.role)
  )
    throw new ManualPaymentError(
      "FORBIDDEN",
      "Current payment-recording access is required.",
    )
  if (
    !["OWNER", "ADMIN"].includes(member.role) &&
    member.staffAccessMode === "SCOPED" &&
    !member.staffStoreAssignments.length
  )
    throw new ManualPaymentError(
      "FORBIDDEN",
      "You cannot record payments in this Store.",
    )
}

export async function saveManualBankDetails(
  db: PrismaClient,
  input: Actor & {
    bookId: string
    accountId: string
    bankName: string
    accountNumber: string
    accountHolder: string
  },
) {
  const details = manualBankDetails(input)
  return runInOwnTransaction(db, async (tx) => {
    await lockFinanceBook(tx, input)
    const account = await tx.financeAccount.findFirst({
      where: {
        id: input.accountId,
        bookId: input.bookId,
        kind: "ASSET",
        purpose: "BANK",
        archivedAt: null,
      },
    })
    if (!account) throw unavailable()
    return tx.financeAccount.update({
      where: { id: account.id },
      data: details,
    })
  })
}
export async function createManualBankAccount(
  db: PrismaClient,
  input: Actor & {
    bookId: string
    clientAccountId: string
    name: string
    bankName: string
    accountNumber: string
    accountHolder: string
  },
) {
  const details = manualBankDetails(input)
  return runInOwnTransaction(db, async (tx) => {
    const account = await createFinanceMoneyAccountInTransaction(tx, {
      ...input,
      code: `BANK_${hash(input.clientAccountId).slice(0, 16)}`,
      purpose: "BANK",
      paymentMethods: ["bank_transfer"],
    })
    if (
      account.bankAccountNumber &&
      (account.bankAccountNumber !== details.bankAccountNumber ||
        account.bankName !== details.bankName ||
        account.bankAccountHolder !== details.bankAccountHolder)
    )
      throw new ManualPaymentError(
        "CONFLICT",
        "This account request was already saved with different bank details.",
      )
    return tx.financeAccount.update({
      where: { id: account.id },
      data: details,
    })
  })
}
export async function listManualBankAccounts(
  db: PrismaClient,
  input: Actor & { bookId: string },
) {
  return runInOwnTransaction(db, async (tx) => {
    await assertFinanceManager(tx, input)
    const book = await tx.financeBook.findFirst({
      where: { id: input.bookId, tenantId: input.tenantId },
    })
    if (!book) throw unavailable()
    return tx.financeAccount.findMany({
      where: {
        bookId: book.id,
        kind: "ASSET",
        purpose: "BANK",
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        bankName: true,
        bankAccountNumber: true,
        bankAccountHolder: true,
        paymentsPausedAt: true,
      },
      orderBy: { code: "asc" },
    })
  })
}

export function createBusinessPaymentLink(
  db: PrismaClient,
  input: Parameters<typeof createBusinessPaymentLinkInTransaction>[1],
) {
  return runInOwnTransaction(db, (tx) =>
    createBusinessPaymentLinkInTransaction(tx, input),
  )
}
export async function createBusinessPaymentLinkInTransaction(
  tx: Prisma.TransactionClient,
  input: Actor & {
    orderId: string
    storeId: string
    bankAccountId: string
    clientLinkId: string
    amountMinor?: number
    allowPartial: boolean
    expiresAt: Date
    now: Date
  },
) {
  await assertOrderActor(tx, input)
  const held = await lockCommerceFinancialOrder(tx, input)
  if (
    !held ||
    held.order.storeId !== input.storeId ||
    !held.context ||
    ["DRAFT", "CANCELLED", "REFUNDED"].includes(held.order.status)
  )
    throw unavailable()
  const order = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: input.orderId },
    include: orderInclude,
  })
  const previous = await tx.manualPaymentLink.findUnique({
    where: {
      tenantId_clientLinkId: {
        tenantId: input.tenantId,
        clientLinkId: input.clientLinkId,
      },
    },
  })
  if (previous) {
    if (
      previous.orderId !== input.orderId ||
      previous.bankAccountId !== input.bankAccountId ||
      previous.allowPartial !== input.allowPartial ||
      (input.amountMinor !== undefined &&
        previous.amountMinor !== input.amountMinor)
    )
      throw new ManualPaymentError(
        "CONFLICT",
        "This link request was already used with different details.",
      )
    return { link: previous, replay: true }
  }
  const balance = Math.max(0, order.totalMinor - paid(order))
  const amountMinor = input.amountMinor ?? balance
  manualPaymentAmount({
    amountMinor,
    requestedMinor: balance,
    balanceMinor: balance,
    allowPartial: true,
  })
  if (
    order.currencyCode !== "NGN" ||
    input.expiresAt.getTime() - input.now.getTime() < 600_000 ||
    input.expiresAt.getTime() - input.now.getTime() > 72 * 3600_000
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Choose NGN and a link lifetime from ten minutes to three days.",
    )
  const account = await assertOrderPaymentAccountInTransaction(tx, {
    bookId: held.context.bookId,
    accountId: input.bankAccountId,
    method: "bank_transfer",
    refund: false,
  })
  if (
    account.purpose !== "BANK" ||
    !account.bankName ||
    !account.bankAccountNumber ||
    !account.bankAccountHolder
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Add the receiving bank details before sharing this account.",
    )
  const link = await tx.manualPaymentLink.create({
    data: {
      id: `${MANUAL_PAYMENT_SHORT_ID_PREFIX}${randomBytes(16).toString("base64url")}`,
      tenantId: input.tenantId,
      orderId: order.id,
      bankAccountId: account.id,
      clientLinkId: input.clientLinkId,
      amountMinor,
      currencyCode: order.currencyCode,
      allowPartial: input.allowPartial,
      bankName: account.bankName,
      bankAccountNumber: account.bankAccountNumber,
      bankAccountHolder: account.bankAccountHolder,
      createdByUserId: input.actorUserId,
      expiresAt: input.expiresAt,
    },
  })
  return { link, replay: false }
}

/** Indexed lookup of a deliberately public handle, never an unsigned legacy link/report ID. */
export async function shortManualPaymentLinkIdentity(
  db: Pick<PrismaClient, "manualPaymentLink">,
  code: string,
): Promise<Proof | null> {
  const id = manualPaymentLinkId(code)
  if (!id) return null
  const link = await db.manualPaymentLink.findFirst({
    where: { id, tenant: { isActive: true } },
    select: { id: true, expiresAt: true },
  })
  return link ? { linkId: link.id, expiresAt: link.expiresAt } : null
}

export async function readManualPaymentLink(
  db: Pick<PrismaClient, "manualPaymentLink">,
  input: Proof,
) {
  const link = await db.manualPaymentLink.findFirst({
    where: {
      id: input.linkId,
      expiresAt: input.expiresAt,
      tenant: { isActive: true },
    },
    include: {
      tenant: { select: { dataClassification: true } },
      order: {
        include: {
          ...orderInclude,
          store: { select: { name: true } },
          lines: {
            take: 100,
            orderBy: { id: "asc" },
            select: {
              kind: true,
              quantity: true,
              totalMinor: true,
              snapshot: {
                select: {
                  offeringName: true,
                  catalogItemName: true,
                  customLineRole: true,
                  note: true,
                },
              },
            },
          },
        },
      },
    },
  })
  if (!link) throw unavailable()
  return link
}
export async function getBusinessPaymentLink(
  db: PrismaClient,
  input: Proof & { now: Date },
) {
  const link = await readManualPaymentLink(db, input)
  const order = link.order
  const paidMinor = paid(order)
  const balanceMinor = Math.max(0, order.totalMinor - paidMinor)
  let receiptAllowed = true
  try {
    await assertAttachmentEntitlement(db, { tenantId: link.tenantId })
  } catch {
    receiptAllowed = false
  }
  return {
    businessName: order.store.name,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    state:
      link.closedAt || ["DRAFT", "CANCELLED", "REFUNDED"].includes(order.status)
        ? ("unavailable" as const)
        : balanceMinor === 0
          ? ("paid" as const)
          : link.expiresAt <= input.now
            ? ("expired" as const)
            : ("active" as const),
    amountRequestedMinor: link.amountMinor,
    amountPrefilledMinor: Math.min(link.amountMinor, balanceMinor),
    totalMinor: order.totalMinor,
    paidMinor,
    balanceMinor,
    currencyCode: link.currencyCode,
    allowPartial: link.allowPartial,
    receiptAllowed,
    expiresAt: link.expiresAt,
    bank: {
      name: link.bankName,
      accountNumber: link.bankAccountNumber,
      accountHolder: link.bankAccountHolder,
    },
    items: order.lines.map((line) => ({
      name:
        (catalogFreeLineKindForRole(line.snapshot?.customLineRole)
          ? line.snapshot?.note?.trim() || null
          : null) ??
        line.snapshot?.offeringName ??
        line.snapshot?.catalogItemName ??
        (line.kind === "SERVICE" ? "Service" : "Item"),
      kind: line.kind,
      quantity: line.quantity.toString(),
      totalMinor: line.totalMinor,
    })),
  }
}

export type ManualReportInput = Proof & {
  clientReportId: string
  payerName: string
  claimedAmountMinor: number
  receipt?: { contentType: string; contentDigest: string; sizeBytes: number }
}
export async function prepareManualPaymentReport(
  db: PrismaClient,
  input: ManualReportInput,
) {
  const payerName = Array.from(input.payerName.trim())
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
  if (
    !payerName ||
    payerName.length > 160 ||
    !/^[a-zA-Z0-9_-]{8,120}$/.test(input.clientReportId)
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Enter your name and a valid payment report.",
    )
  const receipt = input.receipt
  if (
    receipt &&
    (!(manualReceiptTypes as readonly string[]).includes(receipt.contentType) ||
      !/^[a-f0-9]{64}$/.test(receipt.contentDigest) ||
      !Number.isSafeInteger(receipt.sizeBytes) ||
      receipt.sizeBytes < 1 ||
      receipt.sizeBytes > MANUAL_RECEIPT_MAX_BYTES)
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Attach a JPEG, PNG, WebP or PDF receipt up to 4 MB.",
    )
  return runInOwnTransaction(db, async (tx) => {
    const link = await readManualPaymentLink(tx, input)
    await tx.$queryRaw`SELECT id FROM "ManualPaymentLink" WHERE id=${link.id} FOR UPDATE`
    if (
      link.closedAt ||
      link.expiresAt <= new Date() ||
      ["DRAFT", "CANCELLED", "REFUNDED"].includes(link.order.status)
    )
      throw unavailable()
    const previous = await tx.manualPaymentReport.findUnique({
      where: {
        linkId_clientReportId: {
          linkId: link.id,
          clientReportId: input.clientReportId,
        },
      },
    })
    if (previous) {
      if (
        previous.claimedAmountMinor !== input.claimedAmountMinor ||
        previous.payerName !== payerName ||
        previous.receiptDigest !== (receipt?.contentDigest ?? null) ||
        previous.receiptContentType !== (receipt?.contentType ?? null) ||
        previous.receiptSizeBytes !== (receipt?.sizeBytes ?? null)
      )
        throw new ManualPaymentError(
          "CONFLICT",
          "This report request was already used with different details.",
        )
      return { report: previous, replay: true }
    }
    manualPaymentAmount({
      amountMinor: input.claimedAmountMinor,
      requestedMinor: link.amountMinor,
      balanceMinor: Math.max(0, link.order.totalMinor - paid(link.order)),
      allowPartial: link.allowPartial,
    })
    const [pending, recent] = await Promise.all([
      tx.manualPaymentReport.count({
        where: {
          linkId: link.id,
          OR: [
            { status: "SUBMITTED" },
            {
              status: "DRAFT",
              createdAt: { gt: new Date(Date.now() - 3600_000) },
            },
          ],
        },
      }),
      tx.manualPaymentReport.count({
        where: {
          linkId: link.id,
          createdAt: { gt: new Date(Date.now() - 86400_000) },
        },
      }),
    ])
    if (pending > 0 || recent >= 10)
      throw new ManualPaymentError(
        "CONFLICT",
        "A report is already being checked. Keep your confirmation page open or contact the business.",
      )
    if (receipt)
      await assertAttachmentEntitlement(tx, { tenantId: link.tenantId })
    const report = await tx.manualPaymentReport.create({
      data: {
        linkId: link.id,
        clientReportId: input.clientReportId,
        payerName,
        claimedAmountMinor: input.claimedAmountMinor,
        receiptContentType: receipt?.contentType,
        receiptDigest: receipt?.contentDigest,
        receiptSizeBytes: receipt?.sizeBytes,
      },
    })
    return { report, replay: false }
  })
}

export async function submitManualPaymentReport(
  db: PrismaClient,
  input: { reportId: string },
) {
  return runInOwnTransaction(db, async (tx) => {
    const report = await tx.manualPaymentReport.findUnique({
      where: { id: input.reportId },
      include: {
        link: {
          include: {
            tenant: { select: { isActive: true } },
            order: { include: orderInclude },
          },
        },
      },
    })
    if (!report || !report.link.tenant.isActive) throw unavailable()
    if (report.status !== "DRAFT") return { report, replay: true }
    const link = report.link
    if (
      link.closedAt ||
      link.expiresAt <= new Date() ||
      ["DRAFT", "CANCELLED", "REFUNDED"].includes(link.order.status)
    )
      throw unavailable()
    if (report.receiptDigest && !report.receiptUploadedAt)
      throw new ManualPaymentError(
        "CONFLICT",
        "Finish uploading the receipt or start a report without it.",
      )
    manualPaymentAmount({
      amountMinor: report.claimedAmountMinor,
      requestedMinor: link.amountMinor,
      balanceMinor: Math.max(0, link.order.totalMinor - paid(link.order)),
      allowPartial: link.allowPartial,
    })
    const changed = await tx.manualPaymentReport.updateMany({
      where: { id: report.id, status: "DRAFT" },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        revision: { increment: 1 },
      },
    })
    return {
      report: await tx.manualPaymentReport.findUniqueOrThrow({
        where: { id: report.id },
      }),
      replay: !changed.count,
    }
  })
}

export async function manualPaymentReportStatus(
  db: PrismaClient,
  reportId: string,
) {
  const row = await db.manualPaymentReport.findFirst({
    where: { id: reportId, link: { tenant: { isActive: true } } },
    include: { link: { include: { order: { include: orderInclude } } } },
  })
  if (!row) throw unavailable()
  const totalMinor = row.link.order.totalMinor
  const paidMinor = paid(row.link.order)
  const balanceMinor = Math.max(0, totalMinor - paidMinor)
  return {
    reportId: row.id,
    revision: row.revision,
    status: row.status,
    claimedAmountMinor: row.claimedAmountMinor,
    receivedAmountMinor: row.receivedAmountMinor,
    totalMinor,
    paidMinor,
    balanceMinor,
    currencyCode: row.link.currencyCode,
    ...manualPaymentOutcome({
      status: row.status,
      receivedAmountMinor: row.receivedAmountMinor,
      balanceMinor,
      currencyCode: row.link.currencyCode,
      orderNumber: row.link.order.orderNumber,
      note: row.decisionNote,
    }),
  }
}

export async function readManualPaymentReport(
  db: PrismaClient,
  input: { reportId: string; scope: Prisma.CommercialOrderWhereInput },
) {
  const report = await db.manualPaymentReport.findFirst({
    where: { id: input.reportId, link: { order: input.scope } },
    include: {
      link: {
        include: {
          tenant: { select: { dataClassification: true } },
          order: { include: orderInclude },
        },
      },
    },
  })
  if (!report) throw unavailable()
  return report
}
export async function pendingManualPaymentReports(
  db: PrismaClient,
  input: {
    scope: Prisma.CommercialOrderWhereInput
    beforeId?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new ManualPaymentError("BAD_REQUEST", "Invalid payment report page.")
  const rows = await db.manualPaymentReport.findMany({
    where: {
      status: "SUBMITTED",
      link: { order: input.scope },
      ...(input.beforeId ? { id: { lt: input.beforeId } } : {}),
    },
    include: {
      link: {
        select: {
          currencyCode: true,
          order: { select: { id: true, orderNumber: true, storeId: true } },
        },
      },
    },
    orderBy: { id: "desc" },
    take: limit + 1,
  })
  return {
    items: rows.slice(0, limit).map((row) => ({
      id: row.id,
      revision: row.revision,
      payerName: row.payerName,
      amountMinor: row.claimedAmountMinor,
      currencyCode: row.link.currencyCode,
      orderId: row.link.order.id,
      orderNumber: row.link.order.orderNumber,
      submittedAt: row.submittedAt,
      status: "unverified" as const,
    })),
    nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
  }
}

export type ManualPaymentDecision = Actor & {
  reportId: string
  expectedRevision: number
  outcome: "received" | "not_received"
  receivedAmountMinor?: number
  moneyAccountId?: string
  receivedAt?: Date
  reference?: string
  note?: string
}
export async function reviewManualPaymentReport(
  db: PrismaClient,
  input: ManualPaymentDecision,
) {
  const decisionDigest = hash({
    outcome: input.outcome,
    amount: input.receivedAmountMinor ?? null,
    account: input.moneyAccountId ?? null,
    at: input.receivedAt?.toISOString() ?? null,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
  })
  return runInOwnTransaction(db, async (tx) => {
    const original = await tx.manualPaymentReport.findFirst({
      where: { id: input.reportId, link: { tenantId: input.tenantId } },
      include: { link: { include: { order: { select: { storeId: true } } } } },
    })
    if (!original) throw unavailable()
    await assertOrderActor(tx, {
      ...input,
      storeId: original.link.order.storeId,
    })
    const held = await lockCommerceFinancialOrder(tx, {
      tenantId: input.tenantId,
      orderId: original.link.orderId,
    })
    if (!held) throw unavailable()
    await tx.$queryRaw`SELECT id FROM "ManualPaymentReport" WHERE id=${original.id} FOR UPDATE`
    const report = await tx.manualPaymentReport.findUniqueOrThrow({
      where: { id: original.id },
    })
    if (["CONFIRMED", "NOT_RECEIVED"].includes(report.status)) {
      if (report.decisionDigest !== decisionDigest)
        throw new ManualPaymentError(
          "CONFLICT",
          "This report was already reviewed differently. Open the current result.",
        )
      return { report, replay: true }
    }
    if (
      report.status !== "SUBMITTED" ||
      report.revision !== input.expectedRevision
    )
      throw new ManualPaymentError(
        "CONFLICT",
        "This report changed. Review it again before confirming.",
      )
    if (input.outcome === "not_received") {
      if (!input.note?.trim())
        throw new ManualPaymentError(
          "BAD_REQUEST",
          "Add a reason so the customer knows what to check.",
        )
      const saved = await tx.manualPaymentReport.update({
        where: { id: report.id },
        data: {
          status: "NOT_RECEIVED",
          decidedAt: new Date(),
          decidedByUserId: input.actorUserId,
          decisionDigest,
          decisionNote: input.note?.trim() || null,
          revision: { increment: 1 },
        },
      })
      return { report: saved, replay: false }
    }
    if (
      !input.receivedAmountMinor ||
      !Number.isSafeInteger(input.receivedAmountMinor) ||
      input.receivedAmountMinor <= 0 ||
      !input.moneyAccountId ||
      !input.receivedAt ||
      !Number.isFinite(input.receivedAt.getTime()) ||
      input.receivedAt > new Date()
    )
      throw new ManualPaymentError(
        "BAD_REQUEST",
        "Enter the amount, receiving account and actual payment date you verified.",
      )
    if (
      ["DRAFT", "CANCELLED", "REFUNDED"].includes(held.order.status) ||
      !held.context
    )
      throw unavailable()
    const order = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: held.order.id },
      include: orderInclude,
    })
    if (input.receivedAmountMinor > order.totalMinor - paid(order))
      throw new ManualPaymentError(
        "CONFLICT",
        "The received amount exceeds the remaining order balance. Review any excess separately.",
      )
    const receivedAccount = await assertOrderPaymentAccountInTransaction(tx, {
      bookId: held.context.bookId,
      accountId: input.moneyAccountId,
      method: "bank_transfer",
      refund: false,
    })
    if (receivedAccount.purpose !== "BANK")
      throw new ManualPaymentError(
        "BAD_REQUEST",
        "Choose the bank account that received this transfer.",
      )
    const result = await recordCommercialOrderPaymentInTransaction(
      tx,
      {
        actorUserId: input.actorUserId,
        amountMinor: input.receivedAmountMinor,
        moneyAccountId: input.moneyAccountId,
        clientPaymentId: `manual-report:${report.id}`,
        method: "bank_transfer",
        orderId: order.id,
        reference: input.reference?.trim() || undefined,
        tenantId: input.tenantId,
        effectiveAt: input.receivedAt,
        note: `Merchant-confirmed payment report ${report.id}`,
      },
      held,
    )
    const saved = await tx.manualPaymentReport.update({
      where: { id: report.id },
      data: {
        status: "CONFIRMED",
        decidedAt: new Date(),
        decidedByUserId: input.actorUserId,
        receivedAmountMinor: input.receivedAmountMinor,
        receivedAccountId: input.moneyAccountId,
        receivedAt: input.receivedAt,
        bankReference: input.reference?.trim() || null,
        decisionDigest,
        decisionNote: input.note?.trim() || null,
        canonicalPaymentId: result.id,
        revision: { increment: 1 },
      },
    })
    return { report: saved, replay: false }
  })
}
