import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { generalCashCountReadInput } from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { ListCard } from "../green-till/kit"

type Count = RouterOutputs["finance"]["cashCount"]
const options = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const utc = (value: Date | string | null | undefined) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : "Not recorded or unavailable"
const sequence = (value: string) =>
  typeof value === "string" && /^\d+$/.test(value) ? value : "Unavailable"
function money(value: unknown, currency: string) {
  const exact =
    typeof value === "string" && /^-?\d{1,80}$/.test(value)
      ? value
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : null
  if (exact === null) return "Amount unavailable"
  try {
    return formatFinanceMoney(exact, currency)
  } catch {
    return "Amount unavailable"
  }
}
/** Saved physical observation only. Never reuse the ordinary adjustment form. */
export function NativeCashOriginalScreen({
  bookId,
  countId,
}: { bookId: string; countId: string }) {
  const { profile } = useAuthContext()
  const [refresh, setRefresh] = useState(0)
  const parsed = generalCashCountReadInput.safeParse({ bookId, countId })
  if (
    !parsed.success ||
    !profile?.id ||
    !profile.businessId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <Notice>
        This original cash-count link or current business access is unavailable.
      </Notice>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.staffAccessMode,
    profile.catalogEditor,
    profile.status,
    parsed.data,
    refresh,
  ])
  return (
    <FinanceWorkspaceGate
      key={scope}
      expectedBookId={parsed.data.bookId}
      requireOnline
    >
      {(workspace) =>
        workspace.actorUserId === profile.id &&
        workspace.tenantId === profile.businessId &&
        workspace.book.id === parsed.data.bookId ? (
          <CountRead
            key={scope}
            workspace={workspace}
            countId={parsed.data.countId}
            refresh={() => setRefresh((value) => value + 1)}
          />
        ) : (
          <Notice>
            The current actor, business or original Finance Book changed.
          </Notice>
        )
      }
    </FinanceWorkspaceGate>
  )
}
function CountRead({
  workspace,
  countId,
  refresh,
}: { workspace: FinanceWorkspace; countId: string; refresh: () => void }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.finance.cashCount.queryOptions(
        { bookId: workspace.book.id, countId },
        options,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  if (read.state === "checking")
    return <Notice>Checking current access to the original cash count…</Notice>
  if (
    read.state === "refused" ||
    read.data.id !== countId ||
    read.data.bookId !== workspace.book.id ||
    read.data.currencyCode !== workspace.book.currencyCode
  )
    return (
      <View className="gap-3 p-5">
        <Text accessibilityRole="alert">
          This exact original count is unavailable for the current actor, Book
          or currency.
        </Text>
        <ActionButton variant="outline" onPress={refresh}>
          Retry original count
        </ActionButton>
      </View>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 14, padding: 18, paddingBottom: 36 }}
    >
      <CountContent count={read.data} />
      <ActionButton variant="outline" onPress={refresh}>
        Refresh original count
      </ActionButton>
    </ScrollView>
  )
}
function CountContent({ count: c }: { count: Count }) {
  return (
    <>
      <Section title="Original cash observation">
        <Text className="text-sm text-muted-foreground">
          Cash physically counted
        </Text>
        <Text className="text-4xl font-bold tabular-nums text-foreground">
          {money(c.observedBalanceMinor, c.currencyCode)}
        </Text>
        <Text className="text-base font-semibold text-foreground">
          {c.reference}
        </Text>
        <Fact title="Counted at (UTC)" value={utc(c.asOf)} />
        <Fact
          title="Original posted balance"
          value={money(c.expectedBalanceMinor, c.currencyCode)}
        />
        <Fact
          title="Original difference"
          value={money(c.differenceMinor, c.currencyCode)}
        />
        <Fact
          title="Original ledger snapshot"
          value={sequence(c.snapshotSequence)}
        />
        <Fact title="Recorded at (UTC)" value={utc(c.recordedAt)} />
        <Fact title="Recorded actor reference" value={c.actorUserId} />
        <Text>
          This record preserves the physical observation and its original posted
          basis. Recording a count does not post an adjustment or move money.
        </Text>
      </Section>
      <Section title="Current review">
        <Fact title="Current account name" value={c.accountName} />
        <Text className="text-xs text-muted-foreground">
          The name is the current account label, not an original historical name
          snapshot.
        </Text>
        <Fact
          title="Current ledger snapshot"
          value={sequence(c.currentSnapshotSequence)}
        />
        <Fact
          title="Current count review"
          value={c.status.toLowerCase().replaceAll("_", " ")}
        />
        <Text>
          {c.reviewRequired
            ? "Review required: later postings changed account history at or before the count time. The original observation and difference are preserved."
            : c.status === "MATCHED"
              ? "The original count matched its posted basis. This does not certify complete operational reconciliation."
              : "The original difference remains visible. Investigate records before any separately reviewed correction."}
        </Text>
        <Fact
          title="Current cash balance"
          value="Unavailable in this original count read. The current ledger is separate."
        />
      </Section>
      {c.adjustment ? (
        <Section title="Separate adjustment history">
          <Fact
            title="Adjustment description"
            value={c.adjustment.description}
          />
          <Fact
            title="Adjustment recorded (UTC)"
            value={utc(c.adjustment.recordedAt)}
          />
          {c.adjustment.reversal ? (
            <>
              <Fact
                title="Saved reversal reference"
                value={c.adjustment.reversal.id}
              />
              <Fact
                title="Reversal recorded (UTC)"
                value={utc(c.adjustment.reversal.recordedAt)}
              />
            </>
          ) : (
            <Text>
              No reversal is recorded for this adjustment in the current read.
            </Text>
          )}
          <Text>
            The separate journal history does not replace or edit the original
            count.
          </Text>
        </Section>
      ) : (
        <Section title="Separate adjustment history">
          <Text>
            No adjustment is recorded for this count in the current read.
          </Text>
        </Section>
      )}
      <Text className="text-xs text-muted-foreground">
        Opening this original performs no adjustment, reversal, stock closeout,
        posting-date lock or fiscal close.
      </Text>
    </>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-3 py-3">
        <Text
          accessibilityRole="header"
          className="text-lg font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
function Fact({ title, value }: { title: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{title}</Text>
      <Text className="text-sm font-medium text-foreground">{value}</Text>
    </View>
  )
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="p-5">
      <Text accessibilityRole="alert">{children}</Text>
    </View>
  )
}
