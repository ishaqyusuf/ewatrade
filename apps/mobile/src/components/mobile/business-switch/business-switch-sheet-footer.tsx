import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
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
  onHeight: (height: number) => void
} | null>(null)

// Stable component identity keeps the focused search input mounted as its
// context values change; an inline footer renderer would recreate that host.
export function BusinessSwitchSheetFooter(props: BottomSheetFooterProps) {
  const context = useContext(WorkspaceFooterContext)
  if (!context) return null
  const { vm, onHeight } = context
  return (
    <BottomSheetFooter {...props}>
      <BottomSheetInputProvider>
        {!vm.blocked && !vm.accepted ? (
          <BottomSearchFooter
            accessibilityLabel="Find business"
            alwaysShowSearch
            editable={!vm.selectingId}
            keyboardOwner="sheet"
            localSearch
            maxLength={BUSINESS_SEARCH_LIMIT}
            onChangeText={vm.setSearch}
            onHeightChange={onHeight}
            placeholder="Name, role or currency"
            position="relative"
            totalCount={0}
            value={vm.search}
          >
            <ActionButton
              icon="Plus"
              disabled={!vm.canCreate}
              onPress={vm.openCreate}
            >
              Add business
            </ActionButton>
          </BottomSearchFooter>
        ) : null}
      </BottomSheetInputProvider>
    </BottomSheetFooter>
  )
}
