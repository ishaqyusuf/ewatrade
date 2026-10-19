import {
  ORDER_PAYMENT_METHODS,
  moneyAccountCanTake,
} from "@ewatrade/utils/finance-payment-methods"
import { z } from "zod"
import {
  type OfflineCommandScope,
  offlineCommandScope,
  ownsOfflineCommand,
} from "./offline-command-scope"

const identifier = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value)
const currency = z.string().regex(/^[A-Z]{3}$/)
const paymentAccounts = z
  .object({
    book: z
      .object({ id: identifier, currencyCode: currency })
      .strict()
      .nullable(),
    accounts: z
      .array(
        z
          .object({
            id: identifier.max(128),
            name: z.string().min(1).max(200),
            purpose: z.enum(["CASH", "BANK", "CLEARING"]),
            paymentMethods: z.array(z.enum(ORDER_PAYMENT_METHODS)).max(5),
            paused: z.boolean(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
const scopeSchema = z
  .object({
    actorUserId: identifier,
    businessId: identifier,
    storeId: identifier,
    currencyCode: currency,
  })
  .strict()
const snapshotSchema = z
  .object({
    scope: scopeSchema,
    checkedAt: z.number().finite().nonnegative(),
    data: paymentAccounts,
  })
  .strict()

export type CheckoutAccountScope = OfflineCommandScope & {
  currencyCode: string
}
export type CheckoutPaymentAccounts = z.infer<typeof paymentAccounts>
export type CheckoutAccountSnapshot = z.infer<typeof snapshotSchema>
export type CheckoutAccountReadTicket = {
  scope: CheckoutAccountScope
  generation: number
}

export function checkoutAccountScope(
  profile: Parameters<typeof offlineCommandScope>[0],
  currencyCode: string,
): CheckoutAccountScope | null {
  const scope = offlineCommandScope(profile)
  if (!scope || !currency.safeParse(currencyCode).success) return null
  return { ...scope, currencyCode }
}

export function checkoutAccountScopeKey(scope: CheckoutAccountScope) {
  return JSON.stringify([
    scope.actorUserId,
    scope.businessId,
    scope.storeId,
    scope.currencyCode,
  ])
}

export function checkoutAccountTicketCurrent(
  ticket: CheckoutAccountReadTicket,
  currentScope: CheckoutAccountScope | null,
  generation: number,
) {
  return (
    Number.isSafeInteger(ticket.generation) &&
    ticket.generation === generation &&
    ownsOfflineCommand(ticket.scope, currentScope) &&
    ticket.scope.currencyCode === currentScope?.currencyCode
  )
}

/** Accept only the dedicated, balance-free read; never persist arbitrary Finance data. */
export function parseCheckoutAccountSnapshot(
  value: unknown,
): CheckoutAccountSnapshot | null {
  const parsed = snapshotSchema.safeParse(value)
  if (!parsed.success) return null
  const snapshot = parsed.data
  if (
    (!snapshot.data.book && snapshot.data.accounts.length) ||
    (snapshot.data.book &&
      snapshot.data.book.currencyCode !== snapshot.scope.currencyCode)
  )
    return null
  if (
    new Set(snapshot.data.accounts.map((account) => account.id)).size !==
    snapshot.data.accounts.length
  )
    return null
  if (
    snapshot.data.accounts.some(
      (account) =>
        new Set(account.paymentMethods).size !==
          account.paymentMethods.length ||
        account.paymentMethods.some(
          (method) => !moneyAccountCanTake(account.purpose, method),
        ),
    )
  )
    return null
  return snapshot
}

export function eligibleCheckoutPaymentAccounts(
  data: CheckoutPaymentAccounts,
  method: (typeof ORDER_PAYMENT_METHODS)[number],
) {
  return data.accounts.filter(
    (account) => !account.paused && account.paymentMethods.includes(method),
  )
}
