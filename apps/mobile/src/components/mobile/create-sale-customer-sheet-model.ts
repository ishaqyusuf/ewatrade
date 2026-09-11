export const COMPACT_CUSTOMER_SHEET_HEIGHT_RATIO = 0.44
// Content-sized while closed; keyboardBehavior fills the parent only for input.
export const CREATE_CUSTOMER_SHEET_SNAP_POINTS = [] as const
export const CUSTOMER_SHEET_PRESENT_DELAY_MS = 120

export type SaleCustomerDraft = {
  email: string
  name: string
  phone: string
}

export function getCreateCustomerSheetMaxHeight(viewportHeight: number) {
  return Math.round(viewportHeight * COMPACT_CUSTOMER_SHEET_HEIGHT_RATIO)
}

export function hasCreateCustomerDraft({
  email,
  name,
  phone,
}: SaleCustomerDraft) {
  return [email, name, phone].some((value) => value.trim().length > 0)
}

export function isCreateCustomerSaveDisabled({
  disabled,
  name,
}: {
  disabled: boolean
  name: string
}) {
  return disabled || name.trim().length === 0
}
