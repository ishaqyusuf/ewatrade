import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { getSession } from "@/lib/session-store"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { FlatList, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { SectionHeader } from "../green-till/kit"
import {
  BankMatchFooter,
  BankMatchSheet,
  type BankMatchSheetRecord,
  BankMatchedGroupCard,
  BankPickRow,
} from "./finance-bank-match-parts"
import {
  NATIVE_BANK_STALE_REVIEW,
  type NativeBankMatchAction,
  nativeBankMatchedGroups,
  nativeBankSelectionTotals,
  toggleNativeBankSelection,
} from "./finance-bank-match-state"
import {
  type NativeBankStatementDetail,
  validateNativeBankStatementDetail,
} from "./finance-bank-read-state"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useSupplierReadAuthority } from "./supplier-finance-screen"
import { useNativeBankMatch } from "./use-native-bank-match"

type Place = { first: boolean; last: boolean }
type MatchEvent =
  RouterOutputs["finance"]["bankStatements"]["history"]["items"][number]
type Group = ReturnType<
  typeof nativeBankMatchedGroups<
    NativeBankStatementDetail["rows"][number],
    MatchEvent
  >
>[number]
type Row =
  | { kind: "BANK"; row: NativeBankStatementDetail["rows"][number] }
  | { kind: "POSTED"; row: NativeBankStatementDetail["candidates"][number] }
type Item =
  | { kind: "HEADER"; id: string; title: string; count: number }
  | (Row & Place)
  | { kind: "GROUP"; group: Group }

/** Header plus rows placed in one rounded card. */
function section(id: string, title: string, rows: Row[]): Item[] {
  if (!rows.length) return []
  return [
    { kind: "HEADER", id, title, count: rows.length },
    ...rows.map((row, index) => ({
      ...row,
      first: index === 0,
      last: index === rows.length - 1,
    })),
  ]
}

