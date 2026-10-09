import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { SyncReliabilityToggle } from "@/components/mobile/sync-flow"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import {
  canManageMobileOperations,
  normalizeMobileRole,
} from "@/lib/mobile-roles"
import {
  activeBusinessOfflineCommands,
  pendingOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import {
  isOfflineAccessAllowed,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Constants from "expo-constants"
import { useEffect } from "react"
import { Platform, ScrollView, View } from "react-native"
import { HeroCard } from "./green-till/hero-card"
import { ToggleRow } from "./green-till/kit"
import {
  queueCreatedAt,
  queueItemTitle,
  queueStatusLabel,
} from "./queue-display"
import {
  SYNC_STATUS_COPY,
  buildSyncStatusPresentation,
  canChangeOfflinePolicy,
  canReplayOfflineCommands,
  resolveReviewCount,
} from "./sync-status-presentation"

type SyncStatusContentProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}

export function SyncStatusContent({
  onComplete,
  presentation: _presentation,
}: SyncStatusContentProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const canManageReviews = canManageMobileOperations(profile?.role)
  const state = useOfflineCommandStore()
  const commands = activeBusinessOfflineCommands(
    state.commands,
    profile?.businessId,
  )
  const isOfflineMode = useOperationalModeStore((mode) => mode.isOfflineMode)
  const offlineAccessByBusinessId = useOperationalModeStore(
    (mode) => mode.offlineAccessByBusinessId,
  )
  const setOfflineAccess = useOperationalModeStore(
    (mode) => mode.setOfflineAccess,
  )
  const setOfflineMode = useOperationalModeStore((mode) => mode.setOfflineMode)
  const settings = useQuery(
    trpc.offline.settings.queryOptions(undefined, {
      enabled: !isOfflineMode,
      retry: false,
      staleTime: 30_000,
    }),
  )
  const updateSettings = useMutation(
    trpc.offline.updateSettings.mutationOptions({
      onSuccess: (policy) => {
        if (profile?.businessId) {
          setOfflineAccess(profile.businessId, policy.enabled)
        }
        queryClient.setQueryData(trpc.offline.settings.queryKey(), policy)
      },
    }),
  )
  const conflicts = useQuery(
    trpc.offline.conflicts.queryOptions(
      {},
      {
        enabled: canManageReviews && !isOfflineMode,
        retry: false,
        staleTime: 30_000,
      },
    ),
  )
  const replay = useMutation(
    trpc.offline.replay.mutationOptions({
      onError: () => undefined,
      onSuccess: async (results) => {
        state.applyReplayResults(results)
        if (canManageReviews) await conflicts.refetch()
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
          queryClient.invalidateQueries(
            trpc.catalog.listItemsPage.pathFilter(),
          ),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.pathFilter()),
          queryClient.invalidateQueries(
            trpc.orders.customerCount.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.services.queue.queryFilter()),
          queryClient.invalidateQueries(trpc.services.queuePage.pathFilter()),
        ])
      },
    }),
  )
  const register = useMutation(
    trpc.offline.registerDevice.mutationOptions({
      onSuccess: () =>
        replay.mutate({
          commands: pendingOfflineCommands(state, profile?.businessId),
          deviceId: state.deviceId,
        }),
    }),
  )
  const review = useMutation(
    trpc.offline.review.mutationOptions({
      onSuccess: async (result) => {
        state.applyReplayResults([result])
        await Promise.all([
          conflicts.refetch(),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.pathFilter()),
        ])
      },
    }),
  )
  const pending = commands.filter(
    (command) => command.localStatus === "pending",
  )
  const staged = commands.filter(
    (command) => command.localStatus === "approval",
  )
  const reviewing = commands.filter(
    (command) => command.localStatus === "review",
  )
  const applied = commands.filter(
    (command) => command.localStatus === "applied",
  )
  const offlineAllowed = isOfflineAccessAllowed(
    offlineAccessByBusinessId,
    profile?.businessId,
  )
  const normalizedRole = normalizeMobileRole(profile?.role)
  const canManageSettings =
    normalizedRole === "OWNER" || normalizedRole === "ADMIN"
  const policyEnabled = settings.data?.enabled ?? offlineAllowed
  const operationPending =
    replay.isPending ||
    register.isPending ||
    review.isPending ||
    updateSettings.isPending
  const canChangePolicy = canChangeOfflinePolicy({
    canManageSettings,
    hasSettings: !!settings.data && !settings.isError,
    isOfflineMode,
    updatePending: operationPending,
  })
  const reviewCount = resolveReviewCount({
    canManageReviews,
    localCount: staged.length + reviewing.length,
    serverCount: conflicts.data?.length,
  })
  const syncCount = offlineAllowed
    ? pending.length + staged.length + reviewing.length
    : staged.length + reviewing.length
  const canReplay = canReplayOfflineCommands({
    isOfflineMode,
    offlineAllowed,
    operationPending,
    pendingCount: pending.length,
    reviewCount: reviewing.length,
    stagedCount: staged.length,
  })
  const presentation = buildSyncStatusPresentation({
    appliedCount: applied.length,
    isOfflineMode,
    offlineAllowed,
    pendingCount: pending.length,
    reviewCount,
    syncCount,
  })

  useEffect(() => {
    if (!profile?.businessId || !settings.data) return
    setOfflineAccess(profile.businessId, settings.data.enabled)
  }, [profile?.businessId, setOfflineAccess, settings.data])

  const replayNow = () => {
    if (!canReplay) return
    if (!offlineAllowed) {
      replay.mutate({
        commands: pendingOfflineCommands(state, profile?.businessId).filter(
          (command) =>
            commands.some(
              (candidate) =>
                candidate.clientCommandId === command.clientCommandId &&
                (candidate.localStatus === "approval" ||
                  candidate.localStatus === "review"),
            ),
        ),
        deviceId: state.deviceId,
      })
      return
    }
    register.mutate({
      appVersion: Constants.expoConfig?.version,
      deviceId: state.deviceId,
      deviceName: `${Platform.OS} device`,
      platform:
        Platform.OS === "ios" ||
        Platform.OS === "android" ||
        Platform.OS === "web"
          ? Platform.OS
          : "unknown",
    })
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 16,
        paddingBottom: 48,
        paddingHorizontal: 18,
      }}
      refreshControl={<QueryRefreshControl />}
    >
      <HeroCard
        label="Sync & offline"
        title={
          !state.hasHydrated
            ? "Checking this device"
            : isOfflineMode
              ? "Working offline"
              : reviewing.length + staged.length
                ? `${reviewing.length + staged.length} need review`
                : pending.length
                  ? `${pending.length} waiting to sync`
                  : "All synced on this device"
        }
        sub={presentation.statusMessage}
        pill={{
          label: isOfflineMode ? "Offline" : "This device",
          tone: isOfflineMode ? "offline" : "synced",
        }}
        stats={
          state.hasHydrated
            ? [
                { label: "Waiting", value: String(pending.length) },
                {
                  label: "Review",
                  value: String(staged.length + reviewing.length),
                },
                { label: "Synced", value: String(applied.length) },
              ]
            : undefined
        }
      >
        {!state.hasHydrated ? <Skeleton className="mt-4 h-12 w-full" /> : null}
      </HeroCard>
      <ToggleRow
        title="Work offline"
        sub={
          !offlineAllowed
            ? "Offline work is disabled for this business."
            : "New sales stay on this device until you reconnect."
        }
        value={isOfflineMode}
        disabled={(!offlineAllowed && !isOfflineMode) || operationPending}
        onValueChange={(value) => {
          if (
            profile?.businessId &&
            !operationPending &&
            (offlineAllowed || !value)
          )
            setOfflineMode(profile.businessId, value)
        }}
      />
      <ActionButton
        disabled={!canReplay}
        isLoading={operationPending}
        loadingLabel="Syncing"
        onPress={replayNow}
      >
        {presentation.syncLabel}
      </ActionButton>
      {settings.isError ? (
        <StatusBanner
          actionLabel="Try again"
          className="mt-3"
          icon="AlertCircle"
          message={SYNC_STATUS_COPY.policyLoadError}
          onActionPress={() => void settings.refetch()}
          title="Offline policy unavailable"
          tone="warning"
        />
      ) : null}
      {replay.error || register.error ? (
        <StatusBanner
          className="mt-3"
          icon="AlertCircle"
          message={SYNC_STATUS_COPY.syncError}
          title="Sync needs attention"
          tone="destructive"
        />
      ) : null}
      {updateSettings.error ? (
        <StatusBanner
          className="mt-3"
          icon="AlertCircle"
          message={SYNC_STATUS_COPY.policySaveError}
          title="Policy was not saved"
          tone="destructive"
        />
      ) : null}
      {review.error ? (
        <StatusBanner
          className="mt-3"
          icon="AlertCircle"
          message={SYNC_STATUS_COPY.reviewError}
          title="Review was not updated"
          tone="destructive"
        />
      ) : null}

      {canManageReviews ? (
        (conflicts.data?.length ?? 0) > 0 ? (
          <View>
            <SectionLabel>Conflict review</SectionLabel>
            <View className="border-y border-border">
              {(conflicts.data ?? []).map((conflict, index, rows) => (
                <View
                  className={`gap-3 py-4 ${
                    index < rows.length - 1 ? "border-b border-border" : ""
                  }`}
                  key={conflict.id}
                >
                  <Text className="font-bold text-foreground">
                    {conflict.type.replaceAll("_", " ")}
                  </Text>
                  {conflict.actor ? (
                    <Text className="text-xs font-semibold text-muted-foreground">
                      Staff:{" "}
                      {conflict.actor.displayName ||
                        conflict.actor.name ||
                        conflict.actor.email}
                    </Text>
                  ) : null}
                  <Text className="text-sm text-muted-foreground">
                    {conflict.reviewKind === "approval"
                      ? "This staff record is staged and has not changed business records yet."
                      : SYNC_STATUS_COPY.serverConflict}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {conflict.dependentCommands.length} dependent command
                    {conflict.dependentCommands.length === 1 ? "" : "s"}
                  </Text>
                  <View className="flex-row gap-2">
                    <ActionButton
                      className="flex-1"
                      disabled={operationPending}
                      onPress={() => {
                        if (operationPending) return
                        review.mutate({
                          commandId: conflict.id,
                          decision:
                            conflict.reviewKind === "approval"
                              ? "approve"
                              : "retry",
                        })
                      }}
                      variant="outline"
                    >
                      {conflict.reviewKind === "approval" ? "Approve" : "Retry"}
                    </ActionButton>
                    <ActionButton
                      className="flex-1"
                      disabled={operationPending}
                      onPress={() => {
                        if (operationPending) return
                        review.mutate({
                          commandId: conflict.id,
                          decision:
                            conflict.reviewKind === "approval"
                              ? "reject"
                              : "discard",
                        })
                      }}
                      variant="destructive"
                    >
                      {conflict.reviewKind === "approval"
                        ? "Reject"
                        : "Discard"}
                    </ActionButton>
                  </View>
                </View>
              ))}
            </View>
            <Text className="mt-3 text-xs leading-5 text-muted-foreground">
              Server data is authoritative. Review each record before retrying
              or discarding it.
            </Text>
          </View>
        ) : null
      ) : null}

      {onComplete ? (
        <ActionButton onPress={onComplete} variant="outline">
          Done
        </ActionButton>
      ) : null}
      <View>
        <SectionLabel>Activity</SectionLabel>
        {commands.length === 0 ? (
          <EmptyState
            className="border-y border-border px-0 py-4"
            icon="Wind"
            message={presentation.activityMessage}
            title={presentation.activityTitle}
            variant="flat"
          />
        ) : (
          <View className="border-y border-border">
            {commands
              .slice()
              .reverse()
              .map((command, index) => (
                <View
                  className={`gap-2 py-4 ${
                    index < commands.length - 1 ? "border-b border-border" : ""
                  }`}
                  key={command.clientCommandId}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="min-w-0 flex-1 font-bold text-foreground">
                      {queueItemTitle(command.payload)}
                    </Text>
                    <StatusBadge
                      label={queueStatusLabel(command.localStatus)}
                      tone={
                        command.localStatus === "applied"
                          ? "success"
                          : command.localStatus === "review" ||
                              command.localStatus === "approval"
                            ? "warning"
                            : "muted"
                      }
                    />
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    {queueCreatedAt(command.createdAtClient)}
                  </Text>
                  {command.conflictMessage ? (
                    <Text className="text-xs text-destructive">
                      {SYNC_STATUS_COPY.localConflict}
                    </Text>
                  ) : null}
                </View>
              ))}
          </View>
        )}
      </View>

      {canManageSettings ? (
        <View>
          <SectionLabel>Business policy</SectionLabel>
          <View className="border-t border-border">
            {!settings.data ? (
              <Text className="py-4 text-muted-foreground">
                Policy unavailable. Reconnect to load settings.
              </Text>
            ) : (
              <>
                <SyncReliabilityToggle
                  active={policyEnabled}
                  className="rounded-2xl bg-card px-4"
                  description="Orders and checkout only."
                  disabled={!canChangePolicy}
                  label="Allow staff to work offline"
                  onPress={() => {
                    if (!canChangePolicy || !settings.data) return
                    updateSettings.mutate({
                      approvalRequired: settings.data.approvalRequired,
                      enabled: !settings.data.enabled,
                    })
                  }}
                  testID="offline-policy-enabled-toggle"
                />
                <SyncReliabilityToggle
                  active={settings.data?.approvalRequired ?? false}
                  className="rounded-2xl bg-card px-4"
                  description="Review staff Orders before they are applied."
                  disabled={!canChangePolicy || !policyEnabled}
                  label="Require staff record approval"
                  onPress={() => {
                    if (!canChangePolicy || !policyEnabled || !settings.data)
                      return
                    updateSettings.mutate({
                      approvalRequired: !settings.data.approvalRequired,
                      enabled: settings.data.enabled,
                    })
                  }}
                  testID="offline-policy-approval-toggle"
                />
              </>
            )}
          </View>
        </View>
      ) : null}
    </ScrollView>
  )
}

function Divider() {
  return <View className="h-10 w-px bg-border" />
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-5 text-[10px] font-extrabold uppercase tracking-[1.4px] text-muted-foreground">
      {children}
    </Text>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-0 flex-1 items-center">
      <Text className="text-xl font-extrabold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  )
}
