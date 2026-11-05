import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { getListCreateFabFooterOffset } from "@/components/mobile/list-create-fab-model"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { SearchFold, useSearchFold } from "@/components/mobile/search-fold"
import { StatusBanner } from "@/components/mobile/status-banner"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColors } from "@/hooks/use-color"
import { shouldShowListSearch } from "@/lib/list-pagination"
import type { RetailOpsBusiness } from "@/store/businessStore"
import { VariableContextProvider } from "nativewind"
import { useRef, useState } from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
} from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  ClassicWorkspaceHeader,
  ClassicWorkspaceRow,
} from "../appearances/classic/business-switch-screen"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import { BUSINESS_SEARCH_LIMIT, useBusinessSwitch } from "./use-business-switch"

type WorkspaceController = ReturnType<typeof useBusinessSwitch>
type SwitchProps = { onComplete?: () => void }
export function BusinessSwitchChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} />
}

function WorkspaceBody({
  vm,
  footerSpace,
  heroFolded = false,
  onScroll,
}: {
  vm: WorkspaceController
  footerSpace: number
  /** Folds the current-business card while the bottom search is in use. */
  heroFolded?: boolean
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
  const colors = useColors()
  const header = (
    <View className="gap-4 pb-4">
      <SearchFold folded={heroFolded}>
        <ClassicWorkspaceHeader
          count={vm.businesses.length}
          currentName={vm.currentName}
        />
      </SearchFold>
      <View className="gap-3">
        {vm.local ? (
          <StatusBanner
            icon="Building2"
            title="Local demo workspaces"
            message="These businesses are saved on this device, not a list of production memberships."
          />
        ) : null}
        {vm.isOffline && !vm.local ? (
          <StatusBanner
            icon="Wind"
            title="Cached workspaces"
            message="Browse and search locally. Reconnect to verify membership before switching or adding a business."
            tone="warning"
          />
        ) : null}
        {vm.selectingId ? (
          <StatusBanner
            icon="Building2"
            title="Checking workspace access"
            message="Wait while the selected membership is verified. Other selections are temporarily disabled."
          />
        ) : null}
        {vm.businessLimitReached ? (
          <StatusBanner
            title="Business limit reached"
            message="Open Plan & billing from More to review your plan usage before adding another business."
            tone="warning"
          />
        ) : null}
        {vm.error || (!vm.local && vm.memberships.isError) ? (
          <StatusBanner
            icon="AlertCircle"
            title="Workspaces unavailable"
            message={
              vm.error ??
              vm.memberships.error?.message ??
              "Reconnect and refresh before switching workspaces."
            }
            actionLabel={
              !vm.local && !vm.isOffline && !vm.selectingId
                ? "Refresh"
                : undefined
            }
            onActionPress={() => void vm.refresh()}
            tone="destructive"
          />
        ) : null}
      </View>
    </View>
  )
  const empty = vm.isLoading ? (
    <ListSkeleton count={4} label="Loading workspaces" variant="person" />
  ) : (
    <EmptyState
      variant="flat"
      icon="Building2"
      title={
        vm.isOffline && !vm.local
          ? "No cached workspaces"
          : vm.memberships.isError && !vm.local
            ? "Workspaces unavailable"
            : vm.search
              ? "No matching businesses"
              : "No business yet"
      }
      message={
        vm.search
          ? "Try another name, role, currency or category."
          : "Your businesses will appear here. Add a business to set up a new workspace."
      }
    />
  )
  const listProps = {
    data: vm.filteredBusinesses,
    keyExtractor: (business: RetailOpsBusiness) => business.id,
    renderItem: ({ item }: { item: RetailOpsBusiness }) => (
      <ClassicWorkspaceRow
        business={item}
        currentBusinessId={vm.currentBusinessId}
        disabled={!vm.canActivate}
        busy={vm.selectingId === item.id}
        onPress={() => void vm.activateBusiness(item.id)}
      />
    ),
    ListHeaderComponent: header,
    ListEmptyComponent: empty,
    keyboardShouldPersistTaps: "handled" as const,
    showsVerticalScrollIndicator: false,
    refreshControl:
      !vm.local && !vm.isOffline && !vm.selectingId ? (
        <RefreshControl
          refreshing={vm.memberships.isFetching}
          onRefresh={() => void vm.refresh()}
          colors={[colors.primary]}
          tintColor={colors.primary}
          progressBackgroundColor={colors.card}
        />
      ) : undefined,
  }
  return (
    <VariableContextProvider value={{ "--workspace-list-bottom": footerSpace }}>
      <FlatList
        {...listProps}
        className="flex-1"
        keyboardDismissMode="interactive"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="grow gap-3 px-[18px] pb-[var(--workspace-list-bottom)]"
      />
    </VariableContextProvider>
  )
}

function WorkspaceAccessState({ vm }: { vm: WorkspaceController }) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="grow p-5">
      <EmptyState
        variant="flat"
        icon="Building2"
        title={
          vm.accepted
            ? "Workspace selected"
            : vm.scopeChanged
              ? "Session changed"
              : "Workspace access required"
        }
        message={
          vm.accepted
            ? (vm.notice ??
              "Opening the selected business. Close this screen if the Dashboard has not appeared.")
            : "Close and reopen Workspaces from the active account before continuing."
        }
      />
    </ScrollView>
  )
}

export function BusinessSwitchContent({ onComplete }: SwitchProps) {
  const vm = useBusinessSwitch({ onComplete })
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const searchFold = useSearchFold(vm.search)
  const insets = useSafeAreaInsets()
  const discovered = useRef(false)
  if (shouldShowListSearch(vm.businesses.length) || vm.search)
    discovered.current = true
  const searchVisible = discovered.current
  if (vm.blocked || vm.accepted) return <WorkspaceAccessState vm={vm} />
  return (
    <View className="flex-1">
      <WorkspaceBody
        vm={vm}
        footerSpace={(searchVisible ? footerHeight : 0) + 112}
        heroFolded={searchFold.folded}
        onScroll={scrollHide.onScroll}
      />
      {searchVisible ? (
        <BottomSearchFooter
          accessibilityLabel="Find business"
          label="Find business"
          alwaysShowSearch
          hidden={scrollHide.hidden}
          localSearch
          maxLength={BUSINESS_SEARCH_LIMIT}
          placeholder="Name, role or currency"
          value={vm.search}
          onChangeText={vm.setSearch}
          totalCount={vm.businesses.length}
          onFocusChange={searchFold.onFocusChange}
          onHeightChange={setFooterHeight}
        />
      ) : null}
      <ListCreateFab
        accessibilityLabel="Add a new business"
        bottomOffset={
          searchVisible && !(scrollHide.hidden && !vm.search)
            ? getListCreateFabFooterOffset({
                bottomInset: insets.bottom,
                footerHeight,
              })
            : 0
        }
        disabled={!vm.canCreate}
        onPress={vm.openCreate}
        testID="business-add-fab"
      />
    </View>
  )
}
