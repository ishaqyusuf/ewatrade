import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import type { GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { VariableContextProvider } from "nativewind"
import { Suspense, lazy } from "react"
import { useEffect, useRef, useState } from "react"
import { FlatList, View } from "react-native"
import { ClassicCustomerBookFilter } from "../appearances/classic/customer-book-screen"
import { HeroCard } from "../green-till/hero-card"
import {
  RecordRow,
  RowDivider,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import { useWorkflowHeader } from "../workflow-modal-screen"
import { FinanceBankDateField } from "./finance-bank-date-field"
import { financeDisplayDate } from "./finance-display"
import type { FinanceWorkspace } from "./finance-workspace-gate"

import {
  type SupplierReadToken,
  beginSupplierProtectedRead,
  canShowSupplierRead,
  completeSupplierProtectedRead,
  createSupplierReadAuthority,
  isSupplierAgingDay,
  supplierAgingBucketLabels,
  taintSupplierReadAuthority,
  transitionSupplierReadAuthority,
} from "./supplier-finance-state"

const SupplierCommandForm = lazy(() =>
  import("./supplier-command-form").then((module) => ({
    default: module.SupplierCommandForm,
  })),
)
const SupplierPurchaseScreen = lazy(() =>
  import("./supplier-purchase-screen").then((module) => ({
    default: module.SupplierPurchaseScreen,
  })),
)
const SupplierPurchaseRegistrationForm = lazy(() =>
  import("./supplier-purchase-recognition").then((module) => ({
    default: module.SupplierPurchaseRegistrationForm,
  })),
)
const SupplierPurchaseRecognitionPanel = lazy(() =>
  import("./supplier-purchase-recognition").then((module) => ({
    default: module.SupplierPurchaseRecognitionPanel,
  })),
)

export type SupplierReadResult = { isSuccess: boolean; fetchStatus: string }

export function useSupplierReadAuthority({
  scope,
  enabled,
  offline,
  paused,
  error,
  fetching,
  refetch,
}: {
  scope: string
  enabled: boolean
  offline: boolean
  paused: boolean
  error: boolean
  fetching: boolean
  refetch: () => Promise<SupplierReadResult>
}) {
  const [authority, setAuthority] = useState(() =>
    createSupplierReadAuthority(scope),
  )
  const authorityRef = useRef(authority)
  const offlineRef = useRef(offline)
  const scopeRef = useRef(scope)
  authorityRef.current = authority
  offlineRef.current = offline
  scopeRef.current = scope

  const transitioned = transitionSupplierReadAuthority(
    authorityRef.current,
    offline || paused || error || !enabled,
    scope,
  )
  if (transitioned !== authorityRef.current) {
    const next = transitioned
    authorityRef.current = next
    setAuthority(next)
  }

  function publish(next: typeof authorityRef.current) {
    authorityRef.current = next
    setAuthority(next)
  }

  function beginProtectedRead(): SupplierReadToken | null {
    if (offlineRef.current) return null
    const started = beginSupplierProtectedRead(
      authorityRef.current,
      scopeRef.current,
    )
    if (!started) return null
    publish(started.authority)
    return started.token
  }

  function completeProtectedRead(token: SupplierReadToken, succeeded: boolean) {
    const validSuccess =
      succeeded && !offlineRef.current && token.scope === scopeRef.current
    publish(
      completeSupplierProtectedRead(authorityRef.current, token, validSuccess),
    )
  }

  function isCurrent(token: SupplierReadToken) {
    const current = authorityRef.current
    return (
      !offlineRef.current &&
      token.scope === scopeRef.current &&
      current.generation === token.generation &&
      current.activeRequestId === token.requestId
    )
  }

  function runProtectedRead(read: () => Promise<SupplierReadResult> = refetch) {
    const token = beginProtectedRead()
    if (!token) return
    void Promise.resolve()
      .then(read)
      .then((result) => {
        completeProtectedRead(
          token,
          result.isSuccess && result.fetchStatus !== "paused",
        )
      })
      .catch(() => completeProtectedRead(token, false))
  }
  const runProtectedReadRef = useRef(runProtectedRead)
  runProtectedReadRef.current = runProtectedRead

  useEffect(() => {
    if (
      enabled &&
      !offline &&
      !paused &&
      !error &&
      !fetching &&
      !authority.verified &&
      !authority.attempted &&
      authority.activeRequestId === null
    )
      runProtectedReadRef.current()
  }, [enabled, offline, paused, error, fetching, authority])

  return {
    verified:
      authorityRef.current.verified &&
      authorityRef.current.scope === scope &&
      enabled &&
      !offline &&
      !paused &&
      !error,
    beginProtectedRead,
    completeProtectedRead,
    runProtectedRead,
    isCurrent,
    invalidate: () =>
      publish(
        taintSupplierReadAuthority(authorityRef.current, scopeRef.current),
      ),
  }
}

type Supplier = { id: string; code: string; name: string }
type ReversibleSupplierEntry = {
  id: string
  kind: string
  amountMinor: string
  description: string
  effectiveAt: Date | string
  reversal: { id: string } | null
}
type SupplierFinanceScreenProps = FinanceWorkspace & { onBack: () => void }
type AgingCursor = NonNullable<
  RouterInputs["finance"]["supplierPayableAging"]["cursor"]
>

export function SupplierFinanceScreen(props: SupplierFinanceScreenProps) {
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [creating, setCreating] = useState(false)
  // The account view owns the bar while it is open.
  useWorkflowHeader(
    selected
      ? null
      : creating
        ? {
            backLabel: "Back to suppliers",
            onBack: () => setCreating(false),
            title: "New supplier",
          }
        : {
            backLabel: "Back to spending",
            onBack: props.onBack,
            title: "Suppliers",
          },
  )
  if (creating)
    return (
      <Suspense fallback={<Text>Loading supplier form…</Text>}>
        <SupplierCommandForm
          {...props}
          onBack={() => setCreating(false)}
          onRecorded={() => setCreating(false)}
        />
      </Suspense>
    )
  if (selected)
    return (
      <SupplierFinanceDetail
        {...props}
        supplier={selected}
        onBack={() => setSelected(null)}
      />
    )
  return (
    <SupplierDirectory
      {...props}
      onCreate={() => setCreating(true)}
      onSelect={setSelected}
    />
  )
}

function SupplierDirectory({
  book,
  onCreate,
  onSelect,
}: SupplierFinanceScreenProps & {
  onCreate: () => void
  onSelect: (supplier: Supplier) => void
}) {
  const trpc = useTRPC()
  const colors = useColors()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const query = useInfiniteQuery(
    trpc.finance.suppliers.infiniteQueryOptions(
      { bookId: book.id, limit: 30 },
      {
        enabled: !offline,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: "always",
        refetchOnWindowFocus: false,
      },
    ),
  )
  const wasOffline = useRef(offline)
  const recovering = !offline && wasOffline.current
  useEffect(() => {
    wasOffline.current = offline
  }, [offline])
  const authority = useSupplierReadAuthority({
    scope: `directory:${book.id}`,
    enabled: true,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: query.refetch,
  })
  const visible = canShowSupplierRead({
    success: query.isSuccess,
    fetching: query.isFetching,
    paused: query.fetchStatus === "paused",
    offline,
    error: query.isError,
    verified: authority.verified && !recovering,
    scopeMatches: true,
  })
  const suppliers = visible
    ? (query.data?.pages.flatMap((page) => page.data) ?? [])
    : []
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 48 }}
      data={suppliers}
      keyExtractor={(supplier) => supplier.id}
      refreshing={query.isRefetching}
      onRefresh={() => {
        authority.runProtectedRead()
      }}
      onEndReached={() => {
        if (visible && query.hasNextPage && !query.isFetchingNextPage)
          void query.fetchNextPage()
      }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          <ActionButton icon="Plus" onPress={onCreate}>
            Add supplier
          </ActionButton>
          {offline ? (
            <StatusBanner
              title="Offline"
              message="Supplier balances are hidden until a fresh online read is available."
              tone="warning"
            />
          ) : null}
          {query.isPending && !offline ? (
            <Skeleton className="h-36 rounded-[20px]" />
          ) : null}
          {query.isError ? (
            <StatusBanner
              title="Suppliers unavailable"
              message={query.error.message}
              actionLabel="Try again"
              onActionPress={() => {
                authority.runProtectedRead()
              }}
              tone="destructive"
            />
          ) : null}
          {query.isSuccess && visible && suppliers.length === 0 ? (
            <StatusBanner
              title="No suppliers yet"
              message="Supplier accounts will appear here when they are added to this financial book."
              tone="muted"
            />
          ) : null}
          {suppliers.length ? (
            <SectionHeader
              title="Supplier accounts"
              trailing={
                <Text className="text-xs font-bold text-muted-foreground">
                  {suppliers.length}
                  {query.hasNextPage ? "+" : ""}
                </Text>
              }
            />
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const last = index === suppliers.length - 1
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "rounded-t-[20px]",
              last && "rounded-b-[20px]",
            )}
          >
            <RecordRow
              accessibilityLabel={`${item.name}, ${item.code}, open supplier statement`}
              title={item.name}
              meta={item.code}
              avatar={{
                initials: item.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase(),
                tint: "amber",
              }}
              status={
                <Icon
                  className="size-[16px]"
                  color={colors.mutedForeground}
                  name="ChevronRight"
                />
              }
              onPress={() => onSelect(item)}
            />
            {last ? null : <RowDivider />}
          </View>
        )
      }}
      ListFooterComponent={
        visible && query.hasNextPage && !query.isFetchingNextPage ? (
          <ActionButton
            variant="outline"
            isLoading={query.isFetchingNextPage}
            onPress={() => {
              authority.invalidate()
              authority.runProtectedRead(query.fetchNextPage)
            }}
          >
            Load more suppliers
          </ActionButton>
        ) : null
      }
    />
  )
}

