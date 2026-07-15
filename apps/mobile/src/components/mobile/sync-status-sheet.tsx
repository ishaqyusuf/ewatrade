import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import {
  SyncReliabilityAction,
  SyncReliabilityPanel,
  SyncReliabilityRow,
  SyncReliabilityStat,
  SyncReliabilityToggle,
} from "@/components/mobile/sync-flow"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  buildRetailOpsSyncEventsInput,
  getRetailOpsCustomerSyncMappings,
  getRetailOpsProductSyncMappings,
  getRetailOpsRepSessionSyncMappings,
  getRetailOpsSaleSyncMappings,
  getRetailOpsShareLinkSyncMappings,
  getRetailOpsStaffSyncMappings,
  getRetailOpsSyncBlockedEvents,
} from "@/lib/retail-ops-sync"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsSyncEvent,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import Constants from "expo-constants"
import { forwardRef } from "react"
import { useMemo } from "react"
import { Platform, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type SyncStatusSheetProps = {
  onComplete?: () => void
}

type SyncStatusContentProps = SyncStatusSheetProps & {
  presentation?: "screen" | "sheet"
}

const OFFLINE_DEVICE_PREVIEW_LIMIT = 4
const SERVER_SYNC_HISTORY_PREVIEW_LIMIT = 5
const SERVER_SYNC_CONFLICT_PREVIEW_LIMIT = 8
const BLOCKED_EVENT_PREVIEW_LIMIT = 3
const SYNC_QUEUE_PREVIEW_LIMIT = 12

function formatEventTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Pending"

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function getOfflineDevicePlatform() {
  if (
    Platform.OS === "android" ||
    Platform.OS === "ios" ||
    Platform.OS === "web"
  ) {
    return Platform.OS
  }

  return "unknown"
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The offline device could not be registered. Check the connection and retry."
}

function isRetryBackoffActive(event: RetailOpsSyncEvent) {
  if (event.status !== "failed" || !event.nextRetryAt) return false

  const nextRetryTime = new Date(event.nextRetryAt).getTime()

  return !Number.isNaN(nextRetryTime) && nextRetryTime > Date.now()
}

function formatSyncRunStatus(status: string) {
  if (status === "succeeded") return "Synced"
  if (status === "partial") return "Partial"
  if (status === "skipped") return "Skipped"

  return "Failed"
}

function formatSyncEventType(type: string) {
  return type.replace(/_/g, " ")
}

function formatDeviceLabel(deviceId?: string | null) {
  if (!deviceId) return "Unknown device"

  return deviceId.slice(-8) || deviceId
}

function getSyncConflictBusinessImpact(input: {
  errorMessage?: string | null
  type: string
}) {
  const normalizedMessage = input.errorMessage?.toLowerCase() ?? ""

  if (
    input.type === "sale_created" ||
    normalizedMessage.includes("stock") ||
    normalizedMessage.includes("inventory")
  ) {
    return "Sales or stock may be missing from production until inventory is reviewed and replay succeeds."
  }

  if (
    input.type === "closeout_created" ||
    input.type === "rep_session_opened" ||
    normalizedMessage.includes("session")
  ) {
    return "The attendant session or closeout may not match production reporting until the session state is corrected."
  }

  if (input.type === "customer_upsert") {
    return "Customer history may stay device-only until the customer record can be matched or retried."
  }

  if (input.type === "staff_invited") {
    return "The staff invite may not reach production, so the attendant may be unable to onboard."
  }

  if (input.type.startsWith("share_link")) {
    return "The product link state may differ between this device and production."
  }

  return "This local change is not fully reflected in production until it is reviewed and replayed."
}

function getLocalSyncResolutionAction(event: RetailOpsSyncEvent) {
  if (event.status === "conflict") {
    return "Review the production state, confirm the local change is still valid, then move it back to pending."
  }

  if (isRetryBackoffActive(event)) {
    return "Wait for the retry timer or move the event back to pending after checking the server message."
  }

  return "Move the event back to pending after the connection or server issue is resolved."
}

function SyncEventRow({
  event,
  onRetry,
}: {
  event: RetailOpsSyncEvent
  onRetry?: (eventId: string) => void
}) {
  const isPending = event.status === "pending"
  const isFailed = event.status === "failed"
  const isConflict = event.status === "conflict"
  const needsAttention = isFailed || isConflict
  const statusLabel = isConflict
    ? "Conflict"
    : isFailed
      ? "Needs retry"
      : isPending
        ? "Pending"
        : "Synced"
  const statusTone = isConflict
    ? "warning"
    : isFailed
      ? "destructive"
      : isPending
        ? "primary"
        : "success"
  const retryDetailLabel =
    isRetryBackoffActive(event) && event.nextRetryAt
      ? `Retry after ${formatEventTime(event.nextRetryAt)}`
      : event.retryCount
        ? `Retried ${event.retryCount} time${event.retryCount === 1 ? "" : "s"}`
        : event.errorCode || "Sync failed"

  return (
    <SyncReliabilityRow
      detail={`${formatSyncEventType(event.type)} - ${formatEventTime(
        event.createdAt,
      )}`}
      statusIcon={needsAttention ? "TriangleAlert" : "CircleCheck"}
      statusLabel={statusLabel}
      statusTone={statusTone}
      testID="retail-sync-event-row"
      title={event.label}
    >
      {needsAttention ? (
        <View
          className={cn(
            "gap-3 border-y py-3",
            isConflict
              ? "border-warn/30 bg-warn/10"
              : "border-destructive/30 bg-destructive/10",
          )}
          testID={
            isConflict
              ? "retail-sync-event-conflict-detail"
              : "retail-sync-event-failed-detail"
          }
        >
          <Text
            className={cn(
              "text-sm leading-5",
              isConflict ? "text-warn" : "text-destructive",
            )}
          >
            {event.errorMessage ??
              (isConflict
                ? "This event needs review before it can sync."
                : "This event could not sync. Review the details and retry.")}
          </Text>
          <View className="gap-2 border-t border-border/60 pt-3">
            <Text className="text-xs leading-4 text-muted-foreground">
              Impact:{" "}
              {getSyncConflictBusinessImpact({
                errorMessage: event.errorMessage,
                type: event.type,
              })}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              Action: {getLocalSyncResolutionAction(event)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-xs font-semibold uppercase text-muted-foreground">
              {retryDetailLabel}
            </Text>
            {onRetry ? (
              <SyncReliabilityAction
                icon="Zap"
                label={isConflict ? "Reviewed" : "Retry"}
                onPress={() => onRetry(event.id)}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </SyncReliabilityRow>
  )
}

export function SyncStatusContent({
  onComplete,
  presentation = "sheet",
}: SyncStatusContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const closeouts = useRetailOpsStore((state) => state.closeouts)
  const customers = useRetailOpsStore((state) => state.customers)
  const lastSyncSummary = useRetailOpsStore((state) => state.lastSyncSummary)
  const markSyncEventsResolved = useRetailOpsStore(
    (state) => state.markSyncEventsResolved,
  )
  const offlineDeviceId = useRetailOpsStore((state) => state.offlineDeviceId)
  const recordSyncSummary = useRetailOpsStore(
    (state) => state.recordSyncSummary,
  )
  const repSessions = useRetailOpsStore((state) => state.repSessions)
  const sales = useRetailOpsStore((state) => state.sales)
  const setOfflineMode = useRetailOpsStore((state) => state.setOfflineMode)
  const shareLinks = useRetailOpsStore((state) => state.shareLinks)
  const staff = useRetailOpsStore((state) => state.staff)
  const stockMovements = useRetailOpsStore((state) => state.stockMovements)
  const products = useRetailOpsStore((state) => state.products)
  const retrySyncEvents = useRetailOpsStore((state) => state.retrySyncEvents)
  const allSyncEvents = useRetailOpsStore((state) => state.syncEvents)
  const syncEvents = useMemo(
    () =>
      allSyncEvents.filter(
        (event) =>
          !activeBusinessId ||
          (event.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allSyncEvents],
  )
  const syncEventsMutation = useMutation(
    trpc.retailOps.syncEvents.mutationOptions(),
  )
  const registerOfflineDeviceMutation = useMutation(
    trpc.retailOps.registerOfflineDevice.mutationOptions(),
  )
  const revokeOfflineDeviceMutation = useMutation(
    trpc.retailOps.revokeOfflineDevice.mutationOptions(),
  )
  const restoreOfflineDeviceMutation = useMutation(
    trpc.retailOps.restoreOfflineDevice.mutationOptions(),
  )
  const reviewSyncConflictMutation = useMutation(
    trpc.retailOps.reviewSyncConflict.mutationOptions(),
  )
  const offlineDevicesQuery = useQuery(
    trpc.retailOps.offlineDevices.queryOptions(undefined, {
      enabled: !isOfflineMode,
      retry: false,
    }),
  )
  const revokedOfflineDevicesQuery = useQuery(
    trpc.retailOps.revokedOfflineDevices.queryOptions(undefined, {
      enabled: !isOfflineMode,
      retry: false,
    }),
  )
  const syncHistoryQuery = useQuery(
    trpc.retailOps.syncHistory.queryOptions(
      {
        deviceId: offlineDeviceId,
        limit: SERVER_SYNC_HISTORY_PREVIEW_LIMIT,
      },
      {
        enabled: !isOfflineMode,
      },
    ),
  )
  const syncConflictsQuery = useQuery(
    trpc.retailOps.syncConflicts.queryOptions(
      {
        deviceId: offlineDeviceId,
        limit: SERVER_SYNC_CONFLICT_PREVIEW_LIMIT,
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const tenantSyncConflictsQuery = useQuery(
    trpc.retailOps.syncConflicts.queryOptions(
      {
        limit: SERVER_SYNC_CONFLICT_PREVIEW_LIMIT,
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const syncInput = useMemo(
    () =>
      buildRetailOpsSyncEventsInput({
        activeBusinessId,
        closeouts,
        customers,
        deviceId: offlineDeviceId,
        products,
        repSessions,
        sales,
        shareLinks,
        staff,
        stockMovements,
        syncEvents,
      }),
    [
      activeBusinessId,
      closeouts,
      customers,
      offlineDeviceId,
      products,
      repSessions,
      sales,
      shareLinks,
      staff,
      stockMovements,
      syncEvents,
    ],
  )
  const blockedEvents = useMemo(
    () =>
      getRetailOpsSyncBlockedEvents({
        activeBusinessId,
        closeouts,
        customers,
        deviceId: offlineDeviceId,
        products,
        repSessions,
        sales,
        shareLinks,
        staff,
        stockMovements,
        syncEvents,
      }),
    [
      activeBusinessId,
      closeouts,
      customers,
      offlineDeviceId,
      products,
      repSessions,
      sales,
      shareLinks,
      staff,
      stockMovements,
      syncEvents,
    ],
  )
  const pendingEvents = syncEvents.filter((event) => event.status === "pending")
  const failedEvents = syncEvents.filter((event) => event.status === "failed")
  const retryBackoffEvents = failedEvents.filter(isRetryBackoffActive)
  const conflictEvents = syncEvents.filter(
    (event) => event.status === "conflict",
  )
  const activeOfflineDevices = offlineDevicesQuery.data ?? []
  const revokedOfflineDevices = revokedOfflineDevicesQuery.data ?? []
  const visibleActiveOfflineDevices = activeOfflineDevices.slice(
    0,
    OFFLINE_DEVICE_PREVIEW_LIMIT,
  )
  const visibleRevokedOfflineDevices = revokedOfflineDevices.slice(
    0,
    OFFLINE_DEVICE_PREVIEW_LIMIT,
  )
  const shouldShowDeviceManagement =
    offlineDevicesQuery.isSuccess ||
    revokedOfflineDevicesQuery.isSuccess ||
    offlineDevicesQuery.isFetching ||
    revokedOfflineDevicesQuery.isFetching
  const serverSyncHistory = syncHistoryQuery.data ?? []
  const visibleServerSyncHistory = serverSyncHistory.slice(
    0,
    SERVER_SYNC_HISTORY_PREVIEW_LIMIT,
  )
  const serverSyncConflicts = syncConflictsQuery.data ?? []
  const tenantSyncConflicts = tenantSyncConflictsQuery.data ?? []
  const visibleTenantSyncConflicts = tenantSyncConflicts.slice(
    0,
    SERVER_SYNC_CONFLICT_PREVIEW_LIMIT,
  )
  const visibleBlockedEvents = blockedEvents.slice(
    0,
    BLOCKED_EVENT_PREVIEW_LIMIT,
  )
  const visibleSyncEvents = syncEvents.slice(0, SYNC_QUEUE_PREVIEW_LIMIT)
  const shouldShowServerConflicts =
    syncConflictsQuery.isSuccess ||
    syncConflictsQuery.isFetching ||
    tenantSyncConflictsQuery.isSuccess ||
    tenantSyncConflictsQuery.isFetching
  const shortOfflineDeviceId = offlineDeviceId.slice(-8) || "Pending"
  const isSyncBusy =
    registerOfflineDeviceMutation.isPending || syncEventsMutation.isPending
  const canSync = syncInput.events.length > 0 && !isOfflineMode && !isSyncBusy
  const syncButtonLoadingLabel = registerOfflineDeviceMutation.isPending
    ? "Registering device"
    : "Syncing"
  const syncButtonLabel =
    syncInput.events.length === 0 && retryBackoffEvents.length > 0
      ? "Waiting for retry timer"
      : `Sync ${syncInput.events.length} supported event${
          syncInput.events.length === 1 ? "" : "s"
        }`

  function retryFailedEvents(eventIds: string[]) {
    if (eventIds.length === 0 || isSyncBusy) return

    retrySyncEvents({
      businessId: activeBusinessId ?? undefined,
      eventIds,
    })
  }

  function refreshDeviceManagement() {
    void offlineDevicesQuery.refetch()
    void revokedOfflineDevicesQuery.refetch()
  }

  function refreshServerSyncState() {
    void syncHistoryQuery.refetch()
    void syncConflictsQuery.refetch()
    void tenantSyncConflictsQuery.refetch()
  }

  function revokeDevice(deviceId: string) {
    if (
      deviceId === offlineDeviceId ||
      revokeOfflineDeviceMutation.isPending ||
      restoreOfflineDeviceMutation.isPending
    ) {
      return
    }

    revokeOfflineDeviceMutation.mutate(
      { deviceId },
      {
        onSuccess: refreshDeviceManagement,
      },
    )
  }

  function restoreDevice(deviceId: string) {
    if (
      revokeOfflineDeviceMutation.isPending ||
      restoreOfflineDeviceMutation.isPending
    ) {
      return
    }

    restoreOfflineDeviceMutation.mutate(
      { deviceId },
      {
        onSuccess: refreshDeviceManagement,
      },
    )
  }

  function reviewServerConflict(eventId: string) {
    if (reviewSyncConflictMutation.isPending) return

    reviewSyncConflictMutation.mutate(
      { eventId },
      {
        onSuccess: refreshServerSyncState,
      },
    )
  }

  async function syncSupportedEvents() {
    if (!canSync) return

    const attemptedAt = new Date().toISOString()

    try {
      await registerOfflineDeviceMutation.mutateAsync({
        appVersion: Constants.expoConfig?.version,
        deviceId: offlineDeviceId,
        deviceName: "Ewatrade mobile",
        platform: getOfflineDevicePlatform(),
      })
      refreshDeviceManagement()
    } catch (error) {
      const message = getErrorMessage(error)

      markSyncEventsResolved({
        businessId: activeBusinessId ?? undefined,
        failedEvents: syncInput.events.map((event) => ({
          errorCode: "DEVICE_REGISTRATION_FAILED",
          errorMessage: message,
          eventId: event.eventId,
        })),
      })
      recordSyncSummary({
        appliedCount: 0,
        attemptedAt,
        completedAt: new Date().toISOString(),
        deviceId: offlineDeviceId,
        errorMessage: message,
        failedCount: syncInput.events.length,
        skippedCount: 0,
        status: "failed",
        totalCount: syncInput.events.length,
      })
      return
    }

    syncEventsMutation.mutate(syncInput, {
      onError: (error) => {
        const message =
          error.message ||
          "The sync request could not be completed. Check the connection and retry."

        markSyncEventsResolved({
          businessId: activeBusinessId ?? undefined,
          failedEvents: syncInput.events.map((event) => ({
            errorCode: "SYNC_REQUEST_FAILED",
            errorMessage: message,
            eventId: event.eventId,
          })),
        })
        recordSyncSummary({
          appliedCount: 0,
          attemptedAt,
          completedAt: new Date().toISOString(),
          deviceId: offlineDeviceId,
          errorMessage: message,
          failedCount: syncInput.events.length,
          skippedCount: 0,
          status: "failed",
          totalCount: syncInput.events.length,
        })
      },
      onSuccess: (result) => {
        markSyncEventsResolved({
          businessId: activeBusinessId ?? undefined,
          failedEvents: result.results
            .filter((eventResult) => eventResult.status === "failed")
            .map((eventResult) => ({
              errorCode: eventResult.error?.code,
              errorMessage: eventResult.error?.message,
              eventId: eventResult.eventId,
            })),
          customerMappings: getRetailOpsCustomerSyncMappings(result.results),
          productMappings: getRetailOpsProductSyncMappings(result.results),
          repSessionMappings: getRetailOpsRepSessionSyncMappings(
            result.results,
          ),
          saleMappings: getRetailOpsSaleSyncMappings(result.results),
          shareLinkMappings: getRetailOpsShareLinkSyncMappings(result.results),
          staffMappings: getRetailOpsStaffSyncMappings(result.results),
          syncedEventIds: result.results
            .filter((eventResult) => eventResult.status === "applied")
            .map((eventResult) => eventResult.eventId),
        })
        recordSyncSummary({
          appliedCount: result.appliedCount,
          attemptedAt,
          completedAt: new Date().toISOString(),
          deviceId: result.deviceId ?? offlineDeviceId,
          failedCount: result.failedCount,
          skippedCount: result.skippedCount,
          status:
            result.failedCount > 0 || result.skippedCount > 0
              ? "partial"
              : "completed",
          totalCount: result.totalCount,
        })
        refreshServerSyncState()
      },
    })
  }

  const content = (
    <View className="gap-5 px-5 pb-6">
          <SyncReliabilityPanel
            description={
              isOfflineMode
                ? "Changes stay on this device and will be applied when next you connect."
                : "Supported sales and stock changes can sync to production now."
            }
            icon={isOfflineMode ? "Wind" : "CircleCheck"}
            statusIcon={isOfflineMode ? "Wind" : "CircleCheck"}
            statusLabel={isOfflineMode ? "Offline" : "Online"}
            statusTone={isOfflineMode ? "warning" : "success"}
            title={isOfflineMode ? "Offline mode" : "Online mode"}
          />

          <SyncReliabilityToggle
            active={isOfflineMode}
            description="Keep selling during poor network. Sync resumes when online."
            label="Offline mode"
            onPress={() => setOfflineMode(!isOfflineMode)}
            testID="retail-offline-toggle"
          />

          <SyncReliabilityPanel
            description={offlineDeviceId}
            icon="AppWindow"
            statusLabel={`Device ${shortOfflineDeviceId}`}
            statusTone="muted"
            testID="retail-offline-device"
            title="Offline device"
          />

          {shouldShowDeviceManagement ? (
            <SyncReliabilityPanel
              description="Registered and revoked offline devices for this business."
              icon="AppWindow"
              statusIcon="AppWindow"
              statusLabel={
                offlineDevicesQuery.isFetching ||
                revokedOfflineDevicesQuery.isFetching
                  ? "Loading"
                  : "Devices"
              }
              statusTone={
                offlineDevicesQuery.isFetching ||
                revokedOfflineDevicesQuery.isFetching
                  ? "primary"
                  : "muted"
              }
              title="Device management"
            >
              {offlineDevicesQuery.isFetching &&
              revokedOfflineDevicesQuery.isFetching ? (
                <Text className="text-xs leading-4 text-muted-foreground">
                  Loading devices...
                </Text>
              ) : (
                <View className="gap-4">
                  <View>
                    <Text className="text-xs font-semibold uppercase text-muted-foreground">
                      Active
                    </Text>
                    {visibleActiveOfflineDevices.length > 0 ? (
                      visibleActiveOfflineDevices.map((device) => {
                        const isCurrentDevice =
                          device.deviceId === offlineDeviceId

                        return (
                          <SyncReliabilityRow
                            detail={`${device.platform} - seen ${formatEventTime(
                              device.lastSeenAt,
                            )}`}
                            key={device.deviceId}
                            statusIcon={
                              isCurrentDevice ? "CircleCheck" : "AppWindow"
                            }
                            statusLabel={isCurrentDevice ? "Current" : "Active"}
                            statusTone={isCurrentDevice ? "success" : "muted"}
                            title={device.deviceName ?? device.platform}
                          >
                            {!isCurrentDevice ? (
                              <SyncReliabilityAction
                                icon="Ban"
                                label="Revoke"
                                onPress={() => revokeDevice(device.deviceId)}
                                tone="destructive"
                              />
                            ) : null}
                          </SyncReliabilityRow>
                        )
                      })
                    ) : (
                      <Text className="text-xs leading-4 text-muted-foreground">
                        No registered offline devices returned.
                      </Text>
                    )}
                    {activeOfflineDevices.length >
                    visibleActiveOfflineDevices.length ? (
                      <Text className="text-xs font-medium text-muted-foreground">
                        Showing first {visibleActiveOfflineDevices.length} of{" "}
                        {activeOfflineDevices.length} active devices.
                      </Text>
                    ) : null}
                  </View>

                  {revokedOfflineDevices.length > 0 ? (
                    <View>
                      <Text className="text-xs font-semibold uppercase text-muted-foreground">
                        Revoked
                      </Text>
                      {visibleRevokedOfflineDevices.map((device) => (
                        <SyncReliabilityRow
                          detail={`Revoked ${formatEventTime(
                            device.revokedAt,
                          )}`}
                          key={device.deviceId}
                          statusIcon="Ban"
                          statusLabel="Revoked"
                          statusTone="muted"
                          title={device.deviceName ?? device.platform}
                        >
                          <SyncReliabilityAction
                            icon="Activity"
                            label="Restore"
                            onPress={() => restoreDevice(device.deviceId)}
                          />
                        </SyncReliabilityRow>
                      ))}
                      {revokedOfflineDevices.length >
                      visibleRevokedOfflineDevices.length ? (
                        <Text className="text-xs font-medium text-muted-foreground">
                          Showing first {visibleRevokedOfflineDevices.length} of{" "}
                          {revokedOfflineDevices.length} revoked devices.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {revokeOfflineDeviceMutation.isError ||
                  restoreOfflineDeviceMutation.isError ? (
                    <Text className="text-xs leading-4 text-destructive">
                      {revokeOfflineDeviceMutation.error?.message ??
                        restoreOfflineDeviceMutation.error?.message ??
                        "Device management failed."}
                    </Text>
                  ) : null}
                </View>
              )}
            </SyncReliabilityPanel>
          ) : null}

          {lastSyncSummary ? (
            <SyncReliabilityPanel
              description={`${formatEventTime(
                lastSyncSummary.completedAt,
              )} on ${lastSyncSummary.deviceId}`}
              icon="Clock"
              statusLabel={lastSyncSummary.status}
              statusTone={
                lastSyncSummary.status === "failed"
                  ? "destructive"
                  : lastSyncSummary.status === "partial"
                    ? "warning"
                    : "success"
              }
              title="Last sync"
            >
              <Text className="text-xs leading-4 text-muted-foreground">
                Applied {lastSyncSummary.appliedCount} of{" "}
                {lastSyncSummary.totalCount}; failed{" "}
                {lastSyncSummary.failedCount}, skipped{" "}
                {lastSyncSummary.skippedCount}.
              </Text>
              {lastSyncSummary.errorMessage ? (
                <Text className="text-xs leading-4 text-destructive">
                  {lastSyncSummary.errorMessage}
                </Text>
              ) : null}
            </SyncReliabilityPanel>
          ) : null}

          <SyncReliabilityPanel
            description="Recent sync runs recorded by production for this device."
            icon="Clock"
            statusIcon="Clock"
            statusLabel={syncHistoryQuery.isFetching ? "Loading" : "History"}
            statusTone={syncHistoryQuery.isFetching ? "primary" : "muted"}
            title="Server history"
          >
            {syncHistoryQuery.isError ? (
              <Text className="text-xs leading-4 text-destructive">
                Server sync history is unavailable right now.
              </Text>
            ) : serverSyncHistory.length ? (
              <View>
                {visibleServerSyncHistory.map((syncRun) => (
                  <SyncReliabilityRow
                    detail={`${syncRun.appliedCount} applied, ${syncRun.failedCount} failed, ${syncRun.skippedCount} skipped`}
                    key={syncRun.id}
                    statusLabel={formatSyncRunStatus(syncRun.status)}
                    statusTone={
                      syncRun.status === "failed"
                        ? "destructive"
                        : syncRun.status === "partial" ||
                            syncRun.status === "skipped"
                          ? "warning"
                          : "success"
                    }
                    title={formatEventTime(syncRun.completedAt)}
                  >
                    {syncRun.events.some((event) => event.errorMessage) ? (
                      <Text className="text-xs leading-4 text-muted-foreground">
                        {
                          syncRun.events.find((event) => event.errorMessage)
                            ?.errorMessage
                        }
                      </Text>
                    ) : null}
                  </SyncReliabilityRow>
                ))}
                {serverSyncHistory.length > visibleServerSyncHistory.length ? (
                  <Text className="mt-2 text-xs font-medium text-muted-foreground">
                    Showing first {visibleServerSyncHistory.length} of{" "}
                    {serverSyncHistory.length} sync runs.
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text className="text-xs leading-4 text-muted-foreground">
                No server-recorded sync runs for this device yet.
              </Text>
            )}
          </SyncReliabilityPanel>

          {shouldShowServerConflicts ? (
            <SyncReliabilityPanel
              description="Unreviewed production conflicts for this device and the wider business."
              icon="TriangleAlert"
              statusIcon="TriangleAlert"
              statusLabel={
                syncConflictsQuery.isFetching ||
                tenantSyncConflictsQuery.isFetching
                  ? "Loading"
                  : "Conflicts"
              }
              statusTone={
                syncConflictsQuery.isFetching ||
                tenantSyncConflictsQuery.isFetching
                  ? "primary"
                  : tenantSyncConflicts.length > 0
                    ? "warning"
                    : "success"
              }
              title="Server conflicts"
            >
              <View className="flex-row gap-3">
                <SyncReliabilityStat
                  label="This device"
                  tone={serverSyncConflicts.length > 0 ? "warning" : "success"}
                  value={String(serverSyncConflicts.length)}
                />
                <SyncReliabilityStat
                  label="Business"
                  tone={tenantSyncConflicts.length > 0 ? "warning" : "success"}
                  value={String(tenantSyncConflicts.length)}
                />
              </View>

              {syncConflictsQuery.isFetching ||
              tenantSyncConflictsQuery.isFetching ? (
                <Text className="text-xs leading-4 text-muted-foreground">
                  Loading conflicts...
                </Text>
              ) : tenantSyncConflicts.length > 0 ? (
                <View>
                  {visibleTenantSyncConflicts.map((conflict) => (
                    <SyncReliabilityRow
                      detail={`${
                        conflict.processedAt
                          ? formatEventTime(conflict.processedAt)
                          : "Waiting for review"
                      } - ${formatDeviceLabel(conflict.deviceId)}`}
                      key={conflict.id}
                      statusIcon="TriangleAlert"
                      statusLabel="Review"
                      statusTone="warning"
                      title={formatSyncEventType(conflict.type)}
                    >
                      {conflict.errorMessage ? (
                        <Text className="text-xs leading-4 text-warn">
                          {conflict.errorMessage}
                        </Text>
                      ) : null}
                      <View className="gap-1 border-t border-warn/20 pt-3">
                        <Text className="text-xs leading-4 text-muted-foreground">
                          Impact:{" "}
                          {getSyncConflictBusinessImpact({
                            errorMessage: conflict.errorMessage,
                            type: conflict.type,
                          })}
                        </Text>
                        <Text className="text-xs font-bold text-foreground">
                          {conflict.resolutionAction}
                        </Text>
                        <Text className="mt-1 text-xs leading-4 text-muted-foreground">
                          {conflict.resolutionDetail}
                        </Text>
                      </View>
                      <SyncReliabilityAction
                        disabled={reviewSyncConflictMutation.isPending}
                        icon="Check"
                        label="Review"
                        onPress={() => reviewServerConflict(conflict.eventId)}
                      />
                    </SyncReliabilityRow>
                  ))}
                  {tenantSyncConflicts.length >
                  visibleTenantSyncConflicts.length ? (
                    <Text className="text-xs font-medium text-muted-foreground">
                      Showing first {visibleTenantSyncConflicts.length} of{" "}
                      {tenantSyncConflicts.length} server conflicts.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text className="text-xs leading-4 text-muted-foreground">
                  No unreviewed server conflicts for this business.
                </Text>
              )}

              {reviewSyncConflictMutation.isError ? (
                <Text className="text-xs leading-4 text-destructive">
                  {reviewSyncConflictMutation.error.message}
                </Text>
              ) : null}
            </SyncReliabilityPanel>
          ) : null}

          <View className="flex-row gap-3">
            <SyncReliabilityStat
              label="Pending"
              testID="retail-sync-pending-count"
              value={String(pendingEvents.length)}
            />
            <SyncReliabilityStat
              label="Retry"
              tone={failedEvents.length > 0 ? "destructive" : "default"}
              testID="retail-sync-retry-count"
              value={String(failedEvents.length)}
            />
            <SyncReliabilityStat
              label="Review"
              tone={conflictEvents.length > 0 ? "warning" : "default"}
              testID="retail-sync-review-count"
              value={String(conflictEvents.length)}
            />
          </View>

          <View className="flex-row gap-3">
            <SyncReliabilityStat
              label="Total events"
              value={String(syncEvents.length)}
            />
          </View>

          {conflictEvents.length > 0 ? (
            <View className="gap-3" testID="retail-sync-conflict-summary">
              <StatusBanner
                icon="TriangleAlert"
                message="Conflicts usually mean stock, session, staff, or customer state changed on the server. Review the message before retrying."
                title={`${conflictEvents.length} sync conflict${conflictEvents.length === 1 ? "" : "s"} need review`}
                tone="warning"
              />
              <Pressable
                className="h-11 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 active:bg-primary/90"
                disabled={isSyncBusy}
                haptic
                onPress={() =>
                  retryFailedEvents(conflictEvents.map((event) => event.id))
                }
                testID="retail-sync-conflicts-reviewed"
                transition
              >
                <Icon className="size-sm text-primary-foreground" name="Zap" />
                <Text className="text-sm font-bold text-primary-foreground">
                  Move reviewed conflicts to pending
                </Text>
              </Pressable>
            </View>
          ) : null}

          {failedEvents.length > 0 ? (
            <View className="gap-3">
              <StatusBanner
                icon="TriangleAlert"
                message={`Failed events stay on this device with the server message.${
                  retryBackoffEvents.length > 0
                    ? ` ${retryBackoffEvents.length} will wait for the retry timer unless you move them to pending now.`
                    : " They can be moved to pending now."
                }`}
                title={`${failedEvents.length} event${failedEvents.length === 1 ? "" : "s"} need retry`}
                tone="destructive"
              />
              <Pressable
                className="h-11 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 active:bg-primary/90"
                disabled={isSyncBusy}
                haptic
                onPress={() =>
                  retryFailedEvents(failedEvents.map((event) => event.id))
                }
                testID="retail-sync-failed-retry"
                transition
              >
                <Icon className="size-sm text-primary-foreground" name="Zap" />
                <Text className="text-sm font-bold text-primary-foreground">
                  Move failed events to pending
                </Text>
              </Pressable>
            </View>
          ) : null}

          {syncEventsMutation.isError ? (
            <StatusBanner
              icon="TriangleAlert"
              message={syncEventsMutation.error.message}
              title="Sync failed"
              tone="destructive"
            />
          ) : null}

          {registerOfflineDeviceMutation.isError ? (
            <StatusBanner
              icon="TriangleAlert"
              message={registerOfflineDeviceMutation.error.message}
              title="Device registration failed"
              tone="destructive"
            />
          ) : null}

          <ActionButton
            disabled={!canSync}
            isLoading={isSyncBusy}
            loadingLabel={syncButtonLoadingLabel}
            onPress={syncSupportedEvents}
            testID="retail-sync-now"
          >
            {syncButtonLabel}
          </ActionButton>

          {blockedEvents.length > 0 ? (
            <View className="rounded-2xl border border-border bg-muted/40 p-4">
              <StatusBanner
                icon="Clock"
                message={`${blockedEvents.length} event${blockedEvents.length === 1 ? "" : "s"} waiting for another local change to sync first.`}
                title="Waiting on dependencies"
                tone="muted"
              />
              <View className="mt-3 gap-2">
                {visibleBlockedEvents.map((event) => (
                  <SyncReliabilityRow
                    detail="Dependency blocked"
                    key={event.eventId}
                    statusIcon="Clock"
                    statusLabel="Blocked"
                    statusTone="muted"
                    title={event.label}
                  >
                    <Text className="text-xs leading-4 text-muted-foreground">
                      {event.reason}
                    </Text>
                  </SyncReliabilityRow>
                ))}
                {blockedEvents.length > visibleBlockedEvents.length ? (
                  <Text className="text-xs font-medium text-muted-foreground">
                    Showing first {visibleBlockedEvents.length} of{" "}
                    {blockedEvents.length} blocked events.
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View className="gap-3" testID="retail-sync-queue">
            <Text className="text-base font-bold text-foreground">
              Sync queue
            </Text>
            {syncEvents.length > 0 ? (
              <>
                {visibleSyncEvents.map((event) => (
                  <SyncEventRow
                    event={event}
                    key={event.id}
                    onRetry={(eventId) => retryFailedEvents([eventId])}
                  />
                ))}
                {syncEvents.length > visibleSyncEvents.length ? (
                  <Text className="text-xs font-medium text-muted-foreground">
                    Showing first {visibleSyncEvents.length} of{" "}
                    {syncEvents.length} local sync events.
                  </Text>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon="CircleCheck"
                message="No local changes are waiting to sync."
                title="Sync queue is clear"
              />
            )}
          </View>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={140}
        contentContainerStyle={{ paddingBottom: 120 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={96}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const SyncStatusSheet = forwardRef<
  BottomSheetModal,
  SyncStatusSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["84%"]}
      title="Sync status"
    >
      <SyncStatusContent {...props} presentation="sheet" />
    </Modal>
  )
})

SyncStatusSheet.displayName = "SyncStatusSheet"
