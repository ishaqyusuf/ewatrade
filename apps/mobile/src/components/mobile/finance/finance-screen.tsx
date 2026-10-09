import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
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
import { useState } from "react"
import { FlatList, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { FinanceCommandFeedback } from "./finance-command-feedback"
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
      <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Business money
      </Text>
      <Text className="text-sm text-muted-foreground">
        What you spent, paid and still owe. Recorded finance entries only.
      </Text>
      {!creating ? (
        <ActionButton
          variant="outline"
          onPress={() => router.push("/finance-accounts-modal" as Href)}
        >
          Money accounts and statements
        </ActionButton>
      ) : null}
      {!creating ? (
        <ActionButton
          variant="outline"
          onPress={() => router.push("/customer-ledger-modal" as Href)}
        >
          Customer accounts
        </ActionButton>
      ) : null}
      {!creating ? (
        <ActionButton variant="outline" onPress={onSuppliersPress}>
          Supplier accounts
        </ActionButton>
      ) : null}
      {!creating ? (
        <ActionButton
          variant="outline"
          onPress={() => router.push("/finance-reports-modal" as Href)}
        >
          Financial reports
        </ActionButton>
      ) : null}
      {!creating ? (
        <ActionButton
          variant="outline"
          onPress={() => router.push("/finance-periods-modal" as Href)}
        >
          Posting periods and audit history
        </ActionButton>
      ) : null}
      <FinanceCommandFeedback
        command={command}
        onRecorded={clearRecordedDraft}
        onRejected={() => setReview(null)}
      />
      {summary ? (
        <View className="flex-row gap-3 border-y border-border py-4">
          {[
            { label: "Incurred", value: summary.incurredMinor },
            { label: "Paid", value: summary.paidAgainstBillsMinor },
            { label: "Still owed", value: summary.outstandingMinor },
          ].map(({ label, value }) => (
            <View key={label} className="min-w-0 flex-1 gap-1">
              <Text className="text-xs text-muted-foreground">{label}</Text>
              <Text className="text-base font-bold">{money(value)}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
            <FormField
              label="Expense date (UTC)"
              helper="YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              maxLength={10}
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
              <Pressable
                key={a.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: categoryId === a.id }}
                accessibilityLabel={a.name}
                className="min-h-12 justify-center border-b border-border py-3"
                onPress={() => setCategory(a.id)}
              >
                <Text
                  className={
                    categoryId === a.id
                      ? "font-bold text-primary"
                      : "text-foreground"
                  }
                >
                  {categoryId === a.id ? "✓ " : ""}
                  {a.name}
                </Text>
              </Pressable>
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
      ) : (
        <ActionButton
          disabled={!canSubmit}
          onPress={() => {
            setCreating(true)
            setFormError(null)
          }}
        >
          Record expense
        </ActionButton>
      )}
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
                className="min-h-11 justify-center px-2"
                onPress={() => setStatus(value)}
              >
                <Text
                  className={
                    status === value
                      ? "font-bold text-primary"
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
        <View className="px-4 pb-12">{header}</View>
      </KeyboardAwareScrollView>
    )
  return (
    <FlatList
      contentContainerClassName="px-4 pb-12"
      keyboardShouldPersistTaps="handled"
      data={bills.data?.pages.flatMap((p) => p.items) ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      refreshing={bills.isRefetching}
      onRefresh={() => void bills.refetch()}
      onEndReached={() => {
        if (bills.hasNextPage && !bills.isFetchingNextPage)
          void bills.fetchNextPage()
      }}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        bills.isError ? null : bills.isPending ? (
          <ListSkeleton count={5} label="Loading spending" variant="ledger" />
        ) : (
          <Text className="py-6 text-muted-foreground">
            No spending recorded. Record your first expense above.
          </Text>
        )
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open expense: ${item.description}`}
          className="min-h-12 flex-row justify-between gap-4 border-b border-border py-4"
          disabled={command.pending}
          onPress={() =>
            router.push({
              pathname: "/finance-expense/[billId]",
              params: { billId: item.id },
            } as Href)
          }
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-bold">{item.description}</Text>
            <Text className="text-xs text-muted-foreground">
              {item.payeeName} · {item.status === "VOID" ? "Cancelled · " : ""}{" "}
              {new Date(item.incurredAt).toISOString().slice(0, 10)}
            </Text>
          </View>
          <View className="gap-1">
            <Text className="font-bold">{money(item.totalMinor)}</Text>
            <Text className="text-xs text-primary">
              Owed {money(item.outstandingMinor)}
            </Text>
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        bills.isFetchingNextPage ? (
          <Text className="py-4">Loading more expenses…</Text>
        ) : null
      }
    />
  )
}
