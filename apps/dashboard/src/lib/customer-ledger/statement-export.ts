import type { LedgerStatement } from "@/components/customer-ledger/types"
function cell(value: string) {
  const safe =
    /^[=+\-@\t\r]/.test(value) && !/^-?(0|[1-9]\d*)$/.test(value)
      ? `'${value}`
      : value
  return `"${safe.replaceAll('"', '""')}"`
}
export function customerLedgerCsv(
  statement: LedgerStatement,
  entries: LedgerStatement["entries"],
) {
  const rows = [
    [
      "Coverage",
      "Recorded customer ledger entries only; incomplete source coverage",
    ],
    ["Snapshot", statement.snapshotSequence],
    ["Account ID", statement.accountId],
    ["Customer ID", statement.customerId],
    ["Currency", statement.currencyCode],
    ["Amounts", "Exact integer minor units. Import amount columns as text."],
    ["Amount owed (minor units)", statement.totals.outstandingDebtMinor],
    ["Available credit (minor units)", statement.totals.availableCreditMinor],
    ["Net balance (minor units)", statement.totals.netBalanceMinor],
    [],
    [
      "Sequence",
      "Effective date (UTC)",
      "Recorded date (UTC)",
      "Kind",
      "Description",
      "Debit (minor units)",
      "Credit (minor units)",
      "Running net balance (minor units)",
      "Source",
      "Order",
      "Store",
      "Actor",
      "Correction of",
    ],
  ]
  for (const e of entries)
    rows.push([
      e.sequence,
      new Date(e.effectiveAt).toISOString(),
      new Date(e.recordedAt).toISOString(),
      e.kind,
      e.description,
      e.side === "DEBIT" ? e.amountMinor : "0",
      e.side === "CREDIT" ? e.amountMinor : "0",
      e.runningBalanceMinor,
      e.sourceId,
      e.orderId ?? "",
      e.storeId ?? "",
      e.actorUserId,
      e.reversalOfId ?? "",
    ])
  return `\uFEFF${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`
}
/** Bounded export is complete or refused; every page must match the original snapshot. */
export async function collectCustomerLedgerExport(
  first: LedgerStatement,
  read: (afterSequence: string) => Promise<LedgerStatement>,
  maxEntries = 10000,
  cancelled = () => false,
) {
  const unsigned = (value: string) => /^(0|[1-9]\d*)$/.test(value)
  const signed = (value: string) => /^-?(0|[1-9]\d*)$/.test(value)
  const fail = () => {
    throw new Error(
      "Statement does not reconcile. No partial file was downloaded.",
    )
  }
  const checkCancellation = () => {
    if (cancelled())
      throw new Error("Statement export cancelled. No file was downloaded.")
  }
  const fields = [
    "debitMinor",
    "creditMinor",
    "allocatedMinor",
    "outstandingDebtMinor",
    "availableCreditMinor",
    "netBalanceMinor",
  ] as const
  if (
    !unsigned(first.snapshotSequence) ||
    !signed(first.totals.netBalanceMinor)
  )
    fail()
  for (const field of fields.filter((field) => field !== "netBalanceMinor"))
    if (!unsigned(first.totals[field])) fail()
  const totals = first.totals
  if (
    BigInt(totals.debitMinor) - BigInt(totals.creditMinor) !==
      BigInt(totals.netBalanceMinor) ||
    BigInt(totals.debitMinor) - BigInt(totals.allocatedMinor) !==
      BigInt(totals.outstandingDebtMinor) ||
    BigInt(totals.creditMinor) - BigInt(totals.allocatedMinor) !==
      BigInt(totals.availableCreditMinor)
  )
    fail()
  const entries: LedgerStatement["entries"] = []
  const identities = new Set<string>()
  const seenCursors = new Set<string>()
  let sequence = BigInt(0)
  let debit = BigInt(0)
  let credit = BigInt(0)
  let running = BigInt(0)
  let page = first
  for (;;) {
    checkCancellation()
    if (
      page.accountId !== first.accountId ||
      page.customerId !== first.customerId ||
      page.snapshotSequence !== first.snapshotSequence ||
      page.currencyCode !== first.currencyCode ||
      page.coverage !== first.coverage ||
      page.completeness !== first.completeness ||
      fields.some((field) => page.totals[field] !== totals[field])
    )
      throw new Error("Statement snapshot changed. No file was downloaded.")
    if (
      !Number.isInteger(maxEntries) ||
      maxEntries < 1 ||
      entries.length + page.entries.length > maxEntries
    )
      throw new Error(
        "Statement export exceeds its safe bound or has an invalid cursor. No partial file was downloaded.",
      )
    for (const entry of page.entries) {
      if (
        !entry.id ||
        identities.has(entry.id) ||
        !unsigned(entry.sequence) ||
        BigInt(entry.sequence) <= sequence ||
        BigInt(entry.sequence) > BigInt(first.snapshotSequence) ||
        !unsigned(entry.amountMinor) ||
        !signed(entry.runningBalanceMinor) ||
        !["DEBIT", "CREDIT"].includes(entry.side) ||
        Number.isNaN(new Date(entry.effectiveAt).getTime()) ||
        Number.isNaN(new Date(entry.recordedAt).getTime())
      )
        fail()
      const amount = BigInt(entry.amountMinor)
      if (entry.side === "DEBIT") debit += amount
      else credit += amount
      running = debit - credit
      if (running !== BigInt(entry.runningBalanceMinor)) fail()
      sequence = BigInt(entry.sequence)
      identities.add(entry.id)
      entries.push(entry)
    }
    const cursor = page.nextCursor
    if (!cursor) break
    if (
      !unsigned(cursor) ||
      seenCursors.has(cursor) ||
      !page.entries.length ||
      cursor !== page.entries.at(-1)?.sequence ||
      entries.length >= maxEntries
    )
      throw new Error(
        "Statement export exceeds its safe bound or has an invalid cursor. No partial file was downloaded.",
      )
    seenCursors.add(cursor)
    checkCancellation()
    page = await read(cursor)
  }
  checkCancellation()
  if (
    debit !== BigInt(totals.debitMinor) ||
    credit !== BigInt(totals.creditMinor) ||
    running !== BigInt(totals.netBalanceMinor)
  )
    fail()
  return entries
}
