import { describe, expect, test } from "bun:test"

import { Prisma } from "../../generated/prisma/client"
import {
  MembershipRole,
  ServiceCommercePolicyAuditEventType,
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
} from "../../generated/prisma/enums"
import {
  type ServiceCommercePolicyError,
  evaluateServiceCommercePolicyBatchInTransaction,
  getServiceCommercePolicyDecisionDetail,
  listServiceCommercePolicyDecisions,
  revokeServiceCommercePolicyDecision,
  setServiceCommercePolicyDecision,
} from "./service-commerce-policy"

const now = new Date()
const effectiveAt = new Date(now.getTime() - 60_000)
const expiresAt = new Date(now.getTime() + 60_000)

function row(overrides: Record<string, unknown> = {}) {
  return {
    approvalReference: "release-approval-1",
    channel: ServiceCommercePolicyChannel.WEB,
    effectiveAt,
    evidenceReference: "private-evidence-1",
    expiresAt,
    id: "decision-1",
    jurisdictionCode: "NG",
    licenceReference: "private-licence-1",
    outcome: ServiceCommercePolicyOutcome.ALLOWED,
    reason: "Reviewed release policy",
    reviewedByUserId: "reviewer-1",
    revision: 1,
    revokedAt: null,
    storeId: "store-1",
    subject: ServiceCommercePolicySubject.INTAKE,
    tenantId: "tenant-1",
    vertical: ServiceCommercePolicyVertical.SERVICE,
    ...overrides,
  }
}

function createDb(input?: {
  createError?: unknown
  decisions?: ReturnType<typeof row>[]
  managerRole?: MembershipRole | null
  reviewerRole?: MembershipRole | null
  storeCountry?: string | null
}) {
  const calls: Array<{ data: Record<string, unknown>; name: string }> = []
  const decisions = input?.decisions ?? [row()]
  const client = {
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation(client),
    membership: {
      findFirst: async ({ where }: { where: { userId: string } }) => {
        const role =
          where.userId === "reviewer-1"
            ? (input?.reviewerRole ?? MembershipRole.OWNER)
            : (input?.managerRole ?? MembershipRole.OWNER)
        return role ? { role } : null
      },
    },
    serviceCommercePolicyAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, name: "audit.create" })
        return { id: "audit-1" }
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        for (const entry of data)
          calls.push({ data: entry, name: "audit.createMany" })
        return { count: data.length }
      },
    },
    serviceCommercePolicyDecision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (input?.createError) throw input.createError
        const created = row({ ...data, id: "created-1", revision: 1 })
        decisions.push(created)
        return created
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        decisions.find(
          (decision) =>
            decision.id === where.id &&
            decision.storeId === where.storeId &&
            decision.tenantId === where.tenantId,
        ) ?? null,
      findMany: async () => decisions,
      findUnique: async () => decisions[0] ?? null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const current = decisions[0]
        if (!current) throw new Error("Expected a policy decision to update")
        const updated = row({
          ...current,
          ...data,
          revision: current.revision + 1,
        })
        decisions[0] = updated
        return updated
      },
    },
    store: {
      findFirst: async () => ({
        countryCode:
          input?.storeCountry === undefined ? "NG" : input.storeCountry,
        id: "store-1",
      }),
    },
  }
  return { calls, client }
}

const scope = {
  channel: "web" as const,
  storeId: "store-1",
  subject: "intake" as const,
  tenantId: "tenant-1",
  vertical: "service" as const,
}

const setInput = {
  ...scope,
  approvalReference: "release-approval-1",
  effectiveAt,
  evidenceReference: "private-evidence-1",
  expectedRevision: 0,
  expiresAt,
  jurisdictionCode: "NG",
  outcome: "allowed" as const,
  reason: "Reviewed release policy",
  reviewedByUserId: "reviewer-1",
}

