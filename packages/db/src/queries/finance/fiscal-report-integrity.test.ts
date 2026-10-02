import { expect, test } from "bun:test"
import {
  FINANCE_FISCAL_CLOSE_SOURCE,
  FINANCE_FISCAL_REVERSE_SOURCE,
} from "./fiscal-limits"
import {
  type FinanceFiscalReportEvent,
  type FinanceFiscalReportTaggedEntry,
  getFinanceFiscalPnlExclusions,
} from "./fiscal-report-integrity"

const bookId = "book"
const bookStartsAt = new Date("2024-01-01T00:00:00.000Z")
const endsAt = new Date("2024-12-31T23:59:59.999Z")
const calendar = {
  id: "calendar",
  bookId,
  startMonth: 1,
  startDay: 1,
  revision: 1,
  retainedEarningsAccountId: "retained",
}
const accounts = [
  { id: "expense", bookId, kind: "EXPENSE", purpose: "COST_OF_SALES" },
  { id: "income", bookId, kind: "INCOME", purpose: "SALES" },
  { id: "retained", bookId, kind: "EQUITY", purpose: "RETAINED_EARNINGS" },
]
type Balance = {
  accountId: string
  closingDebitMinor: string
  closingCreditMinor: string
}
type Line = { accountId: string; debitMinor: bigint; creditMinor: bigint }

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing test value: ${label}`)
  return value
}

function makeEvent(input: {
  id: string
  kind: "CLOSE" | "REVERSE"
  snapshotSequence: bigint
  earningsMinor: string
  balances: Balance[]
  lines: Line[]
  reversalOf?: FinanceFiscalReportEvent
  effectiveAt?: Date
}) {
  const effectiveAt = input.effectiveAt ?? endsAt
  const resultingSequence =
    input.snapshotSequence + (input.lines.length === 0 ? BigInt(0) : BigInt(1))
  const sourceKind =
    input.kind === "CLOSE"
      ? FINANCE_FISCAL_CLOSE_SOURCE
      : FINANCE_FISCAL_REVERSE_SOURCE
  const journal =
    input.lines.length === 0
      ? null
      : {
          id: `${input.id}-journal`,
          bookId,
          sequence: resultingSequence,
          sourceKind,
          reversalOfId: input.reversalOf?.journals[0]?.journalEntry.id ?? null,
          effectiveAt,
          lines: input.lines.map((line) => ({
            ...line,
            bookId,
            account: required(
              accounts.find((account) => account.id === line.accountId),
              `account ${line.accountId}`,
            ),
          })),
        }
  const event: FinanceFiscalReportEvent = {
    id: input.id,
    bookId,
    fiscalYearId: "year",
    kind: input.kind,
    snapshotSequence: input.snapshotSequence,
    resultingSequence,
    effectiveAt,
    recordedAt: new Date(Date.UTC(2025, 0, 1) + Number(resultingSequence)),
    retainedEarningsAccountId: "retained",
    accountBalances: input.balances,
    earningsMinor: input.earningsMinor,
    reversalOfId: input.reversalOf?.id ?? null,
    fiscalYear: {
      id: "year",
      bookId,
      calendarId: calendar.id,
      calendarRevision: 1,
      startMonth: 1,
      startDay: 1,
      startsAt: bookStartsAt,
      endsAt,
      firstPeriodStub: false,
      calendar,
    },
    retainedEarningsAccount: required(accounts[2], "retained earnings"),
    reversalOf: input.reversalOf
      ? {
          id: input.reversalOf.id,
          bookId,
          fiscalYearId: "year",
          kind: "CLOSE",
          retainedEarningsAccountId: "retained",
          accountBalances: input.reversalOf.accountBalances,
          earningsMinor: input.reversalOf.earningsMinor,
          snapshotSequence: input.reversalOf.snapshotSequence,
          resultingSequence: input.reversalOf.resultingSequence,
          effectiveAt: input.reversalOf.effectiveAt,
          journals: input.reversalOf.journals,
        }
      : null,
    journals: journal
      ? [{ bookId, eventId: input.id, position: 0, journalEntry: journal }]
      : [],
  }
  const taggedEntries: FinanceFiscalReportTaggedEntry[] = journal
    ? [
        {
          id: journal.id,
          bookId,
          sequence: journal.sequence,
          sourceKind,
          effectiveAt,
          fiscalCloseJournal: { bookId, eventId: input.id, position: 0 },
        },
      ]
    : []
  return { event, taggedEntries }
}

function makeClose(id: string, snapshotSequence: bigint, balances: Balance[]) {
  let earnings = BigInt(0)
  const lines: Line[] = []
  for (const balance of balances) {
    const netDebit =
      BigInt(balance.closingDebitMinor) - BigInt(balance.closingCreditMinor)
    earnings -= netDebit
    if (netDebit !== BigInt(0))
      lines.push({
        accountId: balance.accountId,
        debitMinor: netDebit < BigInt(0) ? -netDebit : BigInt(0),
        creditMinor: netDebit > BigInt(0) ? netDebit : BigInt(0),
      })
  }
  if (earnings !== BigInt(0))
    lines.push({
      accountId: "retained",
      debitMinor: earnings < BigInt(0) ? -earnings : BigInt(0),
      creditMinor: earnings > BigInt(0) ? earnings : BigInt(0),
    })
  return makeEvent({
    id,
    kind: "CLOSE",
    snapshotSequence,
    earningsMinor: earnings.toString(),
    balances,
    lines,
  })
}

function evaluate(
  snapshotSequence: bigint,
  events: FinanceFiscalReportEvent[],
  taggedEntries: FinanceFiscalReportTaggedEntry[],
) {
  return getFinanceFiscalPnlExclusions({
    bookId,
    bookStartsAt,
    calendar,
    snapshotSequence,
    accounts,
    events,
    taggedEntries,
  })
}

test("profit, loss, zero and contra corrections validate against temporary balances", () => {
  const fixtures: Balance[][] = [
    [
      {
        accountId: "expense",
        closingDebitMinor: "6000",
        closingCreditMinor: "0",
      },
      {
        accountId: "income",
        closingDebitMinor: "0",
        closingCreditMinor: "10000",
      },
    ],
    [
      {
        accountId: "expense",
        closingDebitMinor: "2500",
        closingCreditMinor: "0",
      },
      {
        accountId: "income",
        closingDebitMinor: "0",
        closingCreditMinor: "1000",
      },
    ],
    [
      {
        accountId: "expense",
        closingDebitMinor: "1000",
        closingCreditMinor: "0",
      },
      {
        accountId: "income",
        closingDebitMinor: "0",
        closingCreditMinor: "1000",
      },
    ],
    [
      {
        accountId: "expense",
        closingDebitMinor: "0",
        closingCreditMinor: "700",
      },
      {
        accountId: "income",
        closingDebitMinor: "300",
        closingCreditMinor: "0",
      },
    ],
    [
      { accountId: "expense", closingDebitMinor: "0", closingCreditMinor: "0" },
      { accountId: "income", closingDebitMinor: "0", closingCreditMinor: "0" },
    ],
  ]
  for (const [index, balances] of fixtures.entries()) {
    const { event, taggedEntries } = makeClose(
      `close-${index}`,
      BigInt(index * 2),
      balances,
    )
    expect(evaluate(event.resultingSequence, [event], taggedEntries).size).toBe(
      event.journals.length,
    )
  }
})

test("close, reversal and reclose preserve the historical exclusion set", () => {
  const balances = [
    {
      accountId: "expense",
      closingDebitMinor: "6000",
      closingCreditMinor: "0",
    },
    { accountId: "income", closingDebitMinor: "0", closingCreditMinor: "9000" },
  ]
  const close = makeClose("close", 4n, balances)
  const reverseLines = required(
    close.event.journals[0],
    "close journal link",
  ).journalEntry.lines.map((line) => ({
    accountId: line.accountId,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
  }))
  const reverse = makeEvent({
    id: "reverse",
    kind: "REVERSE",
    snapshotSequence: close.event.resultingSequence,
    earningsMinor: close.event.earningsMinor,
    balances,
    lines: reverseLines,
    reversalOf: close.event,
  })
  const reclose = makeClose(
    "reclose",
    reverse.event.resultingSequence,
    balances,
  )
  expect(
    evaluate(
      reclose.event.resultingSequence,
      [close.event, reverse.event, reclose.event],
      [
        ...close.taggedEntries,
        ...reverse.taggedEntries,
        ...reclose.taggedEntries,
      ],
    ).size,
  ).toBe(3)
  expect(evaluate(close.event.snapshotSequence, [close.event], []).size).toBe(0)
})

test("a reversal must invert each original journal exactly, not merely preserve its aggregate net", () => {
  const balances = [
    {
      accountId: "expense",
      closingDebitMinor: "6000",
      closingCreditMinor: "0",
    },
    { accountId: "income", closingDebitMinor: "0", closingCreditMinor: "9000" },
  ]
  const close = makeClose("close", 4n, balances)
  const lines = required(
    close.event.journals[0],
    "close",
  ).journalEntry.lines.map((line) => ({
    accountId: line.accountId,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
  }))
  lines.push(
    { accountId: "income", debitMinor: 1n, creditMinor: 0n },
    { accountId: "income", debitMinor: 0n, creditMinor: 1n },
  )
  const reverse = makeEvent({
    id: "reverse",
    kind: "REVERSE",
    snapshotSequence: close.event.resultingSequence,
    earningsMinor: close.event.earningsMinor,
    balances,
    lines,
    reversalOf: close.event,
  })
  expect(() =>
    evaluate(
      reverse.event.resultingSequence,
      [close.event, reverse.event],
      [...close.taggedEntries, ...reverse.taggedEntries],
    ),
  ).toThrow()
})

test("mid-batch snapshots and malformed date, ownership, tags, balances or truncation refuse", () => {
  const balances = [
    {
      accountId: "expense",
      closingDebitMinor: "6000",
      closingCreditMinor: "0",
    },
    {
      accountId: "income",
      closingDebitMinor: "0",
      closingCreditMinor: "10000",
    },
  ]
  const valid = makeClose("valid", 1n, balances)
  const link = required(valid.event.journals[0], "valid journal link")
  const secondJournal = {
    ...link.journalEntry,
    id: "valid-journal-2",
    sequence: link.journalEntry.sequence + 1n,
  }
  const splitEvent: FinanceFiscalReportEvent = {
    ...valid.event,
    resultingSequence: secondJournal.sequence,
    journals: [
      link,
      {
        ...link,
        position: 1,
        journalEntry: secondJournal,
      },
    ],
  }
  const invalidDate = {
    ...valid.event,
    effectiveAt: new Date("2024-06-30T23:59:59.999Z"),
  }
  const wrongTag = valid.taggedEntries.map((entry) => ({
    ...entry,
    sourceKind: FINANCE_FISCAL_REVERSE_SOURCE,
  }))
  const wrongOwner = valid.taggedEntries.map((entry) => ({
    ...entry,
    fiscalCloseJournal: {
      ...required(entry.fiscalCloseJournal ?? undefined, "fiscal close link"),
      bookId: "other",
    },
  }))
  const unbalanced: FinanceFiscalReportEvent = {
    ...valid.event,
    journals: valid.event.journals.map((journalLink) => ({
      ...journalLink,
      journalEntry: {
        ...journalLink.journalEntry,
        lines: journalLink.journalEntry.lines.map((line, index) =>
          index === 0 ? { ...line, debitMinor: line.debitMinor + 1n } : line,
        ),
      },
    })),
  }
  const truncated = {
    ...valid.event,
    resultingSequence: valid.event.resultingSequence + 1n,
  }
  for (const action of [
    () => evaluate(2n, [invalidDate], valid.taggedEntries),
    () => evaluate(2n, [valid.event], wrongTag),
    () => evaluate(2n, [valid.event], wrongOwner),
    () => evaluate(2n, [unbalanced], valid.taggedEntries),
    () => evaluate(2n, [truncated], valid.taggedEntries),
    () => evaluate(2n, [valid.event], []),
    () => evaluate(2n, [splitEvent], valid.taggedEntries),
    () => evaluate(1n, [splitEvent], valid.taggedEntries),
  ])
    expect(action).toThrow()
})
