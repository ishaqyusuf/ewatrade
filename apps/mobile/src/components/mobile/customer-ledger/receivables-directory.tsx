import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useDebounce } from "@/hooks/use-debounce"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { FinanceFormBody } from "../finance/finance-form-body"
import { FormField } from "../form-field"
import { HeroCard } from "../green-till/hero-card"
import {
  ListCard,
  RecordRow,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import { StatusBanner } from "../status-banner"
export function ReceivablesDirectory({ onBrowse }: { onBrowse: () => void }) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [search, setSearch] = useState("")
  const query = useDebounce(search.trim(), 180)
  const result = useInfiniteQuery(
    trpc.customerLedger.receivables.infiniteQueryOptions(
      { limit: 10, query: query || undefined },
      {
        enabled: !offline,
        retry: false,
        getNextPageParam: (page) => page.nextCursor,
      },
    ),
  )
  const items = result.data?.pages.flatMap((page) => page.items) ?? []
  const unique = [...new Map(items.map((item) => [item.id, item])).values()]
  const currencies = new Map<string, bigint>()
  for (const item of unique)
    currencies.set(
      item.currencyCode,
      (currencies.get(item.currencyCode) ?? 0n) +
        BigInt(item.totals.outstandingDebtMinor),
    )
  const groups = [
    {
      key: "owes",
      label: "Owes",
      items: unique.filter((i) => BigInt(i.totals.outstandingDebtMinor) > 0n),
    },
    {
      key: "credit",
      label: "Credit",
      items: unique.filter(
        (i) =>
          BigInt(i.totals.outstandingDebtMinor) === 0n &&
          BigInt(i.totals.availableCreditMinor) > 0n,
      ),
    },
    {
      key: "settled",
      label: "Settled",
      items: unique.filter(
        (i) =>
          BigInt(i.totals.outstandingDebtMinor) === 0n &&
          BigInt(i.totals.availableCreditMinor) === 0n,
      ),
    },
  ]
  return (
    <FinanceFormBody>
      <HeroCard
        label="Customers owe you"
        amount={
          result.isPending && !offline
            ? undefined
            : result.isError && !unique.length
              ? "—"
              : [...currencies]
                  .map(([currency, total]) =>
                    formatFinanceMoney(total.toString(), currency),
                  )
                  .join(" · ") || "—"
        }
        sub={
          unique.length
            ? `${unique.length} loaded accounts · recorded ledger entries only`
            : "Open an account to start recording customer balances."
        }
        pill={{
          label: offline ? "Saved copy" : "Recorded",
          tone: offline ? "offline" : "synced",
        }}
      >
        {result.isPending && !offline ? (
          <View className="mt-4">
            <Skeleton className="h-10 w-full" />
          </View>
        ) : null}
      </HeroCard>
      <FormField
        label="Find a customer"
        value={search}
        onChangeText={setSearch}
        editable={!offline}
        maxLength={160}
      />
      {offline ? (
        <StatusBanner
          tone="warning"
          message={
            result.dataUpdatedAt
              ? `Saved copy as of ${new Date(result.dataUpdatedAt).toLocaleString()}. Reconnect to refresh.`
              : "Reconnect to load customer balances."
          }
        />
      ) : null}
      {result.isError ? (
        <StatusBanner
          tone="destructive"
          message={result.error.message}
          actionLabel={offline ? undefined : "Try again"}
          onActionPress={() => void result.refetch()}
        />
      ) : null}
      {groups.map((group) =>
        group.items.length ? (
          <View key={group.key}>
            <SectionHeader title={group.label} />
            <ListCard>
              {group.items
                .sort((a, b) =>
                  BigInt(a.totals.outstandingDebtMinor) >
                  BigInt(b.totals.outstandingDebtMinor)
                    ? -1
                    : BigInt(a.totals.outstandingDebtMinor) <
                        BigInt(b.totals.outstandingDebtMinor)
                      ? 1
                      : 0,
                )
                .map((item) => (
                  <RecordRow
                    stackDetails
                    key={item.id}
                    title={item.customer.name}
                    meta={`${item.customer.phone ?? item.customer.email ?? "Customer account"}${BigInt(item.totals.availableCreditMinor) > 0n ? ` · ${formatFinanceMoney(item.totals.availableCreditMinor, item.currencyCode)} credit` : ""}`}
                    amount={formatFinanceMoney(
                      group.key === "credit"
                        ? item.totals.availableCreditMinor
                        : item.totals.outstandingDebtMinor,
                      item.currencyCode,
                    )}
                    avatar={{
                      initials: item.customer.name.trim().slice(0, 1),
                      tint: group.key === "owes" ? "amber" : "mint",
                    }}
                    status={
                      <StatusPill
                        label={group.label}
                        tone={group.key === "owes" ? "warn" : "ok"}
                      />
                    }
                    onPress={() =>
                      router.push({
                        pathname: "/customer-ledger/[customerId]",
                        params: { customerId: item.customer.id },
                      })
                    }
                  />
                ))}
            </ListCard>
          </View>
        ) : null,
      )}
      {!unique.length && !(result.isPending && !offline) && !result.isError ? (
        <Text>No recorded accounts in this view.</Text>
      ) : null}
      {result.hasNextPage ? (
        <ActionButton
          variant="outline"
          disabled={offline}
          isLoading={result.isFetchingNextPage}
          onPress={() => void result.fetchNextPage()}
        >
          Load more accounts
        </ActionButton>
      ) : null}
      <ActionButton tone="soft" onPress={onBrowse}>
        All saved customers
      </ActionButton>
    </FinanceFormBody>
  )
}
