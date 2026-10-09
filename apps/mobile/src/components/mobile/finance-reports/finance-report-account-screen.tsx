import { ActionButton } from "@/components/mobile/action-button"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FlatList, View } from "react-native"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { ReportExportActions } from "./report-export-actions"
import {
  buildFinanceLedgerCsv,
  collectFinanceLedgerPages,
} from "./report-ledger-csv"
import { prepareFinanceReportLink } from "./report-link"
import { ReportAmount } from "./report-section"

type Link = {
  accountId: string
  from: string
  through: string
  snapshot: string
}
export function FinanceReportAccountScreen(link: Link) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <AccountLink
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${link.accountId}:${link.from}:${link.through}:${link.snapshot}`}
          {...workspace}
          link={link}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function AccountLink({ book, link }: FinanceWorkspace & { link: Link }) {
  try {
    const input = prepareFinanceReportLink(
      link.accountId,
      link.from,
      link.through,
      link.snapshot,
      book.startsAt,
    )
    return <AccountRows bookId={book.id} input={input} />
  } catch (failure) {
    return (
      <StatusBanner
        title="Account link unavailable"
        message={
          failure instanceof Error
            ? failure.message
            : "Open this account from Financial reports."
        }
        tone="destructive"
      />
    )
  }
}
function AccountRows({
  bookId,
  input,
}: { bookId: string; input: ReturnType<typeof prepareFinanceReportLink> }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.finance.accountLedger.queryOptions(
      { bookId, ...input, cursor: cursors.at(-1), limit: 30 },
      {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  const data = query.isError ? undefined : query.data
  const money = (value: string) =>
    formatFinanceMoney(value, data?.currencyCode ?? "NGN")
  return (
    <FlatList
      className="flex-1 px-4"
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View className="gap-4 pb-5">
          <Text className="text-xl font-bold">
            {data?.account.name ?? "Report account entries"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {input.from.toISOString().slice(0, 10)} –{" "}
            {input.through.toISOString().slice(0, 10)} UTC · Snapshot{" "}
            {input.snapshotSequence}
          </Text>
          <StatusBanner
            message="Posted finance entries only. Unposted Commerce records are excluded. Debits and credits describe accounting sides."
            tone="warning"
          />
          {query.isError ? (
            <StatusBanner
              title="Account unavailable"
              message={query.error.message}
              actionLabel="Try again"
              onActionPress={() => void query.refetch()}
              tone="destructive"
            />
          ) : null}
          {data ? (
            <>
              <Text className="text-sm text-muted-foreground">
                Positive balances represent the account’s normal{" "}
                {data.normalSide.toLowerCase()} side.
              </Text>
              {[
                ["Opening", data.openingBalanceMinor],
                ["Period debits", data.debitMinor],
                ["Period credits", data.creditMinor],
                ["Closing", data.closingBalanceMinor],
              ].map(([label, value]) => (
                <ReportAmount
                  key={label}
                  label={label ?? ""}
                  amount={value ?? "0"}
                  currency={data.currencyCode}
                />
              ))}
              <ReportExportActions
                filename={`report-account-${data.account.id}-snapshot-${data.snapshotSequence}.csv`}
                build={async (cancelled) => {
                  const entries = await collectFinanceLedgerPages(
                    data,
                    (cursor) =>
                      client.fetchQuery(
                        trpc.finance.accountLedger.queryOptions(
                          { bookId, ...input, cursor, limit: 50 },
                          { staleTime: Number.POSITIVE_INFINITY },
                        ),
                      ),
                    undefined,
                    cancelled,
                  )
                  return buildFinanceLedgerCsv(data, entries)
                }}
              />
              <Text className="text-xs text-muted-foreground">
                Page opening balance {money(data.pageOpeningBalanceMinor)}
              </Text>
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        query.isPending ? (
          <ListSkeleton
            count={6}
            label="Loading account entries"
            variant="ledger"
          />
        ) : (
          <Text className="py-5 text-muted-foreground">
            {query.isError
              ? "Retry to load account entries."
              : "No entries in this period."}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <View className="gap-2 border-b border-border py-5">
          <Text className="text-base font-semibold">{item.description}</Text>
          <Text className="text-xs text-muted-foreground">
            {item.effectiveAt.toISOString().slice(0, 10)} UTC · Sequence{" "}
            {item.sequence}
          </Text>
          <Text>
            Debit {money(item.debitMinor)} · Credit {money(item.creditMinor)}
          </Text>
          <Text className="font-semibold">
            Balance {money(item.balanceMinor)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            Source {item.sourceKind} · {item.sourceId}
          </Text>
          {item.reversalOfId ? (
            <Text className="text-sm text-muted-foreground">
              Correction of entry {item.reversalOfId}
            </Text>
          ) : item.reversedById ? (
            <Text className="text-sm text-muted-foreground">
              Reversed by {item.reversedById} · Original retained
            </Text>
          ) : null}
        </View>
      )}
      ListFooterComponent={
        <View className="gap-3 py-6">
          <Text className="text-xs text-muted-foreground">
            Page {cursors.length} · Paging and full export retain snapshot{" "}
            {input.snapshotSequence}.
          </Text>
          <ActionButton
            variant="outline"
            disabled={cursors.length < 2 || query.isFetching}
            onPress={() => setCursors((value) => value.slice(0, -1))}
          >
            Previous page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={!data?.nextCursor || query.isFetching}
            onPress={() => {
              if (data?.nextCursor)
                setCursors((value) => [...value, data.nextCursor ?? undefined])
            }}
          >
            Next page
          </ActionButton>
        </View>
      }
    />
  )
}
