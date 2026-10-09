import {
  type SetupMoneyAccountPayload,
  setupMoneyAccountPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import { majorToMinor } from "@ewatrade/utils/currency"

export function setupMoneyEdit(fields: {
  name: string
  purpose: "CASH" | "BANK"
  bankName: string
  balance: string
}): SetupMoneyAccountPayload | null {
  const balance = fields.balance.trim()
  // Do not silently round a fractional cent or strip an invalid character.
  if (
    balance &&
    !/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?|\.\d{1,2})$/.test(balance)
  )
    return null
  const amount = balance ? majorToMinor(balance) : undefined
  if (amount === null) return null
  const parsed = setupMoneyAccountPayloadSchema.safeParse({
    kind: "money_account",
    name: fields.name,
    purpose: fields.purpose,
    bankName:
      fields.purpose === "BANK"
        ? fields.bankName.trim() || undefined
        : undefined,
    openingBalanceMinor: amount,
  })
  return parsed.success ? parsed.data : null
}
