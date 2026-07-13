import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
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

type SyncStatusSheetProps = {
  onComplete?: () => void
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
    <View
      className="gap-3 rounded-2xl border border-border bg-card p-4"
      testID="retail-sync-event-row"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{event.label}</Text>
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            {formatSyncEventType(event.type)} -{" "}
            {formatEventTime(event.createdAt)}
          </Text>
        </View>
        <StatusBadge
          icon={needsAttention ? "TriangleAlert" : "CircleCheck"}
          label={statusLabel}
          tone={statusTone}
        />
      </View>
      {needsAttention ? (
        <View
          className={cn(
            "gap-3 rounded-xl p-3",
            isConflict ? "bg-amber-500/10" : "bg-destructive/5",
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
              isConflict ? "text-amber-700" : "text-destructive",
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
              <Pressable
                className="h-9 flex-row items-center gap-2 rounded-full bg-primary px-3 active:bg-primary/90"
                haptic
                onPress={() => onRetry(event.id)}
                transition
              >
                <Icon className="size-sm text-primary-foreground" name="Zap" />
                <Text className="text-xs font-bold text-primary-foreground">
                  {isConflict ? "Reviewed" : "Retry"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export const SyncStatusSheet = forwardRef<
  BottomSheetModal,
  SyncStatusSheetProps
>(({ onComplete }, ref) => {
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
  const syncButtonLabel = registerOfflineDeviceMutation.isPending
    ? "Registering device..."
    : syncEventsMutation.isPending
      ? "Syncing..."
      : syncInput.events.length === 0 && retryBackoffEvents.length > 0
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

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["84%"]}
      title="Sync status"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={96}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-3">
            <View
              className={cn(
                "h-12 w-12 items-center justify-center rounded-2xl",
                isOfflineMode ? "bg-amber-500/10" : "bg-emerald-500/10",
              )}
            >
              <Icon
                className={cn(
                  "size-base",
                  isOfflineMode ? "text-amber-600" : "text-emerald-600",
                )}
                name={isOfflineMode ? "Wind" : "CircleCheck"}
              />
            </View>
            <View className="gap-2">
              <Text className="text-xl font-bold text-foreground">
                {isOfflineMode ? "Offline mode" : "Online mode"}
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                {isOfflineMode
                  ? "Changes stay on this device and will be applied when next you connect."
                  : "Supported sales and stock changes can sync to production now."}
              </Text>
            </View>
          </View>

          <Pressable
            className={cn(
              "flex-row items-center justify-between rounded-2xl border border-border bg-card p-4 active:bg-accent",
              isOfflineMode && "border-amber-500/30 bg-amber-500/10",
            )}
            haptic
            onPress={() => setOfflineMode(!isOfflineMode)}
            testID="retail-offline-toggle"
            transition
          >
            <View className="flex-1 gap-1 pr-3">
              <Text className="font-semibold text-foreground">
                Offline mode
              </Text>
              <Text className="text-sm text-muted-foreground">
                Keep selling during poor network. Sync resumes when online.
              </Text>
            </View>
            <View
              className={cn(
                "h-7 w-12 justify-center rounded-full px-1",
                isOfflineMode ? "items-end bg-primary" : "items-start bg-muted",
              )}
            >
              <View className="h-5 w-5 rounded-full bg-background" />
            </View>
          </Pressable>

          <View
            className="rounded-2xl border border-border bg-card p-4"
            testID="retail-offline-device"
          >
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              Offline device
            </Text>
            <Text className="mt-2 text-sm font-semibold text-foreground">
              Device {shortOfflineDeviceId}
            </Text>
            <Text
              className="mt-1 text-xs text-muted-foreground"
              numberOfLines={1}
            >
              {offlineDeviceId}
            </Text>
          </View>

          {shouldShowDeviceManagement ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">
                    Device management
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Registered and revoked offline devices for this business.
                  </Text>
                </View>
                <Icon
                  className={cn(
                    "size-sm",
                    offlineDevicesQuery.isFetching ||
                      revokedOfflineDevicesQuery.isFetching
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                  name="AppWindow"
                />
              </View>

              {offlineDevicesQuery.isFetching &&
              revokedOfflineDevicesQuery.isFetching ? (
                <Text className="mt-3 text-xs leading-4 text-muted-foreground">
                  Loading devices...
                </Text>
              ) : (
                <View className="mt-4 gap-4">
                  <View className="gap-2">
                    <Text className="text-xs font-semibold uppercase text-muted-foreground">
                      Active
                    </Text>
                    {visibleActiveOfflineDevices.length > 0 ? (
                      visibleActiveOfflineDevices.map((device) => {
                        const isCurrentDevice =
                          device.deviceId === offlineDeviceId

                        return (
                          <View
                            className="gap-3 rounded-xl border border-border bg-background p-3"
                            key={device.deviceId}
                          >
                            <View className="flex-row items-start justify-between gap-3">
                              <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                  {device.deviceName ?? device.platform}
                                </Text>
                                <Text className="mt-1 text-xs text-muted-foreground">
                                  {device.platform} - seen{" "}
                                  {formatEventTime(device.lastSeenAt)}
                                </Text>
                              </View>
                              <Pressable
                                className={cn(
                                  "h-9 flex-row items-center gap-2 rounded-full px-3",
                                  isCurrentDevice
                                    ? "bg-muted"
                                    : "bg-destructive/10 active:bg-destructive/20",
                                )}
                                disabled={isCurrentDevice}
                                haptic={!isCurrentDevice}
                                onPress={() => revokeDevice(device.deviceId)}
                                transition
                              >
                                <Icon
                                  className={cn(
                                    "size-sm",
                                    isCurrentDevice
                                      ? "text-muted-foreground"
                                      : "text-destructive",
                                  )}
                                  name={isCurrentDevice ? "CircleCheck" : "Ban"}
                                />
                                <Text
                                  className={cn(
                                    "text-xs font-bold",
                                    isCurrentDevice
                                      ? "text-muted-foreground"
                                      : "text-destructive",
                                  )}
                                >
                                  {isCurrentDevice ? "Current" : "Revoke"}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
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
                    <View className="gap-2">
                      <Text className="text-xs font-semibold uppercase text-muted-foreground">
                        Revoked
                      </Text>
                      {visibleRevokedOfflineDevices.map((device) => (
                        <View
                          className="gap-3 rounded-xl border border-border bg-background p-3"
                          key={device.deviceId}
                        >
                          <View className="flex-row items-start justify-between gap-3">
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-foreground">
                                {device.deviceName ?? device.platform}
                              </Text>
                              <Text className="mt-1 text-xs text-muted-foreground">
                                Revoked {formatEventTime(device.revokedAt)}
                              </Text>
                            </View>
                            <Pressable
                              className="h-9 flex-row items-center gap-2 rounded-full bg-primary px-3 active:bg-primary/90"
                              haptic
                              onPress={() => restoreDevice(device.deviceId)}
                              transition
                            >
                              <Icon
                                className="size-sm text-primary-foreground"
                                name="Activity"
                              />
                              <Text className="text-xs font-bold text-primary-foreground">
                                Restore
                              </Text>
                            </Pressable>
                          </View>
                        </View>
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
            </View>
          ) : null}

          {lastSyncSummary ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">
                    Last sync
                  </Text>
                  <Text className="text-sm font-semibold text-foreground">
                    {formatEventTime(lastSyncSummary.completedAt)} on{" "}
                    {lastSyncSummary.deviceId}
                  </Text>
                </View>
                <StatusBadge
                  label={lastSyncSummary.status}
                  tone={
                    lastSyncSummary.status === "failed"
                      ? "destructive"
                      : lastSyncSummary.status === "partial"
                        ? "warning"
                        : "success"
                  }
                />
              </View>
              <Text className="mt-3 text-xs leading-4 text-muted-foreground">
                Applied {lastSyncSummary.appliedCount} of{" "}
                {lastSyncSummary.totalCount}; failed{" "}
                {lastSyncSummary.failedCount}, skipped{" "}
                {lastSyncSummary.skippedCount}.
              </Text>
              {lastSyncSummary.errorMessage ? (
                <Text className="mt-2 text-xs leading-4 text-destructive">
                  {lastSyncSummary.errorMessage}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-xs font-semibold uppercase text-muted-foreground">
                  Server history
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Recent sync runs recorded by production for this device.
                </Text>
              </View>
              <Icon
                className={cn(
                  "size-sm",
                  syncHistoryQuery.isFetching
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
                name="Clock"
              />
            </View>

            {syncHistoryQuery.isError ? (
              <Text className="mt-3 text-xs leading-4 text-destructive">
                Server sync history is unavailable right now.
              </Text>
            ) : serverSyncHistory.length ? (
              <View className="mt-4 gap-3">
                {visibleServerSyncHistory.map((syncRun) => (
                  <View
                    className="gap-2 rounded-xl border border-border bg-background p-3"
                    key={syncRun.id}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-foreground">
                          {formatEventTime(syncRun.completedAt)}
                        </Text>
                        <Text className="mt-1 text-xs text-muted-foreground">
                          {syncRun.appliedCount} applied, {syncRun.failedCount}{" "}
                          failed, {syncRun.skippedCount} skipped
                        </Text>
                      </View>
                      <StatusBadge
                        label={formatSyncRunStatus(syncRun.status)}
                        tone={
                          syncRun.status === "failed"
                            ? "destructive"
                            : syncRun.status === "partial" ||
                                syncRun.status === "skipped"
                              ? "warning"
                              : "success"
                        }
                      />
                    </View>
                    {syncRun.events.some((event) => event.errorMessage) ? (
                      <Text className="text-xs leading-4 text-muted-foreground">
                        {
                          syncRun.events.find((event) => event.errorMessage)
                            ?.errorMessage
                        }
                      </Text>
                    ) : null}
                  </View>
                ))}
                {serverSyncHistory.length > visibleServerSyncHistory.length ? (
                  <Text className="text-xs font-medium text-muted-foreground">
                    Showing first {visibleServerSyncHistory.length} of{" "}
                    {serverSyncHistory.length} sync runs.
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text className="mt-3 text-xs leading-4 text-muted-foreground">
                No server-recorded sync runs for this device yet.
              </Text>
            )}
          </View>

          {shouldShowServerConflicts ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">
                    Server conflicts
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Unreviewed production conflicts for this device and the
                    wider business.
                  </Text>
                </View>
                <Icon
                  className={cn(
                    "size-sm",
                    syncConflictsQuery.isFetching ||
                      tenantSyncConflictsQuery.isFetching
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                  name="TriangleAlert"
                />
              </View>

              <View className="mt-4 flex-row gap-3">
                <View className="flex-1 rounded-xl bg-background p-3">
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">
                    This device
                  </Text>
                  <Text className="mt-2 text-xl font-bold text-foreground">
                    {serverSyncConflicts.length}
                  </Text>
                </View>
                <View className="flex-1 rounded-xl bg-background p-3">
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">
                    Business
                  </Text>
                  <Text className="mt-2 text-xl font-bold text-foreground">
                    {tenantSyncConflicts.length}
                  </Text>
                </View>
              </View>

              {syncConflictsQuery.isFetching ||
              tenantSyncConflictsQuery.isFetching ? (
                <Text className="mt-3 text-xs leading-4 text-muted-foreground">
                  Loading conflicts...
                </Text>
              ) : tenantSyncConflicts.length > 0 ? (
                <View className="mt-4 gap-3">
                  {visibleTenantSyncConflicts.map((conflict) => (
                    <View
                      className="gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3"
                      key={conflict.id}
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1 gap-1">
                          <Text className="text-sm font-semibold text-foreground">
                            {formatSyncEventType(conflict.type)}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {conflict.processedAt
                              ? formatEventTime(conflict.processedAt)
                              : "Waiting for review"}{" "}
                            - {formatDeviceLabel(conflict.deviceId)}
                          </Text>
                        </View>
                        <Pressable
                          className="h-9 flex-row items-center gap-2 rounded-full bg-primary px-3 active:bg-primary/90"
                          disabled={reviewSyncConflictMutation.isPending}
                          haptic
                          onPress={() => reviewServerConflict(conflict.eventId)}
                          transition
                        >
                          <Icon
                            className="size-sm text-primary-foreground"
                            name="Check"
                          />
                          <Text className="text-xs font-bold text-primary-foreground">
                            Review
                          </Text>
                        </Pressable>
                      </View>
                      {conflict.errorMessage ? (
                        <Text className="text-xs leading-4 text-amber-700">
                          {conflict.errorMessage}
                        </Text>
                      ) : null}
                      <View className="border-t border-amber-500/20 pt-3">
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
                    </View>
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
                <Text className="mt-3 text-xs leading-4 text-muted-foreground">
                  No unreviewed server conflicts for this business.
                </Text>
              )}

              {reviewSyncConflictMutation.isError ? (
                <Text className="mt-3 text-xs leading-4 text-destructive">
                  {reviewSyncConflictMutation.error.message}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="flex-row gap-3">
            <View
              className="flex-1 rounded-2xl border border-border bg-card p-4"
              testID="retail-sync-pending-count"
            >
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                Pending
              </Text>
              <Text className="mt-2 text-2xl font-bold text-foreground">
                {pendingEvents.length}
              </Text>
            </View>
            <View
              className="flex-1 rounded-2xl border border-border bg-card p-4"
              testID="retail-sync-retry-count"
            >
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                Retry
              </Text>
              <Text className="mt-2 text-2xl font-bold text-foreground">
                {failedEvents.length}
              </Text>
            </View>
            <View
              className="flex-1 rounded-2xl border border-border bg-card p-4"
              testID="retail-sync-review-count"
            >
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                Review
              </Text>
              <Text className="mt-2 text-2xl font-bold text-foreground">
                {conflictEvents.length}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-border bg-card p-4">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                Total events
              </Text>
              <Text className="mt-2 text-2xl font-bold text-foreground">
                {syncEvents.length}
              </Text>
            </View>
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
                  <View
                    className="rounded-xl border border-border bg-background p-3"
                    key={event.eventId}
                  >
                    <Text className="text-sm font-semibold text-foreground">
                      {event.label}
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-muted-foreground">
                      {event.reason}
                    </Text>
                  </View>
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
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
})

SyncStatusSheet.displayName = "SyncStatusSheet"
