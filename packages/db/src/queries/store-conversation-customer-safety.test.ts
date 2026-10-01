import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { StoreConversationGuestCredentialPurpose } from "../../generated/prisma/enums"
import {
  listOpenStoreConversationSafetyReports,
  reportCustomerStoreConversation,
  reportStoreConversationAsOperator,
  setCustomerStoreConversationBlock,
  updateStoreConversationSafetyReportStatus,
} from "./store-conversation-customer-safety"
import { StoreConversationError } from "./store-conversations-core"

function fixture() {
  let blockedAt: Date | null = null
  const reports: Record<string, unknown>[] = []
  const commands: Record<string, unknown>[] = []
  const db = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    $queryRaw: async () => [{ id: "conversation_1" }],
    storeConversation: {
      findFirst: async () => ({
        id: "conversation_1",
        customerBlockedAt: blockedAt,
      }),
      update: async ({
        data,
      }: { data: { customerBlockedAt: Date | null } }) => {
        blockedAt = data.customerBlockedAt
        return { id: "conversation_1", customerBlockedAt: blockedAt }
      },
    },
    storeConversationMessage: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === "message_1" ? { id: "message_1" } : null,
    },
    storeConversationCustomerReport: {
      findUnique: async ({
        where,
      }: {
        where: {
          conversationId_principalKind_principalId_clientOperationId: {
            clientOperationId: string
          }
        }
      }) =>
        reports.find(
          (row) =>
            row.clientOperationId ===
            where.conversationId_principalKind_principalId_clientOperationId
              .clientOperationId,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `report_${reports.length + 1}` }
        reports.push(row)
        return row
      },
      findMany: async () => reports,
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "report_1",
        ...data,
      }),
    },
    storeConversationCustomerBlockCommand: {
      findUnique: async ({
        where,
      }: {
        where: {
          conversationId_principalKind_principalId_clientOperationId: {
            clientOperationId: string
          }
        }
      }) =>
        commands.find(
          (row) =>
            row.clientOperationId ===
            where.conversationId_principalKind_principalId_clientOperationId
              .clientOperationId,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: `command_${commands.length + 1}`,
          createdAt: new Date(),
        }
        commands.push(row)
        return row
      },
    },
    membership: { findFirst: async () => ({ id: "membership_1" }) },
    user: { findUnique: async () => ({ isPlatformAdmin: true }) },
  }
  return {
    db: db as unknown as PrismaClient,
    reports,
    commands,
    getBlockedAt: () => blockedAt,
  }
}

const reportInput = {
  clientOperationId: "customer-report-1",
  conversationId: "conversation_1",
  publicToken: "entry_1",
  messageId: "message_1",
  reason: "harassment" as const,
  details: "Repeated abusive message",
}

function customerDependencies() {
  const scopes: unknown[] = []
  return {
    scopes,
    dependencies: {
      resolveEntry: async () => ({ storeId: "store_1", tenantId: "tenant_1" }),
      loadGuest: async (_db: unknown, scope: unknown) => {
        scopes.push(scope)
        return {
          conversation: { id: "conversation_1" },
          credential: { guestIdentityId: "guest_1" },
        }
      },
      loadAccount: async (_db: unknown, scope: unknown) => {
        scopes.push(scope)
        return { conversation: { id: "conversation_1" } }
      },
    } as never,
  }
}

