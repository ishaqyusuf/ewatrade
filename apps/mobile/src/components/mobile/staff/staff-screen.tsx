import {
  ActionButton,
  MarketDayActionButton,
} from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { forwardRef, useRef, useState } from "react"
import { RefreshControl, useWindowDimensions } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { ScrollView } from "react-native-css/components/ScrollView"
import {
  ClassicStaffHeader,
  ClassicStaffRow,
  ClassicStaffEmpty,
} from "../appearances/classic/staff-screen"
import {
  MarketDayStaffHeader,
  MarketDayStaffRow,
  MarketDayStaffEmpty,
} from "../appearances/market-day/staff-screen"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import { STAFF_SEARCH_LIMIT } from "./staff-model"
import { StaffInvitationSheet } from "./staff-invitation-sheet"
import { useStaffDirectory } from "./use-staff-directory"

type StaffInviteProps = { onComplete?: () => void }
export function StaffChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="staff" />
}

export function StaffInviteContent({ onComplete }: StaffInviteProps) {
  const appearance = useMobileDesign("staff")
  const market = appearance === "market-day"
  const Header = market ? MarketDayStaffHeader : ClassicStaffHeader
  const Row = market ? MarketDayStaffRow : ClassicStaffRow
  const Empty = market ? MarketDayStaffEmpty : ClassicStaffEmpty
  const colors = useColors()
  const palette = useMarketDayPalette()
  const vm = useStaffDirectory(onComplete)
  const { invitation, rows } = vm
  const [footerHeight, setFooterHeight] = useState(88)
  const discoveredSearch = useRef(false)
  if (shouldShowListSearch(rows.length) || vm.search)
    discoveredSearch.current = true
  const recovery = Boolean(invitation.recoveryEmail)
  const showSearch = market || discoveredSearch.current || recovery
  const showInitialInvite =
    rows.length === 0 &&
    !vm.search &&
    vm.canOpenInvite &&
    !invitation.recoveryEmail
  const showFab = !market && !showInitialInvite && !recovery
  const bottomSpace = (showSearch ? footerHeight : 0) + (showFab ? 100 : 24)
  const emptyTitle = vm.isLoading
    ? "Loading staff"
    : vm.isOffline
      ? "No cached staff"
      : vm.directory.isError
        ? "Staff unavailable"
        : vm.search
          ? "No matching attendants"
          : "Your crew starts here."
  const emptyMessage = vm.isLoading
    ? "Waiting for the shared attendant directory."
    : vm.isOffline
      ? "Reconnect to load current staff membership."
      : vm.directory.isError
        ? "Try again to load the shared directory."
        : vm.search
          ? "Change or clear your search. No match here does not prove that an uncertain invitation was not saved."
          : "Invite an attendant using their own email address."

  if (vm.blocked) {
    return (
      <ScrollView className="flex-1" contentContainerClassName="grow px-4 py-6">
        <EmptyState
          icon="Users"
          variant="flat"
          title={
            vm.scopeChanged
              ? "Workspace changed"
              : !vm.canManage
                ? "Staff access required"
                : vm.availability.isPending && !vm.isOffline
                  ? "Loading workspace"
                  : "Workspace unavailable"
          }
          message={
            vm.scopeChanged
              ? "Return to the original account, business and Store to continue this invitation, or close and reopen Staff. Pending recovery is kept only while this workflow remains open."
              : !vm.canManage
                ? "An Owner, Admin or Manager manages attendants."
                : vm.isOffline
                  ? "Reconnect to resolve the Store before managing attendants."
                  : "A Store is required before opening the staff directory."
          }
        />
        {!vm.scopeChanged &&
        vm.canManage &&
        !vm.isOffline &&
        vm.availability.isError ? (
          <ActionButton
            icon="RotateCw"
            onPress={() => void vm.availability.refetch()}
          >
            Retry workspace
          </ActionButton>
        ) : null}
      </ScrollView>
    )
  }

  return (
    <VariableContextProvider value={{ "--staff-list-bottom": bottomSpace }}>
      <View
        className={market ? "flex-1 bg-market-canvas" : "flex-1"}
        testID="staff-directory-screen"
      >
        <View
          className="flex-1"
          accessibilityElementsHidden={invitation.open}
          importantForAccessibility={
            invitation.open ? "no-hide-descendants" : "auto"
          }
        >
          <FlatList
            className="flex-1"
            contentContainerClassName={
              market
                ? "grow pb-[var(--staff-list-bottom)]"
                : "grow px-2 pb-[var(--staff-list-bottom)]"
            }
            data={rows}
            keyExtractor={(row) => row.id}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View className="gap-4 pb-4">
                <Header loadedCount={rows.length} />
                <View className="gap-3 px-4">
                  {invitation.notice ? (
                    <StatusBanner icon="Check" message={invitation.notice} />
                  ) : null}
                  {recovery ? (
                    <StatusBanner
                      icon="TriangleAlert"
                      title="Invitation not confirmed"
                      message={
                        "Check the loaded directory for " +
                        invitation.recoveryEmail +
                        ". A matching record does not confirm this request or email delivery. No second invite will be sent from this workflow. Recovery is memory-only."
                      }
                      actionLabel="Review invitation"
                      onActionPress={invitation.present}
                      tone="warning"
                    />
                  ) : null}
                  {vm.isOffline ? (
                    <StatusBanner
                      icon="Wind"
                      title="Cached directory"
                      message="Membership is managed online. Reconnect to search, refresh or invite. Cached status may be out of date."
                      tone="warning"
                    />
                  ) : null}
                  {vm.directory.isError && !vm.isOffline ? (
                    <StatusBanner
                      icon="AlertCircle"
                      title="Directory refresh failed"
                      message="The latest staff list could not load. Existing rows may be out of date."
                      actionLabel="Try again"
                      onActionPress={() => void vm.refresh()}
                      tone="destructive"
                    />
                  ) : null}
                  <Text
                    className={
                      market
                        ? "text-xs leading-5 text-market-muted-ink"
                        : "text-xs leading-5 text-muted-foreground"
                    }
                  >
                    {vm.quotaMessage}
                  </Text>
                  {vm.atResultLimit ? (
                    <StatusBanner
                      icon="Search"
                      title="Showing up to 100 matches"
                      message="Narrow the search by name or email to find another attendant. This API does not provide a full directory count."
                    />
                  ) : null}
                  {vm.searchPending ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      className={
                        market
                          ? "text-xs text-market-muted-ink"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      Updating directory…
                    </Text>
                  ) : null}
                </View>
              </View>
            }
            ListEmptyComponent={
              <Empty
                title={emptyTitle}
                message={emptyMessage}
                onInvite={showInitialInvite ? invitation.present : undefined}
              />
            }
            refreshControl={
              !vm.isOffline ? (
                <RefreshControl
                  refreshing={vm.refreshing}
                  onRefresh={() => void vm.refresh()}
                  tintColor={market ? palette.palm : colors.primary}
                  colors={[market ? palette.palm : colors.primary]}
                  progressBackgroundColor={market ? palette.field : colors.card}
                />
              ) : undefined
            }
            renderItem={({ item }) => <Row staff={item} />}
          />
          {showSearch ? (
            <BottomSearchFooter
              accessibilityLabel="Search attendants"
              alwaysShowSearch
              maxLength={STAFF_SEARCH_LIMIT}
              onHeightChange={setFooterHeight}
              onChangeText={vm.setSearch}
              value={vm.search}
              totalCount={rows.length}
              placeholder="Name or email"
              variant={market ? "market-day" : "default"}
            >
              {market && !showInitialInvite ? (
                <MarketDayActionButton
                  tone="marigold"
                  icon={recovery ? "Search" : "UserPlus"}
                  disabled={recovery ? false : !vm.canOpenInvite}
                  onPress={
                    recovery ? invitation.checkDirectory : invitation.present
                  }
                >
                  {recovery ? "Check directory" : "Invite attendant"}
                </MarketDayActionButton>
              ) : !market && recovery ? (
                <ActionButton icon="Search" onPress={invitation.checkDirectory}>
                  Check directory
                </ActionButton>
              ) : null}
            </BottomSearchFooter>
          ) : null}
          {showFab ? (
            <ListCreateFab
              accessibilityLabel="Invite staff"
              bottomOffset={showSearch ? footerHeight : 0}
              disabled={!vm.canOpenInvite}
              onPress={invitation.present}
              testID="staff-add-fab"
            />
          ) : null}
        </View>
        <StaffInvitationSheet
          ref={invitation.modalRef}
          appearance={appearance}
          draft={invitation.draft}
          error={invitation.error}
          quotaMessage={vm.quotaMessage}
          locked={invitation.locked}
          isPending={invitation.isPending}
          canSubmit={invitation.canSubmit}
          uncertain={recovery}
          recoveryDisabled={invitation.blocked}
          onChange={invitation.setDraft}
          onSave={invitation.save}
          onCheckDirectory={invitation.checkDirectory}
          onClose={invitation.close}
          onDismiss={invitation.onDismiss}
        />
      </View>
    </VariableContextProvider>
  )
}

// Retained for existing imports; route-based Staff uses one full-screen host.
export const StaffInviteSheet = forwardRef<BottomSheetModal, StaffInviteProps>(
  function StaffInviteSheet({ onComplete }, ref) {
    const { height } = useWindowDimensions()
    return (
      <Modal ref={ref} snapPoints={["82%"]} title="Staff">
        <VariableContextProvider
          value={{ "--staff-legacy-height": Math.round(height * 0.7) }}
        >
          <View className="h-[var(--staff-legacy-height)]">
            <StaffInviteContent onComplete={onComplete} />
          </View>
        </VariableContextProvider>
      </Modal>
    )
  },
)
