import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  getServiceCommerceQuoteReleaseSettings,
  listPendingServiceCommerceQuoteApprovals,
  resolveQuoteReleaseRuntimeFacts,
  updateServiceCommerceQuoteReleaseSettings,
} from "./service-commerce-quote-release"

describe("Service Commerce quotation release repository", () => {
  test("resolves exact Tenant/Store assignments and the typed compatibility default", async () => {
    const predicates: unknown[] = []
    const db = {
      membership: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return { id: "membership-1", status: "ACTIVE" }
        },
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return null
        },
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async (input: { where: unknown }) => {
          predicates.push(input.where)
          return []
        },
      },
    }
    const result = await resolveQuoteReleaseRuntimeFacts(db as never, {
      actorUserId: "user-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(result).toMatchObject({
      actor: { attendantActive: true, membershipId: "membership-1" },
      compatibilityDefault: true,
      policy: { mode: "attendant_can_release", revision: 0 },
    })
    expect(predicates).toContainEqual({
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(predicates).toContainEqual(
      expect.objectContaining({ storeId: "store-1", tenantId: "tenant-1" }),
    )
  })

  test("requires a Store attendant assignment after the release policy is persisted", async () => {
    const db = {
      membership: {
        findFirst: async () => ({
          id: "membership-1",
          role: "MEMBER",
          status: "ACTIVE",
        }),
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => ({
          mode: "ATTENDANT_CAN_RELEASE",
          revision: 1,
          selectedApproverMembershipIds: [],
        }),
      },
      serviceCommerceStoreTeamAssignment: { findMany: async () => [] },
    }
    await expect(
      resolveQuoteReleaseRuntimeFacts(db as never, {
        actorUserId: "user-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({
      actor: { attendantActive: false },
      compatibilityDefault: false,
      policy: { mode: "attendant_can_release", revision: 1 },
    })
  })

  test("returns only accepted memberships as approval configuration options", async () => {
    const db = {
      membership: {
        findFirst: async () => ({ id: "manager-1" }),
        findMany: async (input: { where: unknown }) => {
          expect(input.where).toEqual(
            expect.objectContaining({
              acceptedAt: { not: null },
              status: "ACTIVE",
              tenantId: "tenant-1",
            }),
          )
          return [
            {
              id: "membership-2",
              user: {
                displayName: "Ada",
                id: "user-2",
                name: "Ada Lovelace",
              },
            },
          ]
        },
      },
      serviceCommerceQuoteReleasePolicy: { findFirst: async () => null },
      serviceCommerceStoreTeamAssignment: { findMany: async () => [] },
      store: { findFirst: async () => ({ id: "store-1" }) },
    } as unknown as PrismaClient
    await expect(
      getServiceCommerceQuoteReleaseSettings(db, {
        actorUserId: "owner-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({
      policy: { mode: "attendant_can_release", persisted: false, revision: 0 },
      teamOptions: [
        { membershipId: "membership-2", name: "Ada", userId: "user-2" },
      ],
    })
  })

  test("fails before persistence when approval is enabled without a selected account", async () => {
    await expect(
      updateServiceCommerceQuoteReleaseSettings({} as PrismaClient, {
        actorUserId: "owner-1",
        clientOperationId: "policy-1",
        expectedRevision: 0,
        mode: "approval_required",
        reason: "Require commercial review",
        selectedApproverMembershipIds: [],
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })

  test("rejects a sole attendant selecting themselves as the only approver", async () => {
    const transaction = {
      membership: {
        findFirst: async () => ({ id: "membership-1" }),
        findMany: async () => [{ id: "membership-1", userId: "user-1" }],
      },
      serviceCommerceQuoteReleaseCommandReceipt: {
        findUnique: async () => null,
      },
      serviceCommerceQuoteReleasePolicy: { findFirst: async () => null },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [
          {
            membership: { userId: "user-1" },
            membershipId: "membership-1",
          },
        ],
      },
      store: { findFirst: async () => ({ id: "store-1" }) },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      updateServiceCommerceQuoteReleaseSettings(db, {
        actorUserId: "user-1",
        clientOperationId: "policy-self-approval",
        expectedRevision: 0,
        mode: "approval_required",
        reason: "Require commercial review",
        selectedApproverMembershipIds: ["membership-1"],
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })

  test("projects only scoped pending approvals and denies creator self-approval", async () => {
    const transaction = {
      commerceInquiry: { findFirst: async () => ({ id: "inquiry-1" }) },
      membership: {
        findFirst: async () => ({ id: "membership-creator", status: "ACTIVE" }),
      },
      serviceCommerceQuoteApproval: {
        findMany: async (input: { where: unknown }) => {
          expect(input.where).toEqual({
            status: "PENDING",
            storeId: "store-1",
            tenantId: "tenant-1",
          })
          return [
            {
              id: "approval-1",
              policyRevision: 2,
              quote: { currentVersionId: "version-1" },
              quoteId: "quote-1",
              quoteVersion: {
                createdAt: new Date("2026-08-11T00:00:00.000Z"),
                currencyCode: "NGN",
                expiresAt: null,
                totalMinor: 20_000_00,
                version: 1,
                status: "DRAFT",
              },
              quoteVersionId: "version-1",
              requestedAt: new Date("2026-08-11T00:00:00.000Z"),
              requesterMembershipId: "membership-creator",
              sourceId: "inquiry-1",
              sourceType: "COMMERCE_INQUIRY",
            },
          ]
        },
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => ({
          mode: "APPROVAL_REQUIRED",
          revision: 2,
          selectedApproverMembershipIds: [
            "membership-creator",
            "membership-reviewer",
          ],
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [
          { capability: "ATTENDANT", membershipId: "membership-creator" },
          {
            capability: "QUOTE_APPROVER",
            membershipId: "membership-creator",
          },
          {
            capability: "QUOTE_APPROVER",
            membershipId: "membership-reviewer",
          },
        ],
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient
    await expect(
      listPendingServiceCommerceQuoteApprovals(db, {
        actorUserId: "creator-user",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject([{ canApprove: false, canReject: false }])
  })

  test("atomically supersedes an expired pending approval during queue reconciliation", async () => {
    const approvalWrites: unknown[] = []
    const versionWrites: unknown[] = []
    const auditWrites: unknown[] = []
    const transaction = {
      commerceInquiry: { findFirst: async () => ({ id: "inquiry-1" }) },
      commerceQuoteVersion: {
        updateMany: async (input: unknown) => {
          versionWrites.push(input)
          return { count: 1 }
        },
      },
      membership: {
        findFirst: async () => ({
          id: "membership-reviewer",
          role: "ADMIN",
          status: "ACTIVE",
        }),
      },
      serviceCommerceQuoteApproval: {
        findMany: async () => [
          {
            id: "approval-expired",
            policyRevision: 3,
            quote: { currentVersionId: "version-expired" },
            quoteId: "quote-1",
            quoteVersion: {
              createdAt: new Date("2026-08-10T00:00:00.000Z"),
              currencyCode: "NGN",
              expiresAt: new Date("2026-08-10T01:00:00.000Z"),
              status: "DRAFT",
              totalMinor: 30_000_00,
              version: 1,
            },
            quoteVersionId: "version-expired",
            requestedAt: new Date("2026-08-10T00:00:00.000Z"),
            requesterMembershipId: "membership-maker",
            sourceId: "inquiry-1",
            sourceType: "COMMERCE_INQUIRY",
          },
        ],
        updateMany: async (input: unknown) => {
          approvalWrites.push(input)
          return { count: 1 }
        },
      },
      serviceCommerceQuoteApprovalAuditEvent: {
        create: async (input: unknown) => {
          auditWrites.push(input)
          return input
        },
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => ({
          mode: "APPROVAL_REQUIRED",
          revision: 3,
          selectedApproverMembershipIds: ["membership-reviewer"],
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [
          {
            capability: "QUOTE_APPROVER",
            membershipId: "membership-reviewer",
          },
        ],
      },
    }
    const transactionOptions: unknown[] = []
    const db = {
      $transaction: async (
        callback: (tx: typeof transaction) => unknown,
        options: unknown,
      ) => {
        transactionOptions.push(options)
        return callback(transaction)
      },
    } as unknown as PrismaClient

    await expect(
      listPendingServiceCommerceQuoteApprovals(db, {
        actorUserId: "reviewer-user",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual([])
    expect(approvalWrites).toHaveLength(1)
    expect(versionWrites).toHaveLength(1)
    expect(auditWrites).toHaveLength(1)
    expect(transactionOptions).toEqual([
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
    ])
  })
})
