import { ActionButton } from "@/components/mobile/action-button"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { prepareFinanceStatementRange } from "@/lib/finance-money-input"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, View } from "react-native"
import { ClassicCustomerBookFilter } from "../appearances/classic/customer-book-screen"
import { HeroCard } from "../green-till/hero-card"
import { RecordRow, RowDivider } from "../green-till/kit"
import { useWorkflowHeader } from "../workflow-modal-screen"
import { FinanceBankDateField } from "./finance-bank-date-field"
import { financeDisplayDate } from "./finance-display"
import { FinanceFormBody } from "./finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"

type Window = { from: Date; through: Date; revision: number }
export function FinanceAccountScreen({ accountId }: { accountId: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <AccountWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${accountId}`}
          {...workspace}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function AccountWorkspace({
  book,
  accountId,
}: FinanceWorkspace & { accountId: string }) {
  const [window, setWindow] = useState<Window>(() => ({
    ...prepareFinanceStatementRange(
      new Date(book.startsAt).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10),
      book.startsAt,
    ),
    revision: 0,
  }))
  return (
    <StatementWindow
      key={`${window.from.toISOString()}:${window.through.toISOString()}:${window.revision}`}
      book={book}
      accountId={accountId}
      window={window}
      onWindow={setWindow}
    />
  )
}
function StatementWindow({
  book,
  accountId,
  window,
  onWindow,
}: {
  book: FinanceWorkspace["book"]
  accountId: string
  window: Window
  onWindow: (window: Window) => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(window.from.toISOString().slice(0, 10))
  const [through, setThrough] = useState(
    window.through.toISOString().slice(0, 10),
  )
  const [error, setError] = useState<string | null>(null)
  const [flow, setFlow] = useState<"all" | "in" | "out">("all")
  const colors = useColors()
  const query = useQuery(
    trpc.finance.accountActivity.queryOptions(
      {
        bookId: book.id,
        accountId,
        from: window.from,
        through: window.through,
        snapshotSequence: snapshot,
        cursor: cursors.at(-1),
        limit: 30,
      },
      {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  // Never pin a cached unbounded response while its fresh mount request is running.
  useEffect(() => {
    if (
      snapshot === undefined &&
      query.data &&
      !query.isFetching &&
      !query.isError
    )
      setSnapshot(query.data.snapshotSequence)
  }, [snapshot, query.data, query.isFetching, query.isError])
  const initializing = snapshot === undefined && query.isFetching
  const data = initializing || query.isError ? undefined : query.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  function apply() {
    try {
      onWindow({
        ...prepareFinanceStatementRange(from, through, book.startsAt),
        revision: window.revision + 1,
      })
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check statement dates.",
      )
    }
  }
  if (editing)
    return (
      <FinanceFormBody>
        <Text className="text-lg font-extrabold text-foreground">
          Statement dates
        </Text>
        <Text className="text-xs text-muted-foreground">
          UTC dates on or after bookkeeping began.
        </Text>
        <FinanceBankDateField
          label="From"
          value={from}
          onChange={setFrom}
          minimum={new Date(book.startsAt).toISOString().slice(0, 10)}
          maximum={new Date().toISOString().slice(0, 10)}
        />
        <FinanceBankDateField
          label="Through"
          value={through}
          onChange={setThrough}
          minimum={new Date(book.startsAt).toISOString().slice(0, 10)}
          maximum={new Date().toISOString().slice(0, 10)}
        />
        {error ? <StatusBanner message={error} tone="destructive" /> : null}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ActionButton variant="outline" onPress={() => setEditing(false)}>
              Back
            </ActionButton>
          </View>
          <View className="flex-1">
            <ActionButton onPress={apply}>Apply dates</ActionButton>
          </View>
        </View>
      </FinanceFormBody>
    )
  const accountName = data?.account.name
  const items = (data?.items ?? []).filter((item) =>
    flow === "in"
      ? BigInt(item.debitMinor) > 0n
      : flow === "out"
        ? BigInt(item.creditMinor) > 0n
        : true,
  )
  const dayOf = (value: Date | string) =>
    new Date(value).toISOString().slice(0, 10)
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 48 }}
      data={items}
      keyExtractor={(item) => item.id}
      refreshing={query.isRefetching}
      onRefresh={() => onWindow({ ...window, revision: window.revision + 1 })}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          <AccountHeader title={accountName} />
          {query.isError ? (
            <StatusBanner
              title="Statement unavailable"
              message={query.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void query.refetch()}
            />
          ) : null}
          {data ? (
            <HeroCard
              label="Closing balance"
              pill={{
                label: `${shortDate(window.from)} – ${shortDate(window.through)}`,
                tone: "synced",
              }}
              amount={money(data.closingBalanceMinor)}
              sub={`${data.account.purpose ? `${purposeLabel(data.account.purpose)} · ` : ""}recorded entries only`}
              stats={[
                { label: "Opening", value: money(data.openingBalanceMinor) },
                { label: "Money in", value: money(data.debitMinor) },
                { label: "Money out", value: money(data.creditMinor) },
              ]}
            />
          ) : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                icon="Calendar"
                variant="outline"
                onPress={() => setEditing(true)}
              >
                Change dates
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                icon="RefreshCw"
                variant="outline"
                disabled={query.isFetching}
                onPress={() =>
                  onWindow({ ...window, revision: window.revision + 1 })
                }
              >
                Refresh
              </ActionButton>
            </View>
          </View>
          {data?.items.length ? (
            <View className="flex-row gap-2">
              {(
                [
                  ["all", "All entries"],
                  ["in", "Money in"],
                  ["out", "Money out"],
                ] as const
              ).map(([value, label]) => (
                <ClassicCustomerBookFilter
                  key={value}
                  active={flow === value}
                  label={label}
                  onPress={() => setFlow(value)}
                />
              ))}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        query.isPending || initializing ? (
          <ListSkeleton count={6} label="Loading statement" variant="ledger" />
        ) : (
          <Text className="py-5 text-muted-foreground">
            {query.isError
              ? "Refresh to load this account statement."
              : data?.items.length
                ? "No entries match this filter on this page."
                : "No entries in this date range."}
          </Text>
        )
      }
      ListFooterComponent={
        <View className="gap-3 pt-4">
          {cursors.length > 1 || data?.nextCursor ? (
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <ActionButton
                  icon="ChevronLeft"
                  variant="outline"
                  disabled={cursors.length < 2 || query.isFetching}
                  onPress={() => setCursors((value) => value.slice(0, -1))}
                >
                  Newer
                </ActionButton>
              </View>
              <Text className="text-xs font-bold text-muted-foreground">
                Page {cursors.length}
              </Text>
              <View className="flex-1">
                <ActionButton
                  variant="outline"
                  disabled={
                    !data?.nextCursor ||
                    snapshot === undefined ||
                    query.isFetching
                  }
                  onPress={() => {
                    if (data?.nextCursor && snapshot !== undefined)
                      setCursors((value) => [
                        ...value,
                        data.nextCursor ?? undefined,
                      ])
                  }}
                >
                  Older
                </ActionButton>
              </View>
            </View>
          ) : data?.items.length ? (
            <Text className="text-center text-xs text-muted-foreground">
              All entries shown
            </Text>
          ) : null}
          <View className="flex-row gap-2 px-0.5">
            <Icon
              className="mt-0.5 size-[14px]"
              color={colors.mutedForeground}
              name="Info"
            />
            <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
              Recorded finance entries only. Unposted sales and payments are
              excluded. Dates are UTC.
            </Text>
          </View>
        </View>
      }
      renderItem={({ item, index }) => {
        const day = dayOf(item.effectiveAt)
        const first = index === 0 || dayOf(items[index - 1].effectiveAt) !== day
        const last =
          index === items.length - 1 ||
          dayOf(items[index + 1].effectiveAt) !== day
        const net = BigInt(item.debitMinor) - BigInt(item.creditMinor)
        const opensMovement =
          !item.reversalOfId &&
          ["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(
            item.sourceKind,
          )
        const opensExpense = item.sourceKind === "EXPENSE_BILL"
        const onPress = opensMovement
          ? () =>
              router.push({
                pathname: "/finance-movement/[entryId]",
                params: { entryId: item.id },
              } as Href)
          : opensExpense
            ? () =>
                router.push({
                  pathname: "/finance-expense/[billId]",
                  params: { billId: item.sourceId },
                } as Href)
            : undefined
        return (
          <View>
            {first ? (
              <Text className="mb-2 mt-4 px-0.5 text-[11px] font-extrabold uppercase tracking-[1.2px] text-muted-foreground">
                {financeDisplayDate(item.effectiveAt)}
              </Text>
            ) : null}
            <View
              className={cn(
                "overflow-hidden bg-card px-3.5",
                first && "rounded-t-[20px]",
                last && "rounded-b-[20px]",
              )}
            >
              <RecordRow
                stackDetails
                title={item.description}
                meta={`${sourceLabel(item.sourceKind)}${item.reversalOfId ? " · reversal" : item.reversedById ? " · reversed" : ""}`}
                amount={`${net > 0n ? "+" : net < 0n ? "−" : ""}${money((net < 0n ? -net : net).toString())}`}
                avatar={{
                  icon: net >= 0n ? "ArrowDown" : "ArrowUp",
                  tint: net >= 0n ? "mint" : "rose",
                }}
                status={
                  <Text className="text-[11px] tabular-nums text-muted-foreground">
                    Bal {money(item.balanceMinor)}
                  </Text>
                }
                onPress={onPress}
              />
              {last ? null : <RowDivider />}
            </View>
          </View>
        )
      }}
    />
  )
}

function AccountHeader({ title }: { title?: string }) {
  const router = useRouter()
  useWorkflowHeader(
    title ? { backLabel: "Back", onBack: () => router.back(), title } : null,
  )
  return null
}

const SOURCE_LABELS: Record<string, string> = {
  BILL_PAYMENT: "Expense payment",
  CUSTOMER_RECEIPT: "Customer receipt",
  EXPENSE_BILL: "Expense",
  OPENING_BALANCE: "Opening balance",
  OWNER_CONTRIBUTION: "Owner funding",
  OWNER_WITHDRAWAL: "Owner drawings",
  TRANSFER: "Transfer",
}
function sourceLabel(kind: string) {
  const known = SOURCE_LABELS[kind]
  if (known) return known
  const words = kind.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
function purposeLabel(purpose: string) {
  return purpose.charAt(0) + purpose.slice(1).toLowerCase()
}
function shortDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}
