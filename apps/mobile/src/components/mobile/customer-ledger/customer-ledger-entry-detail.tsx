import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { AllocationHistory } from "./allocation-history"
import { type LedgerAccount, ledgerLabels } from "./types"
export function CustomerLedgerEntryDetail({
  account,
  entryId,
}: { account: LedgerAccount; entryId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.customerLedger.entryDetail.queryOptions(
      {
        accountId: account.id,
        entryId,
        expectedRevision: account.revision,
        afterAllocationId: cursors.at(-1),
        limit: 50,
      },
      { retry: false },
    ),
  )
  if (query.isPending)
    return <Text className="px-4">Loading entry history…</Text>
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel="Try again"
        onActionPress={() => void query.refetch()}
      />
    )
  const d = query.data
  const e = d.entry
  const money = (v: string) => formatFinanceMoney(v, account.currencyCode)
  const open = (mode: string, extra: Record<string, string> = {}) =>
    router.push({
      pathname: "/customer-ledger-action/[accountId]",
      params: { accountId: account.id, entryId: e.id, mode, ...extra },
    } as Href)
  const reversible =
    ["OPENING_DEBT", "OPENING_CREDIT", "RECEIPT", "REFUND"].includes(e.kind) &&
    !e.reversalOfId &&
    !d.reversal &&
    !d.reconciliationRequired &&
    (e.kind === "REFUND" || d.usedAmountMinor === "0")
  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">
        {ledgerLabels[e.kind] ?? e.kind} · #{e.sequence}
      </Text>
      <Text className="text-2xl font-bold">
        {money(e.amountMinor)} {e.side.toLowerCase()}
      </Text>
      <Text>{e.description}</Text>
      <Text className="text-sm text-muted-foreground">
        Effective: {new Date(e.effectiveAt).toISOString()} · Recorded:{" "}
        {new Date(e.recordedAt).toISOString()}
      </Text>
      <Text className="text-sm">
        Source: {e.sourceKind} · {e.sourceId}
      </Text>
      <Text className="text-sm">Recorded by: {e.actorUserId}</Text>
      {d.receipt ? (
        <Text>
          {d.receipt.method} · {d.receipt.reference ?? "No reference"}
        </Text>
      ) : null}
      {e.reversalOfId ? (
        <StatusBanner
          message={`Correction of ${e.reversalOfId}; original retained.`}
        />
      ) : null}
      {d.reversal ? (
        <StatusBanner
          title="Original entry retained"
          message={`Reversed by #${d.reversal.sequence}: ${d.reversal.description}`}
        />
      ) : null}
      {d.reconciliationRequired ? (
        <StatusBanner
          message="Settlement history requires reconciliation before financial actions."
          tone="destructive"
        />
      ) : null}
      {reversible && account.book ? (
        <ActionButton
          variant="outline"
          disabled={offline}
          onPress={() => open("reverse")}
        >
          Correct this entry
        </ActionButton>
      ) : null}
      <Text className="font-semibold">
        Allocations · {money(d.usedAmountMinor)} currently used
      </Text>
      {d.allocations.map((a) => (
        <View key={a.id} className="gap-2 border-b border-border py-4">
          <Text>
            Credit #{a.credit.sequence} →{" "}
            {ledgerLabels[a.charge.kind] ?? a.charge.kind} #{a.charge.sequence}
          </Text>
          <Text>
            Applied {money(a.amountMinor)} · Released{" "}
            {money(a.releasedAmountMinor)} · Remaining{" "}
            {money(a.remainingAmountMinor)}
          </Text>
          <AllocationHistory account={account} allocationId={a.id} />
          {BigInt(a.remainingAmountMinor) > 0n &&
          ["OPENING_CREDIT", "RECEIPT"].includes(a.credit.kind) &&
          ["OPENING_DEBT", "ORDER_CHARGE"].includes(a.charge.kind) &&
          !d.reconciliationRequired &&
          account.book ? (
            <ActionButton
              variant="outline"
              disabled={offline}
              onPress={() =>
                open("release", {
                  allocationId: a.id,
                  ...(cursors.at(-1)
                    ? { allocationAfter: cursors.at(-1) ?? "" }
                    : {}),
                })
              }
            >
              Release allocation
            </ActionButton>
          ) : null}
        </View>
      ))}
      {!d.allocations.length ? (
        <Text>No allocations for this entry.</Text>
      ) : null}
      <ActionButton
        variant="outline"
        disabled={cursors.length === 1 || query.isFetching}
        onPress={() => setCursors((v) => v.slice(0, -1))}
      >
        Previous allocations
      </ActionButton>
      <ActionButton
        variant="outline"
        disabled={!d.nextCursor || query.isFetching}
        onPress={() => setCursors((v) => [...v, d.nextCursor ?? undefined])}
      >
        More allocations
      </ActionButton>
    </FinanceFormBody>
  )
}