describe("Store Conversation customer safety", () => {
  test("Guest report binds exact entry scope, credential purpose, message and replay payload", async () => {
    const { db, reports } = fixture()
    const { scopes, dependencies } = customerDependencies()
    const principal = {
      kind: "guest" as const,
      credentialToken: "secret",
      installationToken: "installation",
      purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
    }
    const first = await reportCustomerStoreConversation(
      db,
      reportInput,
      principal,
      dependencies,
    )
    const replay = await reportCustomerStoreConversation(
      db,
      reportInput,
      principal,
      dependencies,
    )
    expect(first).toMatchObject({ reportId: "report_1", replayed: false })
    expect(replay).toMatchObject({ reportId: "report_1", replayed: true })
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      tenantId: "tenant_1",
      storeId: "store_1",
      principalKind: "CUSTOMER_GUEST",
      principalId: "guest_1",
      messageId: "message_1",
    })
    expect(scopes[0]).toMatchObject({
      storeId: "store_1",
      tenantId: "tenant_1",
      purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
      installationToken: "installation",
    })
    await expect(
      reportCustomerStoreConversation(
        db,
        { ...reportInput, details: "changed" },
        principal,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      reportCustomerStoreConversation(
        db,
        {
          ...reportInput,
          clientOperationId: "customer-report-2",
          messageId: "foreign_message",
        },
        principal,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("linked Customer block is independent and payload-bound", async () => {
    const { db, getBlockedAt, commands } = fixture()
    const { scopes, dependencies } = customerDependencies()
    const principal = { kind: "account" as const, accountUserId: "customer_1" }
    const input = {
      clientOperationId: "customer-block-1",
      conversationId: "conversation_1",
      publicToken: "entry_1",
      blocked: true,
    }
    expect(
      await setCustomerStoreConversationBlock(
        db,
        input,
        principal,
        dependencies,
      ),
    ).toMatchObject({ blocked: true, replayed: false })
    expect(getBlockedAt()).toBeInstanceOf(Date)
    expect(
      await setCustomerStoreConversationBlock(
        db,
        input,
        principal,
        dependencies,
      ),
    ).toMatchObject({ blocked: true, replayed: true })
    expect(commands).toHaveLength(1)
    expect(scopes[0]).toMatchObject({
      accountUserId: "customer_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    await expect(
      setCustomerStoreConversationBlock(
        db,
        { ...input, blocked: false },
        principal,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("Store operator report requires active tenant membership and scoped Store conversation", async () => {
    const { db, reports } = fixture()
    const result = await reportStoreConversationAsOperator(db, {
      actorUserId: "operator_1",
      tenantId: "tenant_1",
      storeId: "store_1",
      conversationId: "conversation_1",
      clientOperationId: "operator-report-1",
      reason: "spam",
    })
    expect(result).toMatchObject({ reportId: "report_1", replayed: false })
    expect(reports[0]).toMatchObject({
      principalKind: "STORE_OPERATOR",
      principalId: "membership_1",
    })
    const denied = fixture()
    ;(denied.db.membership.findFirst as unknown as () => Promise<null>) =
      async () => null
    await expect(
      reportStoreConversationAsOperator(denied.db, {
        actorUserId: "operator_1",
        tenantId: "tenant_1",
        storeId: "store_1",
        conversationId: "conversation_1",
        clientOperationId: "operator-report-2",
        reason: "spam",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("only a platform admin can read and resolve safety reports", async () => {
    const { db } = fixture()
    ;(db.user.findUnique as unknown as () => Promise<{
      isPlatformAdmin: boolean
    }>) = async () => ({ isPlatformAdmin: false })
    await expect(
      listOpenStoreConversationSafetyReports(db, { actorUserId: "merchant_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      updateStoreConversationSafetyReportStatus(db, {
        actorUserId: "merchant_1",
        reportId: "report_1",
        status: "RESOLVED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("safety review requires an ordered transition and preserves the first resolution", async () => {
    const report: {
      id: string
      status: "OPEN" | "REVIEWING" | "RESOLVED"
      resolvedAt: Date | null
      reviewedByUserId: string | null
    } = {
      id: "report_1",
      status: "OPEN",
      resolvedAt: null,
      reviewedByUserId: null,
    }
    let writes = 0
    const db = {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
      user: { findUnique: async () => ({ isPlatformAdmin: true }) },
      storeConversationCustomerReport: {
        findUnique: async () => ({ ...report }),
        update: async ({
          data,
        }: {
          data: {
            status: "REVIEWING" | "RESOLVED"
            reviewedByUserId: string
            resolvedAt: Date | null
          }
        }) => {
          writes += 1
          Object.assign(report, data)
          return { ...report }
        },
      },
    } as unknown as PrismaClient
    const transition = (
      actorUserId: string,
      status: "REVIEWING" | "RESOLVED",
    ) =>
      updateStoreConversationSafetyReportStatus(db, {
        actorUserId,
        reportId: report.id,
        status,
      })

    await expect(transition("reviewer_1", "RESOLVED")).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(writes).toBe(0)

    await transition("reviewer_1", "REVIEWING")
    await transition("reviewer_2", "REVIEWING")
    expect(report.reviewedByUserId).toBe("reviewer_1")
    expect(writes).toBe(1)

    const resolved = await transition("reviewer_2", "RESOLVED")
    expect(resolved.resolvedAt).toBeInstanceOf(Date)
    const resolvedAt = resolved.resolvedAt
    await transition("reviewer_1", "RESOLVED")
    expect(report.reviewedByUserId).toBe("reviewer_2")
    expect(report.resolvedAt).toBe(resolvedAt)
    expect(writes).toBe(2)
    await expect(transition("reviewer_1", "REVIEWING")).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })

  test("pages every open report in stable order and exposes count-only overflow", async () => {
    const createdAt = new Date("2026-09-28T12:00:00.000Z")
    const source = Array.from({ length: 105 }, (_, index) => ({
      id: `report_${String(index).padStart(3, "0")}`,
      createdAt,
      status: "OPEN",
      reason: "spam",
      details: "optional report detail",
      principalId: "private-principal",
      clientOperationId: "private-operation",
    }))
    source.push({
      id: "reviewing_1",
      createdAt,
      status: "REVIEWING",
      reason: "spam",
      details: "optional report detail",
      principalId: "private-principal",
      clientOperationId: "private-operation",
    })
    const selects: Array<Record<string, boolean>> = []
    const db = {
      user: {
        findUnique: async () => ({ isPlatformAdmin: true }),
      },
      storeConversationCustomerReport: {
        count: async ({ where }: { where: { status: unknown } }) =>
          source.filter((row) =>
            typeof where.status === "string"
              ? row.status === where.status
              : (where.status as { in: string[] }).in.includes(row.status),
          ).length,
        findMany: async ({
          orderBy,
          select,
          take,
          where,
        }: {
          orderBy: unknown
          select: Record<string, boolean>
          take: number
          where: {
            status: string
            OR?: Array<{ createdAt: unknown; id?: { gt: string } }>
          }
        }) => {
          expect(orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }])
          selects.push(select)
          const cursorId = where.OR?.[1]?.id?.gt
          return source
            .filter(
              (row) =>
                row.status === where.status && (!cursorId || row.id > cursorId),
            )
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, take)
            .map((row) =>
              Object.fromEntries(
                Object.entries(row).filter(([key]) => select[key]),
              ),
            )
        },
      },
    } as unknown as PrismaClient

    const first = await listOpenStoreConversationSafetyReports(db, {
      actorUserId: "platform-admin",
      limit: 100,
    })
    expect(first.reports).toHaveLength(100)
    expect(first.reports[0]?.id).toBe("report_000")
    expect(first.reports.at(-1)?.id).toBe("report_099")
    expect(first).toMatchObject({
      hasMore: true,
      matchingCount: 105,
      pendingCount: 106,
      nextCursor: {
        createdAt: createdAt.toISOString(),
        id: "report_099",
      },
    })
    const second = await listOpenStoreConversationSafetyReports(db, {
      actorUserId: "platform-admin",
      cursor: first.nextCursor ?? undefined,
      limit: 100,
    })
    expect(second.reports.map((row) => row.id)).toEqual([
      "report_100",
      "report_101",
      "report_102",
      "report_103",
      "report_104",
    ])
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeNull()
    expect(selects[0]).not.toHaveProperty("principalId")
    expect(selects[0]).not.toHaveProperty("clientOperationId")
    expect(first.reports[0]).not.toHaveProperty("principalId")
  })
})
