"use client"
import {
  type GeneralAnswer,
  type GeneralMoneyAccounts,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { Button, cn } from "@ewatrade/ui"
import { ORDER_PAYMENT_METHOD_LABELS } from "@ewatrade/utils/finance-payment-methods"
import {
  ArrowRight01Icon,
  BankIcon,
  Cash01Icon,
  CreditCardPosIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

type Row = GeneralMoneyAccounts["rows"][number]

const kinds = {
  cash: { label: "Cash", icon: Cash01Icon },
  bank: { label: "Bank", icon: BankIcon },
  settlement: { label: "Settlement", icon: CreditCardPosIcon },
} satisfies Record<Row["kind"], { label: string; icon: unknown }>

/** Accepted methods only when they differ from what the kind usually takes. */
function methodsLine(row: Row) {
  if (row.defaultMethods || !row.methods.length) return null
  return row.methods
    .map((method) => ORDER_PAYMENT_METHOD_LABELS[method])
    .join(", ")
}

function Balance({
  minor,
  currencyCode,
}: {
  minor: string | undefined
  currencyCode: string
}) {
  // A row the read did not price says so; never a made-up zero.
  if (minor === undefined)
    return <span className="text-sm text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        minor.startsWith("-") && "text-destructive",
      )}
    >
      {generalMoney(minor, currencyCode)}
    </span>
  )
}

/**
 * A money accounts read as a short list: name and kind per row, unusual
 * payment methods and pauses only. A balances read puts each recorded
 * balance on the right and the kind under the name. Where it came from
 * sits under Details.
 */
export function GeneralMoneyAccountsAnswer({
  answer,
  accounts,
  asOf,
}: {
  answer: GeneralAnswer
  accounts: GeneralMoneyAccounts
  /** Locale time once hydrated; ISO before, so markup matches the server. */
  asOf: string
}) {
  const balances = accounts.rows.some((row) => row.balanceMinor !== undefined)
  const currencyCode = accounts.currencyCode ?? ""
  return (
    <section
      aria-label={answer.title}
      className="min-w-0 rounded-lg border px-4 py-3 [overflow-wrap:anywhere]"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{answer.title}</h3>
        <Button
          size="sm"
          variant="ghost"
          className="-mr-2"
          render={<Link href="/finance/accounts" />}
        >
          Open accounts
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Button>
      </div>
      {accounts.rows.length ? (
        <ul className="mt-1 divide-y">
          {accounts.rows.map((row, index) => {
            const kind = kinds[row.kind]
            const methods = methodsLine(row)
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat across kinds
                key={index}
                className="flex min-h-11 items-center gap-3 py-1.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={kind.icon} className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  {balances || methods ? (
                    <p className="text-xs text-muted-foreground">
                      {[
                        balances ? kind.label : null,
                        methods && `Takes ${methods}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                {row.paused ? (
                  <span className="shrink-0 rounded-full border border-amber-300 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-800 dark:text-amber-400">
                    Paused
                  </span>
                ) : null}
                {balances ? (
                  <span className="shrink-0 text-right">
                    <Balance
                      minor={row.balanceMinor}
                      currencyCode={currencyCode}
                    />
                  </span>
                ) : (
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {kind.label}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          No money accounts yet.
        </p>
      )}
      {accounts.more ? (
        <p className="mt-1 text-xs text-muted-foreground">
          More accounts in Money accounts.
        </p>
      ) : null}
      <details className="group mt-2 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer list-none rounded-md py-0.5 hover:text-foreground [&::-webkit-details-marker]:hidden">
          Details
        </summary>
        <div className="mt-1 space-y-0.5">
          <p>
            {answer.scope} · as of <time dateTime={answer.asOf}>{asOf}</time>
          </p>
          <p>
            {balances
              ? "Recorded in your books, not checked against the bank or a cash count."
              : "Names and payment methods only. Balances aren't checked here."}
          </p>
        </div>
      </details>
    </section>
  )
}
