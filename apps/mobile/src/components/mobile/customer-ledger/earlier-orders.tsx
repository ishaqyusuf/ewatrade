import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useState } from "react"
import { ScrollView, View } from "react-native"

type Match =
  RouterOutputs["customerLedger"]["orderLinkSuggestions"]["items"][number]["matchedBy"]
const matchTags: Record<Match, string> = {
  PHONE: "Same phone",
  EMAIL: "Same email",
  PHONE_AND_EMAIL: "Same phone and email",
}
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

/** Workshop Mobile Quality v19, screen 18 v2 direction 01: the match banner. */
export function EarlierOrdersBanner({
  customerId,
  customerName,
  offline,
  onReview,
}: {
  customerId: string
  customerName: string
  offline: boolean
  onReview: () => void
}) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.customerLedger.orderLinkSuggestions.queryOptions(
      { customerId, limit: 50 },
      { retry: false, enabled: !offline },
    ),
  )
  const count = query.data?.suggestedCount ?? 0
  if (!count) return null
  return (
    <StatusBanner
      icon="Users"
      title={`${count} earlier ${count === 1 ? "Order matches" : "Orders match"} ${firstName(customerName)}`}
      message="Same phone or email, not linked to them yet."
      actionLabel="Review"
      onActionPress={onReview}
    />
  )
}

/**
 * Review and link earlier unlinked Orders. The server re-checks each match
 * under lock; linking only shows them under this customer and adds nothing
 * to what they owe.
 */
export function EarlierOrdersScreen({ customerId }: { customerId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const query = useQuery(
    trpc.customerLedger.orderLinkSuggestions.queryOptions(
      { customerId, limit: 50 },
      { retry: false, enabled: !offline },
    ),
  )
  const link = useMutation(
    trpc.customerLedger.linkOrders.mutationOptions({ retry: false }),
  )
  // One identity per review, so a repeated tap links the same Orders once.
  const [commandId, setCommandId] = useState(() => Crypto.randomUUID())
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const [linked, setLinked] = useState<number | null>(null)

  if (offline)
    return (
      <StatusBanner
        tone="warning"
        message="Reconnect to link earlier Orders."
      />
    )
  if (query.isPending)
    return <Text className="px-4">Looking for earlier Orders…</Text>
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel="Try again"
        onActionPress={() => void query.refetch()}
      />
    )
  const data = query.data
  const name = firstName(data.customer.name)
  const picked = data.items.filter((item) => !unpicked.has(item.orderId))

  async function submit() {
    if (!picked.length || link.isPending) return
    setProblem(null)
    try {
      const result = await link.mutateAsync({
        customerId,
        orderIds: picked.map((item) => item.orderId),
        clientCommandId: commandId,
      })
      setLinked(result.linkedOrderIds.length)
      setCommandId(Crypto.randomUUID())
      setUnpicked(new Set())
      await Promise.all([
        client.invalidateQueries(
          trpc.customerLedger.orderLinkSuggestions.pathFilter(),
        ),
        client.invalidateQueries(trpc.customerLedger.aging.pathFilter()),
      ])
    } catch (failure) {
      const code = (failure as { data?: { code?: string } } | null)?.data?.code
      setProblem(
        code === "CONFLICT"
          ? "Some of these Orders were linked or changed. The list is refreshed; check it and link again."
          : "Couldn’t link these Orders. Check your connection and try again.",
      )
      if (code === "CONFLICT") {
        setCommandId(Crypto.randomUUID())
        void query.refetch()
      }
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        gap: 12,
        paddingBottom: 32,
        paddingHorizontal: 16,
      }}
    >
      {linked ? (
        <StatusBanner
          icon="CircleCheck"
          title={`Linked ${linked} ${linked === 1 ? "Order" : "Orders"}`}
          message={`They now show under ${name}. Nothing was added to what they owe.`}
        />
      ) : null}
      {problem ? <StatusBanner message={problem} tone="destructive" /> : null}
      {!data.customer.hasContact ? (
        <Text className="text-sm text-muted-foreground">
          Add {name}’s phone number or email to find their earlier Orders.
        </Text>
      ) : !data.items.length ? (
        <Text className="text-sm text-muted-foreground">
          No earlier Orders match {name}’s phone or email.
        </Text>
      ) : (
        <>
          <Text className="text-sm text-muted-foreground">
            Saved with {name}’s phone or email before they were a saved
            customer. Linking shows them under {name}. It doesn’t add to what
            they owe.
          </Text>
          <View className="rounded-[20px] bg-card px-3.5 py-0.5 shadow-sm">
            {data.items.map((item, index) => {
              const checked = !unpicked.has(item.orderId)
              return (
                <Pressable
                  key={item.orderId}
                  accessibilityLabel={`Order ${item.orderNumber}, ${matchTags[item.matchedBy]}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: link.isPending }}
                  className={
                    index > 0
                      ? "-mx-3.5 flex-row items-start gap-3 border-t border-border px-3.5 py-3 active:opacity-80"
                      : "-mx-3.5 flex-row items-start gap-3 px-3.5 py-3 active:opacity-80"
                  }
                  disabled={link.isPending}
                  haptic
                  onPress={() =>
                    setUnpicked((previous) => {
                      const next = new Set(previous)
                      if (checked) next.add(item.orderId)
                      else next.delete(item.orderId)
                      return next
                    })
                  }
                >
                  <View
                    className={
                      checked
                        ? "size-[22px] items-center justify-center rounded-md border-2 border-primary bg-primary"
                        : "size-[22px] items-center justify-center rounded-md border-2 border-border"
                    }
                  >
                    {checked ? (
                      <Icon
                        className="size-[14px] text-primary-foreground"
                        name="Check"
                      />
                    ) : null}
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-base font-bold text-foreground">
                        {item.orderNumber}
                      </Text>
                      <Text className="text-base font-bold tabular-nums text-foreground">
                        {formatFinanceMoney(
                          item.totalMinor,
                          item.currencyCode,
                        ).replace(/\.00$/, "")}
                      </Text>
                    </View>
                    <Text className="text-sm text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {item.customerName
                        ? ` · Saved as “${item.customerName}”`
                        : ""}
                    </Text>
                    <Text className="text-sm font-bold text-primary">
                      {matchTags[item.matchedBy]}
                    </Text>
                    {item.beforeBooksStart ? (
                      <Text className="text-sm text-muted-foreground">
                        From before your books started. Add any starting balance
                        first: it can’t be added after this is linked.
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
          {data.suggestedCount > data.items.length || data.truncated ? (
            <Text className="text-sm text-muted-foreground">
              More Orders match. Link these first, then review again.
            </Text>
          ) : null}
          <ActionButton
            disabled={!picked.length || link.isPending}
            isLoading={link.isPending}
            loadingLabel="Linking Orders"
            onPress={() => void submit()}
          >
            {`Link ${picked.length} ${picked.length === 1 ? "Order" : "Orders"}`}
          </ActionButton>
        </>
      )}
      {data.conflictCount ? (
        <Text className="text-sm text-muted-foreground">
          {data.conflictCount} more{" "}
          {data.conflictCount === 1 ? "Order shares" : "Orders share"} {name}’s
          phone or email but {data.conflictCount === 1 ? "has" : "have"} other
          details that don’t match, so{" "}
          {data.conflictCount === 1 ? "it isn’t" : "they aren’t"} shown.
        </Text>
      ) : null}
    </ScrollView>
  )
}
