export const CUSTOMER_SHEET_PRESENT_DELAY_MS = 120

export type SaleCustomerDraft = {
  email: string
  name: string
  phone: string
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
