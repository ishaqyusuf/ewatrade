import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { createExpenseFixture } from "@/internal-tooling/fixture-recipes"
import { financeUtcDate } from "@/lib/finance-expense-input"
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
import { FlatList, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { HeroCard } from "../green-till/hero-card"
import {
  ListCard,
  NudgeCard,
  QuickActionRow,
  RecordRow,
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
                  : "Still owed · current expenses"
              }
              amount={summary ? money(summary.outstandingMinor) : "—"}
              sub={
                summary
                  ? "Recorded finance entries only"
                  : "Spending summary unavailable"
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
              ]}
            >
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
                label: "Money accounts",
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
          <NudgeCard
            icon="Calendar"
            tint="lilac"
            title="Posting periods"
            sub="Date locks and audit history"
            actionLabel="Open"
            onAction={() => router.push("/finance-periods-modal" as Href)}
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
          <View className="flex-row flex-wrap gap-2">
            {[
              { label: "Current", value: undefined },
              { label: "Unpaid", value: "UNPAID" as const },
              { label: "Part paid", value: "PARTIAL" as const },
              { label: "Paid", value: "PAID" as const },
              { label: "Cancelled", value: "VOID" as const },
            ].map(({ label, value }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected: status === value }}
                className={
                  status === value
                    ? "min-h-11 rounded-full bg-primary justify-center px-4"
                    : "min-h-11 rounded-full bg-card justify-center px-4"
                }
                onPress={() => setStatus(value)}
              >
                <Text
                  className={
                    status === value
                      ? "font-bold text-primary-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-lg font-bold">
            {status === "VOID" ? "Cancelled expenses" : "Spending records"}
          </Text>
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
      contentContainerClassName="gap-3 px-[18px] pb-12"
      keyboardShouldPersistTaps="handled"
      data={bills.data?.pages.flatMap((p) => p.items) ?? []}
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
        !bills.isError ? (
          <Text className="py-6 text-muted-foreground">
            {bills.isPending
              ? offline
                ? "Reconnect to load spending."
                : "Loading spending…"
              : "No spending recorded. Record your first expense above."}
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <ListCard>
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
        </ListCard>
      )}
      ListFooterComponent={
        bills.isFetchingNextPage ? (
          <Text className="py-4">Loading more expenses…</Text>
        ) : null
      }
    />
  )
}
