import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FlatList, ScrollView, View } from "react-native"
import {
  ListCard,
  RecordRow,
  RowDivider,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
import type { FinanceWorkspace } from "./finance-workspace-gate"
import { useSupplierReadAuthority } from "./supplier-finance-screen"
import { SupplierPurchaseRecognitionPanel } from "./supplier-purchase-recognition"
import {
  purchaseRecognitionPagesAreComplete,
  purchaseRecognitionPagesMatchScope,
} from "./supplier-purchase-recognition-state"
import { SupplierPurchaseSettlementForm } from "./supplier-purchase-settlement-form"
import type { PurchaseSettlementMode } from "./supplier-purchase-settlement-form"
import { resolveSupplierPurchaseView } from "./supplier-purchase-settlement-state"

type Supplier = { id: string; code: string; name: string }
type PurchaseItem = RouterOutputs["finance"]["purchases"]["items"][number]
type PurchaseDetail = RouterOutputs["finance"]["purchase"]
type AdvanceSelection = {
  id: string
  kind: string
  amountMinor: string
  description: string
  effectiveAt: Date | string
  reversal: { id: string } | null
}
type PurchasePayment = PurchaseDetail["payments"][number]
type PurchaseAllocation = PurchaseDetail["allocations"][number]

export function SupplierPurchaseScreen({
  book,
  actorUserId,
  tenantId,
  supplier,
  purchaseId,
  advanceToAllocate,
  onBack,
  onSelectPurchase,
  onRegisterPurchase,
  onSelectRecognition,
}: FinanceWorkspace & {
  supplier: Supplier
  purchaseId?: string
  advanceToAllocate?: AdvanceSelection
  onBack?: () => void
  onSelectPurchase?: (purchaseId: string) => void
  onRegisterPurchase?: () => void
  onSelectRecognition?: (recognitionId: string) => void
}) {
  if (purchaseId && onBack)
    return (
      <SupplierPurchaseDetail
        book={book}
        actorUserId={actorUserId}
        tenantId={tenantId}
        supplier={supplier}
        purchaseId={purchaseId}
        advanceToAllocate={advanceToAllocate}
        onBack={onBack}
      />
    )
  if (!onSelectPurchase) return null
  return (
    <SupplierPurchaseList
      book={book}
      supplier={supplier}
      advanceToAllocate={advanceToAllocate}
      actorUserId={actorUserId}
      tenantId={tenantId}
      onSelectPurchase={onSelectPurchase}
      onRegisterPurchase={onRegisterPurchase}
      onSelectRecognition={onSelectRecognition}
    />
  )
}

function SupplierPurchaseList({
  book,
  actorUserId,
  tenantId,
  supplier,
  advanceToAllocate,
  onSelectPurchase,
  onRegisterPurchase,
  onSelectRecognition,
}: {
  book: FinanceWorkspace["book"]
  actorUserId: string
  tenantId: string
  supplier: Supplier
  advanceToAllocate?: AdvanceSelection
  onSelectPurchase: (purchaseId: string) => void
  onRegisterPurchase?: () => void
  onSelectRecognition?: (recognitionId: string) => void
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const profile = getSession()?.profile
  const sessionMatches =
    profile?.id === actorUserId &&
    profile.businessId === tenantId &&
    ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
  const query = useInfiniteQuery(
    trpc.finance.purchases.infiniteQueryOptions(
      { bookId: book.id, supplierId: supplier.id, limit: 30 },
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
  const authority = useSupplierReadAuthority({
    scope: `purchases:${book.id}:${supplier.id}`,
    enabled: true,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: query.refetch,
  })
  const visible = authority.verified && query.isSuccess && !query.isFetching
  const purchases = visible
    ? (query.data?.pages.flatMap((page) => page.items) ?? [])
    : []
  const recognitionQuery = useInfiniteQuery(
    trpc.finance.purchaseRecognitions.infiniteQueryOptions(
      { bookId: book.id, supplierId: supplier.id, limit: 30 },
      {
        enabled: !offline && sessionMatches,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: "always",
        refetchOnWindowFocus: false,
      },
    ),
  )
  const recognitionAuthority = useSupplierReadAuthority({
    scope: `purchase-recognitions:${actorUserId}:${tenantId}:${book.id}:${supplier.id}`,
    enabled: sessionMatches,
    offline,
    paused: recognitionQuery.fetchStatus === "paused",
    error: recognitionQuery.isError,
    fetching: recognitionQuery.isFetching,
    refetch: recognitionQuery.refetch,
  })
  const recognitionPages = recognitionQuery.data?.pages ?? []
  const recognitionPageParams = recognitionQuery.data?.pageParams ?? []
  const recognitionScopeMatches = purchaseRecognitionPagesMatchScope(
    recognitionPages,
    {
      bookId: book.id,
      supplierId: supplier.id,
      currencyCode: book.currencyCode,
    },
  )
  const recognitionPagesComplete = purchaseRecognitionPagesAreComplete(
    recognitionPages,
    recognitionPageParams,
  )
  const recognitionsVisible =
    sessionMatches &&
    recognitionAuthority.verified &&
    recognitionQuery.isSuccess &&
    !recognitionQuery.isFetching &&
    recognitionScopeMatches &&
    recognitionPagesComplete
  const recognitions = recognitionsVisible
    ? recognitionPages.flatMap((page) => page.items)
    : []
  const summary = visible ? query.data?.pages[0]?.summary : undefined
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  return (
    <FlatList
      className="flex-1"
      data={purchases}
      keyExtractor={(item) => item.id}
      refreshing={query.isRefetching || recognitionQuery.isRefetching}
      onRefresh={() => {
        authority.runProtectedRead()
        recognitionAuthority.runProtectedRead()
      }}
      onEndReached={() => {
        if (visible && query.hasNextPage && !query.isFetchingNextPage)
          void query.fetchNextPage()
      }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          {onRegisterPurchase ? (
            <ActionButton
              icon="Plus"
              variant="outline"
              onPress={onRegisterPurchase}
            >
              Register agreed goods
            </ActionButton>
          ) : null}
          <SectionHeader
            title="Agreed goods"
            trailing={
              recognitionsVisible && recognitions.length ? (
                <Text className="text-xs font-bold text-muted-foreground">
                  {recognitions.length}
                </Text>
              ) : undefined
            }
          />
          {recognitionQuery.isPending && !offline && sessionMatches ? (
            <Text>Loading agreed goods sources…</Text>
          ) : null}
          {recognitionQuery.isError && sessionMatches ? (
            <StatusBanner
              title="Agreed goods sources unavailable"
              message={recognitionQuery.error.message}
              actionLabel="Try again"
              onActionPress={() => recognitionAuthority.runProtectedRead()}
              tone="destructive"
            />
          ) : null}
          {recognitionQuery.isSuccess &&
          !recognitionScopeMatches &&
          !recognitionQuery.isFetching &&
          !offline &&
          sessionMatches ? (
            <StatusBanner
              title="Purchase source scope changed"
              message="These server records do not match the active supplier and finance book. No source is shown."
              tone="warning"
            />
          ) : null}
          {recognitionQuery.isSuccess &&
          recognitionScopeMatches &&
          !recognitionPagesComplete &&
          !recognitionQuery.isFetching &&
          !offline &&
          sessionMatches ? (
            <StatusBanner
              title="Agreed goods pages could not be verified"
              message="The source pages repeated a record or cursor, or did not continue from the prior page. Refresh before opening a source."
              actionLabel="Refresh sources"
              onActionPress={() => recognitionAuthority.runProtectedRead()}
              tone="warning"
            />
          ) : null}
          {recognitionsVisible && recognitions.length === 0 ? (
            <StatusBanner
              title="No agreed goods sources"
              message="This supplier has no registered purchase agreements in the current finance book."
              tone="muted"
            />
          ) : null}
          {recognitionsVisible && onSelectRecognition && recognitions.length ? (
            <ListCard>
              {recognitions.map((item) => (
                <RecordRow
                  key={item.id}
                  accessibilityLabel={`${item.description}, ${money(item.amountMinor)}, open purchase source history`}
                  title={item.description}
                  meta={`Agreed ${financeDisplayDate(item.agreedAt)}`}
                  amount={money(item.amountMinor)}
                  avatar={{ icon: "Package", tint: "sky" }}
                  onPress={() => onSelectRecognition(item.id)}
                />
              ))}
            </ListCard>
          ) : null}
          {advanceToAllocate ? (
            <StatusBanner
              title="Choose a purchase"
              message="Select a current purchase from this supplier. Available advance is checked from the source and complete allocation history before review."
              tone="primary"
            />
          ) : null}
          {offline ? (
            <StatusBanner
              title="Offline"
              message="Purchase totals and bill history are hidden until a fresh online read is available."
              tone="warning"
            />
          ) : null}
          {query.isPending && !offline ? (
            <Text>Loading supplier purchases…</Text>
          ) : null}
          {query.isError ? (
            <StatusBanner
              title="Purchases unavailable"
              message={query.error.message}
              actionLabel="Try again"
              onActionPress={() => authority.runProtectedRead()}
              tone="destructive"
            />
          ) : null}
          <SectionHeader
            title="Purchase bills"
            trailing={
              summary ? (
                <Text className="text-xs font-bold text-muted-foreground">
                  {query.data?.pages[0]?.count ?? 0}
                </Text>
              ) : undefined
            }
          />
          {summary ? (
            <View className="flex-row rounded-[20px] bg-card px-4 py-3 shadow-sm">
              {[
                ["Incurred", money(summary.incurredMinor)],
                ["Still owed", money(summary.outstandingMinor)],
              ].map(([label, value]) => (
                <View key={label} className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-xs text-muted-foreground">{label}</Text>
                  <Text className="text-sm font-bold tabular-nums text-foreground">
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {visible && purchases.length === 0 ? (
            <StatusBanner
              title="No purchase bills"
              message="This supplier has no recorded purchase bills in the current finance book. Supplier advances do not create purchase or inventory records."
              tone="muted"
            />
          ) : null}
        </View>
      }
      renderItem={({ item, index }: { item: PurchaseItem; index: number }) => {
        const last = index === purchases.length - 1
        const owed = BigInt(item.outstandingMinor) > 0n
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "mt-2 rounded-t-[20px]",
              last && "rounded-b-[20px]",
            )}
          >
            <RecordRow
              stackDetails
              accessibilityLabel={`${item.description}, ${item.status}, open actual purchase detail`}
              title={item.description}
              meta={`${item.reference ? `${item.reference} · ` : ""}${financeDisplayDate(item.incurredAt)}${item.dueAt ? ` · due ${financeDisplayDate(item.dueAt)}` : ""}`}
              amount={money(item.totalMinor)}
              avatar={{ icon: "ReceiptText", tint: "amber" }}
              status={
                <StatusPill
                  label={
                    item.status === "VOID"
                      ? "Cancelled"
                      : owed
                        ? `Owed ${money(item.outstandingMinor)}`
                        : "Paid"
                  }
                  tone={item.status === "VOID" ? "muted" : owed ? "warn" : "ok"}
                />
              }
              onPress={() => onSelectPurchase(item.id)}
            />
            {last ? null : <RowDivider />}
          </View>
        )
      }}
      ListFooterComponent={
        <View className="gap-2 pb-8">
          {visible && query.hasNextPage && !query.isFetchingNextPage ? (
            <ActionButton
              variant="outline"
              isLoading={query.isFetchingNextPage}
              onPress={() => {
                authority.invalidate()
                authority.runProtectedRead(query.fetchNextPage)
              }}
            >
              Load more purchase bills
            </ActionButton>
          ) : null}
          {recognitionsVisible &&
          recognitionQuery.hasNextPage &&
          !recognitionQuery.isFetchingNextPage ? (
            <ActionButton
              variant="outline"
              isLoading={recognitionQuery.isFetchingNextPage}
              onPress={() => {
                recognitionAuthority.invalidate()
                recognitionAuthority.runProtectedRead(
                  recognitionQuery.fetchNextPage,
                )
              }}
            >
              Load more agreed sources
            </ActionButton>
          ) : null}
        </View>
      }
      contentContainerClassName="pb-12"
    />
  )
}

function SupplierPurchaseDetail({
  book,
  actorUserId,
  tenantId,
  supplier,
  purchaseId,
  advanceToAllocate,
  onBack,
}: FinanceWorkspace & {
  supplier: Supplier
  purchaseId: string
  advanceToAllocate?: AdvanceSelection
  onBack: () => void
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [mode, setMode] = useState<PurchaseSettlementMode | null>(
    advanceToAllocate ? "allocate" : null,
  )
  const [payment, setPayment] = useState<PurchasePayment | null>(null)
  const [allocation, setAllocation] = useState<PurchaseAllocation | null>(null)
  const [recognitionViewId, setRecognitionViewId] = useState<string | null>(
    null,
  )
  const query = useQuery(
    trpc.finance.purchase.queryOptions(
      { bookId: book.id, billId: purchaseId },
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
  const scope = `purchase:${actorUserId}:${tenantId}:${book.id}:${supplier.id}:${purchaseId}`
  const authority = useSupplierReadAuthority({
    scope,
    enabled: true,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: query.refetch,
  })
  const purchaseView = resolveSupplierPurchaseView({
    data: query.data,
    bookId: book.id,
    billId: purchaseId,
    supplierId: supplier.id,
    verified: authority.verified,
    success: query.isSuccess,
    fetching: query.isFetching,
    paused: query.fetchStatus === "paused",
    offline,
    error: query.isError,
    settlementOpen: mode !== null,
  })
  const data = purchaseView.detail
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)

  function cancelForm() {
    setMode(null)
    setPayment(null)
    setAllocation(null)
  }

  if (recognitionViewId)
    return (
      <SupplierPurchaseRecognitionPanel
        book={book}
        actorUserId={actorUserId}
        tenantId={tenantId}
        supplier={supplier}
        recognitionId={recognitionViewId}
        onBack={() => setRecognitionViewId(null)}
      />
    )

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-12">
      <ActionButton variant="ghost" onPress={mode ? cancelForm : onBack}>
        ‹ {mode ? "Purchase detail" : "Purchases"}
      </ActionButton>
      {offline ? (
        <StatusBanner
          title="Offline"
          message="Purchase detail, payment history and allocation history are hidden until a fresh online read is available."
          tone="warning"
        />
      ) : null}
      {query.isPending && !offline ? (
        <Text>Loading purchase detail…</Text>
      ) : null}
      {query.isError ? (
        <StatusBanner
          title="Purchase detail unavailable"
          message={query.error.message}
          actionLabel="Try again"
          onActionPress={() => authority.runProtectedRead()}
          tone="destructive"
        />
      ) : null}
      {purchaseView.settlement && mode ? (
        <SupplierPurchaseSettlementForm
          key={scope}
          book={book}
          actorUserId={actorUserId}
          tenantId={tenantId}
          supplier={supplier}
          purchase={purchaseView.settlement}
          mode={mode}
          payment={payment ?? undefined}
          allocation={allocation ?? undefined}
          advanceToAllocate={advanceToAllocate}
          onBack={cancelForm}
          onRecorded={cancelForm}
        />
      ) : null}
      {data && !mode ? (
        <>
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {supplier.name} · {supplier.code}
          </Text>
          <Text className="text-2xl font-bold">{data.description}</Text>
          <Text className="text-sm text-muted-foreground">
            Purchase · {data.reference ?? "no reference"} ·{" "}
            {data.storeId ?? "all stores"}
          </Text>
          <View className="flex-row flex-wrap gap-4 border-y border-border py-4">
            {[
              ["Incurred", money(data.totalMinor)],
              ["Paid", money(data.paidMinor)],
              ["Still owed", money(data.outstandingMinor)],
            ].map(([label, value]) => (
              <View key={label} className="min-w-[40%] flex-1 gap-1">
                <Text className="text-xs text-muted-foreground">{label}</Text>
                <Text className="text-lg font-bold tabular-nums">{value}</Text>
              </View>
            ))}
          </View>
          <Text className="text-sm text-muted-foreground">
            {new Date(data.incurredAt).toISOString().slice(0, 10)} UTC
            {data.dueAt
              ? ` · due ${new Date(data.dueAt).toISOString().slice(0, 10)} UTC`
              : " · no due date"}
            {data.voidedAt ? " · void" : ""}
          </Text>
          <Text className="text-xs text-muted-foreground">
            Inventory source · {data.coverage.receipts.replaceAll("_", " ")} ·
            valuation {data.coverage.valuation.replaceAll("_", " ")} · COGS{" "}
            {data.coverage.cogs.replaceAll("_", " ")}
          </Text>
          {data.recognitionId ? (
            <ActionButton
              variant="outline"
              onPress={() => setRecognitionViewId(data.recognitionId)}
            >
              Open purchase source history
            </ActionButton>
          ) : null}
          <Text className="text-lg font-bold">Purchase lines</Text>
          {data.lines.map((line) => (
            <View key={line.id} className="gap-1 border-b border-border py-3">
              <View className="flex-row justify-between gap-3">
                <Text className="min-w-0 flex-1 font-semibold">
                  {line.description}
                </Text>
                <Text className="font-bold tabular-nums">
                  {money(line.amountMinor)}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {line.account.code} · {line.account.name}
              </Text>
            </View>
          ))}
          {!data.voidedAt && BigInt(data.outstandingMinor) > 0n ? (
            <ActionButton onPress={() => setMode("pay")}>
              Pay purchase
            </ActionButton>
          ) : null}
          {!data.voidedAt && BigInt(data.outstandingMinor) > 0n ? (
            <ActionButton variant="outline" onPress={() => setMode("allocate")}>
              Apply supplier advance
            </ActionButton>
          ) : null}
          <Text className="text-lg font-bold">Cash payments</Text>
          {data.payments.map((item) => (
            <View
              key={item.id}
              className="gap-2 rounded-2xl border border-border p-4"
            >
              <View className="flex-row justify-between gap-3">
                <Text className="min-w-0 flex-1 font-semibold">
                  {item.account.name}
                </Text>
                <Text className="font-bold tabular-nums">
                  {money(item.amountMinor)}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {new Date(item.effectiveAt).toISOString().slice(0, 10)} UTC
                {item.reference ? ` · ${item.reference}` : ""}
                {item.reversedAt
                  ? ` · reversed ${new Date(item.reversalEffectiveAt ?? item.reversedAt).toISOString().slice(0, 10)} UTC`
                  : ""}
              </Text>
              {!item.reversedAt ? (
                <ActionButton
                  variant="outline"
                  onPress={() => {
                    setPayment(item)
                    setMode("reverse-payment")
                  }}
                >
                  Reverse this payment
                </ActionButton>
              ) : null}
            </View>
          ))}
          {data.paymentsHasMore ? (
            <StatusBanner
              message="More than 50 payment records exist. The visible actual payments can be corrected individually; older payment pages are not currently exposed here."
              tone="warning"
            />
          ) : null}
          <Text className="text-lg font-bold">
            Supplier advance allocations
          </Text>
          {data.allocations.map((item) => {
            const released = item.releases.reduce(
              (sum, release) => sum + BigInt(release.amountMinor),
              0n,
            )
            const unreleased = BigInt(item.amountMinor) - released
            return (
              <View
                key={item.id}
                className="gap-2 rounded-2xl border border-border p-4"
              >
                <View className="flex-row justify-between gap-3">
                  <Text className="min-w-0 flex-1 font-semibold">
                    Advance applied
                  </Text>
                  <Text className="font-bold tabular-nums">
                    {money(item.amountMinor)}
                  </Text>
                </View>
                <Text className="text-xs text-muted-foreground">
                  {new Date(item.effectiveAt).toISOString().slice(0, 10)} UTC ·{" "}
                  {money(released.toString())} released · source{" "}
                  {item.advanceEntry.kind.toLowerCase().replaceAll("_", " ")}
                </Text>
                {unreleased > 0n && !data.voidedAt ? (
                  <ActionButton
                    variant="outline"
                    onPress={() => {
                      setAllocation(item)
                      setMode("release")
                    }}
                  >
                    Release part of this allocation
                  </ActionButton>
                ) : null}
                {item.releases.map((release) => (
                  <Text
                    key={release.id}
                    className="text-xs text-muted-foreground"
                  >
                    Released {money(release.amountMinor)} ·{" "}
                    {new Date(release.effectiveAt).toISOString().slice(0, 10)}{" "}
                    UTC · {release.reason}
                  </Text>
                ))}
                {item.releasesHasMore ? (
                  <StatusBanner
                    message="This allocation has more than 50 release events; no release action is offered until complete history is available."
                    tone="warning"
                  />
                ) : null}
              </View>
            )
          })}
          {data.allocationsHasMore ? (
            <StatusBanner
              message="More than 50 allocations exist. Additional allocation pages are not currently exposed here."
              tone="warning"
            />
          ) : null}
          <Text className="text-xs text-muted-foreground">
            Same supplier current payable{" "}
            {money(data.currentSupplierTotals.payableMinor)} · advance{" "}
            {money(data.currentSupplierTotals.advanceMinor)} · journal{" "}
            {data.currentSupplierTotals.throughJournalSequence}
          </Text>
        </>
      ) : null}
    </ScrollView>
  )
}
