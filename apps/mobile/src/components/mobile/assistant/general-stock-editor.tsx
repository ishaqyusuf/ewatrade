import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { GeneralStockBalanceEditor } from "./general-stock-balance-editor"
import {
  GeneralStockCloseoutCreateEditor,
  GeneralStockCloseoutFinalizeEditor,
} from "./general-stock-closeout-editor"
import { GeneralStockCorrectEditor } from "./general-stock-correct-editor"
import {
  GeneralStockCountCreateEditor,
  GeneralStockCountFinalizeEditor,
} from "./general-stock-count-editor"
import { GeneralStockCustodyEditor } from "./general-stock-custody-editor"
import { type StockScope, stockReadOptions } from "./general-stock-editor-parts"
import {
  GeneralStockDispatchEditor,
  GeneralStockTransitionEditor,
} from "./general-stock-transfer-editor"
import { GeneralStockTransformEditor } from "./general-stock-transform-editor"
import {
  type NativeStockScope,
  nativeStockRoles,
  nativeStockScope,
} from "./native-stock-state"
import type { NativeStockAction } from "./native-stock-values"

type Props = {
  initial: NativeStockAction
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}

/**
 * Native editors for the 12 stock writes. Each one edits only the intended
 * business facts, loads its own fresh protected reads in the current Store
 * and returns a schema-valid draft to Save; review and confirm stay separate.
 */
export function GeneralStockEditor(props: Props) {
  const { profile } = useAuthContext()
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    !profile.role ||
    !(nativeStockRoles as readonly string[]).includes(profile.role) ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return (
      <View className="p-5">
        <Text accessibilityRole="alert">
          An owner, administrator or manager can edit stock drafts.
        </Text>
      </View>
    )
  const expected: NativeStockScope = {
    tenantId: profile.businessId,
    storeId: profile.storeId,
    actorUserId: profile.id,
    role: profile.role,
  }
  // Any change of person, business, Store, role, access or draft remounts
  // every read and discards local edits.
  return (
    <ScopedStockEditor
      key={JSON.stringify([
        expected,
        profile.staffAccessMode,
        profile.status,
        props.initial,
      ])}
      expected={expected}
      {...props}
    />
  )
}

function ScopedStockEditor({
  expected,
  ...props
}: Props & { expected: NativeStockScope }) {
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
  if (read.state !== "ready" || !scope)
    return (
      <View className="gap-3 p-5">
        <Text
          accessibilityRole={read.state === "checking" ? undefined : "alert"}
        >
          {read.state === "checking"
            ? "Checking your current business and Store…"
            : "Your current business, Store or access changed. Retry, or reopen the draft from chat."}
        </Text>
        {read.state !== "checking" ? (
          <ActionButton
            variant="outline"
            disabled={props.disabled}
            onPress={() => void query.refetch()}
          >
            Retry current Store
          </ActionButton>
        ) : null}
      </View>
    )
  return <StockFamilyEditor scope={scope} {...props} />
}

function StockFamilyEditor({
  initial,
  ...rest
}: Props & { scope: StockScope }) {
  switch (initial.action) {
    case "stock_receive":
    case "stock_adjust":
      return <GeneralStockBalanceEditor initial={initial} {...rest} />
    case "stock_correct":
      return <GeneralStockCorrectEditor initial={initial} {...rest} />
    case "stock_count_create":
      return <GeneralStockCountCreateEditor initial={initial} {...rest} />
    case "stock_count_finalize":
      return <GeneralStockCountFinalizeEditor initial={initial} {...rest} />
    case "inventory_closeout_create":
      return <GeneralStockCloseoutCreateEditor initial={initial} {...rest} />
    case "inventory_closeout_finalize":
      return <GeneralStockCloseoutFinalizeEditor initial={initial} {...rest} />
    case "stock_transfer_dispatch":
      return <GeneralStockDispatchEditor initial={initial} {...rest} />
    case "stock_transfer_receive":
    case "stock_transfer_cancel":
      return <GeneralStockTransitionEditor initial={initial} {...rest} />
    case "stock_custody_move":
      return <GeneralStockCustodyEditor initial={initial} {...rest} />
    case "stock_package_transform":
      return <GeneralStockTransformEditor initial={initial} {...rest} />
  }
}
