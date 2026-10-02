import type { FinanceCommandRecoveryMetadata } from "@ewatrade/utils/finance-command-identity"

export async function readNativePeriodFresh<T>(input: {
  current: () => boolean
  cancel: () => Promise<unknown>
  state: () => { status: string; fetchStatus: string } | undefined
  fetch: () => Promise<T>
}) {
  const assert = () => {
    if (!input.current())
      throw new Error(
        "Account or connectivity changed. Refresh period records.",
      )
  }
  assert()
  await input.cancel()
  assert()
  const before = input.state()
  if (before && before.fetchStatus !== "idle")
    throw new Error("An earlier period read remains active. Refresh records.")
  const result = await input.fetch()
  assert()
  const after = input.state()
  if (after?.status !== "success" || after.fetchStatus !== "idle")
    throw new Error("Fresh online period records are unavailable.")
  return result
}

export function mergeNativePeriodAudit<
  T extends { id: string; kind: string },
>(input: {
  previous: T[]
  page: { events: T[]; nextCursor: string | null }
  cursors: Set<string>
}) {
  const { previous, page, cursors } = input
  const ids = new Set(previous.map((e) => e.id))
  if (
    page.events.length > 30 ||
    (page.nextCursor &&
      (cursors.has(page.nextCursor) ||
        page.events.at(-1)?.id !== page.nextCursor))
  )
    throw new Error(
      "Audit pagination did not advance. Refresh from the first page.",
    )
  for (const event of page.events) {
    if (
      !event.id ||
      event.id.length > 128 ||
      ids.has(event.id) ||
      !["PERIOD_CLOSE", "PERIOD_REOPEN"].includes(event.kind)
    )
      throw new Error(
        "Invalid or duplicate audit source. Refresh from the first page.",
      )
    ids.add(event.id)
  }
  if (page.nextCursor) cursors.add(page.nextCursor)
  return [...previous, ...page.events]
}

type DateValue = Date | string
type Period = {
  id: string
  startsAt: DateValue
  endsAt: DateValue
  reopenedAt: DateValue | null
}
export type PeriodState = {
  closedThrough: DateValue | null
  snapshotSequence: string
  periods: Period[]
}
export type PeriodPayload = {
  bookId: string
  reason: string
  expectedSnapshotSequence: string
} & (
  | { action: "CLOSE"; through: Date }
  | { action: "REOPEN"; periodId: string }
)

export function prepareNativePeriod(input: {
  bookId: string
  startsAt: DateValue
  state: PeriodState
  action: "CLOSE" | "REOPEN"
  day: string
  reason: string
  now?: Date
  saved?: FinanceCommandRecoveryMetadata
}): PeriodPayload {
  const reason = input.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter a reason of up to 400 characters.")
  if (!/^\d{1,19}$/.test(input.state.snapshotSequence))
    throw new Error("The journal snapshot is unavailable.")
  const saved = input.saved
  if (
    saved &&
    (saved.action !== input.action ||
      !saved.expectedSnapshotSequence ||
      !/^\d{1,19}$/.test(saved.expectedSnapshotSequence))
  )
    throw new Error(
      "Check the earlier submission or re-enter its exact original details.",
    )
  const common = {
    bookId: input.bookId,
    reason,
    expectedSnapshotSequence:
      saved?.expectedSnapshotSequence ?? input.state.snapshotSequence,
  }
  if (input.action === "REOPEN") {
    const period = input.state.periods.find(
      (p) =>
        !p.reopenedAt &&
        input.state.closedThrough &&
        new Date(p.endsAt).getTime() ===
          new Date(input.state.closedThrough).getTime(),
    )
    if (!period)
      throw new Error(
        "There is no current closed period to reopen. Check any saved submission result.",
      )
    if (saved && saved.periodId !== period.id)
      throw new Error(
        "The saved period differs. Check the earlier submission result.",
      )
    return { ...common, action: "REOPEN", periodId: period.id }
  }
  const through = new Date(`${input.day}T23:59:59.999Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.day) ||
    !Number.isFinite(through.getTime()) ||
    through.toISOString().slice(0, 10) !== input.day
  )
    throw new Error("Choose a valid UTC date in YYYY-MM-DD format.")
  const start = input.state.closedThrough
    ? new Date(input.state.closedThrough).getTime() + 1
    : new Date(input.startsAt).getTime()
  if (
    !Number.isFinite(start) ||
    through.getTime() < start ||
    through >= (input.now ?? new Date())
  )
    throw new Error(
      "Choose a completed UTC day after the current lock and on or after bookkeeping starts.",
    )
  const reopened = input.state.periods.find(
    (p) => new Date(p.startsAt).getTime() === start,
  )
  if (
    reopened &&
    (!reopened.reopenedAt ||
      new Date(reopened.endsAt).getTime() !== through.getTime())
  )
    throw new Error(
      "A reopened period must be closed through its original end date.",
    )
  if (saved && saved.through !== through.toISOString())
    throw new Error(
      "Use the saved submission's original cutoff or check its result.",
    )
  return { ...common, action: "CLOSE", through }
}

export function assertNativePeriodReport(input: {
  report: {
    bookId: string
    currencyCode: string
    from: DateValue
    through: DateValue
    snapshotSequence: string
    trialBalance: { balanced: boolean; differenceMinor: string }
  }
  payload: Extract<PeriodPayload, { action: "CLOSE" }>
  startsAt: DateValue
  currencyCode: string
}) {
  const { report, payload } = input
  if (
    report.bookId !== payload.bookId ||
    report.currencyCode !== input.currencyCode ||
    report.snapshotSequence !== payload.expectedSnapshotSequence ||
    new Date(report.from).getTime() !== new Date(input.startsAt).getTime() ||
    new Date(report.through).getTime() !== payload.through.getTime()
  )
    throw new Error(
      "The trial balance does not match the reviewed book, dates and snapshot.",
    )
  if (
    !report.trialBalance.balanced ||
    report.trialBalance.differenceMinor !== "0"
  )
    throw new Error(
      "Resolve the posted trial-balance difference before closing.",
    )
}

export function nativePeriodRecovery(
  payload: PeriodPayload,
): FinanceCommandRecoveryMetadata {
  return {
    action: payload.action,
    expectedSnapshotSequence: payload.expectedSnapshotSequence,
    ...(payload.action === "CLOSE"
      ? { through: payload.through.toISOString() }
      : { periodId: payload.periodId }),
  }
}

export function nativePeriodAudit(result: unknown) {
  const record =
    result && typeof result === "object" && "audit" in result
      ? result.audit
      : null
  if (!record || typeof record !== "object") return null
  const reason =
    "reason" in record && typeof record.reason === "string"
      ? record.reason
      : null
  const endsAt =
    "endsAt" in record &&
    typeof record.endsAt === "string" &&
    Number.isFinite(new Date(record.endsAt).getTime())
      ? record.endsAt.slice(0, 10)
      : null
  const snapshot =
    "snapshotSequence" in record &&
    typeof record.snapshotSequence === "string" &&
    /^\d+$/.test(record.snapshotSequence)
      ? record.snapshotSequence
      : null
  return { reason, endsAt, snapshot }
}
