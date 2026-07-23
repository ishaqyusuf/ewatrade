import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import {
  activeBusinessOfflineCommands,
  pendingOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Constants from "expo-constants"
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
  const state = useOfflineCommandStore()
  const commands = activeBusinessOfflineCommands(
    state.commands,
    profile?.businessId,
  )
  const isOfflineMode = useOperationalModeStore((mode) => mode.isOfflineMode)
  const setOfflineMode = useOperationalModeStore((mode) => mode.setOfflineMode)
  const conflicts = useQuery(
    trpc.offline.conflicts.queryOptions({}, { retry: false }),
  )
  const replay = useMutation(
    trpc.offline.replay.mutationOptions({
      onError: () => undefined,
      onSuccess: async (results) => {
        state.applyReplayResults(results)
        await Promise.all([
          conflicts.refetch(),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
          queryClient.invalidateQueries(
            trpc.catalog.listItemsPage.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
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
      onSuccess: () => void conflicts.refetch(),
    }),
  )
  const pending = commands.filter(
    (command) => command.localStatus === "pending",
  )
  const applied = commands.filter(
    (command) => command.localStatus === "applied",
  )

  const replayNow = () => {
    if (pending.length === 0) return
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
        icon={isOfflineMode ? "Wind" : "CircleCheck"}
        message={
          isOfflineMode
            ? "New supported operations are queued on this device until you reconnect."
            : "Server data is authoritative. You can switch to offline work when connectivity is unreliable."
        }
        title={isOfflineMode ? "Offline work enabled" : "Online work enabled"}
        tone={isOfflineMode ? "warning" : "success"}
      />
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

      <ActionButton
        onPress={() => setOfflineMode(!isOfflineMode)}
        variant="outline"
      >
        {isOfflineMode ? "Return to online work" : "Switch to offline work"}
      </ActionButton>
      <ActionButton
        disabled={isOfflineMode || pending.length === 0}
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
                          : command.localStatus === "review"
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

      <View className="gap-3">
        <Text className="text-lg font-extrabold text-foreground">
          Conflict review
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
              <Text className="text-sm text-muted-foreground">
                {conflict.conflictMessage ?? "Authoritative state changed."}
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
                      decision: "retry",
                    })
                    state.retryCommand(conflict.clientCommandId)
                  }}
                  variant="outline"
                >
                  Retry
                </ActionButton>
                <ActionButton
                  className="flex-1"
                  onPress={() => {
                    review.mutate({
                      commandId: conflict.id,
                      decision: "discard",
                    })
                    state.discardCommand(conflict.clientCommandId)
                  }}
                  variant="destructive"
                >
                  Discard
                </ActionButton>
              </View>
            </View>
          ))}
        </View>
      </View>

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
