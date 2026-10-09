import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, RecordRow } from "../green-till/kit"
import { CustomerLedgerGate } from "./customer-ledger-gate"
import { ReceivablesDirectory } from "./receivables-directory"
export function CustomerLedgerDirectory() {
  const [browse, setBrowse] = useState(false)
  return (
    <CustomerLedgerGate>
      {(s) =>
        browse ? (
          <Directory key={`${s.actorUserId}:${s.tenantId}`} />
        ) : (
          <ReceivablesDirectory
            key={`${s.actorUserId}:${s.tenantId}`}
            onBrowse={() => setBrowse(true)}
          />
        )
      }
    </CustomerLedgerGate>
  )
}
function Directory() {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [cursor, setCursor] = useState<string>()
  const query = useQuery(
    trpc.customers.listPage.queryOptions(
      { query: search.trim() || undefined, cursor, limit: 30 },
      { retry: false, enabled: !offline },
    ),
  )
  return (
    <FinanceFormBody>
      <HeroCard
        label="Customer accounts"
        title="Who owes you?"
        sub="Open a customer to see recorded debt and available credit."
        pill={{
          label: offline ? "Saved copy" : "Online",
          tone: offline ? "offline" : "synced",
        }}
      />
      {offline ? (
        <StatusBanner
          tone="warning"
          message={
            query.data
              ? `Saved copy as of ${new Date(query.dataUpdatedAt).toLocaleString()}. Reconnect to refresh balances.`
              : "Reconnect to load customer accounts."
          }
        />
      ) : null}
      <FormField
        label="Find a customer"
        value={search}
        onChangeText={(v) => {
          setSearch(v)
          setCursor(undefined)
        }}
        editable={!offline}
        maxLength={160}
      />
      {query.isPending && !offline ? (
        <View className="gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </View>
      ) : query.isError ? (
        <StatusBanner
          message={query.error.message}
          tone="destructive"
          actionLabel={offline ? undefined : "Try again"}
          onActionPress={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          <ListCard>
            {query.data.items.map((c) => (
              <RecordRow
                stackDetails
                key={c.id}
                title={c.name}
                meta={c.phone ?? c.email ?? "Saved customer"}
                avatar={{ initials: c.name.trim().slice(0, 1), tint: "lilac" }}
                onPress={() =>
                  router.push(
                    `/customer-ledger/${encodeURIComponent(c.id)}` as Href,
                  )
                }
              />
            ))}
          </ListCard>
          {!query.data.items.length ? (
            <Text>No matching saved customers.</Text>
          ) : null}
          <ActionButton
            variant="outline"
            disabled={offline || !cursor || query.isFetching}
            onPress={() => setCursor(undefined)}
          >
            First page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={offline || !query.data.nextCursor || query.isFetching}
            onPress={() => setCursor(query.data.nextCursor)}
          >
            Next page
          </ActionButton>
        </>
      ) : null}
    </FinanceFormBody>
  )
}
