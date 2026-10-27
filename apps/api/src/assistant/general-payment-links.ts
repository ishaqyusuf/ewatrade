import { createHash } from "node:crypto"
import {
  type GeneralAction,
  type GeneralReceipt,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import {
  createBusinessPaymentLinkInTransaction,
  effectiveCommercialAmountPaid,
  lockManualPaymentLinkOrdersInTransaction,
  resolveOrderScope,
} from "@ewatrade/db/queries"
import {
  createPaymentLinkToken,
  paymentLinkSharing,
  paymentLinkUrl,
} from "@ewatrade/payments"
import { moneyAccountPaymentMethods } from "@ewatrade/utils/finance-payment-methods"
import { manualPaymentShortCode } from "@ewatrade/utils/manual-payments"
import { TRPCError } from "@trpc/server"
import { paymentLinkOrigin, paymentLinkSigningKey } from "../banking/config"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type Action = Extract<GeneralAction, { action: "payment_links_create" }>
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
async function current(
  ctx: GeneralTransactionContext,
  payload: Action,
  lock: boolean,
) {
  const scope = requireGeneralScope(ctx)
  if (new Set(payload.orderIds).size !== payload.orderIds.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose each order once.",
    })
  const ids = [...payload.orderIds].sort()
  const access = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId,
    userId: scope.userId,
    role: ctx.tenantContext.membership.role,
    storeId: scope.storeId,
    activeStoreId: scope.storeId,
    allowedStoreIds: [scope.storeId],
  })
  const read = () =>
    ctx.db.commercialOrder.findMany({
      where: {
        ...access,
        id: { in: ids },
        currencyCode: "NGN",
        status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] },
      },
      include: {
        _count: { select: { payments: true } },
        store: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    })
  let rows = await read()
  if (rows.length !== ids.length)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "An order is no longer available in this Store.",
    })
  if (lock) {
    // Resolve every Book/customer context before taking any Order row lock.
    await lockManualPaymentLinkOrdersInTransaction(ctx.db, scope.tenantId, rows)
    const fresh = await read()
    if (
      fresh.length !== rows.length ||
      fresh.some(
        (row, index) =>
          row.currencyCode !== rows[index]?.currencyCode ||
          row.customerId !== rows[index]?.customerId,
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "An order changed. Review the links again.",
      })
    rows = fresh
  }
  const account = await ctx.db.financeAccount.findFirst({
    where: {
      id: payload.bankAccountId,
      book: { tenantId: scope.tenantId, currencyCode: "NGN" },
      kind: "ASSET",
      purpose: "BANK",
      archivedAt: null,
      paymentsPausedAt: null,
    },
    select: {
      id: true,
      name: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountHolder: true,
      paymentMethods: true,
    },
  })
  if (
    !account?.bankName ||
    !account.bankAccountNumber ||
    !account.bankAccountHolder ||
    !moneyAccountPaymentMethods({
      purpose: "BANK",
      paymentMethods: account.paymentMethods,
    }).includes("bank_transfer")
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Choose a configured receiving bank account, or add its details in Accounts.",
    })
  const orders = rows.map((row) => ({
    ...row,
    balance:
      row.totalMinor -
      effectiveCommercialAmountPaid({
        ...row,
        paymentCount: row._count.payments,
      }),
  }))
  if (orders.some((row) => row.balance <= 0))
    throw new TRPCError({
      code: "CONFLICT",
      message: "An order is already paid. Read the unpaid orders again.",
    })
  return {
    scope,
    orders,
    account,
    target: {
      id: ids.join(",").slice(0, 128),
      revision: hash({
        orders: orders.map((row) => [
          row.id,
          row.balance,
          row.status,
          row.updatedAt.toISOString(),
        ]),
        account,
        allowPartial: payload.allowPartial,
        lifetimeMinutes: payload.lifetimeMinutes,
      }),
    },
  }
}
async function execute(
  ctx: GeneralTransactionContext,
  payload: Action,
  key: string,
  loaded: Awaited<ReturnType<typeof current>>,
): Promise<GeneralReceipt> {
  const origin = paymentLinkOrigin()
  const secret = paymentLinkSigningKey()
  const now = new Date()
  const links: Extract<GeneralReceipt, { kind: "payment_links" }>["links"] = []
  for (const order of loaded.orders) {
    const result = await createBusinessPaymentLinkInTransaction(ctx.db, {
      tenantId: loaded.scope.tenantId,
      actorUserId: loaded.scope.userId,
      storeId: loaded.scope.storeId,
      orderId: order.id,
      bankAccountId: payload.bankAccountId,
      clientLinkId: `assistant_${hash([key, order.id]).slice(0, 48)}`,
      allowPartial: payload.allowPartial,
      amountMinor: order.balance,
      expiresAt: new Date(now.getTime() + payload.lifetimeMinutes * 60000),
      now,
    })
    const url = paymentLinkUrl(
      origin,
      manualPaymentShortCode(result.link.id) ??
        createPaymentLinkToken(
          { intentId: result.link.id, expiresAt: result.link.expiresAt },
          secret,
        ),
    )
    links.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      url,
      ...paymentLinkSharing({
        phone: order.customerPhone,
        businessName: order.store.name,
        orderNumber: order.orderNumber,
        url,
        amountMinor: result.link.amountMinor,
        currencyCode: result.link.currencyCode,
      }),
      amountMinor: result.link.amountMinor,
      currencyCode: result.link.currencyCode,
      expiresAt: result.link.expiresAt.toISOString(),
    })
  }
  return {
    kind: "payment_links",
    recordId: key,
    title: `${links.length} payment link${links.length === 1 ? "" : "s"} created`,
    detail: links
      .map(
        (link) =>
          `${link.orderNumber} · ${link.currencyCode} ${(link.amountMinor / 100).toFixed(2)}\n${link.url}`,
      )
      .join("\n\n")
      .concat("\n\nNothing was sent and no payment was recorded."),
    links,
  }
}
export const paymentLinksCreate: GeneralActionAdapter<Action> = {
  stale:
    "An order balance or receiving account changed. Review the links again.",
  unavailable: "These payment links are unavailable in the current Store.",
  validate: async (ctx, payload, lock) =>
    (await current(ctx, payload, lock)).target,
  async review(ctx, payload) {
    const loaded = await current(ctx, payload, false)
    return {
      target: loaded.target,
      presentation: {
        summary: {
          party: `${loaded.orders.length} payment link${loaded.orders.length === 1 ? "" : "s"}`,
          amount: generalMoney(
            loaded.orders.reduce((sum, order) => sum + order.balance, 0),
            "NGN",
          ),
          amountLabel: "Total due",
        },
        facts: [
          { label: "Receiving account", value: loaded.account.name },
          {
            label: "Bank",
            value: `${loaded.account.bankName} · ending ${loaded.account.bankAccountNumber?.slice(-4)}`,
          },
          {
            label: "Account holder",
            value: loaded.account.bankAccountHolder ?? "",
          },
          {
            label: "Amount",
            value: payload.allowPartial
              ? "Customer may pay part"
              : "Fixed amount",
          },
          {
            label: "Link lifetime",
            value: `${payload.lifetimeMinutes} minutes`,
          },
        ],
        table: {
          columns: [
            { label: "Order" },
            { label: "Due", align: "end" as const },
          ],
          rows: loaded.orders.map((order) => ({
            cells: [order.orderNumber, generalMoney(order.balance, "NGN")],
          })),
          preview: loaded.orders.length,
        },
        note: "Creates payment instructions only. All links are created together; a changed order requires a new review. Nothing is sent and no payment is recorded.",
      },
      lines: [
        ...loaded.orders.map(
          (order) =>
            `${order.orderNumber} · NGN ${(order.balance / 100).toFixed(2)} due`,
        ),
        `Receive into ${loaded.account.name} · ${loaded.account.bankName} · ending ${loaded.account.bankAccountNumber?.slice(-4)}.`,
        payload.allowPartial
          ? "Customers may report partial payments."
          : "Customers must use the displayed amount.",
        `Links expire ${payload.lifetimeMinutes} minutes after creation.`,
        "Creates shareable bank-transfer instructions only. Nothing is sent and no payment is recorded.",
      ],
    }
  },
  async prepareExecution(ctx, payload) {
    const loaded = await current(ctx, payload, true)
    return {
      target: loaded.target,
      execute: (key) => execute(ctx, payload, key, loaded),
    }
  },
  async execute(ctx, payload, key) {
    return execute(ctx, payload, key, await current(ctx, payload, true))
  },
  async authorizeRecovery(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    const access = await resolveOrderScope(ctx.db, {
      tenantId: scope.tenantId,
      userId: scope.userId,
      role: ctx.tenantContext.membership.role,
      storeId: scope.storeId,
      activeStoreId: scope.storeId,
      allowedStoreIds: [scope.storeId],
    })
    const count = await ctx.db.commercialOrder.count({
      where: {
        ...access,
        id: { in: payload.orderIds },
      },
    })
    if (count !== payload.orderIds.length)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "These links are unavailable in this Store.",
      })
  },
}
