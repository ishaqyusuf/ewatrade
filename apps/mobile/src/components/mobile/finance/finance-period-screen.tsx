import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  assertFinanceCloseChecklistScope,
  financeCloseChecklistCanProceed,
  financeCloseChecklistMatchesReview,
} from "@ewatrade/utils/finance-close-checklist"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { FinanceFormBody } from "./finance-form-body"
import { FinancePeriodChecklist } from "./finance-period-checklist"
import {
  type PeriodPayload,
  assertNativePeriodReport,
  mergeNativePeriodAudit,
  nativePeriodAudit,
  nativePeriodRecovery,
  prepareNativePeriod,
  readNativePeriodFresh,
} from "./finance-period-state"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Periods = RouterOutputs["finance"]["periods"]
type Audit = RouterOutputs["finance"]["periodAudit"]
type Checklist = RouterOutputs["finance"]["periodCloseChecklist"]
type Review = {
  payload: PeriodPayload
  generation: number
  reopenedThrough?: Date | string
  checklist?: Checklist
}

export function FinancePeriodsScreen() {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <PeriodWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}`}
          {...workspace}
        />
      )}
    </FinanceWorkspaceGate>
  )
}

function PeriodWorkspace({ book, actorUserId, tenantId }: FinanceWorkspace) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const mutation = useMutation(trpc.finance.changePeriod.mutationOptions())
  const generation = useRef(0)
  const mounted = useRef(false)
  const reading = useRef(false)
  const cursors = useRef(new Set<string>())
  const [periods, setPeriods] = useState<Periods | null>(null)
  const [events, setEvents] = useState<Audit["events"] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<"CLOSE" | "REOPEN">("CLOSE")
  const [day, setDay] = useState(
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  )
  const [reason, setReason] = useState("")
  const [review, setReview] = useState<Review | null>(null)

  function current(token = generation.current) {
    const profile = getSession()?.profile
    return (
      mounted.current &&
      token === generation.current &&
      !useOperationalModeStore.getState().isOfflineMode &&
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
    )
  }
  async function fresh<T>(
    key: readonly unknown[],
    token: number,
    fetch: () => Promise<T>,
  ) {
    return readNativePeriodFresh({
      current: () => current(token),
      cancel: () =>
        client.cancelQueries({ queryKey: key, exact: true }, { silent: true }),
      state: () => client.getQueryState(key),
      fetch,
    })
  }

  function readPeriods(token: number) {
    const input = { bookId: book.id }
    return fresh(trpc.finance.periods.queryKey(input), token, () =>
      client.fetchQuery(
        trpc.finance.periods.queryOptions(input, {
          staleTime: 0,
          retry: false,
        }),
      ),
    )
  }
  function readBook(token: number) {
    const options = trpc.finance.book.queryOptions(undefined, {
      staleTime: 0,
      retry: false,
    })
    return fresh(options.queryKey, token, () => client.fetchQuery(options))
  }
  function readChecklist(token: number, through: Date) {
    const input = { bookId: book.id, through }
    return fresh(trpc.finance.periodCloseChecklist.queryKey(input), token, () =>
      client.fetchQuery(
        trpc.finance.periodCloseChecklist.queryOptions(input, {
          staleTime: 0,
          retry: false,
        }),
      ),
    )
  }
  function readAudit(token: number, next?: string) {
    const input = {
      bookId: book.id,
      limit: 30,
      ...(next ? { cursor: next } : {}),
    }
    return fresh(trpc.finance.periodAudit.queryKey(input), token, () =>
      client.fetchQuery(
        trpc.finance.periodAudit.queryOptions(input, {
          staleTime: 0,
          retry: false,
        }),
      ),
    )
  }
  function adoptAudit(page: Audit, previous: Audit["events"]) {
    setEvents(
      mergeNativePeriodAudit({ previous, page, cursors: cursors.current }),
    )
    setCursor(page.nextCursor)
  }
  async function reload() {
    if (reading.current || !current()) return
    reading.current = true
    const token = ++generation.current
    setLoading(true)
    setError(null)
    setReview(null)
    setPeriods(null)
    setEvents(null)
    setCursor(null)
    cursors.current.clear()
    try {
      const [state, audit] = await Promise.all([
        readPeriods(token),
        readAudit(token),
      ])
      if (!current(token)) return
      adoptAudit(audit, [])
      setPeriods(state)
    } catch (failure) {
      if (current(token)) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Period records unavailable.",
        )
        setEvents(null)
        setPeriods(null)
      }
    } finally {
      reading.current = false
      if (current(token)) setLoading(false)
      else if (current()) void reloadRef.current()
    }
  }
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useOperationalModeStore.subscribe((next, previous) => {
      if (!previous.isOfflineMode && next.isOfflineMode) {
        generation.current++
        setReview(null)
        setPeriods(null)
        setEvents(null)
        setCursor(null)
        setLoading(false)
      }
    })
    return () => {
      mounted.current = false
      generation.current++
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (!offline) void reloadRef.current()
  }, [offline])
  useEffect(() => {
    if (command.retained?.command.operation !== "changePeriod") return
    if (review) return
    const saved = command.retained.command.recoveryMetadata
    if (saved?.action) setAction(saved.action)
    if (saved?.through) setDay(saved.through.slice(0, 10))
  }, [
    command.retained?.command.operation,
    command.retained?.command.recoveryMetadata,
    review,
  ])

  async function prepare() {
    if (reading.current || !current() || !command.ready || command.pending)
      return
    reading.current = true
    const token = generation.current
    setLoading(true)
    setError(null)
    setReview(null)
    try {
      const retained = command.retained?.command
      if (retained && retained.operation !== "changePeriod")
        throw new Error(
          "Resolve the earlier financial submission before changing a period.",
        )
      if (retained && !retained.recoveryMetadata)
        throw new Error(
          "The saved period details are unavailable. Check its result before continuing.",
        )
      const [state, currentBook] = await Promise.all([
        readPeriods(token),
        readBook(token),
      ])
      if (
        !currentBook ||
        currentBook.id !== book.id ||
        currentBook.currencyCode !== book.currencyCode ||
        new Date(currentBook.startsAt).getTime() !==
          new Date(book.startsAt).getTime()
      )
        throw new Error(
          "The active finance book changed. Refresh this close review.",
        )
      const payload = prepareNativePeriod({
        bookId: book.id,
        startsAt: book.startsAt,
        state,
        action,
        day,
        reason,
        saved: retained?.recoveryMetadata,
      })
      let checklistResult: Checklist | undefined
      if (payload.action === "CLOSE") {
        checklistResult = await readChecklist(token, payload.through)
        const expectedFrom = state.closedThrough
          ? new Date(new Date(state.closedThrough).getTime() + 1)
          : new Date(currentBook.startsAt)
        assertFinanceCloseChecklistScope({
          checklist: checklistResult,
          bookId: book.id,
          currencyCode: book.currencyCode,
          from: expectedFrom,
          through: payload.through,
          snapshotSequence: payload.expectedSnapshotSequence,
        })
        const input = {
          bookId: book.id,
          from: new Date(book.startsAt),
          through: payload.through,
          snapshotSequence: payload.expectedSnapshotSequence,
        }
        const report = await fresh(
          trpc.finance.reports.queryKey(input),
          token,
          () =>
            client.fetchQuery(
              trpc.finance.reports.queryOptions(input, {
                staleTime: 0,
                retry: false,
              }),
            ),
        )
        assertNativePeriodReport({
          report,
          payload,
          startsAt: book.startsAt,
          currencyCode: book.currencyCode,
        })
      }
      if (current(token)) {
        setPeriods(state)
        const reopenedPeriod =
          payload.action === "REOPEN"
            ? state.periods.find((period) => period.id === payload.periodId)
            : undefined
        setReview({
          payload,
          generation: token,
          ...(reopenedPeriod ? { reopenedThrough: reopenedPeriod.endsAt } : {}),
          ...(payload.action === "CLOSE" && checklistResult
            ? { checklist: checklistResult }
            : {}),
        })
      }
    } catch (failure) {
      if (current(token)) {
        setPeriods(null)
        setEvents(null)
        setCursor(null)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to prepare the period change.",
        )
      }
    } finally {
      reading.current = false
      if (current(token)) setLoading(false)
      else if (current()) void reloadRef.current()
    }
  }
  async function older() {
    if (!cursor || !events || reading.current || !current()) return
    reading.current = true
    const token = generation.current
    setLoading(true)
    setError(null)
    try {
      const page = await readAudit(token, cursor)
      if (current(token)) adoptAudit(page, events)
    } catch (failure) {
      if (current(token)) {
        setEvents(null)
        setCursor(null)
        setError(
          failure instanceof Error
            ? failure.message
            : "Audit history unavailable.",
        )
      }
    } finally {
      reading.current = false
      if (current(token)) setLoading(false)
      else if (current()) void reloadRef.current()
    }
  }
  async function confirm() {
    if (
      !review ||
      !current(review.generation) ||
      reading.current ||
      command.pending
    )
      return
    const { payload } = review
    const token = review.generation
    reading.current = true
    setLoading(true)
    setError(null)
    let validated = false
    try {
      const [latest, currentBook] = await Promise.all([
        readPeriods(token),
        readBook(token),
      ])
      if (
        !currentBook ||
        currentBook.id !== book.id ||
        currentBook.currencyCode !== book.currencyCode ||
        new Date(currentBook.startsAt).getTime() !==
          new Date(book.startsAt).getTime()
      )
        throw new Error(
          "The active finance book changed. Refresh period records.",
        )
      if (
        latest.snapshotSequence !== payload.expectedSnapshotSequence ||
        (payload.action === "REOPEN" &&
          !latest.periods.some(
            (period) =>
              period.id === payload.periodId &&
              !period.reopenedAt &&
              latest.closedThrough &&
              new Date(period.endsAt).getTime() ===
                new Date(latest.closedThrough).getTime() &&
              review.reopenedThrough !== undefined &&
              new Date(period.endsAt).getTime() ===
                new Date(review.reopenedThrough).getTime(),
          ))
      )
        throw new Error(
          "The reviewed period changed. Refresh and review it again.",
        )
      if (payload.action === "CLOSE") {
        const reviewedChecklist = review.checklist
        if (!reviewedChecklist)
          throw new Error(
            "The close checklist is unavailable. Refresh and review again.",
          )
        const latestChecklist = await readChecklist(token, payload.through)
        const expectedFrom = latest.closedThrough
          ? new Date(new Date(latest.closedThrough).getTime() + 1)
          : new Date(currentBook.startsAt)
        assertFinanceCloseChecklistScope({
          checklist: latestChecklist,
          bookId: book.id,
          currencyCode: book.currencyCode,
          from: expectedFrom,
          through: payload.through,
          snapshotSequence: payload.expectedSnapshotSequence,
        })
        if (
          !financeCloseChecklistMatchesReview(
            latestChecklist,
            reviewedChecklist,
          ) ||
          !financeCloseChecklistCanProceed(latestChecklist)
        )
          throw new Error(
            "The close checklist changed. Refresh and review current records.",
          )
        const input = {
          bookId: book.id,
          from: new Date(currentBook.startsAt),
          through: payload.through,
          snapshotSequence: payload.expectedSnapshotSequence,
        }
        const report = await fresh(
          trpc.finance.reports.queryKey(input),
          token,
          () =>
            client.fetchQuery(
              trpc.finance.reports.queryOptions(input, {
                staleTime: 0,
                retry: false,
              }),
            ),
        )
        assertNativePeriodReport({
          report,
          payload,
          startsAt: currentBook.startsAt,
          currencyCode: currentBook.currencyCode,
        })
      }
      if (!current(token)) return
      validated = true
    } catch (failure) {
      if (current(token)) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to refresh the close checklist.",
        )
      }
      return
    } finally {
      if (!validated) {
        reading.current = false
        if (current(token)) setLoading(false)
      }
    }
    let accepted: boolean
    try {
      accepted = await command.run(
        "changePeriod",
        payload,
        (clientCommandId) => {
          if (!current(token))
            throw new Error(
              "The reviewed finance scope changed. Nothing was sent.",
            )
          return mutation.mutateAsync({ ...payload, clientCommandId })
        },
        "Period change recorded.",
        nativePeriodRecovery(payload),
      )
    } finally {
      reading.current = false
      if (current(token)) setLoading(false)
    }
    if (accepted && current(token)) {
      setReason("")
      setReview(null)
      void reload()
    }
  }
  function recorded() {
    setReview(null)
    setReason("")
    void reload()
  }
  function backFromReview() {
    if (reading.current || loading || command.pending || command.retained)
      return
    generation.current++
    setReview(null)
    setError(null)
  }
  const visible = current() && !offline
  const state = visible ? periods : null
  const history = visible ? events : null
  const selected =
    visible && review && current(review.generation) ? review.payload : null
  const closeChecklist =
    visible && selected?.action === "CLOSE" && review?.checklist
      ? review.checklist
      : null
  const disabled = !visible || loading || !command.ready || command.pending
  const date = (value: Date | string) =>
    new Date(value).toISOString().slice(0, 10)
  return (
    <FinanceFormBody>
      <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Posting dates
      </Text>
      <Text className="text-2xl font-bold">
        {state
          ? state.closedThrough
            ? `Locked through ${date(state.closedThrough)} UTC`
            : "No posting dates locked"
          : "Period controls"}
      </Text>
      {state ? (
        <Text className="text-sm text-muted-foreground">
          {book.currencyCode} book · journal snapshot {state.snapshotSequence}
        </Text>
      ) : null}
      <FinanceCommandFeedback
        command={command}
        onRecorded={recorded}
        onRejected={() => setReview(null)}
      />
      <StatusBanner
        title="A posting date lock"
        message="Closing blocks new entries and corrections through the chosen date. A balanced posted trial balance does not certify complete financial records. Sales/customer payments, inventory costs and opening reconciliation still require coverage. This does not perform year-end retained earnings."
        tone="muted"
      />
      {offline ? (
        <StatusBanner
          title="Offline"
          message="Period and audit records are hidden. Reconnect for fresh records."
          tone="warning"
        />
      ) : null}
      {error ? (
        <StatusBanner
          title="Period records need attention"
          message={error}
          tone="destructive"
        />
      ) : null}
      {loading ? <Text>Checking period records…</Text> : null}
      <ActionButton
        variant="outline"
        disabled={!visible || loading || command.pending}
        onPress={() => void reload()}
      >
        Refresh period and audit records
      </ActionButton>
      {state ? (
        <View className="gap-4 rounded-2xl border border-border bg-card p-4">
          {selected ? (
            <>
              <Text className="text-lg font-bold">Review before recording</Text>
              <Text>
                {selected.action === "CLOSE"
                  ? `Lock postings through ${date(selected.through)} UTC`
                  : `Reopen latest period ${selected.periodId}`}
              </Text>
              <Text>
                {selected.action === "CLOSE"
                  ? "Earlier-dated postings and corrections will be rejected. Later dates remain available."
                  : "Postings into this period become available. Earlier closed periods stay locked."}
              </Text>
              <Text>Reason: {selected.reason}</Text>
              <Text>
                Journal snapshot {selected.expectedSnapshotSequence}
                {selected.action === "CLOSE"
                  ? " · posted trial-balance difference 0"
                  : ""}
              </Text>
              {closeChecklist ? (
                <FinancePeriodChecklist checklist={closeChecklist} />
              ) : null}
              <ActionButton
                disabled={
                  disabled ||
                  (selected.action === "CLOSE" &&
                    (!closeChecklist ||
                      !financeCloseChecklistCanProceed(closeChecklist)))
                }
                isLoading={command.pending}
                onPress={() => void confirm()}
              >
                Confirm and record
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={command.pending || loading}
                onPress={backFromReview}
              >
                Back to details
              </ActionButton>
            </>
          ) : (
            <>
              <View className="flex-row flex-wrap gap-2">
                <ActionButton
                  variant={action === "CLOSE" ? "secondary" : "outline"}
                  disabled={disabled}
                  onPress={() => setAction("CLOSE")}
                >
                  Close a period
                </ActionButton>
                <ActionButton
                  variant={action === "REOPEN" ? "secondary" : "outline"}
                  disabled={disabled || !state.closedThrough}
                  onPress={() => setAction("REOPEN")}
                >
                  Reopen latest
                </ActionButton>
              </View>
              {action === "CLOSE" ? (
                <FormField
                  label="Lock through date (YYYY-MM-DD, UTC)"
                  value={day}
                  onChangeText={setDay}
                  editable={!disabled}
                  maxLength={10}
                  autoCapitalize="none"
                />
              ) : (
                <Text>
                  Only the latest current closed period can be reopened.
                </Text>
              )}
              <FormField
                label="Reason"
                value={reason}
                onChangeText={setReason}
                editable={!disabled}
                maxLength={400}
                multiline
              />
              <ActionButton
                disabled={disabled}
                isLoading={loading}
                onPress={() => void prepare()}
              >
                Review period change
              </ActionButton>
            </>
          )}
        </View>
      ) : null}
      <Text className="text-lg font-bold">Close and reopen history</Text>
      <Text className="text-sm text-muted-foreground">
        Immutable actions with recorded actor and time. Refresh starts at the
        newest action; journal sequence does not version this history.
      </Text>
      {history?.length === 0 ? (
        <StatusBanner
          message="No period changes have been recorded."
          tone="muted"
        />
      ) : null}
      {history?.map((event) => {
        const audit = nativePeriodAudit(event.result)
        return (
          <View key={event.id} className="gap-2 border-b border-border py-3">
            <Text className="font-semibold">
              {event.kind === "PERIOD_CLOSE"
                ? "Closed period"
                : "Reopened period"}
              {audit?.endsAt ? ` ending ${audit.endsAt} UTC` : ""}
            </Text>
            <Text>{audit?.reason ?? "Historical reason unavailable"}</Text>
            <Text className="text-xs text-muted-foreground">
              Actor {event.actorUserId} ·{" "}
              {new Date(event.createdAt).toISOString()}
              {audit?.snapshot
                ? ` · snapshot ${audit.snapshot}`
                : " · historical snapshot unavailable"}
            </Text>
          </View>
        )
      })}
      {visible && history && cursor ? (
        <ActionButton
          variant="outline"
          disabled={loading || command.pending}
          onPress={() => void older()}
        >
          Load older actions
        </ActionButton>
      ) : null}
    </FinanceFormBody>
  )
}
