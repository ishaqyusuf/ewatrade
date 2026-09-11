import {
  ActionButton,
  MarketDayActionButton,
} from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { View } from "@/components/ui/view"
import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet"
import { createContext, useContext } from "react"
import {
  BUSINESS_SEARCH_LIMIT,
  type useBusinessSwitch,
} from "./use-business-switch"

export const WorkspaceFooterContext = createContext<{
  vm: ReturnType<typeof useBusinessSwitch>
  market: boolean
  onHeight: (height: number) => void
} | null>(null)

// Stable component identity keeps the focused search input mounted as its
// context values change; an inline footer renderer would recreate that host.
export function BusinessSwitchSheetFooter(props: BottomSheetFooterProps) {
  const context = useContext(WorkspaceFooterContext)
  if (!context) return null
  const { vm, market, onHeight } = context
  return (
    <BottomSheetFooter {...props}>
      <BottomSheetInputProvider>
        <View
          className={
            market
              ? "gap-3 bg-market-field px-5 pb-5 pt-3"
              : "gap-3 bg-card px-5 pb-5 pt-3"
          }
          onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
        >
          {!vm.blocked && !vm.accepted ? (
            <>
              <FormField
                variant={market ? "market" : "filled"}
                label="Find business"
                leadingIcon="Search"
                maxLength={BUSINESS_SEARCH_LIMIT}
                editable={!vm.selectingId}
                value={vm.search}
                onChangeText={vm.setSearch}
                placeholder="Name, role or currency"
              />
              {market ? (
                <MarketDayActionButton
                  tone="marigold"
                  icon="Plus"
                  disabled={!vm.canCreate}
                  onPress={vm.openCreate}
                >
                  Add business
                </MarketDayActionButton>
              ) : (
                <ActionButton
                  icon="Plus"
                  disabled={!vm.canCreate}
                  onPress={vm.openCreate}
                >
                  Add business
                </ActionButton>
              )}
            </>
          ) : null}
        </View>
      </BottomSheetInputProvider>
    </BottomSheetFooter>
  )
}
