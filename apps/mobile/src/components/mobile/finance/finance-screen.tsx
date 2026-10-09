import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { createExpenseFixture } from "@/internal-tooling/fixture-recipes"
import { financeUtcDate } from "@/lib/finance-expense-input"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useRef, useState } from "react"
import { FlatList, ScrollView, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { ClassicCustomerBookFilter } from "../appearances/classic/customer-book-screen"
import { HeroCard } from "../green-till/hero-card"
import {
  NudgeCard,
  QuickActionRow,
  RecordRow,
  RowDivider,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import { FinanceBankDateField } from "./finance-bank-date-field"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { FinanceChoice } from "./finance-ledger-layout"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { SupplierFinanceScreen } from "./supplier-finance-screen"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Expense = Omit<
  RouterInputs["finance"]["recordExpense"],
  "clientCommandId" | "lines" | "incurredAt"
> & {
  incurredAt: Date
  lines: [RouterInputs["finance"]["recordExpense"]["lines"][number]]
}

export function FinanceScreen() {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <FinanceWorkspaceHome
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}`}
          {...workspace}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function FinanceWorkspaceHome(workspace: FinanceWorkspace) {
  const [showSuppliers, setShowSuppliers] = useState(false)
  return showSuppliers ? (
    <SupplierFinanceScreen
      {...workspace}
      onBack={() => setShowSuppliers(false)}
    />
  ) : (
    <SpendingWorkspace
      {...workspace}
      onSuppliersPress={() => setShowSuppliers(true)}
    />
  )
}
function SpendingWorkspace({
  book,
  actorUserId,
  tenantId,
  onSuppliersPress,
}: FinanceWorkspace & { onSuppliersPress: () => void }) {
  const trpc = useTRPC()
  const router = useRouter()
  const colors = useColors()
  const [status, setStatus] = useState<
    "UNPAID" | "PARTIAL" | "PAID" | "VOID" | undefined
  >()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  const bills = useInfiniteQuery(
    trpc.finance.bills.infiniteQueryOptions(
      { bookId: book.id, limit: 30, status },
      {
        enabled: !offline,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const mutation = useMutation(trpc.finance.recordExpense.mutationOptions())
  const [creating, setCreating] = useState(false)
  const [review, setReview] = useState<Expense | null>(null)
  const [payee, setPayee] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<{
    amount: string
    date: string
    description: string
    payee: string
  } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const categories =
    balances.data?.accounts.filter(
      (a) =>
        a.kind === "EXPENSE" &&
        a.purpose === "OPERATING_EXPENSE" &&
        !a.archivedAt,
    ) ?? []
  const categoryId = category || categories[0]?.id || ""
  const summary = bills.data?.pages[0]?.summary
  const recordCount = bills.data?.pages[0]?.count
  const loadedBills = bills.data?.pages.flatMap((page) => page.items) ?? []
  // Exact only once every page is loaded; otherwise the hero leaves it out.
  const notFullyPaid =
    bills.data && !bills.hasNextPage
      ? loadedBills.filter(
          (bill) => bill.status === "UNPAID" || bill.status === "PARTIAL",
        ).length
      : undefined
  const money = (v: string) => formatFinanceMoney(v, book.currencyCode)
  function prepare() {
    try {
      const incurredAt = financeUtcDate(date, book.startsAt)
      if (!payee.trim() || !description.trim())
        throw new Error("Enter the payee and expense description.")
      if (!categories.some((a) => a.id === categoryId))
        throw new Error("Choose an active expense category.")
      setReview({
        bookId: book.id,
        payeeName: payee.trim(),
        description: description.trim(),
        incurredAt,
        lines: [
          {
            accountId: categoryId,
            description: description.trim(),
            amountMinor: parseFinanceMoney(amount),
          },
        ],
      })
      setFormError(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Check expense details.")
    }
  }
  function clearRecordedDraft() {
    setCreating(false)
    setReview(null)
    setPayee("")
    setDescription("")
    setAmount("")
    setFormError(null)
    quickFillSnapshot.current = null
    setCanUndoQuickFill(false)
  }
  async function confirm() {
    if (!review) return
    const accepted = await command.run("recordExpense", review, (id) =>
      mutation.mutateAsync({ ...review, clientCommandId: id }),
    )
    if (accepted) clearRecordedDraft()
  }
  const canSubmit = command.ready && !command.pending && !offline
  const header = (
    <View className="gap-5 pb-5">
      {!creating ? (
        <>
          {bills.isPending && !offline ? (
            <Skeleton className="h-52 rounded-[22px]" />
          ) : (
            <HeroCard
              label={
                status
                  ? `${status === "PARTIAL" ? "Part paid" : status.toLowerCase()} expenses · still owed`
                  : "Still owed"
              }
              amount={summary ? money(summary.outstandingMinor) : "—"}
              pill={{ label: "Recorded entries", tone: "synced" }}
              sub={
                !summary
                  ? "Spending summary unavailable"
                  : notFullyPaid === undefined || status
                    ? undefined
                    : notFullyPaid
                      ? `${notFullyPaid} expense${notFullyPaid === 1 ? "" : "s"} not fully paid`
                      : "Everything recorded is paid"
              }
              stats={[
                {
                  label: "Incurred",
                  value: summary ? money(summary.incurredMinor) : "—",
                },
                {
                  label: "Paid",
                  value: summary ? money(summary.paidAgainstBillsMinor) : "—",
                },
                {
                  label: "Records",
                  value: recordCount === undefined ? "—" : String(recordCount),
                },
              ]}
            >
              <View className="mt-4">
                <ActionButton
                  tone="cream"
                  icon="Plus"
                  disabled={!canSubmit}
                  onPress={() => {
                    setCreating(true)
                    setFormError(null)
                  }}
                >
                  Record expense
                </ActionButton>
              </View>
            </HeroCard>
          )}
          {offline ? (
            <StatusBanner
              tone="warning"
              title="Reconnect to record"
              message={
                bills.data
                  ? `Saved spending · as of ${new Date(bills.dataUpdatedAt).toLocaleString()}. Finance entries are never queued.`
                  : "Reconnect to load financial records. Finance entries are never queued."
              }
            />
          ) : null}
          <QuickActionRow
            actions={[
              {
                label: "Accounts",
                icon: "Wallet",
                onPress: () => router.push("/finance-accounts-modal" as Href),
              },
              {
                label: "Customers",
                icon: "Users",
                onPress: () => router.push("/customer-ledger-modal" as Href),
              },
              { label: "Suppliers", icon: "Truck", onPress: onSuppliersPress },
              {
                label: "Reports",
                icon: "BarChart3",
                onPress: () => router.push("/finance-reports-modal" as Href),
              },
            ]}
          />
        </>
      ) : null}
      <FinanceCommandFeedback
        command={command}
        onRecorded={clearRecordedDraft}
        onRejected={() => setReview(null)}
      />
      {creating ? (
        review ? (
          <View className="gap-4">
            <Text className="text-xl font-bold">Review before recording</Text>
            <Text>{review.payeeName}</Text>
            <Text>{review.description}</Text>
            <Text className="text-2xl font-bold">
              {money(review.lines[0].amountMinor)}
            </Text>
            <Text>
              {categories.find((a) => a.id === review.lines[0].accountId)?.name}{" "}
              · {new Date(review.incurredAt).toISOString().slice(0, 10)} UTC ·
              Unpaid
            </Text>
            <Text className="text-sm text-muted-foreground">
              This records an expense and the amount owed. It does not send
              money.
            </Text>
            <ActionButton
              disabled={!canSubmit}
              isLoading={command.pending}
              onPress={() => void confirm()}
            >
              Confirm and record
            </ActionButton>
            <ActionButton
              variant="outline"
              disabled={command.pending}
              onPress={() => setReview(null)}
            >
              Back to details
            </ActionButton>
          </View>
        ) : (
          <View className="gap-4">
            <QaQuickFillButton
              canUndo={canUndoQuickFill}
              formId="mobile.finance.expense"
              isDirty={Boolean(payee || description || amount)}
              onFill={(context, sequence) => {
                quickFillSnapshot.current = { amount, date, description, payee }
                const fixture = createExpenseFixture(context, sequence)
                setPayee(fixture.payee)
                setDescription(fixture.description)
                setAmount(fixture.amount)
                setDate(fixture.date)
                setFormError(null)
                setCanUndoQuickFill(true)
              }}
              onUndo={() => {
                const snapshot = quickFillSnapshot.current
                if (!snapshot) return
                setPayee(snapshot.payee)
                setDescription(snapshot.description)
                setAmount(snapshot.amount)
                setDate(snapshot.date)
                quickFillSnapshot.current = null
                setCanUndoQuickFill(false)
              }}
            />
            <FormField
              label="Payee"
              maxLength={160}
              value={payee}
              onChangeText={setPayee}
            />
            <FormField
              label="Expense description"
              maxLength={200}
              value={description}
              onChangeText={setDescription}
            />
            <MoneyField
              label="Amount"
              currencyCode={book.currencyCode}
              value={amount}
              onChangeValue={setAmount}
            />
            <FinanceBankDateField
              label="Expense date"
              value={date}
              onChange={setDate}
              minimum={new Date(book.startsAt).toISOString().slice(0, 10)}
              maximum={new Date().toISOString().slice(0, 10)}
              disabled={command.pending || offline}
            />
            <Text className="text-sm font-bold">Expense category</Text>
            {balances.isError ? (
              <StatusBanner
                message={balances.error.message}
                actionLabel="Try again"
                onActionPress={() => void balances.refetch()}
                tone="destructive"
              />
            ) : null}
            {categories.map((a) => (
              <FinanceChoice
                key={a.id}
                label={a.name}
                selected={categoryId === a.id}
                onPress={() => setCategory(a.id)}
                disabled={command.pending || offline}
              />
            ))}
            {formError ? (
              <StatusBanner message={formError} tone="destructive" />
            ) : null}
            <ActionButton
              disabled={!canSubmit || !categoryId}
              onPress={prepare}
            >
              Review expense
            </ActionButton>
            <ActionButton
              variant="outline"
              disabled={command.pending}
              onPress={() => setCreating(false)}
            >
              Back to spending
            </ActionButton>
          </View>
        )
      ) : null}
      {!creating ? (
        <>
          <SectionHeader
            title={
              status === "VOID" ? "Cancelled expenses" : "Spending records"
            }
            trailing={
              recordCount === undefined ? undefined : (
                <Text className="text-xs font-bold text-muted-foreground">
                  {recordCount}
                </Text>
              )
            }
          />
          <ScrollView
            contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginHorizontal: -18, marginTop: -8 }}
          >
            {[
              { label: "Current", value: undefined },
              { label: "Unpaid", value: "UNPAID" as const },
              { label: "Part paid", value: "PARTIAL" as const },
              { label: "Paid", value: "PAID" as const },
              { label: "Cancelled", value: "VOID" as const },
            ].map(({ label, value }) => (
              <ClassicCustomerBookFilter
                key={label}
                active={status === value}
                label={label}
                onPress={() => setStatus(value)}
              />
            ))}
          </ScrollView>
          {status === "VOID" ? (
            <Text className="text-sm text-muted-foreground">
              Original amounts remain in history. Cancelled expenses contribute
              zero to these totals.
            </Text>
          ) : null}
        </>
      ) : null}
      {bills.isError ? (
        <StatusBanner
          title="Spending unavailable"
          message={bills.error.message}
          actionLabel="Try again"
          onActionPress={() => void bills.refetch()}
          tone="destructive"
        />
      ) : null}
    </View>
  )
  if (creating)
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={120}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        disableScrollOnKeyboardHide
      >
        <View className="px-[18px] pb-12">{header}</View>
      </KeyboardAwareScrollView>
    )
  return (
    <FlatList
      contentContainerClassName="px-[18px] pb-12"
      keyboardShouldPersistTaps="handled"
      data={loadedBills}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      refreshing={bills.isRefetching}
      onRefresh={offline ? undefined : () => void bills.refetch()}
      onEndReached={() => {
        if (!offline && bills.hasNextPage && !bills.isFetchingNextPage)
          void bills.fetchNextPage()
      }}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        bills.isError ? null : bills.isPending && !offline ? (
          <ListSkeleton count={5} label="Loading spending" variant="ledger" />
        ) : (
          <Text className="py-6 text-muted-foreground">
            {bills.isPending
              ? "Reconnect to load spending."
              : "No spending recorded. Record your first expense above."}
          </Text>
        )
      }
      renderItem={({ item, index }) => (
        <View
          className={cn(
            "overflow-hidden bg-card px-3.5",
            index === 0 && "rounded-t-[20px]",
            index === loadedBills.length - 1 && "rounded-b-[20px]",
          )}
        >
          <RecordRow
            stackDetails
            title={item.description}
            meta={`${item.payeeName} · ${new Date(item.incurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`}
            amount={money(item.totalMinor)}
            avatar={{ icon: "Receipt", tint: "rose" }}
            status={
              <StatusPill
                label={
                  item.status === "VOID"
                    ? "Cancelled"
                    : item.status === "PAID"
                      ? "Paid"
                      : `Owed ${money(item.outstandingMinor)}`
                }
                tone={
                  item.status === "VOID"
                    ? "muted"
                    : item.status === "PAID"
                      ? "ok"
                      : "warn"
                }
              />
            }
            onPress={
              command.pending
                ? undefined
                : () =>
                    router.push({
                      pathname: "/finance-expense/[billId]",
                      params: { billId: item.id },
                    } as Href)
            }
          />
          {index === loadedBills.length - 1 ? null : <RowDivider />}
        </View>
      )}
      ListFooterComponent={
        <View className="gap-3 pt-3">
          {bills.isFetchingNextPage ? (
            <Text className="py-2 text-muted-foreground">
              Loading more expenses…
            </Text>
          ) : null}
          <NudgeCard
            icon="Lock"
            tint="sky"
            title="Posting periods"
            sub="Lock dates after you close a month"
            actionLabel="Open"
            onAction={() => router.push("/finance-periods-modal" as Href)}
          />
          <View className="flex-row gap-2 px-0.5">
            <Icon
              className="mt-0.5 size-[14px]"
              color={colors.mutedForeground}
              name="Info"
            />
            <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
              Recorded finance entries only. Sales and customer payments are not
              posted here yet.
            </Text>
          </View>
        </View>
      }
    />
  )
}
