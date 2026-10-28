import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  ListCard,
  RecordRow,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import { ChoiceChip } from "./customer-ledger-command-form"
import {
  type RefundStatusFilter,
  refundStateInfo,
  refundStatusFilters,
  refundTime,
} from "./refund-request-model"
import type { LedgerAccount } from "./types"

const tint = { info: "sky", warn: "amber", ok: "mint", danger: "rose" } as const

export function CustomerRefundRequests({
  account,
}: {
  account: LedgerAccount
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [status, setStatus] = useState<RefundStatusFilter>(undefined)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.customerLedger.refundRequests.queryOptions(
      {
        accountId: account.id,
        status,
        cursor: cursors.at(-1),
        limit: 20,
      },
      { retry: false, enabled: !offline },
    ),
  )
  const whole = (minor: string) =>
    formatFinanceMoney(minor, account.currencyCode).replace(/\.00$/, "")
  const open = (params: Record<string, string>) =>
    router.push({
      pathname: "/customer-ledger-action/[accountId]",
      params: { accountId: account.id, ...params },
    } as Href)
  const filterLabel =
    refundStatusFilters.find((f) => f.value === status)?.label ?? "All"
  return (
    <FinanceFormBody>
      <HeroCard
        label={`${account.customer.name} · refund requests`}
        amount={whole(account.totals.availableCreditMinor)}
        sub="Available credit"
      />
      <Text className="text-sm text-muted-foreground">
        Request, approval and the actual bank return are separate steps.
        EwaTrade never sends a refund; you return the money from your bank.
      </Text>
      {offline ? (
        <StatusBanner
          message="Reconnect to load and manage refund requests."
          tone="warning"
        />
      ) : null}
      <ActionButton
        icon="PlusCircle"
        disabled={offline || account.totals.availableCreditMinor === "0"}
        onPress={() => open({ mode: "request-refund" })}
      >
        New refund request
      </ActionButton>
      <View className="flex-row flex-wrap gap-2">
        {refundStatusFilters.map((f) => (
          <ChoiceChip
            key={f.label}
            icon={f.value ? "ClipboardList" : "List"}
            label={f.label}
            selected={f.value === status}
            onPress={() => {
              setStatus(f.value)
              setCursors([undefined])
            }}
          />
        ))}
      </View>
      <SectionHeader
        title="Requests"
        actionLabel={
          offline ? undefined : query.isFetching ? "Refreshing…" : "Refresh"
        }
        onAction={() => void query.refetch()}
      />
      {query.isPending && !offline ? (
        <Skeleton className="h-32 w-full" />
      ) : query.isError ? (
        <StatusBanner
          message={query.error.message}
          tone="destructive"
          actionLabel="Try again"
          onActionPress={() => void query.refetch()}
        />
      ) : query.data && !query.data.requests.length ? (
        <Text className="text-sm text-muted-foreground">
          {status
            ? `No ${filterLabel.toLowerCase()} refund requests on this page.`
            : "No refund requests for this customer yet."}
        </Text>
      ) : query.data ? (
        <ListCard>
          {query.data.requests.map((r) => {
            const info = refundStateInfo(r)
            const amount = whole(r.amountMinor)
            return (
              <RecordRow
                key={r.id}
                stackDetails
                accessibilityLabel={`${r.customerName}, ${amount}, ${info.label}. Open refund request.`}
                title={r.customerName}
                meta={[`Requested ${refundTime(r.createdAt)}`, r.reason]}
                amount={amount}
                avatar={{
                  icon: "Undo2",
                  tint: info.tone === "muted" ? "muted" : tint[info.tone],
                }}
                status={<StatusPill tone={info.tone} label={info.label} />}
                onPress={() => open({ mode: "refund-request", entryId: r.id })}
              />
            )
          })}
        </ListCard>
      ) : null}
      {cursors.length > 1 || query.data?.nextCursor ? (
        <View className="gap-3">
          <ActionButton
            variant="outline"
            disabled={offline || cursors.length === 1 || query.isFetching}
            onPress={() => setCursors((v) => v.slice(0, -1))}
          >
            Previous requests
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={offline || !query.data?.nextCursor || query.isFetching}
            onPress={() =>
              setCursors((v) => [...v, query.data?.nextCursor ?? undefined])
            }
          >
            More requests
          </ActionButton>
        </View>
      ) : null}
    </FinanceFormBody>
  )
}