describe("Service Commerce policy decisions", () => {
  test("evaluates an exact tenant/store decision and never returns its private evidence", async () => {
    const { calls, client } = createDb()
    const [evaluation] = await evaluateServiceCommercePolicyBatchInTransaction(
      client as never,
      {
        actorUserId: "user-1",
        purpose: "test",
        scopes: [scope],
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    )

    expect(evaluation).toMatchObject({
      outcome: "allowed",
      reason: "policy_allowed",
    })
    expect(JSON.stringify(evaluation)).not.toContain("private-evidence-1")
    expect(calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          type: ServiceCommercePolicyAuditEventType.READ,
        }),
        name: "audit.createMany",
      }),
    )
  })

  test("fails closed for a decision belonging to a different jurisdiction and for expired or revoked approval", async () => {
    for (const decision of [
      row({ jurisdictionCode: "GH" }),
      row({ expiresAt: new Date(now.getTime() - 1) }),
      row({ revokedAt: now }),
    ]) {
      const { client } = createDb({ decisions: [decision] })
      const [evaluation] =
        await evaluateServiceCommercePolicyBatchInTransaction(client as never, {
          actorUserId: "user-1",
          purpose: "test",
          scopes: [scope],
          storeId: "store-1",
          tenantId: "tenant-1",
        })
      expect(evaluation).toBeDefined()
      expect(evaluation?.outcome).not.toBe("allowed")
    }
  })

  test("blocks an unauthorized override but records the denied attempt", async () => {
    const { calls, client } = createDb({ managerRole: MembershipRole.MEMBER })
    await expect(
      setServiceCommercePolicyDecision(client as never, {
        ...setInput,
        actorUserId: "member-1",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<ServiceCommercePolicyError>)
    expect(calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
        }),
        name: "audit.create",
      }),
    )
  })

  test("rejects a stale optimistic revision before writing", async () => {
    const { calls, client } = createDb()
    await expect(
      setServiceCommercePolicyDecision(client as never, {
        ...setInput,
        actorUserId: "owner-1",
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<ServiceCommercePolicyError>)
    expect(calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: "policy_revision_conflict",
          type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
        }),
      }),
    )
  })

  test("audits jurisdiction mismatch before rejecting a policy change", async () => {
    const { calls, client } = createDb({ storeCountry: "GH" })
    await expect(
      setServiceCommercePolicyDecision(client as never, {
        ...setInput,
        actorUserId: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JURISDICTION" })
    expect(calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: "policy_jurisdiction_mismatch",
          type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
        }),
      }),
    )
  })

  test("translates a racing first-create unique conflict to the typed conflict", async () => {
    const { client } = createDb({
      decisions: [],
      createError: new Prisma.PrismaClientKnownRequestError("duplicate", {
        clientVersion: "test",
        code: "P2002",
      }),
    })
    await expect(
      setServiceCommercePolicyDecision(client as never, {
        ...setInput,
        actorUserId: "owner-1",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<ServiceCommercePolicyError>)
  })

  test("keeps evidence private in list responses and exposes it only to an authorized detail read", async () => {
    const { calls, client } = createDb()
    const list = await listServiceCommercePolicyDecisions(client as never, {
      actorUserId: "owner-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(JSON.stringify(list)).not.toContain("private-evidence-1")

    const detail = await getServiceCommercePolicyDecisionDetail(
      client as never,
      {
        actorUserId: "owner-1",
        decisionId: "decision-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    )
    expect(detail).toMatchObject({ evidenceReference: "private-evidence-1" })
    expect(calls.filter((call) => call.name === "audit.create")).toHaveLength(1)
  })

  test("audits unauthorized policy list and evidence detail reads", async () => {
    const { calls, client } = createDb({ managerRole: MembershipRole.MEMBER })
    await expect(
      listServiceCommercePolicyDecisions(client as never, {
        actorUserId: "member-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      getServiceCommercePolicyDecisionDetail(client as never, {
        actorUserId: "member-1",
        decisionId: "decision-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(
      calls.some(
        (call) =>
          call.data.purpose === "policy_decision_list_read_denied" &&
          call.data.observedOutcome === "denied",
      ),
    ).toBe(true)
    expect(
      calls.some(
        (call) =>
          call.data.purpose === "policy_evidence_detail_read_denied" &&
          call.data.observedOutcome === "denied",
      ),
    ).toBe(true)
  })

  test("revokes only the current revision and audits the revocation", async () => {
    const { calls, client } = createDb()
    const revoked = await revokeServiceCommercePolicyDecision(client as never, {
      actorUserId: "owner-1",
      decisionId: "decision-1",
      expectedRevision: 1,
      reason: "Meta approval withdrawn",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(revoked.revokedAt).toBeInstanceOf(Date)
    expect(revoked.revision).toBe(2)
    expect(calls).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          type: ServiceCommercePolicyAuditEventType.REVOKED,
        }),
        name: "audit.create",
      }),
    )
  })
})
