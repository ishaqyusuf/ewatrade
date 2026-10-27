import {
  type CheckoutAccountChoice,
  type CheckoutAccountRead,
  type CheckoutAccountState,
  type CheckoutMoneyAccount,
  checkoutAccountForSubmit,
  resolveCheckoutAccount,
} from "@/components/mobile/create-sale/checkout-money-account-model"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

/**
 * Where money received on an existing Order lands, chosen like checkout's
 * Into row. With no Finance book yet there is nothing to choose and the
 * payment records as before; the server rechecks every choice.
 */
export function useOrderPaymentAccount({
  enabled,
  owner,
  currencyCode,
  method,
  receivedMinor,
}: {
  /** Online, with money due; skips the lookup otherwise. */
  enabled: boolean
  /** The Order or Job being paid; a choice never carries to another one. */
  owner: string
  currencyCode: string
  method: string
  receivedMinor: number
}) {
  const trpc = useTRPC()
  const [choice, setChoice] = useState<CheckoutAccountChoice | null>(null)
  const accounts = useQuery({
    ...trpc.orders.paymentAccounts.queryOptions(),
    enabled,
    refetchOnMount: "always",
    retry: false,
  })
  const code = (accounts.error as { data?: { code?: string } } | null)?.data
    ?.code
  const read: CheckoutAccountRead = accounts.isError
    ? {
        status:
          code === "FORBIDDEN" || code === "UNAUTHORIZED" ? "denied" : "error",
      }
    : !accounts.data || accounts.isFetching
      ? { status: "loading" }
      : accounts.data.book && accounts.data.book.currencyCode !== currencyCode
        ? { status: "error" }
        : {
            status: "ready",
            book: accounts.data.book,
            accounts: accounts.data.accounts,
          }
  const state: CheckoutAccountState =
    !enabled || (read.status === "ready" && !read.book)
      ? { kind: "not_needed" }
      : resolveCheckoutAccount({
          receivedMinor,
          method,
          offline: false,
          read,
          owner,
          choice,
        })
  return {
    state,
    list: read.status === "ready" ? read.accounts : [],
    retry: () => void accounts.refetch(),
    /** False while money is received but no account is settled yet. */
    ready: checkoutAccountForSubmit(state).ok,
    chosen: state.kind === "selected" ? state.account : null,
    choose: (account: CheckoutMoneyAccount) =>
      setChoice({ owner, id: account.id, name: account.name }),
  }
}
