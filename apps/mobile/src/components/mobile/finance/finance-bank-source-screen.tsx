import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { ScrollView, View } from "react-native"
import {
  type NativeBankCorrectionSource,
  validateNativeBankCorrectionSource,
} from "./finance-bank-read-state"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useSupplierReadAuthority } from "./supplier-finance-screen"

export function FinanceBankSourceScreen({
  entryId,
  accountId,
}: { entryId: string; accountId: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <SourceWorkspace
          key={JSON.stringify([
            workspace.actorUserId,
            workspace.tenantId,
            workspace.book.id,
            entryId,
            accountId,
          ])}
          {...workspace}
          entryId={entryId}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function SourceWorkspace({
  book,
  actorUserId,
  tenantId,
  entryId,
  accountId,
}: FinanceWorkspace & { entryId: string; accountId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const profile = getSession()?.profile
  const enabled = Boolean(
    entryId &&
      accountId &&
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? ""),
  )
  const query = useQuery(
    trpc.finance.bankStatements.resolveCorrectionSource.queryOptions(
      { bookId: book.id, accountId, entryId },
      { enabled: false, retry: false, refetchOnWindowFocus: false },
    ),
  )
  const authority = useSupplierReadAuthority({
    scope: JSON.stringify([actorUserId, tenantId, book.id, accountId, entryId]),
    enabled,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: () => query.refetch(),
  })
  let data: NativeBankCorrectionSource | undefined
  let error: string | undefined
  if (authority.verified && !query.isFetching && query.isSuccess) {
    try {
      data = validateNativeBankCorrectionSource({
        result: query.data,
        bookId: book.id,
        accountId,
        journalEntryId: entryId,
      })
    } catch (failure) {
      error =
        failure instanceof Error
          ? failure.message
          : "Refresh the original posted source."
    }
  }
  const target = data?.target
  const money = (amount: string) =>
    formatFinanceMoney(amount, book.currencyCode)
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-12">
      <Text className="text-sm text-muted-foreground">
        Review the owning record behind this bank posting. Original entries and
        reversals remain in history.
      </Text>
      {offline ? (
        <StatusBanner
          tone="warning"
          message="Reconnect and refresh to confirm original source ownership."
        />
      ) : null}
      {query.isError || error ? (
        <StatusBanner
          title="Source unavailable"
          tone="destructive"
          message={error ?? query.error?.message ?? "Refresh this source."}
        />
      ) : null}
      <ActionButton
        variant="outline"
        disabled={offline || !enabled || query.isFetching}
        onPress={() => authority.runProtectedRead()}
      >
        Refresh original source
      </ActionButton>
      {data ? (
        <>
          <Text className="text-lg font-semibold">
            Selected posted transaction
          </Text>
          <Text>{data.posted.description}</Text>
          <Text className="text-xl font-bold">
            {money(data.posted.amountMinor)}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {data.posted.effectiveAt.toISOString()} ·{" "}
            {data.sourceKind.toLowerCase().replaceAll("_", " ")}
          </Text>
          {target?.kind === "MONEY" ? (
            <ActionButton
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: "/finance-movement/[entryId]",
                  params: { entryId: target.entryId },
                } as Href)
              }
            >
              Open original money movement
            </ActionButton>
          ) : null}
          {target?.kind === "BILL" ? (
            <>
              {target.paymentId ? (
                <Text className="text-sm text-muted-foreground">
                  Original payment · {target.paymentId}
                </Text>
              ) : null}
              <ActionButton
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/finance-expense/[billId]",
                    params: { billId: target.billId },
                  } as Href)
                }
              >
                Open original expense and payments
              </ActionButton>
            </>
          ) : null}
          {target?.kind === "CUSTOMER" ? (
            <>
              <Text className="text-sm text-muted-foreground">
                Original customer ledger entry · {target.entryId}
              </Text>
              <ActionButton
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/customer-ledger/[customerId]",
                    params: { customerId: target.customerId },
                  } as Href)
                }
              >
                Open original customer ledger
              </ActionButton>
            </>
          ) : null}
          {target?.kind === "SUPPLIER" ? (
            <View className="gap-3 border-y border-border py-4">
              <Text className="text-lg font-semibold">
                Original supplier source
              </Text>
              <Text>{target.description}</Text>
              <Text>{money(target.amountMinor)}</Text>
              <Text>
                {target.effectiveAt.toISOString()} ·{" "}
                {target.entryKind.toLowerCase().replaceAll("_", " ")}
              </Text>
              <Text className="text-sm text-muted-foreground">
                Supplier {target.supplierId} · original entry{" "}
                {target.supplierEntryId}
              </Text>
              {target.reversal ? (
                <Text className="text-sm text-muted-foreground">
                  Original retained · reversal dated{" "}
                  {target.reversal.effectiveAt.toISOString()}
                </Text>
              ) : null}
            </View>
          ) : null}
          {target?.kind === "PURCHASE" ? (
            <>
              <PurchaseOriginal
                {...{ book, actorUserId, tenantId }}
                billId={target.billId}
              />
              <Text className="text-lg font-semibold">
                Original supplier purchase
              </Text>
              <Text className="text-sm text-muted-foreground">
                Purchase bill · {target.billId}
              </Text>
              {target.payment ? (
                <View className="gap-3 border-y border-border py-4">
                  <Text>{target.payment.description}</Text>
                  <Text>{money(target.payment.amountMinor)}</Text>
                  <Text>{target.payment.effectiveAt.toISOString()}</Text>
                  <Text className="text-sm text-muted-foreground">
                    Original payment {target.payment.id} · supplier{" "}
                    {target.payment.supplierId}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Latest purchase activity ·{" "}
                    {target.payment.latestEffectiveAt.toISOString()}
                  </Text>
                  {target.payment.reversed ? (
                    <Text>
                      Original retained · payment reversed
                      {target.payment.reversalEffectiveAt
                        ? ` · ${target.payment.reversalEffectiveAt.toISOString()}`
                        : ""}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground">
                  Original purchase accrual. This posting is separate from its
                  later bank payments.
                </Text>
              )}
            </>
          ) : null}
          {target?.kind === "UNAVAILABLE" ? (
            <StatusBanner
              tone="warning"
              title="Original source review unavailable"
              message={target.reason}
            />
          ) : null}
        </>
      ) : (
        <Text className="text-muted-foreground">
          {offline || !enabled
            ? "Original source authority is unavailable."
            : query.isError || error
              ? "Refresh to confirm the original source."
              : "Checking source ownership…"}
        </Text>
      )}
    </ScrollView>
  )
}

