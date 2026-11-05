import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { SearchFold, useSearchFold } from "@/components/mobile/search-fold"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColors } from "@/hooks/use-color"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { useRef, useState } from "react"
import { Alert, RefreshControl } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { ScrollView } from "react-native-css/components/ScrollView"
import {
  ClassicStaffEmpty,
  ClassicStaffHeader,
  ClassicStaffRow,
} from "../appearances/classic/staff-screen"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import { NudgeCard, SectionHeader } from "../green-till/kit"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import { OrderVisibilityCard } from "./order-visibility-card"
import { StaffInvitationSheet } from "./staff-invitation-sheet"
import { STAFF_SEARCH_LIMIT } from "./staff-model"
import { useStaffDirectory } from "./use-staff-directory"

type StaffInviteProps = { onComplete?: () => void }
export function StaffChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} />
}

export function StaffInviteContent({ onComplete }: StaffInviteProps) {
  const router = useRouter()
  const colors = useColors()
  const vm = useStaffDirectory(onComplete)
  const { invitation, rows } = vm
  const ordered = [...rows].sort(
    (a, b) =>
      (a.statusLabel === "Pending" ? 0 : a.statusLabel === "Active" ? 1 : 2) -
      (b.statusLabel === "Pending" ? 0 : b.statusLabel === "Active" ? 1 : 2),
  )
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const searchFold = useSearchFold(vm.search)
  const discoveredSearch = useRef(false)
  if (shouldShowListSearch(rows.length) || vm.search)
    discoveredSearch.current = true
  const recovery = Boolean(invitation.recoveryEmail)
  const showSearch = discoveredSearch.current || recovery
  const showInitialInvite =
    rows.length === 0 &&
    !vm.search &&
    vm.canOpenInvite &&
    !invitation.recoveryEmail
  const showFab = false
  const bottomSpace = (showSearch ? footerHeight : 0) + (showFab ? 100 : 24)
  const emptyTitle = vm.isLoading
    ? "Loading staff"
    : vm.isOffline
      ? "No cached staff"
      : vm.directory.isError
        ? "Staff unavailable"
        : vm.search
          ? "No matching sales reps"
          : "Your crew starts here."
  const emptyMessage = vm.isLoading
    ? "Waiting for the shared sales rep directory."
    : vm.isOffline
      ? "Reconnect to load current staff membership."
      : vm.directory.isError
        ? "Try again to load the shared directory."
        : vm.search
          ? "Change or clear your search. No match here does not prove that an uncertain invitation was not saved."
          : "Invite a sales rep using their own email address."

  if (
    vm.blocked &&
    !vm.scopeChanged &&
    vm.canManage &&
    vm.availability.isPending &&
    !vm.isOffline
  ) {
    return (
      <View className="flex-1 px-4 py-6">
        <ListSkeleton count={5} label="Loading workspace" variant="person" />
      </View>
    )
  }

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
                : "Workspace unavailable"
          }
          message={
            vm.scopeChanged
              ? "Return to the original account, business and Store to continue this invitation, or close and reopen Staff. Pending recovery is kept only while this workflow remains open."
              : !vm.canManage
                ? "An Owner, Admin or Manager manages sales reps."
                : vm.isOffline
                  ? "Reconnect to resolve the Store before managing sales reps."
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
      <View className="flex-1" testID="staff-directory-screen">
        <View
          className="flex-1"
          accessibilityElementsHidden={invitation.open}
          importantForAccessibility={
            invitation.open ? "no-hide-descendants" : "auto"
          }
        >
          <FlatList
            className="flex-1"
            contentContainerClassName="grow px-[18px] pb-[var(--staff-list-bottom)]"
            data={ordered}
            keyExtractor={(row) => row.id}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={scrollHide.onScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={
              <View className="gap-4 pb-4">
                <SearchFold folded={searchFold.folded}>
                  <ClassicStaffHeader
                    activeCount={
                      rows.filter((row) => row.statusLabel === "Active").length
                    }
                    pendingCount={
                      rows.filter((row) => row.statusLabel === "Pending").length
                    }
                    onSeePlans={() => router.push("/subscription-modal")}
                    used={vm.entitlement?.used}
                    limit={vm.entitlement?.limit}
                    planName={vm.planName}
                    loading={vm.quotaLoading}
                    offline={vm.isOffline}
                    updatedAt={vm.quotaUpdatedAt}
                    onInvite={invitation.present}
                    inviteDisabled={!vm.canOpenInvite}
                  />
                </SearchFold>
                {vm.entitlement?.isAtLimit ? (
                  <NudgeCard
                    icon="UserPlus"
                    tint="amber"
                    title="Invite anyway"
                    sub="Your plan decides when you send."
                    actionLabel={vm.canOpenInvite ? "Invite" : undefined}
                    onAction={invitation.present}
                  />
                ) : null}
                <OrderVisibilityCard />
                <View className="gap-3 px-4">
                  {invitation.notice ? (
                    <StatusBanner icon="Check" message={invitation.notice} />
                  ) : null}
                  {recovery ? (
                    <StatusBanner
                      icon="TriangleAlert"
                      title="Invitation not confirmed"
                      message={`Check the loaded directory for ${invitation.recoveryEmail}. A matching record does not confirm this request or email delivery. No second invite will be sent from this workflow. Recovery is memory-only.`}
                      actionLabel="Review invitation"
                      onActionPress={invitation.present}
                      tone="warning"
                    />
                  ) : null}
                  {vm.isOffline ? (
                    <StatusBanner
                      icon="Wind"
                      title="Cached directory"
                      message={`Reconnect to search, refresh or invite.${vm.directory.dataUpdatedAt ? ` Saved copy as of ${new Date(vm.directory.dataUpdatedAt).toLocaleString()}.` : " No saved directory is available."}`}
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
                  {vm.atResultLimit ? (
                    <StatusBanner
                      icon="Search"
                      title="Showing up to 100 matches"
                      message="Narrow the search by name or email to find another sales rep. This API does not provide a full directory count."
                    />
                  ) : null}
                  {vm.searchPending ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      className="text-xs text-muted-foreground"
                    >
                      Updating directory…
                    </Text>
                  ) : null}
                </View>
              </View>
            }
            ListEmptyComponent={
              vm.isLoading ? (
                <View className="px-4">
                  <ListSkeleton
                    count={5}
                    label="Loading staff"
                    variant="person"
                  />
                </View>
              ) : (
                <ClassicStaffEmpty
                  title={emptyTitle}
                  message={emptyMessage}
                  onInvite={showInitialInvite ? invitation.present : undefined}
                />
              )
            }
            refreshControl={
              !vm.isOffline ? (
                <RefreshControl
                  refreshing={vm.refreshing}
                  onRefresh={() => void vm.refresh()}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                  progressBackgroundColor={colors.card}
                />
              ) : undefined
            }
            renderItem={({ item, index }) => {
              const first =
                index === 0 ||
                ordered[index - 1]?.statusLabel !== item.statusLabel
              const last =
                index === ordered.length - 1 ||
                ordered[index + 1]?.statusLabel !== item.statusLabel
              return (
                <View>
                  {first ? (
                    <SectionHeader
                      title={
                        item.statusLabel === "Pending"
                          ? "Waiting to accept"
                          : item.statusLabel
                      }
                      trailing={
                        <Text className="text-xs font-bold text-muted-foreground">
                          {
                            ordered.filter(
                              (row) => row.statusLabel === item.statusLabel,
                            ).length
                          }
                        </Text>
                      }
                    />
                  ) : null}
                  <ClassicStaffRow
                    first={first}
                    last={last}
                    staff={item}
                    onPress={() =>
                      Alert.alert(
                        item.name,
                        `${item.email}\n${item.statusLabel}\n${item.detail}`,
                      )
                    }
                  />
                </View>
              )
            }}
          />
          {showSearch ? (
            <BottomSearchFooter
              accessibilityLabel="Search sales reps"
              alwaysShowSearch
              hidden={scrollHide.hidden}
              maxLength={STAFF_SEARCH_LIMIT}
              onFocusChange={searchFold.onFocusChange}
              onHeightChange={setFooterHeight}
              onChangeText={vm.setSearch}
              value={vm.search}
              totalCount={rows.length}
              placeholder="Name or email"
            >
              {recovery ? (
                <ActionButton
                  className="rounded-full"
                  icon="Search"
                  onPress={invitation.checkDirectory}
                >
                  Check directory
                </ActionButton>
              ) : null}
            </BottomSearchFooter>
          ) : null}
          {showFab ? (
            <ListCreateFab
              accessibilityLabel="Invite staff"
              bottomOffset={
                showSearch && !(scrollHide.hidden && !vm.search)
                  ? footerHeight
                  : 0
              }
              disabled={!vm.canOpenInvite}
              onPress={invitation.present}
              testID="staff-add-fab"
            />
          ) : null}
        </View>
        <StaffInvitationSheet
          ref={invitation.modalRef}
          draft={invitation.draft}
          error={invitation.error}
          fieldErrors={invitation.fieldErrors}
          duplicate={invitation.duplicate}
          whatsappEnabled={invitation.whatsappEnabled}
          quotaMessage={vm.quotaMessage}
          locked={invitation.locked}
          isPending={invitation.isPending}
          canSubmit={invitation.canSubmit}
          uncertain={recovery}
          recoveryDisabled={invitation.blocked}
          onChange={invitation.setDraft}
          onSave={invitation.save}
          onCheckDirectory={invitation.checkDirectory}
          onDismiss={invitation.onDismiss}
        />
      </View>
    </VariableContextProvider>
  )
}
