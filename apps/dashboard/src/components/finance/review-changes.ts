"use client"
import { useTRPC } from "@/trpc/client"
import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { FinanceChange } from "./form-fields"

export type MoneyBalance = { name: string; balanceMinor: bigint }

/** Current money-account balances, for "What changes" in a review. */
export function useMoneyBalances(bookId: string) {
  const trpc = useTRPC()
  const balances = useQuery(trpc.finance.balances.queryOptions({ bookId }))
  return useMemo(() => {
    const map = new Map<string, MoneyBalance>()
    for (const account of balances.data?.accounts ?? [])
      map.set(account.id, {
        name: account.name,
        balanceMinor: BigInt(account.balanceMinor),
      })
    return map
  }, [balances.data])
}

/** A money account's balance before → after; null when it isn't loaded. */
export function balanceChange(
  balances: Map<string, MoneyBalance>,
  accountId: string | undefined,
  deltaMinor: bigint,
  currency: string,
): FinanceChange | null {
  const account = accountId ? balances.get(accountId) : undefined
  if (!account) return null
  return {
    label: account.name,
    before: formatFinanceMoney(account.balanceMinor.toString(), currency),
    after: formatFinanceMoney(
      (account.balanceMinor + deltaMinor).toString(),
      currency,
    ),
    tone:
      deltaMinor < BigInt(0)
        ? "out"
        : deltaMinor > BigInt(0)
          ? "in"
          : undefined,
  }
}

/** A warning when a payment would take an account below zero. */
export function overdrawWarning(
  balances: Map<string, MoneyBalance>,
  accountId: string | undefined,
  amountMinor: bigint,
  currency: string,
) {
  const account = accountId ? balances.get(accountId) : undefined
  if (!account || amountMinor <= account.balanceMinor) return undefined
  return `${account.name} only has ${formatFinanceMoney(account.balanceMinor.toString(), currency)} recorded, so it will go below zero. Check you picked the right account.`
}

export function changes(
  items: Array<FinanceChange | null | undefined | false>,
) {
  return items.filter((item): item is FinanceChange => Boolean(item))
}

/** "19 Oct 2026" for a YYYY-MM-DD day. */
export function plainDay(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!match) return day
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`
}

/** A moment's day in the book's time zone, as YYYY-MM-DD. */
export function dayIn(at: Date | string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at))
}

/** Today's day in the book's time zone, as YYYY-MM-DD. */
export function todayIn(timeZone?: string) {
  return dayIn(new Date(), timeZone)
}

/** "Paid from" choices: each money account with its balance, then the owner's own money. */
export function paidFromOptions(
  accounts: { id: string; name: string }[],
  balances: Map<string, MoneyBalance>,
  currency: string,
  withOwner = true,
) {
  return [
    ...accounts.map((account) => {
      const balance = balances.get(account.id)
      return {
        value: account.id,
        label: balance
          ? `${account.name} · ${formatFinanceMoney(balance.balanceMinor.toString(), currency)}`
          : account.name,
      }
    }),
    ...(withOwner
      ? [
          {
            value: "OWNER_CAPITAL",
            label: "Owner's own money (they put it in)",
          },
        ]
      : []),
  ]
}

/** Active cash, bank and clearing accounts of a book. */
export function moneyAccounts<
  T extends { purpose: string; archivedAt: Date | string | null },
>(accounts: T[]) {
  return accounts.filter(
    (account) =>
      ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
      !account.archivedAt,
  )
}

export function minorOf(value: string) {
  return BigInt(parseFinanceMoney(value))
}

export function moneyText(minor: bigint | string, currency: string) {
  return formatFinanceMoney(minor.toString(), currency)
}

/** A minor-unit amount as money-input text, e.g. 38000000 → "380000.00". */
export function amountInput(minor: bigint | string) {
  const value = BigInt(minor)
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`
}