function sourceLabel(kind: string) {
  const words = kind.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
export function FinanceBankStatementScreen({
  statementId,
  accountId,
}: { statementId: string; accountId: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <StatementWorkspace
          key={JSON.stringify([
            workspace.actorUserId,
            workspace.tenantId,
            workspace.book.id,
            statementId,
            accountId,
          ])}
          {...workspace}
          statementId={statementId}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function StatementWorkspace({
  book,
  actorUserId,
  tenantId,
  statementId,
  accountId,
}: FinanceWorkspace & { statementId: string; accountId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const profile = getSession()?.profile
  const enabled = Boolean(
    statementId &&
      accountId &&
      book.accounts.some(
        (a) =>
          a.id === accountId &&
          a.kind === "ASSET" &&
          ["BANK", "CLEARING"].includes(a.purpose),
      ) &&
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? ""),
  )
  const query = useQuery(
    trpc.finance.bankStatements.get.queryOptions(
      { bookId: book.id, statementId },
      { enabled: false, retry: false, refetchOnWindowFocus: false },
    ),
  )
  const authority = useSupplierReadAuthority({
    scope: JSON.stringify([
      actorUserId,
      tenantId,
      book.id,
      book.currencyCode,
      statementId,
      accountId,
    ]),
    enabled,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: () => query.refetch(),
  })
  let data: NativeBankStatementDetail | undefined
  let error: string | undefined
  if (authority.verified && !query.isFetching && query.isSuccess) {
    try {
      data = validateNativeBankStatementDetail({
        detail: query.data,
        bookId: book.id,
        currencyCode: book.currencyCode,
        accountId,
        statementId,
        bookStartsAt: book.startsAt,
      })
    } catch (failure) {
      error =
        failure instanceof Error
          ? failure.message
          : "Refresh the original statement."
    }
  }
  // The sheet keeps the last verified read while a fresh check refetches it.
  const lastData = useRef<NativeBankStatementDetail | undefined>(undefined)
  if (data) lastData.current = data
  const shown = data ?? lastData.current
  const matcher = useNativeBankMatch(
    { book, actorUserId, tenantId },
    { accountId, statementId },
  )
  const [bankRowIds, setBankRowIds] = useState<string[]>([])
  const [journalLineIds, setJournalLineIds] = useState<string[]>([])
  const [sheet, setSheet] = useState<NativeBankMatchAction | null>(null)
  // New evidence needs a new explicit selection.
  const revisionKey = data
    ? JSON.stringify([
        data.bookId,
        data.accountId,
        data.statement.id,
        data.bankRevision,
        data.snapshotSequence,
      ])
    : null
  const selectionRevision = useRef<string | null>(null)
  const { clearStale } = matcher
  useEffect(() => {
    if (!revisionKey || selectionRevision.current === revisionKey) return
    const first = selectionRevision.current === null
    selectionRevision.current = revisionKey
    setBankRowIds([])
    setJournalLineIds([])
    if (!first) clearStale()
  }, [revisionKey, clearStale])
  // A saved, unconfirmed match on this statement reopens with its records.
  const recoveryShown = useRef(false)
  const recoveredAction = matcher.recovery?.action ?? null
  useEffect(() => {
    if (!data || !recoveredAction || recoveryShown.current) return
    recoveryShown.current = true
    setSheet(recoveredAction)
  }, [data, recoveredAction])

  const history = useInfiniteQuery(
    trpc.finance.bankStatements.history.infiniteQueryOptions(
      {
        bookId: book.id,
        accountId,
        snapshotRevision: shown?.bankRevision ?? "0",
        limit: 20,
      },
      {
        enabled: Boolean(shown) && !offline,
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  )
  const events = (history.data?.pages ?? []).flatMap((page) =>
    page.bookId === book.id &&
    page.accountId === accountId &&
    page.snapshotRevision === shown?.bankRevision
      ? page.items
      : [],
  )

  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const unmatched = data?.rows.filter((row) => !row.activeMatchId) ?? []
  const matchedRows = data?.rows.filter((row) => row.activeMatchId) ?? []
  const groups = shown ? nativeBankMatchedGroups(shown.rows, events) : []
  const totals = data
    ? nativeBankSelectionTotals(data, bankRowIds, journalLineIds)
    : null
  const saved = Boolean(matcher.command.retained)
  const canPick =
    Boolean(data) &&
    enabled &&
    !offline &&
    !query.isFetching &&
    !matcher.busy &&
    !matcher.stale &&
    matcher.command.ready &&
    !saved
  const items: Item[] = data
    ? [
        ...section(
          "unmatched",
          "Needs a match",
          unmatched.map((row) => ({ kind: "BANK" as const, row })),
        ),
        ...section(
          "posted",
          "Posted · not matched yet",
          data.candidates.map((row) => ({ kind: "POSTED" as const, row })),
        ),
        ...(groups.length
          ? [
              {
                kind: "HEADER" as const,
                id: "matched",
                title: "Matched",
                count: groups.length,
              },
              ...groups.map((group) => ({ kind: "GROUP" as const, group })),
            ]
          : []),
      ]
    : []
  const colors = useColors()
  const accountName =
    book.accounts.find((a) => a.id === accountId)?.name ?? "Bank account"
  const balanced = data ? BigInt(data.closingDifferenceMinor) === 0n : false
  const openSource = (entryId: string) =>
    router.push({
      pathname: "/finance-bank-source/[entryId]",
      params: { entryId, accountId, statementId },
    } as Href)
  const refresh = () => {
    matcher.clearError()
    authority.runProtectedRead()
  }
  const onlyPosted =
    journalLineIds.length === 1
      ? data?.candidates.find((line) => line.id === journalLineIds[0])
      : undefined

  // Sheet records come from the action, so a recovered retry shows its own rows.
  const sheetRecords: BankMatchSheetRecord[] = []
  let sheetTotal = "0"
  if (sheet && shown && sheet.kind === "MATCH") {
    for (const rowId of sheet.bankRowIds) {
      const row = shown.rows.find((item) => item.id === rowId)
      sheetRecords.push({
        key: `b:${rowId}`,
        side: "Bank",
        label: row
          ? `${row.description || row.externalId} · ${money(row.amountMinor)}`
          : "Bank row no longer on this statement",
      })
    }
    for (const lineId of sheet.journalLineIds) {
      const line = shown.candidates.find((item) => item.id === lineId)
      sheetRecords.push({
        key: `p:${lineId}`,
        side: "Posted",
        label: line
          ? `${line.description} · ${money(line.amountMinor)}`
          : "Posted record no longer waiting",
      })
    }
    sheetTotal = money(
      nativeBankSelectionTotals(shown, sheet.bankRowIds, sheet.journalLineIds)
        .bankMinor,
    )
  }
  if (sheet && sheet.kind === "UNMATCH") {
    const group = groups.find((item) => item.matchId === sheet.matchId)
    for (const row of group?.rows ?? [])
      sheetRecords.push({
        key: `b:${row.id}`,
        side: "Bank",
        label: `${row.description || row.externalId} · ${money(row.amountMinor)}`,
      })
    for (const line of group?.evidence?.journal ?? [])
      sheetRecords.push({
        key: `p:${line.id}`,
        side: "Posted",
        label: `Record ${line.sequence} · ${money((BigInt(line.debitMinor) - BigInt(line.creditMinor)).toString())}`,
      })
    if (group?.event)
      sheetRecords.push({
        key: "reason",
        side: "Matched because",
        label: group.event.reason,
      })
    sheetTotal = money(group?.amountMinor ?? "0")
  }
  const sheetCount =
    sheet?.kind === "MATCH"
      ? sheet.bankRowIds.length + sheet.journalLineIds.length
      : 0

  async function submit(reason: string) {
    if (!sheet || !shown) return
    const recorded = await matcher.submit(sheet, reason, {
      expectedRevision: shown.bankRevision,
      expectedSnapshotSequence: shown.snapshotSequence,
    })
    if (!recorded) return
    setSheet(null)
    setBankRowIds([])
    setJournalLineIds([])
    authority.runProtectedRead()
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
        data={items}
        keyExtractor={(item) =>
          item.kind === "HEADER"
            ? item.id
            : item.kind === "GROUP"
              ? `GROUP:${item.group.matchId}`
              : `${item.kind}:${item.row.id}`
        }
        refreshing={query.isFetching}
        onRefresh={refresh}
        ListHeaderComponent={
          <View className="gap-4 pb-1">
            {!enabled ? (
              <StatusBanner
                tone="warning"
                message="Choose an original statement and bank account in this finance book."
              />
            ) : null}
            {offline ? (
              <StatusBanner
                icon="WifiOff"
                tone="warning"
                title="Offline"
                message="Reconnect to match or undo a match."
              />
            ) : null}
            {query.isError || error ? (
              <StatusBanner
                tone="destructive"
                title="Statement unavailable"
                message={
                  error ?? query.error?.message ?? "Refresh bank evidence."
                }
                actionLabel="Try again"
                onActionPress={refresh}
              />
            ) : null}
            {matcher.stale ? (
              <StatusBanner
                icon="TriangleAlert"
                tone="destructive"
                title="Review changed"
                message={NATIVE_BANK_STALE_REVIEW}
                actionLabel="Refresh"
                actionDisabled={offline || query.isFetching}
                onActionPress={refresh}
              />
            ) : null}
            <FinanceCommandFeedback
              command={matcher.command}
              onRecorded={() => {
                setSheet(null)
                refresh()
              }}
              onRejected={() => setSheet(null)}
            />
            {matcher.recoveryError && saved ? (
              <StatusBanner tone="warning" message={matcher.recoveryError} />
            ) : null}
            {recoveredAction && !sheet ? (
              <StatusBanner
                tone="warning"
                title="Finish what you started"
                message="Enter the same reason again to send the saved match, or check its result."
                actionLabel="Continue"
                actionDisabled={offline || !data}
                onActionPress={() => setSheet(recoveredAction)}
              />
            ) : null}
            {data ? (
              <>
                <HeroCard
                  label="Closing difference"
                  pill={
                    unmatched.length
                      ? {
                          label: `${unmatched.length} to match`,
                          tone: "draft",
                        }
                      : balanced
                        ? { label: "Balanced", tone: "synced" }
                        : undefined
                  }
                  amount={money(data.closingDifferenceMinor)}
                  sub={`Bank ${money(data.statement.closingBalanceMinor)} · Posted ${money(data.postedClosingMinor)}`}
                  stats={[
                    {
                      label: "Opening diff",
                      value: money(data.openingDifferenceMinor),
                    },
                    {
                      label: "Matched",
                      value: `${matchedRows.length} of ${data.rows.length}`,
                    },
                    { label: "Unmatched", value: String(unmatched.length) },
                  ]}
                />
                <View className="flex-row gap-2 px-0.5">
                  <Icon
                    className="mt-0.5 size-[14px]"
                    color={colors.mutedForeground}
                    name="Info"
                  />
                  <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {data.statement.reference} · {accountName} ·{" "}
                    {financeDisplayDate(data.statement.startsAt)} –{" "}
                    {financeDisplayDate(data.statement.endsAt)} · imported{" "}
                    {financeDisplayDate(data.statement.importedAt)}
                  </Text>
                </View>
              </>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <ActionButton
                  icon="FileText"
                  disabled={!enabled || offline}
                  onPress={() =>
                    router.push({
                      pathname: "/finance-bank-import-modal",
                      params: { accountId },
                    } as Href)
                  }
                >
                  Import next
                </ActionButton>
              </View>
              <View className="flex-1">
                <ActionButton
                  icon="RefreshCw"
                  variant="outline"
                  disabled={!enabled || offline || query.isFetching}
                  onPress={refresh}
                >
                  Refresh
                </ActionButton>
              </View>
            </View>
            {data && !data.candidateCoverageComplete ? (
              <StatusBanner
                tone="warning"
                message={`Only the first ${data.candidateReviewLimit} posted entries are shown, so this review doesn’t cover every posted entry.`}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text className="py-5 text-muted-foreground">
            {!enabled || offline
              ? "Current evidence is unavailable."
              : query.isError || error
                ? "Refresh before reviewing original rows."
                : !data
                  ? "Checking original statement…"
                  : "No rows or posted candidates in this statement."}
          </Text>
        }
        ListFooterComponent={
          data ? (
            <View className="mt-4 gap-1 px-0.5">
              {history.hasNextPage && groups.some((group) => !group.event) ? (
                <ActionButton
                  variant="outline"
                  disabled={offline || history.isFetchingNextPage}
                  isLoading={history.isFetchingNextPage}
                  onPress={() => void history.fetchNextPage()}
                >
                  Load older matches
                </ActionButton>
              ) : null}
              {history.isError ? (
                <StatusBanner
                  tone="destructive"
                  message="Match history didn't load. Undo match needs it."
                  actionLabel="Try again"
                  onActionPress={() => void history.refetch()}
                />
              ) : null}
              <Text className="mt-2 text-xs text-muted-foreground">
                Matching links records; it never moves money. If something is
                wrong, correct the original record. Equal balances do not prove
                every transaction.
              </Text>
              <Text className="text-xs text-muted-foreground">
                Evidence revision {data.bankRevision} · journal snapshot{" "}
                {data.snapshotSequence}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === "HEADER")
            return (
              <SectionHeader
                title={item.title}
                trailing={
                  <Text className="text-xs font-bold text-muted-foreground">
                    {item.count}
                  </Text>
                }
              />
            )
          if (item.kind === "GROUP") {
            const { group } = item
            return (
              <BankMatchedGroupCard
                amount={money(group.amountMinor)}
                lines={[
                  ...group.rows.map((row) => ({
                    key: `b:${row.id}`,
                    side: "Bank" as const,
                    label: row.description || row.externalId,
                    amount: money(row.amountMinor),
                  })),
                  ...(group.evidence?.journal ?? []).map((line) => ({
                    key: `p:${line.id}`,
                    side: "Posted" as const,
                    label: `Record ${line.sequence}`,
                    amount: money(
                      (
                        BigInt(line.debitMinor) - BigInt(line.creditMinor)
                      ).toString(),
                    ),
                  })),
                ]}
                reason={group.event?.reason ?? null}
                footnote={
                  group.event
                    ? financeDisplayDate(group.event.createdAt)
                    : history.isLoading
                      ? "Loading match history…"
                      : "Original match not loaded"
                }
                canUndo={group.canUndo}
                disabled={!canPick}
                onUndo={() =>
                  group.event &&
                  setSheet({
                    kind: "UNMATCH",
                    matchId: group.matchId,
                    matchRevision: group.event.revision,
                  })
                }
              />
            )
          }
          const shell = cn(
            "overflow-hidden bg-card",
            item.first && "rounded-t-[20px]",
            item.last && "rounded-b-[20px]",
          )
          if (item.kind === "BANK")
            return (
              <View className={shell}>
                <BankPickRow
                  title={item.row.description || "No bank description"}
                  meta={`${financeDisplayDate(item.row.occurredAt)} · ${item.row.externalId}`}
                  amount={money(item.row.amountMinor)}
                  checked={bankRowIds.includes(item.row.id)}
                  disabled={!canPick}
                  last={item.last}
                  onToggle={() =>
                    setBankRowIds((values) =>
                      toggleNativeBankSelection(values, item.row.id),
                    )
                  }
                />
              </View>
            )
          const label = sourceLabel(item.row.sourceKind)
          return (
            <View className={shell}>
              <BankPickRow
                title={item.row.description || label}
                meta={`${financeDisplayDate(item.row.effectiveAt)} · ${label}`}
                amount={money(item.row.amountMinor)}
                checked={journalLineIds.includes(item.row.id)}
                disabled={!canPick}
                last={item.last}
                sourceLabel={label.toLowerCase()}
                onOpenSource={() => openSource(item.row.entryId)}
                onToggle={() =>
                  setJournalLineIds((values) =>
                    toggleNativeBankSelection(values, item.row.id),
                  )
                }
              />
            </View>
          )
        }}
      />
      {data && enabled && totals ? (
        <BankMatchFooter
          bankCount={bankRowIds.length}
          postedCount={journalLineIds.length}
          bankTotal={money(totals.bankMinor)}
          postedTotal={money(totals.postedMinor)}
          difference={money(totals.differenceMinor)}
          equal={totals.equal && !totals.error}
          differ={totals.both && !totals.equal}
          disabled={!canPick}
          offline={offline}
          onClear={() => {
            setBankRowIds([])
            setJournalLineIds([])
          }}
          onMatch={() =>
            setSheet({
              kind: "MATCH",
              bankRowIds: [...bankRowIds],
              journalLineIds: [...journalLineIds],
            })
          }
          onOpenSource={
            onlyPosted ? () => openSource(onlyPosted.entryId) : undefined
          }
        />
      ) : null}
      <BankMatchSheet
        open={Boolean(sheet)}
        title={
          sheet?.kind === "UNMATCH"
            ? "Undo this match?"
            : `Match ${sheetCount} records`
        }
        kind={sheet?.kind ?? "MATCH"}
        records={sheetRecords}
        total={sheetTotal}
        retry={Boolean(
          recoveredAction && sheet && recoveredAction.kind === sheet.kind,
        )}
        busy={matcher.busy}
        offline={offline}
        error={matcher.error}
        onSubmit={(reason) => void submit(reason)}
        onClose={() => {
          if (matcher.busy) return
          matcher.clearError()
          setSheet(null)
        }}
      />
    </View>
  )
}
