import { describe, expect, test } from "bun:test"

import {
  getOfflineOperationsPolicy,
  updateOfflineOperationsPolicy,
} from "./offline-settings"
import type { DbClient } from "./types"

function createMockDb(enabled?: boolean, approvalRequired?: boolean) {
  const calls: Array<{
    kind: string
    query?: unknown
    select?: unknown
    where?: unknown
  }> = []
  const updatedAt = new Date("2026-07-24T10:00:00.000Z")
  let metadata = {
    billing: { planId: "starter" },
    ...(enabled === undefined ? {} : { offlineOperationsEnabled: enabled }),
    ...(approvalRequired === undefined
      ? {}
      : { offlineApprovalRequired: approvalRequired }),
  }
  const db = {
    $executeRaw: async (query: unknown) => {
      calls.push({ kind: "executeRaw", query })
      metadata = {
        ...metadata,
        offlineApprovalRequired: true,
        offlineOperationsEnabled: false,
      }
      return 1
    },
    tenant: {
      findUnique: async ({
        select,
        where,
      }: {
        select: unknown
        where: unknown
      }) => {
        calls.push({ kind: "findUnique", select, where })
        return { metadata, updatedAt }
      },
    },
  }

  return { calls, client: db as unknown as DbClient, updatedAt }
}

describe("offline operations policy", () => {
  test("defaults existing tenants to enabled when the policy is absent", async () => {
    const db = createMockDb()

    await expect(
      getOfflineOperationsPolicy(db.client, { tenantId: "tenant_123" }),
    ).resolves.toEqual({
      approvalRequired: false,
      enabled: true,
      updatedAt: db.updatedAt,
    })
    expect(db.calls[0]).toEqual({
      kind: "findUnique",
      select: { metadata: true, updatedAt: true },
      where: { id: "tenant_123" },
    })
  })

  test("updates only the requested tenant policy", async () => {
    const db = createMockDb(true, false)

    await expect(
      updateOfflineOperationsPolicy(db.client, {
        approvalRequired: true,
        enabled: false,
        tenantId: "tenant_123",
      }),
    ).resolves.toEqual({
      approvalRequired: true,
      enabled: false,
      updatedAt: db.updatedAt,
    })
    expect(db.calls[0]?.kind).toBe("executeRaw")
    expect(
      (db.calls[0]?.query as { values?: unknown[] } | undefined)?.values,
    ).toEqual([false, true, "tenant_123"])
    expect(db.calls[1]).toEqual({
      kind: "findUnique",
      select: { metadata: true, updatedAt: true },
      where: { id: "tenant_123" },
    })
  })
})
