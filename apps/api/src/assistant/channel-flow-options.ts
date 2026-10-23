import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { classifyCapabilityAction } from "@ewatrade/assistant/channels/capability-action-handoff"
import type { WhatsAppFlowKind } from "@ewatrade/assistant/channels/flows"
import { listOrderPaymentAccounts } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  assertGeneralAction,
  assertGeneralActionHandoffAuthority,
  requireGeneralScope,
} from "./general-context"
import { simpleExpenseOptions } from "./general-simple-expense"

export const nativeFlowActions = {
  sale: "sale_record",
  customer: "customer_create",
  product: "product_create",
  expense: "expense_record_simple",
  stock_receive: "stock_receive",
} as const
export type BusinessFlowKind = Exclude<WhatsAppFlowKind, "registration">
export function assertBusinessFlowAuthority(
  ctx: Pick<GeneralContext, "session" | "tenantContext">,
  kind: BusinessFlowKind,
) {
  const action = nativeFlowActions[kind]
  if (kind !== "stock_receive") return assertGeneralAction(ctx, action)
  const capability = capabilityForAction(action)
  if (classifyCapabilityAction(capability).kind !== "app_review")
    throw Error("Stock receipt requires app review.")
  return assertGeneralActionHandoffAuthority(ctx, capability)
}
const option = (row: { id: string; name: string }) => ({
  id: row.id,
  title: row.name,
})
/** Server-derived choices only, refreshed again by canonical validation on return. */
export async function businessFlowOptions(
  ctx: GeneralContext,
  kind: BusinessFlowKind,
) {
  const scope = assertBusinessFlowAuthority(ctx, kind)
  const currencyCode =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  const data: Record<string, unknown> = {
    scope_label: `${ctx.tenantContext.tenant.name} · ${ctx.tenantContext.activeStore?.name ?? "Store"} · ${currencyCode}`,
  }
  if (kind === "sale") {
    const accounts = await listOrderPaymentAccounts(ctx.db, {
      tenantId: scope.tenantId,
      currencyCode,
    })
    const customers = await ctx.db.customer.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 201,
    })
    data.accounts = accounts.accounts.filter((a) => !a.paused).map(option)
    data.customers = customers.map(option)
  }
  if (kind === "expense") {
    const current = await simpleExpenseOptions(ctx)
    data.scope_label = `${ctx.tenantContext.tenant.name} · ${ctx.tenantContext.activeStore?.name ?? "Store"} · ${current.book?.currencyCode ?? ctx.tenantContext.tenant.currencyCode} Finance Book`
    data.accounts = current.accounts.map(option)
    data.categories = current.categories.map(option)
    data.books = current.book
      ? [{ id: current.book.id, title: current.book.currencyCode }]
      : []
  }
  if (kind === "stock_receive") {
    requireGeneralScope(ctx)
    const sources = await ctx.db.stockBalanceSource.findMany({
      where: {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        custodyType: "STORE",
      },
      include: {
        product: { include: { catalogItem: { select: { name: true } } } },
        variant: { select: { name: true } },
        inventoryUnit: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
      take: 201,
    })
    data.stockItems = sources.map((s) => ({
      id: s.id,
      title: `${s.product.catalogItem.name} · ${s.variant.name}`,
    }))
    data.inventoryUnits = [
      ...new Map(
        sources.map((s) => [s.inventoryUnit.id, option(s.inventoryUnit)]),
      ).values(),
    ]
  }
  return data
}