export function SupplierFinanceDetail({
  book,
  actorUserId,
  tenantId,
  supplier,
  onBack,
  initialView = "statement",
}: SupplierFinanceScreenProps & {
  supplier: Supplier
  onBack: () => void
  initialView?: "statement" | "aging"
}) {
  const [view, setView] = useState<"statement" | "aging" | "purchases">(
    initialView,
  )
  const [recording, setRecording] = useState(false)
  const [reversalEntry, setReversalEntry] =
    useState<ReversibleSupplierEntry | null>(null)
  const [advanceToAllocate, setAdvanceToAllocate] =
    useState<ReversibleSupplierEntry | null>(null)
  const [purchaseId, setPurchaseId] = useState<string | null>(null)
  const [registeringPurchase, setRegisteringPurchase] = useState(false)
  const [recognitionId, setRecognitionId] = useState<string | null>(null)
  const subView = recognitionId
    ? "Purchase history"
    : registeringPurchase
      ? "Register purchase"
      : purchaseId
        ? "Purchase"
        : recording || reversalEntry
          ? reversalEntry
            ? "Correct entry"
            : "Record entry"
          : null
  useWorkflowHeader({
    backLabel: subView ? "Back to supplier account" : "Back to suppliers",
    onBack: subView
      ? () => {
          setRecognitionId(null)
          setRegisteringPurchase(false)
          setPurchaseId(null)
          setRecording(false)
          setReversalEntry(null)
        }
      : onBack,
    title: subView ?? "Supplier account",
  })
  if (recognitionId)
    return (
      <Suspense
        fallback={<Text className="px-4">Loading purchase history…</Text>}
      >
        <SupplierPurchaseRecognitionPanel
          book={book}
          actorUserId={actorUserId}
          tenantId={tenantId}
          supplier={supplier}
          recognitionId={recognitionId}
          onBack={() => setRecognitionId(null)}
        />
      </Suspense>
    )
  if (registeringPurchase)
    return (
      <Suspense fallback={<Text className="px-4">Loading purchase form…</Text>}>
        <SupplierPurchaseRegistrationForm
          book={book}
          actorUserId={actorUserId}
          tenantId={tenantId}
          supplier={supplier}
          onBack={() => setRegisteringPurchase(false)}
          onRegistered={(id) => {
            setRegisteringPurchase(false)
            setRecognitionId(id)
          }}
        />
      </Suspense>
    )
  if (purchaseId)
    return (
      <Suspense fallback={<Text className="px-4">Loading purchase…</Text>}>
        <SupplierPurchaseScreen
          book={book}
          actorUserId={actorUserId}
          tenantId={tenantId}
          supplier={supplier}
          purchaseId={purchaseId}
          advanceToAllocate={advanceToAllocate ?? undefined}
          onBack={() => setPurchaseId(null)}
          onRegisterPurchase={() => setRegisteringPurchase(true)}
        />
      </Suspense>
    )
  if (recording || reversalEntry)
    return (
      <Suspense fallback={<Text className="px-4">Loading supplier form…</Text>}>
        <SupplierCommandForm
          book={book}
          actorUserId={actorUserId}
          tenantId={tenantId}
          supplier={supplier}
          reversalEntry={reversalEntry ?? undefined}
          onBack={() => {
            setRecording(false)
            setReversalEntry(null)
          }}
          onRecorded={() => {
            setRecording(false)
            setReversalEntry(null)
          }}
        />
      </Suspense>
    )
  return (
    <View className="flex-1 px-[18px]">
      <View className="gap-3 pb-3">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text
              className="text-lg font-extrabold tracking-tight text-foreground"
              numberOfLines={2}
            >
              {supplier.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {supplier.code} · {book.currencyCode} · all stores
            </Text>
          </View>
          <ActionButton
            className="min-h-[44px] w-auto px-4"
            icon="Plus"
            variant="outline"
            onPress={() => setRecording(true)}
          >
            Record entry
          </ActionButton>
        </View>
        <View className="flex-row gap-2">
          {(
            [
              { value: "statement", label: "Statement" },
              { value: "aging", label: "Payable aging" },
              { value: "purchases", label: "Purchases" },
            ] as const
          ).map((tab) => (
            <ClassicCustomerBookFilter
              key={tab.value}
              active={view === tab.value}
              label={tab.label}
              onPress={() => setView(tab.value)}
            />
          ))}
        </View>
      </View>
      {view === "statement" ? (
        <SupplierStatement
          key={supplier.id}
          bookId={book.id}
          supplier={supplier}
          currencyCode={book.currencyCode}
          onReverse={setReversalEntry}
          onAllocateAdvance={(entry) => {
            setAdvanceToAllocate(entry)
            setView("purchases")
          }}
        />
      ) : view === "aging" ? (
        <SupplierAging
          key={supplier.id}
          bookId={book.id}
          supplier={supplier}
          currencyCode={book.currencyCode}
        />
      ) : (
        <Suspense fallback={<Text>Loading purchases…</Text>}>
          <SupplierPurchaseScreen
            book={book}
            actorUserId={actorUserId}
            tenantId={tenantId}
            supplier={supplier}
            advanceToAllocate={advanceToAllocate ?? undefined}
            onSelectPurchase={setPurchaseId}
            onRegisterPurchase={() => setRegisteringPurchase(true)}
            onSelectRecognition={setRecognitionId}
          />
        </Suspense>
      )}
    </View>
  )
}

function SupplierStatement({
  bookId,
  supplier,
  currencyCode,
  onReverse,
  onAllocateAdvance,
}: {
  bookId: string
  supplier: Supplier
  currencyCode: string
  onReverse: (entry: ReversibleSupplierEntry) => void
  onAllocateAdvance: (entry: ReversibleSupplierEntry) => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [snapshot, setSnapshot] = useState<string>()
  const [cursor, setCursor] = useState<string>()
  const [previous, setPrevious] = useState<(string | undefined)[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const query = useQuery(
    trpc.finance.supplierStatement.queryOptions(
      {
        bookId,
        supplierId: supplier.id,
        snapshotSequence: snapshot,
        cursor,
        limit: 30,
      },
      {
        enabled: !offline,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: "always",
        refetchOnWindowFocus: false,
      },
    ),
  )
  const scope = `statement:${bookId}:${supplier.id}:${snapshot ?? "latest"}:${cursor ?? "first"}`
  const authority = useSupplierReadAuthority({
    scope,
    enabled: true,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: query.refetch,
  })
  useEffect(() => {
    if (
      snapshot === undefined &&
      query.data &&
      authority.verified &&
      !query.isFetching &&
      query.fetchStatus !== "paused" &&
      !query.isError &&
      !refreshing &&
      !offline
    )
      setSnapshot(query.data.snapshotSequence)
  }, [
    snapshot,
    query.data,
    query.isFetching,
    query.fetchStatus,
    query.isError,
    refreshing,
    offline,
    authority.verified,
  ])
  const visible = canShowSupplierRead({
    success: query.isSuccess && refreshError === null,
    fetching: query.isFetching || refreshing,
    paused: query.fetchStatus === "paused",
    offline,
    error: query.isError,
    verified: authority.verified,
    scopeMatches:
      snapshot === undefined || query.data?.snapshotSequence === snapshot,
  })
  async function refresh() {
    if (refreshing || query.isFetching || offline) return
    authority.invalidate()
    const token = authority.beginProtectedRead()
    if (!token) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const latest = await client.fetchQuery(
        trpc.finance.supplierStatement.queryOptions(
          { bookId, supplierId: supplier.id, limit: 30 },
          { retry: false, staleTime: 0 },
        ),
      )
      if (!authority.isCurrent(token)) return
      const pinnedInput = {
        bookId,
        supplierId: supplier.id,
        snapshotSequence: latest.snapshotSequence,
        cursor: undefined,
        limit: 30,
      }
      client.setQueryData(
        trpc.finance.supplierStatement.queryKey(pinnedInput),
        latest,
      )
      authority.completeProtectedRead(token, true)
      setPrevious([])
      setCursor(undefined)
      setSnapshot(latest.snapshotSequence)
    } catch (failure) {
      authority.completeProtectedRead(token, false)
      setRefreshError(
        failure instanceof Error
          ? failure.message
          : "Statement refresh failed.",
      )
    } finally {
      setRefreshing(false)
    }
  }
  function changePage(nextCursor: string | undefined) {
    if (snapshot === undefined || offline) return
    const input = {
      bookId,
      supplierId: supplier.id,
      snapshotSequence: snapshot,
      cursor: nextCursor,
      limit: 30,
    }
    client.removeQueries({
      queryKey: trpc.finance.supplierStatement.queryKey(input),
      exact: true,
    })
    setCursor(nextCursor)
  }
  return (
    <FlatList
      className="flex-1"
      data={visible ? (query.data?.data ?? []) : []}
      keyExtractor={(entry) => entry.id}
      refreshing={refreshing || query.isRefetching}
      onRefresh={() => void refresh()}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          {offline ? (
            <StatusBanner
              title="Offline"
              message="Statement details and balances are hidden until a fresh online read is available."
              tone="warning"
            />
          ) : null}
          {query.isPending && !offline ? (
            <Skeleton className="h-48 rounded-[22px]" />
          ) : null}
          {query.isError ? (
            <StatusBanner
              title="Statement unavailable"
              message={query.error.message}
              actionLabel="Try again"
              onActionPress={() => {
                authority.runProtectedRead()
              }}
              tone="destructive"
            />
          ) : null}
          {refreshError ? (
            <StatusBanner
              title="Statement refresh failed"
              message={refreshError}
              actionLabel="Try again"
              onActionPress={() => void refresh()}
              tone="destructive"
            />
          ) : null}
          {visible && query.data ? (
            <HeroCard
              label="Payable to supplier"
              amount={formatFinanceMoney(query.data.payableMinor, currencyCode)}
              sub={`Advance held ${formatFinanceMoney(query.data.advanceMinor, currencyCode)} · kept separate`}
              stats={[
                {
                  label: "Payable",
                  value: formatFinanceMoney(
                    query.data.payableMinor,
                    currencyCode,
                  ),
                },
                {
                  label: "Advance",
                  value: formatFinanceMoney(
                    query.data.advanceMinor,
                    currencyCode,
                  ),
                },
              ]}
            />
          ) : null}
          {query.isSuccess && visible && query.data.data.length === 0 ? (
            <Text className="py-6 text-sm text-muted-foreground">
              No supplier entries at this snapshot.
            </Text>
          ) : null}
          {visible && query.data?.data.length ? (
            <SectionHeader title="Statement" />
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const rows = query.data?.data ?? []
        const last = index === rows.length - 1
        const style = supplierEntryStyle(item.kind)
        const canCorrect =
          !item.reversal &&
          ["OPENING_PAYABLE", "OPENING_ADVANCE", "ADVANCE"].includes(item.kind)
        const canApply =
          !item.reversal && ["OPENING_ADVANCE", "ADVANCE"].includes(item.kind)
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "rounded-t-[20px]",
              last && "rounded-b-[20px]",
            )}
          >
            <RecordRow
              stackDetails
              title={item.description}
              meta={`${financeDisplayDate(item.effectiveAt)} · ${supplierKindLabel(item.kind)}${item.reversal ? " · Reversed" : ""}`}
              amount={formatFinanceMoney(item.amountMinor, currencyCode)}
              avatar={{ icon: style.icon, tint: style.tint }}
            />
            {canCorrect || canApply ? (
              <View className="-mt-1 flex-row flex-wrap gap-x-5 pb-3 pl-[50px]">
                {canCorrect ? (
                  <Pressable
                    accessibilityLabel={`Correct ${supplierKindLabel(item.kind)} dated ${financeDisplayDate(item.effectiveAt)}`}
                    accessibilityRole="button"
                    className="min-h-9 justify-center"
                    hitSlop={6}
                    onPress={() => onReverse(item)}
                  >
                    <Text className="text-[13px] font-bold text-primary">
                      Correct
                    </Text>
                  </Pressable>
                ) : null}
                {canApply ? (
                  <Pressable
                    accessibilityLabel={`Choose a purchase to apply ${supplierKindLabel(item.kind)} from ${financeDisplayDate(item.effectiveAt)}`}
                    accessibilityRole="button"
                    className="min-h-9 justify-center"
                    hitSlop={6}
                    onPress={() => onAllocateAdvance(item)}
                  >
                    <Text className="text-[13px] font-bold text-primary">
                      Apply to a purchase
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {last ? null : <RowDivider />}
          </View>
        )
      }}
      ListFooterComponent={
        visible && query.data ? (
          <SupplierFinancePageControls
            visible={visible}
            nextLabel="Next entries"
            previousLabel="Previous entries"
            hasNext={query.data.nextCursor !== null}
            hasPrevious={previous.length > 0}
            onNext={() => {
              const next = query.data?.nextCursor ?? undefined
              if (next === undefined) return
              setPrevious((pages) => [...pages, cursor])
              changePage(next)
            }}
            onPrevious={() => {
              const prev = previous.at(-1)
              setPrevious((pages) => pages.slice(0, -1))
              changePage(prev)
            }}
          />
        ) : null
      }
      contentContainerClassName="pb-12"
    />
  )
}

const SUPPLIER_KIND_LABELS: Record<string, string> = {
  ADVANCE: "Advance paid",
  ADVANCE_ALLOCATION: "Advance applied",
  OPENING_ADVANCE: "Opening advance",
  OPENING_PAYABLE: "Opening payable",
  PURCHASE: "Purchase",
  PURCHASE_BILL: "Purchase bill",
  PURCHASE_PAYMENT: "Payment",
  PURCHASE_PAYMENT_REVERSAL: "Payment reversed",
  PURCHASE_RECOGNITION_REVERSAL: "Purchase reversed",
  REVERSAL: "Reversal",
  SUPPLIER_OPENING_PAYABLE: "Opening payable",
}
function supplierKindLabel(kind: string) {
  const known = SUPPLIER_KIND_LABELS[kind]
  if (known) return known
  const words = kind.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
function supplierEntryStyle(kind: string): {
  icon: IconKeys
  tint: GreenTillTint
} {
  if (kind.includes("REVERSAL")) return { icon: "Undo2", tint: "rose" }
  if (kind.includes("PAYMENT") || kind === "ADVANCE")
    return { icon: "ArrowUp", tint: "mint" }
  if (kind.startsWith("PURCHASE")) return { icon: "ReceiptText", tint: "amber" }
  return { icon: "FileText", tint: "sky" }
}

function SupplierAging({
  bookId,
  supplier,
  currencyCode,
}: { bookId: string; supplier: Supplier; currencyCode: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [asOfDate, setAsOfDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const asOfDateRef = useRef(asOfDate)
  asOfDateRef.current = asOfDate
  const scopeGeneration = useRef(0)
  const refreshGeneration = useRef(0)
  const [snapshot, setSnapshot] = useState<string>()
  const [snapshotDate, setSnapshotDate] = useState<string>()
  const [cursor, setCursor] = useState<AgingCursor>()
  const [previous, setPrevious] = useState<(AgingCursor | undefined)[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const validDay = isSupplierAgingDay(asOfDate)
  const query = useQuery(
    trpc.finance.supplierPayableAging.queryOptions(
      {
        bookId,
        supplierId: supplier.id,
        asOfDate,
        snapshotSequence: snapshot,
        cursor,
        limit: 30,
      },
      {
        enabled: validDay && !offline,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: "always",
        refetchOnWindowFocus: false,
      },
    ),
  )
  const readScope = `aging:${bookId}:${supplier.id}:${asOfDate}:${snapshot ?? "latest"}:${cursor ? JSON.stringify(cursor) : "first"}`
  const authority = useSupplierReadAuthority({
    scope: readScope,
    enabled: validDay,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: query.refetch,
  })
  useEffect(() => {
    if (
      snapshot === undefined &&
      query.data &&
      validDay &&
      !offline &&
      query.data.asOfDate === asOfDate &&
      authority.verified &&
      !query.isFetching &&
      query.fetchStatus !== "paused" &&
      !query.isError &&
      !refreshing
    ) {
      setSnapshot(query.data.snapshotSequence)
      setSnapshotDate(asOfDate)
    }
  }, [
    snapshot,
    query.data,
    query.isFetching,
    query.fetchStatus,
    query.isError,
    authority.verified,
    refreshing,
    validDay,
    offline,
    asOfDate,
  ])
  const visible =
    validDay &&
    canShowSupplierRead({
      success: query.isSuccess && refreshError === null,
      fetching: query.isFetching || refreshing,
      paused: query.fetchStatus === "paused",
      offline,
      error: query.isError,
      verified: authority.verified,
      scopeMatches:
        query.data?.asOfDate === asOfDate &&
        (snapshotDate === undefined || snapshotDate === asOfDate) &&
        (snapshot === undefined || query.data?.snapshotSequence === snapshot),
    })
  async function refresh() {
    if (refreshing || query.isFetching || offline || !validDay) return
    const requestedDate = asOfDate
    const requestedScope = scopeGeneration.current
    const request = ++refreshGeneration.current
    authority.invalidate()
    const token = authority.beginProtectedRead()
    if (!token) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const latest = await client.fetchQuery(
        trpc.finance.supplierPayableAging.queryOptions(
          { bookId, supplierId: supplier.id, asOfDate, limit: 30 },
          { retry: false, staleTime: 0 },
        ),
      )
      if (
        request !== refreshGeneration.current ||
        requestedScope !== scopeGeneration.current ||
        asOfDateRef.current !== requestedDate ||
        !authority.isCurrent(token)
      )
        return
      const pinnedInput = {
        bookId,
        supplierId: supplier.id,
        asOfDate,
        snapshotSequence: latest.snapshotSequence,
        cursor: undefined,
        limit: 30,
      }
      client.setQueryData(
        trpc.finance.supplierPayableAging.queryKey(pinnedInput),
        latest,
      )
      authority.completeProtectedRead(token, true)
      setPrevious([])
      setCursor(undefined)
      setSnapshot(latest.snapshotSequence)
      setSnapshotDate(asOfDate)
    } catch (failure) {
      authority.completeProtectedRead(token, false)
      if (
        request === refreshGeneration.current &&
        requestedScope === scopeGeneration.current &&
        asOfDateRef.current === requestedDate
      )
        setRefreshError(
          failure instanceof Error
            ? failure.message
            : "Payable aging refresh failed.",
        )
    } finally {
      if (request === refreshGeneration.current) setRefreshing(false)
    }
  }
  function changeDate(value: string) {
    scopeGeneration.current += 1
    refreshGeneration.current += 1
    setRefreshing(false)
    authority.invalidate()
    if (isSupplierAgingDay(value)) {
      client.removeQueries({
        queryKey: trpc.finance.supplierPayableAging.queryKey({
          bookId,
          supplierId: supplier.id,
          asOfDate: value,
          snapshotSequence: undefined,
          cursor: undefined,
          limit: 30,
        }),
        exact: true,
      })
    }
    setAsOfDate(value)
    setSnapshot(undefined)
    setSnapshotDate(undefined)
    setCursor(undefined)
    setPrevious([])
    setRefreshError(null)
  }
  const total = visible && query.data ? BigInt(query.data.payableMinor) : 0n
  function changePage(nextCursor: AgingCursor | undefined) {
    if (snapshot === undefined || offline || !validDay) return
    const input = {
      bookId,
      supplierId: supplier.id,
      asOfDate,
      snapshotSequence: snapshot,
      cursor: nextCursor,
      limit: 30,
    }
    client.removeQueries({
      queryKey: trpc.finance.supplierPayableAging.queryKey(input),
      exact: true,
    })
    setCursor(nextCursor)
  }
  return (
    <FlatList
      className="flex-1"
      data={visible ? (query.data?.data ?? []) : []}
      keyExtractor={(entry) => entry.sourceEntryId}
      refreshing={refreshing || query.isRefetching}
      onRefresh={() => void refresh()}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          <FinanceBankDateField
            label="Aging as of"
            value={asOfDate}
            onChange={changeDate}
            minimum="2000-01-01"
            maximum={new Date().toISOString().slice(0, 10)}
          />
          {!validDay ? (
            <Text className="text-sm text-destructive">
              Enter a real date in YYYY-MM-DD format.
            </Text>
          ) : null}
          {offline ? (
            <StatusBanner
              title="Offline"
              message="Aging totals and source entries are hidden until a fresh online read is available."
              tone="warning"
            />
          ) : null}
          {query.isPending && validDay && !offline ? (
            <Skeleton className="h-48 rounded-[20px]" />
          ) : null}
          {query.isError ? (
            <StatusBanner
              title="Payable aging unavailable"
              message={query.error.message}
              actionLabel="Try again"
              onActionPress={() => {
                authority.runProtectedRead()
              }}
              tone="destructive"
            />
          ) : null}
          {refreshError ? (
            <StatusBanner
              title="Payable aging refresh failed"
              message={refreshError}
              actionLabel="Try again"
              onActionPress={() => void refresh()}
              tone="destructive"
            />
          ) : null}
          {visible && query.data ? (
            <View>
              <SectionHeader
                title={`Payable aging · as of ${financeDisplayDate(`${asOfDate}T00:00:00.000Z`)}`}
              />
              <View className="gap-3.5 rounded-[20px] bg-card p-4 shadow-sm">
                {query.data.buckets.map((bucket) => {
                  const amount = BigInt(bucket.amountMinor)
                  const pct = total > 0n ? Number((amount * 100n) / total) : 0
                  const tone =
                    bucket.bucket === "NOT_DUE" ||
                    bucket.bucket === "DUE_TODAY" ||
                    bucket.bucket === "UNDATED"
                      ? "bg-primary"
                      : bucket.bucket === "OVERDUE_1_30"
                        ? "bg-gold"
                        : "bg-destructive"
                  return (
                    <View key={bucket.bucket} className="gap-1.5">
                      <View className="flex-row justify-between gap-3">
                        <Text className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
                          {supplierAgingBucketLabels[bucket.bucket]}
                        </Text>
                        <Text className="text-[13px] font-bold tabular-nums text-foreground">
                          {formatFinanceMoney(bucket.amountMinor, currencyCode)}
                        </Text>
                      </View>
                      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <VariableContextProvider
                          value={{ "--aging-width": `${pct}%` }}
                        >
                          <View
                            className={cn(
                              "h-full w-[var(--aging-width)] rounded-full",
                              tone,
                            )}
                          />
                        </VariableContextProvider>
                      </View>
                    </View>
                  )
                })}
              </View>
              <Text className="mt-2 px-0.5 text-xs text-muted-foreground">
                Payable{" "}
                {formatFinanceMoney(query.data.payableMinor, currencyCode)} ·
                advance held{" "}
                {formatFinanceMoney(query.data.advanceMinor, currencyCode)} ·
                based on recorded due dates
              </Text>
            </View>
          ) : null}
          {visible && query.data?.data.length ? (
            <SectionHeader title="Open sources" />
          ) : null}
          {query.isSuccess && visible && query.data.data.length === 0 ? (
            <Text className="py-6 text-sm text-muted-foreground">
              No outstanding payable sources at this cutoff.
            </Text>
          ) : null}
          {visible &&
          query.data &&
          query.data.outstandingSourceCount > query.data.sourceLimit ? (
            <StatusBanner
              title="Aging source limit reached"
              message="The full aging result is unavailable. Ask an administrator to stage a report."
              tone="warning"
            />
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const rows = query.data?.data ?? []
        const last = index === rows.length - 1
        const overdue = item.bucket.startsWith("OVERDUE")
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "rounded-t-[20px]",
              last && "rounded-b-[20px]",
            )}
          >
            <RecordRow
              stackDetails
              title={item.reference || item.description}
              meta={`${supplierKindLabel(item.kind)} · ${item.dueAt ? `due ${financeDisplayDate(item.dueAt)}` : "no due date"}`}
              amount={formatFinanceMoney(item.outstandingMinor, currencyCode)}
              avatar={{
                icon: overdue ? "TriangleAlert" : "ReceiptText",
                tint: overdue ? "rose" : "amber",
              }}
              status={
                <StatusPill
                  label={supplierAgingBucketLabels[item.bucket]}
                  tone={overdue ? "danger" : "muted"}
                />
              }
            />
            {last ? null : <RowDivider />}
          </View>
        )
      }}
      ListFooterComponent={
        visible && query.data ? (
          <SupplierFinancePageControls
            visible={visible}
            nextLabel="Next sources"
            previousLabel="Previous sources"
            hasNext={query.data.nextCursor !== null}
            hasPrevious={previous.length > 0}
            onNext={() => {
              const next = query.data?.nextCursor ?? undefined
              if (next === undefined) return
              setPrevious((pages) => [...pages, cursor])
              changePage(next)
            }}
            onPrevious={() => {
              const prev = previous.at(-1)
              setPrevious((pages) => pages.slice(0, -1))
              changePage(prev)
            }}
          />
        ) : null
      }
      contentContainerClassName="pb-12"
    />
  )
}

function Amount({
  label,
  amount,
  currencyCode,
}: { label: string; amount: string; currencyCode: string }) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-base font-bold">
        {formatFinanceMoney(amount, currencyCode)}
      </Text>
    </View>
  )
}

export function SupplierFinancePageControls({
  visible,
  hasNext,
  hasPrevious,
  nextLabel,
  previousLabel,
  onNext,
  onPrevious,
}: {
  visible: boolean
  hasNext: boolean
  hasPrevious: boolean
  nextLabel: string
  previousLabel: string
  onNext: () => void
  onPrevious: () => void
}) {
  if (!visible || (!hasNext && !hasPrevious)) return null
  return (
    <View className="gap-2">
      {hasNext ? (
        <ActionButton variant="outline" onPress={onNext}>
          {nextLabel}
        </ActionButton>
      ) : null}
      {hasPrevious ? (
        <ActionButton variant="ghost" onPress={onPrevious}>
          {previousLabel}
        </ActionButton>
      ) : null}
    </View>
  )
}
