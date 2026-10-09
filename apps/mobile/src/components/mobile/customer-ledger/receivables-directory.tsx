import { Pressable } from "@/components/ui/pressable"
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
/** Whole-naira display for lists and the hero; statements keep kobo. */
const whole = (minor: string | bigint, currency: string) =>
  formatFinanceMoney(minor.toString(), currency).replace(/\.00$/, "")
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => Array.from(part)[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase()

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
  const debtOf = (i: (typeof unique)[number]) =>
    BigInt(i.totals.outstandingDebtMinor)
  const creditOf = (i: (typeof unique)[number]) =>
    BigInt(i.totals.availableCreditMinor)
  const owing = unique.filter((i) => debtOf(i) > 0n)
  const withCredit = unique.filter((i) => creditOf(i) > 0n)
  // One currency in practice (NGN); mixed books fall back to the first.
  const heroCurrency = unique[0]?.currencyCode ?? "NGN"
  const largest = owing.reduce(
    (max, i) => (debtOf(i) > max ? debtOf(i) : max),
    0n,
  )
  const creditHeld = withCredit.reduce((sum, i) => sum + creditOf(i), 0n)
  const groups = [
    {
      key: "owes",
      label: "Owes you",
      items: unique.filter((i) => BigInt(i.totals.outstandingDebtMinor) > 0n),
    },
    {
      key: "credit",
      label: "Has credit",
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
                  .map(([currency, total]) => whole(total, currency))
                  .join(" · ") || whole(0n, heroCurrency)
        }
        sub={
          !unique.length
            ? "Open an account to start recording customer balances."
            : !owing.length
              ? "Nobody owes you right now."
              : [
                  `${owing.length} ${owing.length === 1 ? "customer" : "customers"}`,
                  creditHeld > 0n
                    ? `${whole(creditHeld, heroCurrency)} credit held for ${withCredit.length}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
        }
        pill={{
          label: offline ? "Saved copy" : "Up to date",
          tone: offline ? "offline" : "synced",
        }}
        stats={
          owing.length
            ? [
                { label: "Owing", value: String(owing.length) },
                { label: "Largest", value: whole(largest, heroCurrency) },
                {
                  label: "Credit held",
                  value: whole(creditHeld, heroCurrency),
                },
              ]
            : undefined
        }
      >
        {result.isPending && !offline ? (
          <View className="mt-4">
            <Skeleton className="h-10 w-full" />
          </View>
        ) : null}
      </HeroCard>
      <FormField
        accessibilityLabel="Find a customer"
        autoCapitalize="none"
        label="Find a customer"
        leadingIcon="Search"
        placeholder="Find a customer"
        value={search}
        onChangeText={setSearch}
        editable={!offline}
        maxLength={160}
        variant="till-search"
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
            <SectionHeader
              title={group.label}
              trailing={
                group.key === "owes" ? (
                  <Text className="text-[13px] font-bold text-primary">
                    {group.items.length}
                  </Text>
                ) : undefined
              }
            />
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
                    meta={
                      group.key === "owes" && creditOf(item) > 0n
                        ? `${whole(creditOf(item), item.currencyCode)} payment not applied`
                        : group.key === "credit"
                          ? "Credit held"
                          : (item.customer.phone ??
                            item.customer.email ??
                            "Customer account")
                    }
                    amount={whole(
                      group.key === "credit"
                        ? item.totals.availableCreditMinor
                        : item.totals.outstandingDebtMinor,
                      item.currencyCode,
                    )}
                    avatar={{
                      initials: initials(item.customer.name),
                      tint:
                        group.key === "owes"
                          ? "amber"
                          : group.key === "credit"
                            ? "mint"
                            : "lilac",
                    }}
                    status={
                      <StatusPill
                        label={
                          group.key === "owes"
                            ? "Owes"
                            : group.key === "credit"
                              ? "Credit"
                              : "Settled"
                        }
                        tone={
                          group.key === "owes"
                            ? "warn"
                            : group.key === "credit"
                              ? "ok"
                              : "muted"
                        }
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
      <Pressable
        accessibilityRole="button"
        className="min-h-11 items-center justify-center"
        haptic
        onPress={onBrowse}
      >
        <Text className="text-[13px] font-bold text-muted-foreground">
          All saved customers
        </Text>
      </Pressable>
    </FinanceFormBody>
  )
}
