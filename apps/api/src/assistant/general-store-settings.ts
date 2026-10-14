import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { ordersRouter } from "../trpc/routers/orders"
import { storesRouter } from "../trpc/routers/stores"
import type { GeneralContext } from "./general-context"

/** G05: the current Store's settings, read through each canonical procedure. */
export const generalStoreSettingsInput = z.object({}).strict()

type Section<T> =
  | { status: "available"; value: T }
  | { status: "not_permitted" | "not_on_plan" | "unavailable"; reason: string }

/**
 * Each section keeps its own procedure's role and plan checks; one refusal
 * never hides the others, and a refusal is never shown as a default value.
 */
export function settleSection<T>(result: PromiseSettledResult<T>): Section<T> {
  if (result.status === "fulfilled")
    return { status: "available", value: result.value }
  const error = result.reason
  const plan = [error, error instanceof Error ? error.cause : null].find(
    (value) =>
      value instanceof Error &&
      Reflect.get(value, "code") === "PLAN_FEATURE_UNAVAILABLE",
  )
  if (plan instanceof Error)
    return { status: "not_on_plan", reason: plan.message }
  if (error instanceof TRPCError && error.code === "FORBIDDEN")
    return { status: "not_permitted", reason: error.message }
  return { status: "unavailable", reason: "This setting could not be read." }
}

export async function readGeneralStoreSettings(fresh: GeneralContext) {
  const orders = ordersRouter.createCaller(fresh)
  const stores = storesRouter.createCaller(fresh)
  const [receipts, reminders, visibility] = await Promise.allSettled([
    orders.receiptSettings({}),
    orders.reminderSettings({}),
    stores.orderVisibility({}),
  ])
  return {
    storeId: fresh.tenantContext.activeStore?.id ?? null,
    storeName: fresh.tenantContext.activeStore?.name ?? null,
    receipts: settleSection(receipts),
    reminders: settleSection(reminders),
    visibility: settleSection(visibility),
  }
}

type Settings = Awaited<ReturnType<typeof readGeneralStoreSettings>>
const yesNo = (value: boolean) => (value ? "yes" : "no")

function blocked(section: Exclude<Section<unknown>, { status: "available" }>) {
  return section.status === "not_on_plan"
    ? "not included in your plan"
    : section.status === "not_permitted"
      ? "Owner/Admin only"
      : "could not be read"
}

export function generalStoreSettingsAnswer(
  settings: Settings,
  asOf = new Date().toISOString(),
): GeneralAnswer {
  const { receipts, reminders, visibility } = settings
  const lines = [
    receipts.status === "available"
      ? `Receipts (${receipts.value.source === "store" ? "this Store's own settings" : "business defaults"}): customer name ${yesNo(receipts.value.effective.showCustomerName)}, payment breakdown ${yesNo(receipts.value.effective.showPaymentBreakdown)}, note "${receipts.value.effective.thankYouNote}".`
      : `Receipts: ${blocked(receipts)}.`,
    reminders.status === "available"
      ? `Order reminders: ${reminders.value.enabled ? "on" : "off"}${reminders.value.enabled ? ` (day before ${yesNo(reminders.value.dayBeforeEnabled)}, same day ${yesNo(reminders.value.sameDayEnabled)})` : ""}${reminders.value.updatedAt ? "" : " — never changed, using defaults"}.`
      : `Order reminders: ${blocked(reminders)}.`,
    visibility.status === "available"
      ? `Sales reps see ${visibility.value.salesRepOrderVisibility === "ALL_STORE_ORDERS" ? "all orders in this Store" : "only orders they created"}.`
      : `Sales rep order visibility: ${blocked(visibility)}.`,
  ]
  return {
    id: `store_settings_${crypto.randomUUID()}`,
    title: "Store settings",
    value: settings.storeName ?? "Current Store",
    scope: "Current Store · receipts, order reminders and sales rep visibility",
    asOf,
    detail: [
      ...lines,
      "Changes are made from Settings; the assistant only reads them here.",
    ].join("\n"),
  }
}
