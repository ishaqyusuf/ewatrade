import { z } from "zod"

/**
 * G05: one reviewed change to the current Store's settings. Receipts can
 * change the business defaults or this Store's own override (null removes the
 * override); reminders and sales-rep order visibility are per Store.
 */
const receiptSettings = z
  .object({
    showCustomerName: z.boolean(),
    showPaymentBreakdown: z.boolean(),
    thankYouNote: z.string().trim().max(300),
  })
  .strict()
export const storeSettingsUpdateAction = z
  .object({
    action: z.literal("store_settings_update"),
    change: z.discriminatedUnion("section", [
      z
        .object({
          section: z.literal("receipts"),
          scope: z.enum(["business", "store"]),
          settings: receiptSettings.nullable(),
        })
        .strict()
        .refine(
          (value) => value.scope === "store" || value.settings !== null,
          "Business receipt defaults can be changed but not removed.",
        ),
      z
        .object({
          section: z.literal("reminders"),
          enabled: z.boolean(),
          dayBeforeEnabled: z.boolean(),
          sameDayEnabled: z.boolean(),
        })
        .strict(),
      z
        .object({
          section: z.literal("order_visibility"),
          visibility: z.enum(["OWN_SALES", "ALL_STORE_ORDERS"]),
        })
        .strict(),
    ]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
export type StoreSettingsUpdateAction = z.infer<
  typeof storeSettingsUpdateAction
>

/** Each section opens its own native screen, so receipts name the section. */
export const storeSettingsReceiptKinds = [
  "store_receipt_settings",
  "store_reminder_settings",
  "store_order_visibility",
] as const
export function storeSettingsReceiptKind(
  section: StoreSettingsUpdateAction["change"]["section"],
) {
  return section === "receipts"
    ? "store_receipt_settings"
    : section === "reminders"
      ? "store_reminder_settings"
      : "store_order_visibility"
}

const yesNo = (value: boolean) => (value ? "yes" : "no")
export function storeSettingsSummary(action: StoreSettingsUpdateAction) {
  const { change } = action
  if (change.section === "receipts")
    return change.settings
      ? `Receipts (${change.scope === "business" ? "business defaults" : "this Store only"}): customer name ${yesNo(change.settings.showCustomerName)}, payment breakdown ${yesNo(change.settings.showPaymentBreakdown)}, note "${change.settings.thankYouNote}"`
      : "Receipts: remove this Store's own settings and use the business defaults"
  if (change.section === "reminders")
    return change.enabled
      ? `Order reminders on · day before ${yesNo(change.dayBeforeEnabled)} · same day ${yesNo(change.sameDayEnabled)}`
      : "Order reminders off for this Store"
  return change.visibility === "ALL_STORE_ORDERS"
    ? "Sales reps see all orders in this Store"
    : "Sales reps see only orders they created"
}
