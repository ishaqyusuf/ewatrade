import { describe, expect, test } from "bun:test"

import {
  SYNC_STATUS_COPY,
  buildSyncStatusPresentation,
  canChangeOfflinePolicy,
  canReplayOfflineCommands,
  resolveReviewCount,
} from "./sync-status-presentation"

describe("sync status presentation", () => {
  test("separates online readiness from queue activity", () => {
    expect(
      buildSyncStatusPresentation({
        appliedCount: 0,
        isOfflineMode: false,
        offlineAllowed: true,
        pendingCount: 0,
        reviewCount: 0,
        syncCount: 0,
      }),
    ).toEqual({
      activityMessage: "No queued actions or offline records need attention.",
      activityTitle: "All caught up",
      statusMessage: "Offline checkout is available when the connection drops.",
      statusTitle: "Online and ready",
      syncLabel: "Nothing to sync",
      tone: "success",
    })
  })

  test("describes offline and policy-disabled states without implying sync", () => {
    expect(
      buildSyncStatusPresentation({
        appliedCount: 2,
        isOfflineMode: true,
        offlineAllowed: true,
        pendingCount: 1,
        reviewCount: 0,
        syncCount: 1,
      }),
    ).toMatchObject({
      statusTitle: "Working offline",
      syncLabel: "Reconnect to sync 1 change",
      tone: "warning",
    })

    expect(
      buildSyncStatusPresentation({
        appliedCount: 0,
        isOfflineMode: false,
        offlineAllowed: false,
        pendingCount: 0,
        reviewCount: 0,
        syncCount: 0,
      }),
    ).toMatchObject({
      statusTitle: "Offline work disabled",
      tone: "warning",
    })
  })

  test("does not permit policy writes until authoritative settings are loaded", () => {
    expect(
      canChangeOfflinePolicy({
        canManageSettings: true,
        hasSettings: false,
        isOfflineMode: false,
        updatePending: false,
      }),
    ).toBe(false)
    expect(
      canChangeOfflinePolicy({
        canManageSettings: true,
        hasSettings: true,
        isOfflineMode: false,
        updatePending: true,
      }),
    ).toBe(false)
    expect(
      canChangeOfflinePolicy({
        canManageSettings: true,
        hasSettings: true,
        isOfflineMode: false,
        updatePending: false,
      }),
    ).toBe(true)
  })

  test("enables replay only for queued work while connected", () => {
    expect(
      canReplayOfflineCommands({
        isOfflineMode: false,
        offlineAllowed: true,
        operationPending: false,
        pendingCount: 1,
        reviewCount: 0,
        stagedCount: 0,
      }),
    ).toBe(true)
    expect(
      canReplayOfflineCommands({
        isOfflineMode: true,
        offlineAllowed: true,
        operationPending: false,
        pendingCount: 1,
        reviewCount: 0,
        stagedCount: 0,
      }),
    ).toBe(false)
  })

  test("does not submit an empty replay when policy blocks ordinary pending work", () => {
    expect(
      canReplayOfflineCommands({
        isOfflineMode: false,
        offlineAllowed: false,
        operationPending: false,
        pendingCount: 1,
        reviewCount: 0,
        stagedCount: 0,
      }),
    ).toBe(false)
    expect(
      canReplayOfflineCommands({
        isOfflineMode: false,
        offlineAllowed: false,
        operationPending: false,
        pendingCount: 0,
        reviewCount: 1,
        stagedCount: 0,
      }),
    ).toBe(true)
  })

  test("labels staged work as eligible sync activity", () => {
    expect(
      buildSyncStatusPresentation({
        appliedCount: 0,
        isOfflineMode: false,
        offlineAllowed: true,
        pendingCount: 0,
        reviewCount: 1,
        syncCount: 1,
      }),
    ).toMatchObject({
      activityTitle: "Action needed",
      syncLabel: "Sync 1 change",
    })
  })

  test("uses operator-safe errors instead of raw server details", () => {
    expect(SYNC_STATUS_COPY.syncError).not.toContain("TRPC")
    expect(SYNC_STATUS_COPY.syncError).not.toContain("Prisma")
    expect(SYNC_STATUS_COPY.policySaveError).not.toContain("TRPC")
    expect(SYNC_STATUS_COPY.reviewError).not.toContain("Prisma")
    expect(SYNC_STATUS_COPY.localConflict).not.toContain("CatalogError")
    expect(SYNC_STATUS_COPY.serverConflict).not.toContain("Zod")
  })

  test("uses local review work when the server review query is unavailable", () => {
    expect(
      resolveReviewCount({
        canManageReviews: false,
        localCount: 2,
        serverCount: undefined,
      }),
    ).toBe(2)
    expect(
      resolveReviewCount({
        canManageReviews: true,
        localCount: 2,
        serverCount: 1,
      }),
    ).toBe(1)
  })
})
