import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
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
    trpc.offline.settings.queryOptions(undefined, { retry: false }),
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
            trpc.catalog.listItemsPage.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
          queryClient.invalidateQueries(
            trpc.orders.customerCount.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.services.queue.queryFilter()),
          queryClient.invalidateQueries(trpc.services.queuePage.queryFilter()),
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
          queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
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

  useEffect(() => {
    if (!profile?.businessId || !settings.data) return
    setOfflineAccess(profile.businessId, settings.data.enabled)
  }, [profile?.businessId, setOfflineAccess, settings.data])

  const replayNow = () => {
    if (pending.length === 0 && staged.length === 0 && reviewing.length === 0)
      return
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
        gap: 20,
        paddingBottom: 48,
        paddingHorizontal: 20,
      }}
      refreshControl={<QueryRefreshControl />}
    >
      <StatusBanner
        icon={!offlineAllowed ? "Lock" : isOfflineMode ? "Wind" : "CircleCheck"}
        message={
          !offlineAllowed
            ? "The business owner has disabled offline work. Staff must reconnect before creating Orders or collecting payments."
            : isOfflineMode
              ? "New supported operations are queued on this device until you reconnect."
              : "Offline work is limited to creating Orders, collecting payment, and saving a customer during checkout."
        }
        title={
          !offlineAllowed
            ? "Offline work disabled"
            : isOfflineMode
              ? "Offline work enabled"
              : "Online work enabled"
        }
        tone={!offlineAllowed || isOfflineMode ? "warning" : "success"}
      />
      {settings.isError ? (
        <StatusBanner
          actionLabel="Try again"
          icon="AlertCircle"
          message="Reconnect to confirm whether this business currently allows offline work."
          onActionPress={() => void settings.refetch()}
          title="Offline policy unavailable"
          tone="warning"
        />
      ) : null}
      {replay.error || register.error ? (
        <StatusBanner
          icon="AlertCircle"
          message={(replay.error ?? register.error)?.message ?? "Sync failed."}
          title="Sync needs attention"
          tone="destructive"
        />
      ) : null}

      <View className="flex-row border-y border-border py-4">
        <Summary label="Pending" value={pending.length} />
        <Divider />
        <Summary label="Review" value={conflicts.data?.length ?? 0} />
        <Divider />
        <Summary label="Applied" value={applied.length} />
      </View>

      {canManageSettings ? (
        <View className="gap-3">
          <ActionButton
            disabled={isOfflineMode || updateSettings.isPending}
            isLoading={updateSettings.isPending}
            loadingLabel="Saving offline policy"
            onPress={() =>
              updateSettings.mutate({
                approvalRequired: settings.data?.approvalRequired ?? false,
                enabled: !offlineAllowed,
              })
            }
            variant="outline"
          >
            {offlineAllowed
              ? "Disable offline work for staff"
              : "Enable offline work for staff"}
          </ActionButton>
          <ActionButton
            disabled={
              isOfflineMode || !offlineAllowed || updateSettings.isPending
            }
            isLoading={updateSettings.isPending}
            loadingLabel="Saving approval policy"
            onPress={() =>
              updateSettings.mutate({
                approvalRequired: !settings.data?.approvalRequired,
                enabled: offlineAllowed,
              })
            }
            variant="outline"
          >
            Approve staff offline records:{" "}
            {settings.data?.approvalRequired ? "On" : "Off"}
          </ActionButton>
        </View>
      ) : null}
      <ActionButton
        disabled={!offlineAllowed}
        onPress={() => {
          if (offlineAllowed && profile?.businessId) {
            setOfflineMode(profile.businessId, !isOfflineMode)
          }
        }}
        variant="outline"
      >
        {!offlineAllowed
          ? "Offline work is disabled"
          : isOfflineMode
            ? "Return to online work"
            : "Switch to offline work"}
      </ActionButton>
      <ActionButton
        disabled={
          isOfflineMode ||
          (pending.length === 0 &&
            staged.length === 0 &&
            reviewing.length === 0)
        }
        isLoading={replay.isPending || register.isPending}
        loadingLabel="Syncing"
        onPress={replayNow}
      >
        Sync pending commands
      </ActionButton>

      <View className="gap-3">
        <Text className="text-lg font-extrabold text-foreground">
          Local queue
        </Text>
        {commands.length === 0 ? (
          <EmptyState
            icon="Wind"
            message="Offline actions for this business will appear here with provisional status."
            title="Queue is clear"
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
                      {command.payload.kind.replaceAll("_", " ")}
                    </Text>
                    <StatusBadge
                      label={command.localStatus}
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
                  {command.conflictMessage ? (
                    <Text className="text-xs text-destructive">
                      {command.conflictMessage}
                    </Text>
                  ) : null}
                </View>
              ))}
          </View>
        )}
      </View>

      {canManageReviews ? (
        <View className="gap-3">
          <Text className="text-lg font-extrabold text-foreground">
            Offline records
          </Text>
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
                    : (conflict.conflictMessage ??
                      "Authoritative state changed.")}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {conflict.dependentCommands.length} dependent command
                  {conflict.dependentCommands.length === 1 ? "" : "s"}
                </Text>
                <View className="flex-row gap-2">
                  <ActionButton
                    className="flex-1"
                    onPress={() => {
                      review.mutate({
                        commandId: conflict.id,
                        decision:
                          conflict.reviewKind === "approval"
                            ? "approve"
                            : "retry",
                      })
                      if (conflict.reviewKind !== "approval") {
                        state.retryCommand(conflict.clientCommandId)
                      }
                    }}
                    variant="outline"
                  >
                    {conflict.reviewKind === "approval" ? "Approve" : "Retry"}
                  </ActionButton>
                  <ActionButton
                    className="flex-1"
                    onPress={() => {
                      review.mutate({
                        commandId: conflict.id,
                        decision:
                          conflict.reviewKind === "approval"
                            ? "reject"
                            : "discard",
                      })
                      state.discardCommand(conflict.clientCommandId)
                    }}
                    variant="destructive"
                  >
                    {conflict.reviewKind === "approval" ? "Reject" : "Discard"}
                  </ActionButton>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {onComplete ? (
        <ActionButton onPress={onComplete} variant="outline">
          Done
        </ActionButton>
      ) : null}
    </ScrollView>
  )
}

function Divider() {
  return <View className="h-10 w-px bg-border" />
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-0 flex-1 items-center">
      <Text className="text-xl font-extrabold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  )
}
