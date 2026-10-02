import { resolveNextFinanceFiscalPeriod } from "./fiscal-calendar"
import {
  FINANCE_FISCAL_CLOSE_SOURCE,
  FINANCE_FISCAL_MAX_ACCOUNTS,
  FINANCE_FISCAL_MAX_JOURNALS,
  FINANCE_FISCAL_MAX_JOURNAL_LINES,
  FINANCE_FISCAL_REVERSE_SOURCE,
} from "./fiscal-limits"
import { FinanceError, MAX_FINANCE_AMOUNT } from "./rules"

const MAX_SEQUENCE = BigInt("9223372036854775807")
const MAX_ACCOUNT_BALANCE =
  MAX_FINANCE_AMOUNT * MAX_SEQUENCE * BigInt(FINANCE_FISCAL_MAX_JOURNAL_LINES)

type Account = {
  id: string
  bookId: string
  kind: string
  purpose: string
}

type FiscalBalance = {
  accountId: string
  closingDebitMinor: string
  closingCreditMinor: string
}

type FiscalJournal = {
  id: string
  bookId: string
  sequence: bigint
  sourceKind: string
  reversalOfId: string | null
  effectiveAt: Date
  lines: Array<{
    accountId: string
    bookId: string
    debitMinor: bigint
    creditMinor: bigint
    account: Account
  }>
}

type FiscalJournalLink = {
  bookId: string
  eventId: string
  position: number
  journalEntry: FiscalJournal
}

type FiscalEventReference = {
  id: string
  bookId: string
  fiscalYearId: string
  kind: string
  retainedEarningsAccountId: string
  accountBalances: unknown
  earningsMinor: string
  snapshotSequence: bigint
  resultingSequence: bigint
  effectiveAt: Date
  journals: FiscalJournalLink[]
}

export type FinanceFiscalReportCalendar = {
  id: string
  bookId: string
  startMonth: number
  startDay: number
  revision: number
  retainedEarningsAccountId: string
}

export type FinanceFiscalReportEvent = {
  id: string
  bookId: string
  fiscalYearId: string
  kind: string
  snapshotSequence: bigint
  resultingSequence: bigint
  effectiveAt: Date
  recordedAt: Date
  retainedEarningsAccountId: string
  accountBalances: unknown
  earningsMinor: string
  reversalOfId: string | null
  fiscalYear: {
    id: string
    bookId: string
    calendarId: string
    calendarRevision: number
    startMonth: number
    startDay: number
    startsAt: Date
    endsAt: Date
    firstPeriodStub: boolean
    calendar: {
      id: string
      bookId: string
      startMonth: number
      startDay: number
      revision: number
      retainedEarningsAccountId: string
    }
  }
  retainedEarningsAccount: Account
  reversalOf: FiscalEventReference | null
  journals: FiscalJournalLink[]
}

export type FinanceFiscalReportTaggedEntry = {
  id: string
  bookId: string
  sequence: bigint
  sourceKind: string
  effectiveAt: Date
  fiscalCloseJournal: {
    bookId: string
    eventId: string
    position: number
  } | null
}

function inconsistent(): never {
  throw new FinanceError(
    "CONFLICT",
    "Fiscal close history is inconsistent; the report cannot safely exclude fiscal journals.",
  )
}

function unsignedMinor(value: unknown): bigint {
  if (
    typeof value !== "string" ||
    value.length > 38 ||
    !/^(0|[1-9]\d*)$/.test(value)
  )
    return inconsistent()
  const amount = BigInt(value)
  if (amount > MAX_ACCOUNT_BALANCE) return inconsistent()
  return amount
}

function signedMinor(value: unknown): bigint {
  if (
    typeof value !== "string" ||
    value.length > 39 ||
    !/^(0|-?[1-9]\d*)$/.test(value)
  )
    return inconsistent()
  const amount = BigInt(value)
  if (amount > MAX_ACCOUNT_BALANCE || amount < -MAX_ACCOUNT_BALANCE)
    return inconsistent()
  return amount
}

function parseBalances(value: unknown, accounts: Map<string, Account>) {
  if (!Array.isArray(value) || value.length > FINANCE_FISCAL_MAX_ACCOUNTS)
    return inconsistent()
  const balances = new Map<string, { debit: bigint; credit: bigint }>()
  let previousAccountId = ""
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return inconsistent()
    const item = candidate as Partial<FiscalBalance>
    const account =
      typeof item.accountId === "string"
        ? accounts.get(item.accountId)
        : undefined
    if (
      !account ||
      (account.kind !== "INCOME" && account.kind !== "EXPENSE") ||
      account.id <= previousAccountId
    )
      return inconsistent()
    previousAccountId = account.id
    const debit = unsignedMinor(item.closingDebitMinor)
    const credit = unsignedMinor(item.closingCreditMinor)
    if (debit !== BigInt(0) && credit !== BigInt(0)) return inconsistent()
    balances.set(account.id, { debit, credit })
  }
  return balances
}

