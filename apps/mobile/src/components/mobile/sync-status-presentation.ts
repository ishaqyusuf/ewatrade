export const SYNC_STATUS_COPY = {
  localConflict:
    "This queued action needs review before it can be applied safely.",
  policyLoadError:
    "Offline policy could not be confirmed. Check your connection and try again.",
  policySaveError:
    "Offline policy could not be saved. Check your connection and try again.",
  reviewError:
    "This offline record could not be updated. Check your connection and try again.",
  serverConflict:
    "Business data changed after this action was queued. Review it before retrying or discarding it.",
  syncError:
    "This device could not sync its queued work. Check your connection and try again.",
} as const

type SyncStatusPresentationInput = {
  appliedCount: number
  isOfflineMode: boolean
  offlineAllowed: boolean
  pendingCount: number
  reviewCount: number
  syncCount: number
}

export function buildSyncStatusPresentation({
  isOfflineMode,
  offlineAllowed,
  pendingCount,
  reviewCount,
  syncCount,
}: SyncStatusPresentationInput) {
  const attentionCount = pendingCount + reviewCount
  const changeLabel = `${attentionCount} ${attentionCount === 1 ? "change" : "changes"}`
  const syncChangeLabel = `${syncCount} ${syncCount === 1 ? "change" : "changes"}`

  if (!offlineAllowed) {
    return {
      activityMessage:
        attentionCount === 0
          ? "No queued actions or offline records need attention."
          : `${changeLabel} still needs attention on this device.`,
      activityTitle: attentionCount === 0 ? "All caught up" : "Action needed",
      statusMessage:
        "Staff must reconnect before creating Orders or collecting payment.",
      statusTitle: "Offline work disabled",
      syncLabel:
        syncCount === 0 ? "Nothing to sync" : `Sync ${syncChangeLabel}`,
      tone: "warning" as const,
    }
  }

  if (isOfflineMode) {
    return {
      activityMessage:
        attentionCount === 0
          ? "New supported actions will wait safely on this device."
          : `${changeLabel} will sync after you reconnect.`,
      activityTitle:
        attentionCount === 0 ? "Queue is clear" : "Waiting to reconnect",
      statusMessage:
        "Supported checkout actions stay on this device until you reconnect.",
      statusTitle: "Working offline",
      syncLabel:
        syncCount === 0
          ? "Nothing to sync"
          : `Reconnect to sync ${syncChangeLabel}`,
      tone: "warning" as const,
    }
  }

  return {
    activityMessage:
      attentionCount === 0
        ? "No queued actions or offline records need attention."
        : `${changeLabel} is ready for sync or review.`,
    activityTitle: attentionCount === 0 ? "All caught up" : "Action needed",
    statusMessage: "Offline checkout is available when the connection drops.",
    statusTitle: "Online and ready",
    syncLabel: syncCount === 0 ? "Nothing to sync" : `Sync ${syncChangeLabel}`,
    tone: "success" as const,
  }
}

export function resolveReviewCount(input: {
  canManageReviews: boolean
  localCount: number
  serverCount: number | undefined
}) {
  return input.canManageReviews
    ? (input.serverCount ?? input.localCount)
    : input.localCount
}

export function canChangeOfflinePolicy(input: {
  canManageSettings: boolean
  hasSettings: boolean
  isOfflineMode: boolean
  updatePending: boolean
}) {
  return (
    input.canManageSettings &&
    input.hasSettings &&
    !input.isOfflineMode &&
    !input.updatePending
  )
}

export function canReplayOfflineCommands(input: {
  isOfflineMode: boolean
  offlineAllowed: boolean
  operationPending: boolean
  pendingCount: number
  reviewCount: number
  stagedCount: number
}) {
  const eligibleCount = input.offlineAllowed
    ? input.pendingCount + input.reviewCount + input.stagedCount
    : input.reviewCount + input.stagedCount

  return !input.isOfflineMode && !input.operationPending && eligibleCount > 0
}
