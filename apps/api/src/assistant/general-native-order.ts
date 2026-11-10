import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { nativeOrderChoiceIssues } from "@ewatrade/assistant/channels/order-review"
import { whatsAppCapabilityEnabled } from "@ewatrade/assistant/channels/policy"
import {
  type GeneralAction,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { readGeneralOrderReview } from "@ewatrade/db/assistant-general"
import {
  getConfiguredCatalogOfferingAvailability,
  lockInventorySourcesForReview,
} from "@ewatrade/db/queries"
import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { TRPCError } from "@trpc/server"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import { paymentAccountName } from "./general-actions"
import {
  assertGeneralOrderInitialPayment,
  requireGeneralScope,
} from "./general-context"
import { proposalDigest } from "./proposal-security"

type Order = Extract<GeneralAction, { action: "order_create" }>
export function isNativeCatalogOrder(
  ctx: Pick<GeneralTransactionContext, "session">,
) {
  return (
    isLinkedAssistantIdentity(ctx.session) &&
    whatsAppCapabilityEnabled(capabilityForAction("order_create"))
  )
}
export async function nativeCatalogOrderReview(
  ctx: GeneralTransactionContext,
  p: Order,
  lock = false,
) {
  const scope = requireGeneralScope(ctx)
  const issues = nativeOrderChoiceIssues(p)
  if (issues.length)
    throw new TRPCError({ code: "BAD_REQUEST", message: issues.join(" ") })
  const currency =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  const money = (n: number) => generalMoney(n, currency)
  const stocks = new Map<
    string,
    Awaited<ReturnType<typeof getConfiguredCatalogOfferingAvailability>>
  >()
  for (const line of p.lines) {
    if ("custom" in line) throw new Error("Catalog line required")
    if (!stocks.has(line.offeringId))
      stocks.set(
        line.offeringId,
        await getConfiguredCatalogOfferingAvailability(ctx.db, {
          ...scope,
          offeringId: line.offeringId,
        }),
      )
  }
  if (lock) {
    await lockInventorySourcesForReview(ctx.db, {
      ...scope,
      balanceSourceIds: [
        ...new Set([...stocks.values()].map((x) => x.balanceSourceId)),
      ].sort(),
    })
    return nativeCatalogOrderReview(ctx, p, false)
  }
  // Price/eligibility facts are read once after the current stock locks. The
  // canonical reader retains tenant/Store/systemRole, price and config checks.
  if (p.initialPayment) assertGeneralOrderInitialPayment(ctx)
  const read = await readGeneralOrderReview(ctx.db, scope, p.lines, currency)
  const quantities = new Map<string, string>()
  const lines: string[] = []
  for (const [i, line] of p.lines.entries()) {
    if ("custom" in line) throw new Error("Catalog line required")
    const stock = stocks.get(line.offeringId)
    const row = read.rows[i]
    if (!stock || !row) throw new Error("Offering unavailable")
    parseExactDecimal(line.quantity, {
      allowZero: false,
      maxScale: stock.transactionScale,
    })
    const amount = multiplyExactDecimals(line.quantity, stock.factor, 18)
    const used = addExactDecimals(
      quantities.get(stock.balanceSourceId) ?? "0",
      amount,
      18,
    )
    if (compareExactDecimals(used, stock.availableBalanceQuantity) > 0)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Stock changed or the requested quantity is unavailable. Review again.",
      })
    quantities.set(stock.balanceSourceId, used)
    lines.push(
      `${i + 1}. ${row.title} · ${row.detail ?? stock.offeringUnitName}`,
      row.unitPriceMinor === null
        ? `${line.quantity} · agreed item total ${money(row.totalMinor)}`
        : `${line.quantity} × ${money(row.unitPriceMinor ?? 0)} = ${money(row.totalMinor)}`,
      `Stock: on hand ${stock.onHandQuantity} → ${p.fulfillNow ? subtractExactDecimals(stock.onHandQuantity, used, 18) : stock.onHandQuantity}; reserved ${stock.reservedQuantity} → ${p.fulfillNow ? stock.reservedQuantity : addExactDecimals(stock.reservedQuantity, used, 18)}; available ${stock.availableBalanceQuantity} → ${subtractExactDecimals(stock.availableBalanceQuantity, used, 18)} ${stock.balanceUnitName}`,
    )
  }
  const received = p.initialPayment?.amountMinor ?? 0
  if (
    received > read.totalMinor ||
    (p.paymentChoice === "full" && received !== read.totalMinor) ||
    (p.paymentChoice === "partial" &&
      (received <= 0 || received >= read.totalMinor))
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The received amount does not match the selected unpaid, partial or full payment.",
    })
  const customer = p.customerId
    ? await ctx.db.customer.findFirst({
        where: { id: p.customerId, tenantId: scope.tenantId },
        select: { id: true, name: true },
      })
    : null
  if (p.customerId && !customer)
    throw new TRPCError({ code: "NOT_FOUND", message: "Customer unavailable." })
  const account = p.initialPayment
    ? await paymentAccountName(ctx, p.initialPayment)
    : "none · no payment recorded"
  lines.push(
    `Customer: ${customer?.name ?? "Walk-in"}`,
    `Total: ${money(read.totalMinor)}`,
    `Received: ${money(received)}${p.initialPayment ? ` · ${p.initialPayment.method.replaceAll("_", " ")}` : " · unpaid"}`,
    `Received into: ${account}`,
    `Balance: ${money(read.totalMinor - received)}`,
    `Handover: ${p.fulfillNow ? "handed over now; product stock is deducted" : "collect later; on-hand stays unchanged and product stock is reserved"}`,
    "Nothing is saved until you confirm.",
  )
  if (p.initialPayment?.note)
    lines.push(`Payment note: ${p.initialPayment.note}`)
  if (p.notes) lines.push(`Note: ${p.notes}`)
  return {
    lines,
    target: {
      id: scope.storeId,
      revision: proposalDigest({
        lines,
        stocks: [...stocks.values()],
        customer,
        account,
      }),
    },
  }
}
