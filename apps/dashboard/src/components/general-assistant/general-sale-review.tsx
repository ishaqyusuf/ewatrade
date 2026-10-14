"use client"
import {
  type SimpleSale,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { Button, cn } from "@ewatrade/ui"
import type { ReactNode } from "react"
import { GeneralChatPhotoThumb } from "./general-chat-photo"

type SaleChoice = { label: string; text: string }

/** The review reply that reopens the customer question. */
export const SALE_CHANGE_CUSTOMER = "Change customer"

function saleCustomer(sale: SimpleSale) {
  if (sale.customerChoice === "walk_in" || !sale.customerName)
    return { name: "Walk-in", note: null }
  return {
    name: sale.customerName,
    note: sale.customerChoice === "new" && !sale.customerId ? "New" : null,
  }
}

function saleAccount(sale: SimpleSale) {
  if (!sale.accountName) return null
  return {
    name: sale.accountName,
    note: sale.createAccount && !sale.moneyAccountId ? "New account" : null,
  }
}

function Row({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-7 items-center justify-between gap-4",
        className,
      )}
    >
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right">
        {children}
      </dd>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

/**
 * A quick sale at review: the amount leads, then where it went and who paid.
 * Built from the draft itself, so nothing reads "Pending" and no ids show.
 */
export function GeneralSaleReview({
  sale,
  currencyCode,
  choices,
  disabled,
  onChoice,
}: {
  sale: SimpleSale
  currencyCode: string
  /** Server choices for this revision; only offered while the draft is open. */
  choices?: SaleChoice[]
  disabled: boolean
  onChoice?: (choice: SaleChoice) => void
}) {
  const account = saleAccount(sale)
  const customer = saleCustomer(sale)
  const photo = sale.attachmentIds[0]
  const total =
    sale.totalMinor ?? (!sale.partial ? sale.receivedMinor : undefined)
  const balance =
    sale.partial && total !== undefined && sale.receivedMinor !== undefined
      ? total - sale.receivedMinor
      : null
  const changeCustomer = choices?.find(
    (choice) => choice.text === SALE_CHANGE_CUSTOMER,
  )
  const more = choices?.filter((choice) => choice !== changeCustomer) ?? []
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {balance ? "Part payment received" : "Amount received"}
          </p>
          <p className="text-2xl leading-tight font-semibold tabular-nums">
            {sale.receivedMinor === undefined
              ? "—"
              : generalMoney(sale.receivedMinor, currencyCode)}
          </p>
        </div>
        {photo ? (
          <GeneralChatPhotoThumb attachmentId={photo} className="size-12" />
        ) : null}
      </div>
      <dl className="divide-y border-t text-sm">
        {account ? (
          <Row label="Paid into">
            <span className="truncate font-medium">{account.name}</span>
            {account.note ? <Note>{account.note}</Note> : null}
          </Row>
        ) : null}
        <Row label="Customer">
          <span className="truncate font-medium">{customer.name}</span>
          {customer.note ? <Note>{customer.note}</Note> : null}
          {changeCustomer && onChoice ? (
            <Button
              size="sm"
              variant="link"
              className="h-auto px-0 text-xs"
              disabled={disabled}
              onClick={() => onChoice(changeCustomer)}
            >
              Change
            </Button>
          ) : null}
        </Row>
        {balance !== null && total !== undefined ? (
          <>
            <Row label="Sale total">
              <span className="tabular-nums">
                {generalMoney(total, currencyCode)}
              </span>
            </Row>
            <Row label="Balance due">
              <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {generalMoney(balance, currencyCode)}
              </span>
            </Row>
          </>
        ) : null}
      </dl>
      {sale.description ? (
        <p className="text-sm text-muted-foreground">{sale.description}</p>
      ) : null}
      {more.length && onChoice ? (
        <div className="flex flex-wrap gap-2">
          {more.map((choice) => (
            <Button
              key={choice.text}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onChoice(choice)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