function PurchaseOriginal({
  book,
  actorUserId,
  tenantId,
  billId,
}: FinanceWorkspace & { billId: string }) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const profile = getSession()?.profile
  const enabled =
    profile?.id === actorUserId &&
    profile.businessId === tenantId &&
    ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
  const query = useQuery(
    trpc.finance.purchase.queryOptions(
      { bookId: book.id, billId },
      { enabled: false, retry: false, refetchOnWindowFocus: false },
    ),
  )
  const authority = useSupplierReadAuthority({
    scope: JSON.stringify([
      actorUserId,
      tenantId,
      book.id,
      book.currencyCode,
      billId,
    ]),
    enabled,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: () => query.refetch(),
  })
  const data =
    authority.verified &&
    query.isSuccess &&
    !query.isFetching &&
    query.data.id === billId &&
    query.data.bookId === book.id &&
    query.data.currencyCode === book.currencyCode
      ? query.data
      : undefined
  return (
    <View className="gap-3 border-y border-border py-4">
      <Text className="text-lg font-semibold">Original purchase details</Text>
      {data ? (
        <>
          <Text>{data.reference}</Text>
          <Text>{data.description}</Text>
          <Text>{data.payeeName}</Text>
          <Text>{formatFinanceMoney(data.totalMinor, book.currencyCode)}</Text>
          <Text className="text-sm text-muted-foreground">
            Incurred {data.incurredAt.toISOString()}
            {data.dueAt ? ` · Due ${data.dueAt.toISOString()}` : ""}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Paid {formatFinanceMoney(data.paidMinor, book.currencyCode)} ·
            Outstanding{" "}
            {formatFinanceMoney(data.outstandingMinor, book.currencyCode)}
          </Text>
          {data.voidedAt ? (
            <Text>Original retained · purchase voided</Text>
          ) : null}
        </>
      ) : (
        <Text className="text-muted-foreground">
          {query.isError
            ? "Purchase details could not be confirmed."
            : "Checking original purchase details…"}
        </Text>
      )}
      <ActionButton
        variant="outline"
        disabled={!enabled || offline || query.isFetching}
        onPress={() => authority.runProtectedRead()}
      >
        Refresh purchase details
      </ActionButton>
    </View>
  )
}
