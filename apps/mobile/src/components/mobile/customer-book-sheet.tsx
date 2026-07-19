import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { FlatList, View } from "react-native"

export function CustomerBookContent({ onComplete, presentation: _presentation }: { onComplete?: () => void; presentation?: "screen" | "sheet" }) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const orders = useQuery(trpc.orders.list.queryOptions({ limit: 100 }, { retry: false }))
  const customers = useMemo(() => {
    const byKey = new Map<string, { email: string | null; name: string; orderCount: number; phone: string | null; recentOrder: string }>()
    for (const order of orders.data ?? []) {
      if (!order.customerName && !order.customerPhone && !order.customerEmail) continue
      const key = order.customerEmail?.toLowerCase() ?? order.customerPhone ?? order.customerName ?? order.id
      const current = byKey.get(key)
      byKey.set(key, { email: order.customerEmail, name: order.customerName ?? order.customerPhone ?? "Customer", orderCount: (current?.orderCount ?? 0) + 1, phone: order.customerPhone, recentOrder: current?.recentOrder ?? order.orderNumber })
    }
    const query = search.trim().toLowerCase()
    return [...byKey.entries()].map(([id, row]) => ({ id, ...row })).filter((row) => !query || `${row.name} ${row.phone ?? ""} ${row.email ?? ""}`.toLowerCase().includes(query))
  }, [orders.data, search])
  return <View className="flex-1 gap-4 px-4 pb-10"><FormField autoCapitalize="none" label="Search" leadingIcon="Search" onChangeText={setSearch} value={search} /><FlatList data={customers} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 12, paddingBottom: 32 }} ListEmptyComponent={<EmptyState icon="Users" message="Customers appear from confirmed Orders when contact details are provided." title={orders.isLoading ? "Loading" : "No customers"} />} renderItem={({ item }) => <View className="gap-1 rounded-2xl border border-border bg-card p-4"><Text className="font-bold text-foreground">{item.name}</Text><Text className="text-xs text-muted-foreground">{item.phone ?? item.email ?? "No contact"} · {item.orderCount} order{item.orderCount === 1 ? "" : "s"}</Text><Text className="text-xs text-muted-foreground">Recent: {item.recentOrder}</Text></View>} />{onComplete ? <ActionButton onPress={onComplete} variant="outline">Done</ActionButton> : null}</View>
}