function earningsFromBalances(
  balances: Map<string, { debit: bigint; credit: bigint }>,
  accounts: Map<string, Account>,
) {
  let earnings = BigInt(0)
  for (const [accountId, balance] of balances) {
    if (!accounts.has(accountId)) return inconsistent()
    const netDebit = balance.debit - balance.credit
    earnings -= netDebit
  }
  // The stored account net is debit-minus-credit. Both temporary account kinds
  // contribute the negative of that net to earnings: income is credit-normal,
  // while an expense debit reduces earnings.
  return earnings
}

function sameBalances(
  left: Map<string, { debit: bigint; credit: bigint }>,
  right: Map<string, { debit: bigint; credit: bigint }>,
) {
  if (left.size !== right.size) return false
  for (const [accountId, balance] of left) {
    const other = right.get(accountId)
    if (
      !other ||
      balance.debit !== other.debit ||
      balance.credit !== other.credit
    )
      return false
  }
  return true
}

/**
 * Validate persisted fiscal close journals before historical P&L excludes them.
 * Only complete linked CLOSE/REVERSE batches are eligible for exclusion.
 */
export function getFinanceFiscalPnlExclusions(input: {
  bookId: string
  bookStartsAt: Date
  calendar: FinanceFiscalReportCalendar | null
  snapshotSequence: bigint
  accounts: Account[]
  events: FinanceFiscalReportEvent[]
  taggedEntries: FinanceFiscalReportTaggedEntry[]
}) {
  const accountById = new Map(
    input.accounts.map((account) => [account.id, account]),
  )
  const eventById = new Map(input.events.map((event) => [event.id, event]))
  if (eventById.size !== input.events.length) return inconsistent()

  const relevantEvents = new Map<string, FinanceFiscalReportEvent>()
  for (const event of input.events) relevantEvents.set(event.id, event)
  const tagsById = new Map<string, FinanceFiscalReportTaggedEntry>()
  for (const entry of input.taggedEntries) {
    if (
      entry.bookId !== input.bookId ||
      entry.sequence > input.snapshotSequence ||
      (entry.sourceKind !== FINANCE_FISCAL_CLOSE_SOURCE &&
        entry.sourceKind !== FINANCE_FISCAL_REVERSE_SOURCE) ||
      tagsById.has(entry.id)
    )
      return inconsistent()
    tagsById.set(entry.id, entry)
    if (!entry.fiscalCloseJournal) return inconsistent()
    const event = eventById.get(entry.fiscalCloseJournal.eventId)
    if (!event) return inconsistent()
    relevantEvents.set(event.id, event)
  }

  const excludedJournalEntryIds = new Set<string>()
  const orderedEvents = [...relevantEvents.values()].sort((a, b) =>
    a.id === b.reversalOfId
      ? -1
      : b.id === a.reversalOfId
        ? 1
        : a.resultingSequence < b.resultingSequence
          ? -1
          : a.resultingSequence > b.resultingSequence
            ? 1
            : a.recordedAt.getTime() - b.recordedAt.getTime() ||
              a.id.localeCompare(b.id),
  )
  const validatedCloseEventIds = new Set<string>()
  let previousResult = BigInt(0)
  for (const event of orderedEvents) {
    if (event.resultingSequence > input.snapshotSequence) {
      if (
        event.snapshotSequence < input.snapshotSequence &&
        input.snapshotSequence < event.resultingSequence
      )
        return inconsistent()
      // A report pinned before the first journal of a later batch sees the
      // pre-close state. There are no eligible journal rows to exclude yet.
      continue
    }
    if (
      event.bookId !== input.bookId ||
      event.fiscalYear.bookId !== input.bookId ||
      event.fiscalYear.id !== event.fiscalYearId ||
      !input.calendar ||
      input.calendar.bookId !== input.bookId ||
      event.fiscalYear.calendarId !== input.calendar.id ||
      event.fiscalYear.calendarRevision !== input.calendar.revision ||
      event.fiscalYear.calendar.id !== input.calendar.id ||
      event.fiscalYear.calendar.bookId !== input.bookId ||
      event.fiscalYear.calendar.startMonth !== input.calendar.startMonth ||
      event.fiscalYear.calendar.startDay !== input.calendar.startDay ||
      event.fiscalYear.calendar.revision !== input.calendar.revision ||
      event.fiscalYear.startMonth !== input.calendar.startMonth ||
      event.fiscalYear.startDay !== input.calendar.startDay ||
      input.calendar.retainedEarningsAccountId !==
        event.retainedEarningsAccountId ||
      event.retainedEarningsAccount.bookId !== input.bookId ||
      event.retainedEarningsAccount.id !== event.retainedEarningsAccountId ||
      event.retainedEarningsAccount.kind !== "EQUITY" ||
      event.retainedEarningsAccount.purpose !== "RETAINED_EARNINGS" ||
      !Number.isFinite(event.fiscalYear.startsAt.getTime()) ||
      !Number.isFinite(event.fiscalYear.endsAt.getTime()) ||
      event.fiscalYear.startsAt > event.fiscalYear.endsAt ||
      !Number.isFinite(event.effectiveAt.getTime()) ||
      event.effectiveAt.getTime() !== event.fiscalYear.endsAt.getTime() ||
      event.snapshotSequence < previousResult ||
      event.snapshotSequence < BigInt(0) ||
      event.resultingSequence < event.snapshotSequence ||
      event.resultingSequence > input.snapshotSequence
    )
      return inconsistent()
    let expectedPeriod: ReturnType<typeof resolveNextFinanceFiscalPeriod>
    try {
      const firstYear =
        event.fiscalYear.startsAt.getTime() === input.bookStartsAt.getTime()
      expectedPeriod = resolveNextFinanceFiscalPeriod({
        startMonth: input.calendar.startMonth,
        startDay: input.calendar.startDay,
        bookStartsAt: input.bookStartsAt,
        previousFiscalCloseEnd: firstYear
          ? null
          : new Date(event.fiscalYear.startsAt.getTime() - 1),
        now: new Date(event.fiscalYear.endsAt.getTime() + 1),
      })
    } catch {
      return inconsistent()
    }
    if (
      expectedPeriod.fiscalStart.getTime() !==
        event.fiscalYear.startsAt.getTime() ||
      expectedPeriod.fiscalEnd.getTime() !==
        event.fiscalYear.endsAt.getTime() ||
      expectedPeriod.firstPeriodStub !== event.fiscalYear.firstPeriodStub
    )
      return inconsistent()
    previousResult = event.resultingSequence

    const sourceKind =
      event.kind === "CLOSE"
        ? FINANCE_FISCAL_CLOSE_SOURCE
        : event.kind === "REVERSE"
          ? FINANCE_FISCAL_REVERSE_SOURCE
          : null
    if (!sourceKind) return inconsistent()
    const balances = parseBalances(event.accountBalances, accountById)
    const earnings = signedMinor(event.earningsMinor)
    if (earningsFromBalances(balances, accountById) !== earnings)
      return inconsistent()

    if (event.kind === "CLOSE") {
      if (
        event.reversalOfId !== null ||
        event.reversalOf !== null ||
        event.journals.some((link) => link.journalEntry.reversalOfId !== null)
      )
        return inconsistent()
    } else {
      const original = event.reversalOf
      if (
        !event.reversalOfId ||
        !original ||
        original.id !== event.reversalOfId ||
        original.bookId !== input.bookId ||
        original.fiscalYearId !== event.fiscalYearId ||
        original.kind !== "CLOSE" ||
        original.retainedEarningsAccountId !==
          event.retainedEarningsAccountId ||
        !validatedCloseEventIds.has(original.id) ||
        original.resultingSequence > event.snapshotSequence ||
        original.effectiveAt.getTime() !== event.effectiveAt.getTime() ||
        original.journals.length !== event.journals.length ||
        signedMinor(original.earningsMinor) !== earnings ||
        !sameBalances(
          balances,
          parseBalances(original.accountBalances, accountById),
        )
      )
        return inconsistent()
      for (const [position, link] of event.journals.entries()) {
        const originalLink = original.journals[position]
        if (
          !originalLink ||
          originalLink.position !== position ||
          originalLink.eventId !== original.id ||
          originalLink.bookId !== input.bookId ||
          link.journalEntry.reversalOfId !== originalLink.journalEntry.id
        )
          return inconsistent()
        const inverseLines = new Map<string, number>()
        for (const line of originalLink.journalEntry.lines) {
          const key = `${line.accountId}:${line.creditMinor}:${line.debitMinor}`
          inverseLines.set(key, (inverseLines.get(key) ?? 0) + 1)
        }
        for (const line of link.journalEntry.lines) {
          const key = `${line.accountId}:${line.debitMinor}:${line.creditMinor}`
          const remaining = inverseLines.get(key) ?? 0
          if (remaining === 0) return inconsistent()
          inverseLines.set(key, remaining - 1)
        }
        if ([...inverseLines.values()].some((count) => count !== 0))
          return inconsistent()
      }
    }

    if (event.journals.length > FINANCE_FISCAL_MAX_JOURNALS)
      return inconsistent()
    const hasBalances = [...balances.values()].some(
      (balance) => balance.debit !== BigInt(0) || balance.credit !== BigInt(0),
    )
    if (event.journals.length === 0) {
      if (
        event.snapshotSequence !== event.resultingSequence ||
        hasBalances ||
        earnings !== BigInt(0)
      )
        return inconsistent()
    } else if (
      event.snapshotSequence + BigInt(event.journals.length) !==
      event.resultingSequence
    ) {
      return inconsistent()
    }

    const actualByAccount = new Map<string, bigint>()
    let expectedSequence = event.snapshotSequence
    for (const [position, link] of event.journals.entries()) {
      const journal = link.journalEntry
      if (
        link.bookId !== input.bookId ||
        link.eventId !== event.id ||
        link.position !== position ||
        journal.bookId !== input.bookId ||
        journal.sequence !== expectedSequence + BigInt(1) ||
        journal.sourceKind !== sourceKind ||
        journal.effectiveAt.getTime() !== event.effectiveAt.getTime() ||
        journal.lines.length < 2 ||
        journal.lines.length > FINANCE_FISCAL_MAX_JOURNAL_LINES
      )
        return inconsistent()
      expectedSequence = journal.sequence
      let debit = BigInt(0)
      let credit = BigInt(0)
      for (const line of journal.lines) {
        const account = accountById.get(line.accountId)
        if (
          line.bookId !== input.bookId ||
          !account ||
          line.account.bookId !== input.bookId ||
          line.account.id !== line.accountId ||
          line.debitMinor < BigInt(0) ||
          line.creditMinor < BigInt(0) ||
          line.debitMinor > MAX_FINANCE_AMOUNT ||
          line.creditMinor > MAX_FINANCE_AMOUNT ||
          (line.debitMinor === BigInt(0)) === (line.creditMinor === BigInt(0))
        )
          return inconsistent()
        if (
          account.id !== event.retainedEarningsAccountId &&
          account.kind !== "INCOME" &&
          account.kind !== "EXPENSE"
        )
          return inconsistent()
        if (
          account.id === event.retainedEarningsAccountId &&
          (account.kind !== "EQUITY" || account.purpose !== "RETAINED_EARNINGS")
        )
          return inconsistent()
        debit += line.debitMinor
        credit += line.creditMinor
        actualByAccount.set(
          account.id,
          (actualByAccount.get(account.id) ?? BigInt(0)) +
            line.debitMinor -
            line.creditMinor,
        )
      }
      if (debit !== credit) return inconsistent()
      const tagged = tagsById.get(journal.id)
      if (
        !tagged ||
        tagged.sequence !== journal.sequence ||
        tagged.effectiveAt.getTime() !== journal.effectiveAt.getTime() ||
        tagged.fiscalCloseJournal?.eventId !== event.id ||
        tagged.fiscalCloseJournal.position !== position ||
        tagged.sourceKind !== sourceKind
      )
        return inconsistent()
      excludedJournalEntryIds.add(journal.id)
    }

    if (
      event.journals.length > 0 &&
      expectedSequence !== event.resultingSequence
    )
      return inconsistent()
    const expectedByAccount = new Map<string, bigint>()
    for (const [accountId, balance] of balances) {
      const netDebit = balance.debit - balance.credit
      expectedByAccount.set(
        accountId,
        event.kind === "CLOSE" ? -netDebit : netDebit,
      )
    }
    expectedByAccount.set(
      event.retainedEarningsAccountId,
      event.kind === "CLOSE" ? -earnings : earnings,
    )
    const relevantAccountIds = new Set([
      ...expectedByAccount.keys(),
      ...actualByAccount.keys(),
    ])
    for (const accountId of relevantAccountIds) {
      if (
        (actualByAccount.get(accountId) ?? BigInt(0)) !==
        (expectedByAccount.get(accountId) ?? BigInt(0))
      )
        return inconsistent()
    }
    if (event.kind === "CLOSE") validatedCloseEventIds.add(event.id)
  }

  for (const entry of input.taggedEntries) {
    const link = entry.fiscalCloseJournal
    if (
      !link ||
      link.bookId !== input.bookId ||
      !excludedJournalEntryIds.has(entry.id)
    )
      return inconsistent()
  }
  return excludedJournalEntryIds
}
