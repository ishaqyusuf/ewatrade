import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { CustomerLedgerGate } from "./customer-ledger-gate"
export function CustomerLedgerDirectory() {
  return (
    <CustomerLedgerGate>
      {(s) => <Directory key={`${s.actorUserId}:${s.tenantId}`} />}
    </CustomerLedgerGate>
  )
}
function Directory() {
  const trpc = useTRPC()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [cursor, setCursor] = useState<string>()
  const query = useQuery(
    trpc.customers.listPage.queryOptions(
      { query: search.trim() || undefined, cursor, limit: 30 },
      { retry: false },
    ),
  )
  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">Saved customer accounts</Text>
      <Text className="text-sm text-muted-foreground">
        Choose a saved customer. Historical contact similarity does not
        establish account ownership.
      </Text>
      <FormField
        label="Find a customer"
        value={search}
        onChangeText={(v) => {
          setSearch(v)
          setCursor(undefined)
        }}
        maxLength={160}
      />
      {query.isPending ? (
        <Text>Loading customers…</Text>
      ) : query.isError ? (
        <StatusBanner
          message={query.error.message}
          tone="destructive"
          actionLabel="Try again"
          onActionPress={() => void query.refetch()}
        />
      ) : (
        <>
          <View>
            {query.data.items.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`View ${c.name} statement`}
                className="border-b border-border py-4"
                onPress={() =>
                  router.push(
                    `/customer-ledger/${encodeURIComponent(c.id)}` as Href,
                  )
                }
              >
                <Text className="font-semibold">{c.name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {c.phone ?? c.email ?? "Saved customer"}
                </Text>
              </Pressable>
            ))}
          </View>
          {!query.data.items.length ? (
            <Text>No matching saved customers.</Text>
          ) : null}
          <ActionButton
            variant="outline"
            disabled={!cursor || query.isFetching}
            onPress={() => setCursor(undefined)}
          >
            First page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={!query.data.nextCursor || query.isFetching}
            onPress={() => setCursor(query.data.nextCursor)}
          >
            Next page
          </ActionButton>
        </>
      )}
    </FinanceFormBody>
  )
}
