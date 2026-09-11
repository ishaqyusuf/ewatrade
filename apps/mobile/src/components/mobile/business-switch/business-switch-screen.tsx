import { MarketDayActionButton } from "@/components/mobile/action-button"
import { AppBottomSheetBackdrop } from "@/components/app/bottom-sheet-backdrop"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import {
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { RefreshControl, useWindowDimensions } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { ScrollView } from "react-native-css/components/ScrollView"
import {
  ClassicWorkspaceHeader,
  ClassicWorkspaceRow,
} from "../appearances/classic/business-switch-screen"
import {
  MarketDayWorkspaceHeader,
  MarketDayWorkspaceRow,
} from "../appearances/market-day/business-switch-screen"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import { BUSINESS_SWITCH_COPY } from "../business-switch-presentation"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import { BUSINESS_SEARCH_LIMIT, useBusinessSwitch } from "./use-business-switch"
import type { RetailOpsBusiness } from "@/store/businessStore"
import {
  BusinessSwitchSheetFooter,
  WorkspaceFooterContext,
} from "./business-switch-sheet-footer"

type WorkspaceController = ReturnType<typeof useBusinessSwitch>
type SwitchProps = { onComplete?: () => void }
export function BusinessSwitchChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="business-switch" />
}

function WorkspaceBody({
  vm,
  market,
  footerSpace,
  sheet = false,
}: {
  vm: WorkspaceController
  market: boolean
  footerSpace: number
  sheet?: boolean
}) {
  const Header = market ? MarketDayWorkspaceHeader : ClassicWorkspaceHeader
  const Row = market ? MarketDayWorkspaceRow : ClassicWorkspaceRow
  const colors = useColors()
  const palette = useMarketDayPalette()
  const header = (
    <View className="gap-4 pb-4">
      <Header count={vm.businesses.length} currentName={vm.currentName} />
      <View className={market ? "gap-3 px-4" : "gap-3"}>
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
        {vm.error || (!vm.local && vm.memberships.isError) ? (
          <StatusBanner
            icon="AlertCircle"
            title="Workspaces unavailable"
            message={
              vm.error ?? "Reconnect and refresh before switching workspaces."
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
  const empty = (
    <EmptyState
      variant="flat"
      icon="Building2"
      title={
        vm.isLoading
          ? "Loading workspaces"
          : vm.isOffline && !vm.local
            ? "No cached workspaces"
            : vm.memberships.isError && !vm.local
              ? "Workspaces unavailable"
              : vm.search
                ? "No matching businesses"
                : "No business yet"
      }
      message={
        vm.isLoading
          ? "Reading the businesses available to this account."
          : vm.search
            ? "Try another name, role, currency or category."
            : "Your businesses will appear here. Add a business to set up a new workspace."
      }
    />
  )
  const listProps = {
    data: vm.filteredBusinesses,
    keyExtractor: (business: RetailOpsBusiness) => business.id,
    renderItem: ({ item }: { item: RetailOpsBusiness }) => (
      <Row
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
          colors={[market ? palette.palm : colors.primary]}
          tintColor={market ? palette.palm : colors.primary}
          progressBackgroundColor={market ? palette.field : colors.card}
        />
      ) : undefined,
  }
  if (sheet)
    return (
      <BottomSheetFlatList
        {...listProps}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: market ? 0 : 20,
          paddingBottom: footerSpace,
        }}
      />
    )
  return (
    <VariableContextProvider value={{ "--workspace-list-bottom": footerSpace }}>
      <FlatList
        {...listProps}
        className="flex-1"
        keyboardDismissMode="interactive"
        contentContainerClassName={
          market
            ? "grow pb-[var(--workspace-list-bottom)]"
            : "grow px-4 pb-[var(--workspace-list-bottom)]"
        }
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
  const market = useMobileDesign("business-switch") === "market-day"
  const [footerHeight, setFooterHeight] = useState(88)
  const discovered = useRef(false)
  if (shouldShowListSearch(vm.businesses.length) || vm.search)
    discovered.current = true
  const searchVisible = market || discovered.current
  if (vm.blocked || vm.accepted) return <WorkspaceAccessState vm={vm} />
  return (
    <View className={market ? "flex-1 bg-market-canvas" : "flex-1"}>
      <WorkspaceBody
        vm={vm}
        market={market}
        footerSpace={(searchVisible ? footerHeight : 0) + (market ? 24 : 112)}
      />
      {searchVisible ? (
        <BottomSearchFooter
          accessibilityLabel="Find business"
          label="Find business"
          alwaysShowSearch
          localSearch
          maxLength={BUSINESS_SEARCH_LIMIT}
          placeholder="Name, role or currency"
          value={vm.search}
          onChangeText={vm.setSearch}
          totalCount={vm.businesses.length}
          onHeightChange={setFooterHeight}
          variant={market ? "market-day" : "default"}
        >
          {market ? (
            <MarketDayActionButton
              tone="marigold"
              icon="Plus"
              disabled={!vm.canCreate}
              onPress={vm.openCreate}
            >
              Add business
            </MarketDayActionButton>
          ) : null}
        </BottomSearchFooter>
      ) : null}
      {!market ? (
        <ListCreateFab
          accessibilityLabel="Add a new business"
          bottomOffset={searchVisible ? footerHeight : 0}
          disabled={!vm.canCreate}
          onPress={vm.openCreate}
          testID="business-add-fab"
        />
      ) : null}
    </View>
  )
}

export const BusinessSwitchSheet = forwardRef<BottomSheetModal, SwitchProps>(
  function BusinessSwitchSheet({ onComplete }, ref) {
    const modal = useModal()
    const afterDismiss = useRef<(() => void) | null>(null)
    const vm = useBusinessSwitch({
      onComplete: () => {
        modal.dismiss()
        onComplete?.()
      },
      beforeCreate: (navigate) => {
        afterDismiss.current = navigate
        modal.dismiss()
      },
    })
    const market = useMobileDesign("business-switch") === "market-day"
    const palette = useMarketDayPalette()
    const { height } = useWindowDimensions()
    const [footerHeight, setFooterHeight] = useState(150)
    const portalValues = useRef({
      vm,
      market,
      onHeight: setFooterHeight,
      height,
    })
    portalValues.current = { vm, market, onHeight: setFooterHeight, height }
    // Gorhom renders its node at a separate PortalHost. Put local providers
    // inside that node, not outside Modal; keep the container type stable.
    const PortalContainer = useCallback(
      ({ children }: { children?: ReactNode }) => {
        const value = portalValues.current
        return (
          <WorkspaceFooterContext.Provider value={value}>
            <VariableContextProvider
              value={{
                "--workspace-sheet-height": Math.round(value.height * 0.72),
              }}
            >
              {children}
            </VariableContextProvider>
          </WorkspaceFooterContext.Provider>
        )
      },
      [],
    )
    const bindRef = useCallback(
      (instance: BottomSheetModal | null) => {
        modal.ref.current = instance
        if (typeof ref === "function") ref(instance)
        else if (ref) ref.current = instance
      },
      [modal.ref, ref],
    )
    const backdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <AppBottomSheetBackdrop {...props} dismissible={!vm.selectingId} />
      ),
      [vm.selectingId],
    )
    const handle = useCallback(
      () => (
        <View className="flex-row items-center justify-between gap-3 px-5 pb-3 pt-4">
          <Text
            accessibilityRole="header"
            className={
              market
                ? "min-w-0 flex-1 text-xl font-bold text-market-ink"
                : "min-w-0 flex-1 text-xl font-bold text-foreground"
            }
          >
            {BUSINESS_SWITCH_COPY.title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              vm.selectingId
                ? "Cancel workspace check and close"
                : "Close workspaces"
            }
            onPress={() => {
              vm.cancelActivation()
              modal.dismiss()
            }}
            className={
              market
                ? "size-11 items-center justify-center rounded-full bg-market-soft-band"
                : "size-11 items-center justify-center rounded-full bg-muted"
            }
          >
            <Icon
              name="X"
              className={
                market ? "size-sm text-market-ink" : "size-sm text-foreground"
              }
            />
          </Pressable>
        </View>
      ),
      [market, modal.dismiss, vm.cancelActivation, vm.selectingId],
    )
    return (
      <Modal
        containerComponent={PortalContainer}
        ref={bindRef}
        title={BUSINESS_SWITCH_COPY.title}
        snapPoints={["90%"]}
        keyboardBehavior="fillParent"
        footerComponent={BusinessSwitchSheetFooter}
        backdropComponent={backdrop}
        handleComponent={handle}
        enablePanDownToClose={!vm.selectingId}
        onAnimate={(_fromIndex, toIndex) => {
          if (toIndex === -1) vm.cancelActivation()
        }}
        backgroundStyle={
          market
            ? { backgroundColor: palette.field, borderColor: palette.line }
            : undefined
        }
        onDismiss={() => {
          vm.cancelActivation()
          const navigate = afterDismiss.current
          afterDismiss.current = null
          navigate?.()
        }}
      >
        <View className="h-[var(--workspace-sheet-height)]">
          {vm.blocked || vm.accepted ? (
            <WorkspaceAccessState vm={vm} />
          ) : (
            <WorkspaceBody
              vm={vm}
              market={market}
              sheet
              footerSpace={footerHeight + 24}
            />
          )}
        </View>
      </Modal>
    )
  },
)
