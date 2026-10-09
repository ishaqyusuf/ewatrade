import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type Href, useFocusEffect, useRouter } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, Text as NativeText, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  ListCard,
  QuickActionRow,
  RecordRow,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import { CustomerLedgerGate } from "./customer-ledger-gate"
import { ledgerLabels } from "./types"
export function CustomerLedgerScreen({ customerId }: { customerId: string }) {
  return (
    <CustomerLedgerGate>
      {(s) => (
        <Accounts
          key={`${s.actorUserId}:${s.tenantId}:${customerId}`}
          customerId={customerId}
        />
      )}
    </CustomerLedgerGate>
  )
}
function Accounts({ customerId }: { customerId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [accountId, setAccountId] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    trpc.customerLedger.accounts.queryOptions(
      { customerId, limit: 50 },
      { retry: false, enabled: !offline },
    ),
  )
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      retry: false,
      enabled: !offline,
    }),
  )
  const ensure = useMutation(
    trpc.customerLedger.ensureAccount.mutationOptions(),
  )
  const selected =
    query.data?.accounts.find((a) => a.id === accountId) ??
    (accountId ? undefined : query.data?.accounts[0])
  async function create() {
    if (!book.data || offline || ensure.isPending) return
    try {
      const a = await ensure.mutateAsync({
        customerId,
        currencyCode: book.data.currencyCode,
      })
      await client.invalidateQueries({
        queryKey: trpc.customerLedger.accounts.pathKey(),
      })
      setAccountId(a.id)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Account unavailable.",
      )
    }
  }
  if (query.isPending && offline)
    return (
      <StatusBanner
        tone="warning"
        message="Reconnect to load this customer account."
      />
    )
  if (query.isPending)
    return (
      <View className="gap-4 px-[18px]">
        <HeroCard label="Customer statement" sub="Loading account" />
        <Skeleton className="h-32 w-full" />
      </View>
    )
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel={offline ? undefined : "Try again"}
        onActionPress={() => void query.refetch()}
      />
    )
  return (
    <View className="flex-1 gap-3">
      <View className="gap-2 px-4">
        {query.data.accounts.length > 1 ? (
          <View className="flex-row flex-wrap gap-2">
            {query.data.accounts.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: a.id === selected?.id }}
                className={`rounded-xl border px-4 py-2 ${a.id === selected?.id ? "border-primary bg-accent" : "border-border"}`}
                onPress={() => setAccountId(a.id)}
              >
                <Text>{a.currencyCode}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {book.data &&
        !query.data.accounts.some(
          (a) => a.currencyCode === book.data?.currencyCode,
        ) ? (
          <ActionButton
            variant="outline"
            disabled={offline || ensure.isPending}
            onPress={() => void create()}
          >
            Open {book.data.currencyCode} account
          </ActionButton>
        ) : null}
        {error ? <StatusBanner message={error} tone="destructive" /> : null}
      </View>
      {selected ? (
        <Statement
          key={selected.id}
          accountId={selected.id}
          customerName={query.data.customer.name}
        />
      ) : (
        <Text className="px-4">
          No account yet. Start a financial book on the dashboard to open a
          matching customer account.
        </Text>
      )}
    </View>
  )
}
/** "Today", "Yesterday", "5 Oct" (year only when it differs). */
function statementDay(value: string | Date, now = new Date()) {
  const date = new Date(value)
  const day = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(date)) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
}

