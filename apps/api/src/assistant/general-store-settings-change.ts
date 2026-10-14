import {
  type GeneralAction,
  storeSettingsReceiptKind,
  storeSettingsSummary,
} from "@ewatrade/assistant/general/contracts"
import {
  CatalogError,
  RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
  RetailOpsSubscriptionError,
  assertRetailOpsPlanIdFeature,
  getCommercialOrderReminderSettings,
  getOrderReceiptSettings,
  getStoreOrderVisibility,
  saveOrderReceiptSettings,
  updateCommercialOrderReminderSettings,
  updateStoreOrderVisibility,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Action = Extract<GeneralAction, { action: "store_settings_update" }>
type Change = Action["change"]
const yesNo = (value: boolean) => (value ? "yes" : "no")

/** The section's plan gate, exactly as its settings procedure applies it. */
function assertSectionPlan(ctx: GeneralTransactionContext, change: Change) {
  const feature =
    change.section === "receipts"
      ? "invoices"
      : change.section === "reminders"
        ? "orderReminders"
        : null
  if (!feature) return
  try {
    assertRetailOpsPlanIdFeature(
      ctx.tenantContext.tenant.retailOpsPlanId ??
        RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
      feature,
    )
  } catch (error) {
    if (error instanceof RetailOpsSubscriptionError)
      throw new TRPCError({ code: "FORBIDDEN", message: error.message })
    throw error
  }
}

/** Current values, the review lines and a digest that goes stale on change. */
async function settingsTarget(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  const { change } = payload
  assertSectionPlan(ctx, change)
  const input = { tenantId: scope.tenantId, storeId: scope.storeId }
  const storeName = ctx.tenantContext.activeStore?.name ?? "this Store"
  let current: unknown
  let unchanged: boolean
  let lines: string[]
  if (change.section === "receipts") {
    const settings = await getOrderReceiptSettings(ctx.db, input)
    const before =
      change.scope === "business" ? settings.business : settings.override
    current = { business: settings.business, override: settings.override }
    unchanged = JSON.stringify(before) === JSON.stringify(change.settings)
    const describe = (value: typeof before) =>
      value
        ? `customer name ${yesNo(value.showCustomerName)}, payment breakdown ${yesNo(value.showPaymentBreakdown)}, note "${value.thankYouNote}"`
        : "none (uses business defaults)"
    lines = [
      change.scope === "business"
        ? "Business receipt defaults"
        : `${storeName} · own receipt settings`,
      `Before: ${describe(before)}`,
      `After: ${describe(change.settings)}`,
      change.scope === "business"
        ? settings.source === "store"
          ? `Applies to every Store without its own receipt settings. ${storeName} keeps its own settings.`
          : "Applies to every Store without its own receipt settings, including this one."
        : change.settings
          ? `Only ${storeName}. Other Stores keep the business defaults or their own settings.`
          : `${storeName} will use the business defaults again.`,
      "Receipts already shared stay as they were.",
    ]
  } else if (change.section === "reminders") {
    const settings = await getCommercialOrderReminderSettings(ctx.db, input)
    if (!settings)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this business.",
      })
    current = settings
    unchanged =
      settings.enabled === change.enabled &&
      settings.dayBeforeEnabled === change.dayBeforeEnabled &&
      settings.sameDayEnabled === change.sameDayEnabled
    lines = [
      `${storeName} · order reminder emails`,
      `On: ${yesNo(settings.enabled)} → ${yesNo(change.enabled)}`,
      `Day before: ${yesNo(settings.dayBeforeEnabled)} → ${yesNo(change.dayBeforeEnabled)}`,
      `Same day: ${yesNo(settings.sameDayEnabled)} → ${yesNo(change.sameDayEnabled)}`,
      "Applies to reminders not yet sent; reminders already sent are unchanged.",
    ]
  } else {
    const store = await getStoreOrderVisibility(ctx.db, input)
    if (!store)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this business.",
      })
    current = store
    unchanged = store.salesRepOrderVisibility === change.visibility
    const label = (value: string) =>
      value === "ALL_STORE_ORDERS"
        ? "all orders in this Store"
        : "only orders they created"
    lines = [
      `${storeName} · what sales reps can see`,
      `Sales reps (Cashier/Operator) see: ${label(store.salesRepOrderVisibility)} → ${label(change.visibility)}`,
      "Owners, Admins and Managers are not affected. Orders and payments stay unchanged.",
    ]
  }
  if (unchanged)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This setting is already saved.",
    })
  if (payload.reason) lines.push(`Reason: ${payload.reason}`)
  return {
    scope,
    lines,
    target: {
      id: scope.storeId,
      revision: proposalDigest({ section: change.section, current }),
    },
  }
}

export const storeSettingsUpdate: GeneralActionAdapter<Action> = {
  async validate(ctx, payload) {
    return (await settingsTarget(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { lines, target } = await settingsTarget(ctx, payload)
    return { lines, target }
  },
  stale: "This setting changed. Edit and review the current value again.",
  unavailable: "This setting is unavailable or already saved.",
  async execute(ctx, payload) {
    const { scope } = await settingsTarget(ctx, payload)
    const { change } = payload
    const input = { tenantId: scope.tenantId, storeId: scope.storeId }
    try {
      if (change.section === "receipts")
        await saveOrderReceiptSettings(ctx.db, {
          ...input,
          scope: change.scope,
          settings: change.settings,
        })
      else if (change.section === "reminders") {
        const saved = await updateCommercialOrderReminderSettings(ctx.db, {
          ...input,
          actorUserId: scope.userId,
          enabled: change.enabled,
          dayBeforeEnabled: change.dayBeforeEnabled,
          sameDayEnabled: change.sameDayEnabled,
        })
        if (!saved)
          throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
      } else {
        const saved = await updateStoreOrderVisibility(ctx.db, {
          ...input,
          userId: scope.userId,
          visibility: change.visibility,
        })
        if (!saved)
          throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
      }
    } catch (error) {
      if (error instanceof CatalogError)
        throw new TRPCError({ code: "CONFLICT", message: error.message })
      throw error
    }
    return {
      kind: storeSettingsReceiptKind(change.section),
      recordId: scope.storeId,
      title: "Store setting saved",
      detail: `${ctx.tenantContext.activeStore?.name ?? "This Store"} · ${storeSettingsSummary(payload)}`,
    }
  },
}
