import { ActionButton } from "@/components/mobile/action-button"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { SyncReliabilityToggle } from "@/components/mobile/sync-flow"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useOfflineReplay } from "@/hooks/use-offline-replay"
import { useQuickSaleCorrection } from "@/hooks/use-quick-sale-correction"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import {
  canManageMobileOperations,
  normalizeMobileRole,
} from "@/lib/mobile-roles"
import { replayableBatch } from "@/lib/offline-replay-client"
import {
  blankQuickSaleLines,
  correctionAvailability,
  correctionView,
} from "@/lib/quick-sale-correction"
import {
  activeBusinessOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import {
  isOfflineAccessAllowed,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Constants from "expo-constants"
import { useEffect, useState } from "react"
import { Text as NativeText, Platform, ScrollView, View } from "react-native"
import { HeroCard } from "./green-till/hero-card"
import { ListCard, SectionHeader, StatusPill } from "./green-till/kit"
import { OfflineRecoveryReviewCard } from "./offline-recovery-review"
import {
  queueCreatedAt,
  queueItemTitle,
  queueStatusLabel,
} from "./queue-display"
import { QuickSaleCorrectionSheet } from "./quick-sale-correction-sheet"
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
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
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
  const sync = useOfflineReplay()
  // Older queued Quick sales saved without a description (M06 correction).
  const correction = useQuickSaleCorrection()
  const [fixing, setFixing] = useState<string | null>(null)
  const correctionFor = (command: (typeof commands)[number]) => {
    if (!blankQuickSaleLines(command.payload).length && !command.correctedBy)
      return null
    const attempt = state.correctionFor(command)
    const availability = correctionAvailability(command, commands)
    if (!attempt && availability === "unavailable") return null
    const replacement = attempt
      ? commands.find(
          (candidate) =>
            candidate.clientCommandId === attempt.replacementClientCommandId,
        )
      : undefined
    return {
      attempt,
      view: correctionView({
        availability,
        attempt,
        replacementStatus: replacement?.localStatus ?? null,
        sending: correction.isSending(attempt?.key),
        canSend: correction.canSend,
      }),
    }
  }
  const fixingCommand = fixing
    ? commands.find((command) => command.clientCommandId === fixing)
    : undefined
  const fixingCorrection = fixingCommand ? correctionFor(fixingCommand) : null
  const [syncing, setSyncing] = useState(false)
  const [reviewRefreshFailed, setReviewRefreshFailed] = useState(false)
  // Management review only changes this reviewer's own local partition.
  const reviewCommand = async (
    input: Parameters<typeof sync.reviewCommand>[0],
  ) => {
    // The shared refresh already reloads conflicts for this lifetime.
    const outcome = await sync.reviewCommand(input)
    setReviewRefreshFailed(outcome === "applied_refresh_failed")
  }
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
    syncing ||
    sync.reviewPending ||
    sync.decidePending ||
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
    if (!canReplay || syncing) return
    // Capture at the tap; with offline access off, only held reviews resend.
    const batch = replayableBatch(
      state.prepareReplay(),
      offlineAllowed
        ? undefined
        : (id) =>
            commands.some(
              (candidate) =>
                candidate.clientCommandId === id &&
                (candidate.localStatus === "approval" ||
                  candidate.localStatus === "review"),
            ),
    )
    if (!batch) return
    setSyncing(true)
    void sync
      .request({
        registerFirst: offlineAllowed,
        include: (id) => batch.commands.some((c) => c.clientCommandId === id),
      })
      .finally(() => setSyncing(false))
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
        label="This phone"
        title={
          !state.hasHydrated
            ? "Checking this phone"
            : isOfflineMode
              ? "Working offline"
              : reviewing.length + staged.length
                ? `${reviewing.length + staged.length} need review`
                : pending.length
                  ? `${pending.length} waiting to sync`
                  : "All synced"
        }
        sub={presentation.statusMessage}
        pill={{
          label: isOfflineMode ? "Offline" : "Online",
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
        <View
          style={{
            alignItems: "center",
            borderTopColor: palette.heroLine,
            borderTopWidth: 1,
            flexDirection: "row",
            gap: 12,
            marginTop: 16,
            paddingTop: 14,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <NativeText
              style={{
                color: palette.heroForeground,
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              Work offline
            </NativeText>
            <NativeText style={{ color: palette.heroMuted, fontSize: 16 }}>
              {!offlineAllowed
                ? "Offline work is off for this business"
                : "New sales stay on this phone until you reconnect"}
            </NativeText>
          </View>
          <Switch
            accessibilityLabel="Work offline"
            checked={isOfflineMode}
            disabled={(!offlineAllowed && !isOfflineMode) || operationPending}
            onCheckedChange={(value) => {
              if (
                profile?.businessId &&
                !operationPending &&
                (offlineAllowed || !value)
              )
                setOfflineMode(profile.businessId, value)
            }}
          />
        </View>
      </HeroCard>
      {syncCount > 0 || operationPending ? (
        <ActionButton
          disabled={!canReplay}
          isLoading={operationPending}
          loadingLabel="Syncing"
          onPress={replayNow}
        >
          {presentation.syncLabel}
        </ActionButton>
      ) : null}
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
      {sync.status.status === "failed" ? (
        <StatusBanner
          className="mt-3"
          icon="AlertCircle"
          message={
            refusedByServer(sync.status.error)
              ? "This account can't sync these records right now. They stay saved on this phone; nothing was changed or lost."
              : SYNC_STATUS_COPY.syncError
          }
          title={
            refusedByServer(sync.status.error)
              ? "Sync was refused"
              : "Sync needs attention"
          }
          tone="destructive"
        />
      ) : null}
      {(sync.status.status === "applied" && sync.status.refreshFailed) ||
      reviewRefreshFailed ? (
        <StatusBanner
          className="mt-3"
          icon="RefreshCw"
          message="The sync went through. Some lists didn't refresh; pull to refresh when you're on a good connection."
          title="Synced"
          tone="warning"
        />
      ) : null}
      <Text className="mt-3 text-xs [-rn-line-height:22] text-muted-foreground">
        Records saved on this phone under another sign-in, Store or an older app
        version stay on the phone and aren't shown here. Sign in to that account
        and Store to sync them, or ask your owner about recovery.
      </Text>
      {updateSettings.error ? (
        <StatusBanner
          className="mt-3"
          icon="AlertCircle"
          message={SYNC_STATUS_COPY.policySaveError}
          title="Policy was not saved"
          tone="destructive"
        />
      ) : null}
      {sync.reviewError ? (
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
            <SectionHeader title="Needs review" />
            <View className="border-y border-border">
              {(conflicts.data ?? []).map((conflict, index, rows) => (
                <View
                  className={`gap-3 py-4 ${
                    index < rows.length - 1 ? "border-b border-border" : ""
                  }`}
                  key={conflict.id}
                >
                  {conflict.reviewKind === "suspended_recovery" ? (
                    <OfflineRecoveryReviewCard
                      conflict={conflict}
                      disabled={operationPending}
                      onDecide={(input) => sync.decideRecovery(input)}
                      viewerId={profile?.id}
                      viewerRole={profile?.role}
                    />
                  ) : (
                    <>
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
                            void reviewCommand({
                              commandId: conflict.id,
                              decision:
                                conflict.reviewKind === "approval"
                                  ? "approve"
                                  : "retry",
                            })
                          }}
                          variant="outline"
                        >
                          {conflict.reviewKind === "approval"
                            ? "Approve"
                            : "Retry"}
                        </ActionButton>
                        <ActionButton
                          className="flex-1"
                          disabled={operationPending}
                          onPress={() => {
                            if (operationPending) return
                            void reviewCommand({
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
                    </>
                  )}
                </View>
              ))}
            </View>
            <Text className="mt-3 text-xs [-rn-line-height:22] text-muted-foreground">
              Server data is authoritative. Review each record before retrying
              or discarding it.
            </Text>
          </View>
        ) : null
      ) : null}

      {onComplete && _presentation === "sheet" ? (
        <ActionButton onPress={onComplete} variant="outline">
          Done
        </ActionButton>
      ) : null}
      <View>
        <SectionHeader title="On this phone" />
        {commands.length === 0 ? (
          <View className="rounded-[20px] bg-card px-4 py-3.5 shadow-sm">
            <Text className="text-sm font-bold text-foreground">
              {presentation.activityTitle}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {presentation.activityMessage}
            </Text>
          </View>
        ) : (
          <ListCard>
            {commands
              .slice()
              .reverse()
              .map((command) => {
                const fix = command.correctedBy ? null : correctionFor(command)
                return (
                  <View className="gap-1 py-3" key={command.clientCommandId}>
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
                        {queueItemTitle(command.payload)}
                      </Text>
                      <StatusPill
                        label={
                          command.correctedBy
                            ? "Fixed · kept as history"
                            : fix
                              ? fix.view.rowLabel
                              : queueStatusLabel(command.localStatus)
                        }
                        tone={
                          command.localStatus === "applied" ||
                          fix?.view.kind === "applied" ||
                          fix?.view.kind === "already"
                            ? "ok"
                            : fix ||
                                command.localStatus === "review" ||
                                command.localStatus === "approval"
                              ? "warn"
                              : "muted"
                        }
                      />
                    </View>
                    <Text className="text-xs text-muted-foreground">
                      {queueCreatedAt(command.createdAtClient)}
                    </Text>
                    {command.conflictMessage && !fix ? (
                      <Text className="text-xs text-destructive">
                        {SYNC_STATUS_COPY.localConflict}
                      </Text>
                    ) : null}
                    {fix ? (
                      <ActionButton
                        accessibilityLabel={`${fix.view.editable ? "Add what was sold" : "Open fix"} for ${queueItemTitle(command.payload)}`}
                        onPress={() => setFixing(command.clientCommandId)}
                        tone="soft"
                      >
                        {fix.view.editable ? "Fix" : "Open fix"}
                      </ActionButton>
                    ) : null}
                  </View>
                )
              })}
          </ListCard>
        )}
      </View>

      {fixingCommand && fixingCorrection ? (
        <QuickSaleCorrectionSheet
          // A different sale is a different sheet: fresh draft and lifetime.
          key={fixingCommand.clientCommandId}
          attempt={fixingCorrection.attempt}
          command={fixingCommand}
          correction={correction}
          onClose={() => setFixing(null)}
          open
          view={fixingCorrection.view}
        />
      ) : null}
      {canManageSettings ? (
        <View>
          <SectionHeader title="Business policy" />
          <View className="overflow-hidden rounded-[20px] bg-card shadow-sm">
            {!settings.data ? (
              <Text className="py-4 text-muted-foreground">
                Policy unavailable. Reconnect to load settings.
              </Text>
            ) : (
              <>
                <SyncReliabilityToggle
                  active={policyEnabled}
                  className="px-4"
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
                  className="border-t border-border px-4"
                  description="Review staff orders before they are applied."
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

function refusedByServer(error: unknown) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code
  return code === "FORBIDDEN" || code === "UNAUTHORIZED"
}
