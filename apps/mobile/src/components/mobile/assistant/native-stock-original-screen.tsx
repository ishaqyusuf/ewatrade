import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { type StockScope, stockReadOptions } from "./general-stock-editor-parts"
import {
  StockCloseoutContent,
  StockCountContent,
  StockOperationContent,
  StockTransferContent,
} from "./native-stock-original-content"
import {
  type NativeStockOriginal,
  nativeStockRoles,
  nativeStockScope,
} from "./native-stock-state"

const labels: Record<NativeStockOriginal["kind"], string> = {
  stock_operation: "stock operation",
  stock_count: "stock count",
  stock_transfer: "stock transfer",
  inventory_closeout: "custody closeout",
}

/**
 * The exact saved stock record, read fresh in the active Store. Receipts
 * carry no Store, so another Store's record reads as unavailable here.
 */
export function NativeStockOriginalScreen({
  original,
}: { original: NativeStockOriginal | null }) {
  const { profile } = useAuthContext()
  const [refresh, setRefresh] = useState(0)
  if (!original)
    return (
      <Notice>
        This original stock link is invalid. Go back and open the exact saved
        record again.
      </Notice>
    )
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    !profile.role ||
    !(nativeStockRoles as readonly string[]).includes(profile.role) ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <Notice>
        An owner, administrator or manager can open this {labels[original.kind]}
        .
      </Notice>
    )
  const expected = {
    tenantId: profile.businessId,
    storeId: profile.storeId,
    actorUserId: profile.id,
    role: profile.role,
  }
  return (
    <ScopedOriginal
      key={JSON.stringify([
        expected,
        profile.staffAccessMode,
        profile.status,
        original,
        refresh,
      ])}
      original={original}
      expected={expected}
      refresh={() => setRefresh((value) => value + 1)}
    />
  )
}

function ScopedOriginal({
  original,
  expected,
  refresh,
}: {
  original: NativeStockOriginal
  expected: Parameters<typeof nativeStockScope>[1]
  refresh: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.tenant.current.queryOptions(undefined, stockReadOptions),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const scope =
    read.state === "ready" ? nativeStockScope(read.data, expected) : null
  if (read.state === "checking")
    return <Notice>Checking your current business and Store…</Notice>
  if (!scope)
    return (
      <Unavailable refresh={refresh}>
        Your current business, Store or access changed.
      </Unavailable>
    )
  return <OriginalRead original={original} scope={scope} refresh={refresh} />
}

function OriginalRead({
  original,
  scope,
  refresh,
}: {
  original: NativeStockOriginal
  scope: StockScope
  refresh: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const storeId = scope.storeId
  const operation = useQuery(
    mountOwnedRead(
      trpc.inventory.operationAudit.queryOptions(
        {
          operationId:
            original.kind === "stock_operation" ? original.operationId : "",
          storeId,
        },
        { ...stockReadOptions, enabled: original.kind === "stock_operation" },
      ),
      mount,
    ),
  )
  const count = useQuery(
    mountOwnedRead(
      trpc.inventory.stockCountReview.queryOptions(
        {
          stockCountId:
            original.kind === "stock_count" ? original.stockCountId : "",
          storeId,
        },
        { ...stockReadOptions, enabled: original.kind === "stock_count" },
      ),
      mount,
    ),
  )
  const closeout = useQuery(
    mountOwnedRead(
      trpc.inventory.closeoutReview.queryOptions(
        {
          closeoutId:
            original.kind === "inventory_closeout" ? original.closeoutId : "",
          storeId,
        },
        {
          ...stockReadOptions,
          enabled: original.kind === "inventory_closeout",
        },
      ),
      mount,
    ),
  )
  const transfer = useQuery(
    mountOwnedRead(
      trpc.inventory.transferReview.queryOptions(
        {
          transferId:
            original.kind === "stock_transfer" ? original.transferId : "",
          storeId,
        },
        { ...stockReadOptions, enabled: original.kind === "stock_transfer" },
      ),
      mount,
    ),
  )
  let content: ReactNode = null
  let state: "checking" | "refused" | "ready" = "checking"
  switch (original.kind) {
    case "stock_operation": {
      const read = freshShownRead(operation)
      state = read.state
      if (
        read.state === "ready" &&
        read.data?.id === original.operationId &&
        read.data.storeId === storeId
      )
        content = <StockOperationContent op={read.data} />
      break
    }
    case "stock_count": {
      const read = freshShownRead(count)
      state = read.state
      if (
        read.state === "ready" &&
        read.data.id === original.stockCountId &&
        read.data.storeId === storeId
      )
        content = <StockCountContent count={read.data} />
      break
    }
    case "inventory_closeout": {
      const read = freshShownRead(closeout)
      state = read.state
      if (
        read.state === "ready" &&
        read.data.id === original.closeoutId &&
        read.data.storeId === storeId
      )
        content = <StockCloseoutContent closeout={read.data} />
      break
    }
    case "stock_transfer": {
      const read = freshShownRead(transfer)
      state = read.state
      if (
        read.state === "ready" &&
        read.data.id === original.transferId &&
        (read.data.sourceStore.id === storeId ||
          read.data.targetStore.id === storeId)
      )
        content = (
          <StockTransferContent transfer={read.data} storeId={storeId} />
        )
      break
    }
  }
  if (state === "checking")
    return <Notice>Checking the original {labels[original.kind]}…</Notice>
  if (!content)
    return (
      <Unavailable refresh={refresh}>
        {`This exact ${labels[original.kind]} is unavailable in the current Store. It may belong to another Store or no longer be readable with your access.`}
      </Unavailable>
    )
  return (
    <ScrollView
      contentContainerStyle={{ gap: 14, padding: 18, paddingBottom: 36 }}
    >
      {content}
      <ActionButton variant="outline" onPress={refresh}>
        Refresh original
      </ActionButton>
    </ScrollView>
  )
}

function Unavailable({
  children,
  refresh,
}: { children: string; refresh: () => void }) {
  return (
    <View className="gap-3 p-5">
      <Text accessibilityRole="alert">{children}</Text>
      <ActionButton variant="outline" onPress={refresh}>
        Retry original
      </ActionButton>
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