function Statement({
  accountId,
  customerName,
}: {
  accountId: string
  customerName: string
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [snapshot, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detail = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false, enabled: !offline },
    ),
  )
  const query = useQuery(
    trpc.customerLedger.statement.queryOptions(
      {
        accountId,
        snapshotSequence: snapshot,
        afterSequence: cursors.at(-1),
        limit: 30,
      },
      {
        retry: false,
        enabled: !offline,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    ),
  )
  useEffect(() => {
    if (
      !offline &&
      snapshot === undefined &&
      query.data &&
      !query.isFetching &&
      !query.isError &&
      !refreshing
    )
      setSnapshot(query.data.snapshotSequence)
  }, [
    offline,
    snapshot,
    query.data,
    query.isFetching,
    query.isError,
    refreshing,
  ])
  async function refresh() {
    if (offline || refreshing || query.isFetching) return
    setRefreshing(true)
    setError(null)
    try {
      const latest = await client.fetchQuery(
        trpc.customerLedger.statement.queryOptions(
          { accountId, limit: 30 },
          { staleTime: 0, retry: false },
        ),
      )
      client.setQueryData(
        trpc.customerLedger.statement.queryKey({
          accountId,
          snapshotSequence: latest.snapshotSequence,
          limit: 30,
        }),
        latest,
      )
      setCursors([undefined])
      setSnapshot(latest.snapshotSequence)
      await detail.refetch()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Refresh failed; previous snapshot retained.",
      )
    } finally {
      setRefreshing(false)
    }
  }
  // Coming back from a payment or correction: show it without a manual Refresh.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const focusedBefore = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void refreshRef.current()
      focusedBefore.current = true
    }, []),
  )
  const open = (mode: string, entryId?: string) =>
    router.push({
      pathname: "/customer-ledger-action/[accountId]",
      params: { accountId, mode, ...(entryId ? { entryId } : {}) },
    } as Href)
  if (query.isPending && offline)
    return (
      <StatusBanner
        tone="warning"
        message="Reconnect to load this statement."
      />
    )
  if (query.isPending || (snapshot === undefined && query.isFetching))
    return (
      <View className="gap-4 px-[18px]">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-16 w-full" />
      </View>
    )
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel={offline ? undefined : "Try again"}
        onActionPress={() => void query.refetch()}
      />
    )
  const s = query.data
  const money = (v: string) => formatFinanceMoney(v, s.currencyCode)
  // Whole naira for the hero and rows; entry detail keeps kobo.
  const whole = (v: string) => money(v).replace(/\.00$/, "")
  const debt = BigInt(s.totals.outstandingDebtMinor)
  const credit = BigInt(s.totals.availableCreditMinor)
  const dayKey = (value: string | Date) => new Date(value).toDateString()
  const busy = query.isFetching || refreshing
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      data={s.entries}
      keyExtractor={(entry) => entry.id}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          {offline ? (
            <StatusBanner
              title="Offline"
              message={`Cached statement last read ${new Date(query.dataUpdatedAt).toLocaleString()}. Financial writes require a connection.`}
              tone="warning"
            />
          ) : null}
          <HeroCard
            label={
              debt > 0n
                ? `${customerName} owes`
                : credit > 0n
                  ? `${customerName} has credit`
                  : `${customerName} is settled`
            }
            amount={whole(
              debt > 0n || credit === 0n
                ? s.totals.outstandingDebtMinor
                : s.totals.availableCreditMinor,
            )}
            pill={{
              label: offline ? "Saved copy" : "Up to date",
              tone: offline ? "offline" : "synced",
            }}
            stats={[
              { label: "Owed", value: whole(s.totals.outstandingDebtMinor) },
              { label: "Credit", value: whole(s.totals.availableCreditMinor) },
              { label: "Net", value: whole(s.totals.netBalanceMinor) },
            ]}
          >
            {detail.data?.book ? (
              <View className="mt-4">
                <ActionButton
                  icon="CreditCard"
                  tone="cream"
                  disabled={offline}
                  onPress={() => open("receipt")}
                >
                  Record payment
                </ActionButton>
              </View>
            ) : null}
          </HeroCard>
          {detail.data?.book ? (
            <QuickActionRow
              actions={[
                {
                  label: "Apply credit",
                  icon: "Link",
                  disabled:
                    offline ||
                    s.totals.availableCreditMinor === "0" ||
                    s.totals.outstandingDebtMinor === "0",
                  onPress: () => open("apply"),
                },
                {
                  label: "Return credit",
                  icon: "Undo2",
                  disabled: offline || s.totals.availableCreditMinor === "0",
                  onPress: () => open("refund"),
                },
                {
                  label: "Opening balance",
                  icon: "ChartNoAxesColumn",
                  disabled: offline,
                  onPress: () => open("opening"),
                },
              ]}
            />
          ) : null}
          {credit > 0n && debt > 0n && detail.data?.book ? (
            <UnappliedStrip
              amount={whole(s.totals.availableCreditMinor)}
              disabled={offline}
              onApply={() => open("apply")}
            />
          ) : null}
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          <SectionHeader
            title="Activity"
            actionLabel={offline ? undefined : busy ? "Refreshing…" : "Refresh"}
            onAction={() => void refresh()}
          />
        </View>
      }
      renderItem={({ item: e, index }) => {
        const first =
          index === 0 ||
          dayKey(s.entries[index - 1].effectiveAt) !== dayKey(e.effectiveAt)
        const last =
          index === s.entries.length - 1 ||
          dayKey(s.entries[index + 1].effectiveAt) !== dayKey(e.effectiveAt)
        return (
          <View>
            {first ? (
              <Text className="pb-2 pt-3 text-xs font-bold text-muted-foreground">
                {statementDay(e.effectiveAt)}
              </Text>
            ) : null}
            <View
              className={
                first && last
                  ? "overflow-hidden rounded-[20px] bg-card px-3.5"
                  : first
                    ? "overflow-hidden rounded-t-[20px] bg-card px-3.5"
                    : last
                      ? "overflow-hidden rounded-b-[20px] bg-card px-3.5"
                      : "overflow-hidden bg-card px-3.5"
              }
            >
              <View className={last ? undefined : "border-b border-border"}>
                <RecordRow
                  stackDetails
                  title={ledgerLabels[e.kind] ?? "Account entry"}
                  meta={e.description}
                  amount={`${e.side === "CREDIT" ? "−" : "+"}${whole(e.amountMinor)}`}
                  avatar={{
                    icon: e.side === "CREDIT" ? "Wallet" : "ReceiptText",
                    tint: e.side === "CREDIT" ? "mint" : "amber",
                  }}
                  status={
                    e.reversalOfId ? (
                      <StatusPill tone="muted" label="Correction" />
                    ) : (
                      <Text className="text-[11.5px] tabular-nums text-muted-foreground">
                        Net {whole(e.runningBalanceMinor)}
                      </Text>
                    )
                  }
                  onPress={() => open("entry", e.id)}
                />
              </View>
            </View>
          </View>
        )
      }}
      ListEmptyComponent={<Text>No recorded customer activity.</Text>}
      ListFooterComponent={
        cursors.length === 1 && !s.nextCursor ? null : (
          <View className="gap-3 pt-4">
            <ActionButton
              variant="outline"
              disabled={offline || cursors.length === 1 || busy}
              onPress={() => setCursors((v) => v.slice(0, -1))}
            >
              Previous page
            </ActionButton>
            <ActionButton
              variant="outline"
              disabled={
                offline || !s.nextCursor || snapshot === undefined || busy
              }
              onPress={() =>
                setCursors((v) => [...v, s.nextCursor ?? undefined])
              }
            >
              Next page
            </ActionButton>
          </View>
        )
      }
    />
  )
}

/** Amber strip for credit that could settle a recorded charge. */
function UnappliedStrip({
  amount,
  disabled,
  onApply,
}: {
  amount: string
  disabled: boolean
  onApply: () => void
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.amber,
        borderRadius: 18,
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Icon
        className="size-[18px]"
        color={palette.amberForeground}
        name="Link"
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <NativeText
          style={{
            color: palette.amberForeground,
            fontSize: 14,
            fontWeight: "800",
          }}
        >
          {amount} not applied
        </NativeText>
        <NativeText
          style={{
            color: palette.amberForeground,
            fontSize: 12,
            opacity: 0.85,
          }}
        >
          It can settle a recorded charge.
        </NativeText>
      </View>
      <Pressable
        accessibilityLabel="Apply existing credit"
        accessibilityRole="button"
        disabled={disabled}
        haptic
        hitSlop={8}
        onPress={onApply}
      >
        <NativeText
          style={{
            color: palette.amberForeground,
            fontSize: 13,
            fontWeight: "800",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Apply
        </NativeText>
      </Pressable>
    </View>
  )
}
