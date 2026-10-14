import {
  DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS,
  type MoneyAccountPurpose,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_LABELS,
  type OrderPaymentMethod,
} from "@ewatrade/utils/finance-payment-methods"
import { z } from "zod"

/** Plain kinds the owner recognises; CLEARING reads as settlement. */
const kinds = { CASH: "cash", BANK: "bank", CLEARING: "settlement" } as const

/**
 * Money accounts as rows: names, kinds and accepted methods only. A page of
 * identities from readMoneyAccounts; never balances or payout state.
 */
export const generalMoneyAccountsSchema = z
  .object({
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    rows: z
      .array(
        z
          .object({
            name: z.string().max(160),
            balanceMinor: z
              .string()
              .regex(/^-?\d{1,20}$/)
              .optional(),
            kind: z.enum(["cash", "bank", "settlement"]),
            methods: z.array(z.enum(ORDER_PAYMENT_METHODS)).max(5),
            /** True when the account's methods are its kind's defaults. */
            defaultMethods: z.boolean(),
            paused: z.boolean(),
          })
          .strict(),
      )
      .max(10),
    /** More accounts exist after this page; the total is unknown. */
    more: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.rows.some((row) => row.balanceMinor !== undefined) &&
      !value.currencyCode
    )
      ctx.addIssue({
        code: "custom",
        path: ["currencyCode"],
        message: "Balance rows require the Book currency.",
      })
  })
export type GeneralMoneyAccounts = z.infer<typeof generalMoneyAccountsSchema>

const sameMethods = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((method) => b.includes(method))

/** The readMoneyAccounts page as an answer; rows come from the read, not text. */
export function generalMoneyAccountsAnswer(page: {
  book: { currencyCode: string }
  accounts: {
    name: string
    purpose: string
    paymentMethods: OrderPaymentMethod[]
    availableForPayments: boolean
  }[]
  nextCursor: string | null
}) {
  const rows = page.accounts.slice(0, 10).flatMap((account) => {
    const purpose = account.purpose as MoneyAccountPurpose
    const kind = kinds[purpose]
    if (!kind) return []
    return [
      {
        name: account.name,
        kind,
        methods: account.paymentMethods,
        defaultMethods: sameMethods(
          account.paymentMethods,
          DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS[purpose],
        ),
        paused: !account.availableForPayments,
      },
    ]
  })
  const count = `${rows.length} account${rows.length === 1 ? "" : "s"}`
  return {
    id: `money_accounts_${crypto.randomUUID()}`,
    title: "Money accounts",
    value: page.nextCursor ? `${count} shown` : count,
    scope: `Finance Book · ${page.book.currencyCode}`,
    asOf: new Date().toISOString(),
    // Plain fallback for clients without the rows view; never parsed back.
    detail: `${
      rows
        .map(
          (row) =>
            `${row.name} (${row.kind}${row.defaultMethods ? "" : `; ${row.methods.map((method) => ORDER_PAYMENT_METHOD_LABELS[method]).join(", ")}`}${row.paused ? "; paused" : ""})`,
        )
        .join(", ") || "No money accounts yet."
    }${page.nextCursor ? " More accounts not shown." : ""} Names only; balances aren't checked here.`.slice(
      0,
      1000,
    ),
    accounts: { rows, more: !!page.nextCursor },
  }
}
