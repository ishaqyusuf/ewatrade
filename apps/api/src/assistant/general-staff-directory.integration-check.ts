import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { listStaffDirectoryPage } from "@ewatrade/db/queries"
import { retailOpsRouter } from "../trpc/routers/retail-ops"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

/** Read-only actual canonical/router/tool checks in an exact classified QA Tenant. */
export async function verifyStaffDirectoryReads(
  ctx: GeneralContext,
  conversationId: string,
) {
  const db = ctx.db,
    tenantId = ctx.tenantContext.tenant.id
  await db.tenant.findFirstOrThrow({
    where: { id: tenantId, dataClassification: "QA" },
    select: { id: true },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      ownerUserId: ctx.session.user.id,
      purpose: "GENERAL",
      storeId: ctx.tenantContext.activeStore?.id,
    },
    select: { id: true },
  })
  const facts = async () =>
    (
      await db.$queryRaw<Array<{ facts: unknown }>>`SELECT jsonb_build_object(
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffAccessAuditEvent" a WHERE a."tenantId"=${tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${tenantId}),
    'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "AssistantActionProposal" p WHERE p."tenantId"=${tenantId})
  ) AS facts`
    )[0]!.facts
  const before = await facts()
  const expected = await db.membership.findMany({
    where: { tenantId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      role: true,
      status: true,
      user: { select: { email: true } },
    },
  })
  if (!expected.length) throw Error("Owned QA membership required")
  const caller = retailOpsRouter.createCaller(ctx)
  const first = await caller.staffDirectoryPage({ limit: 1 })
  expect(first.total).toBe(expected.length)
  expect(first.data.map((m) => m.membershipId)).toEqual([expected[0]!.id])
  const second = first.nextCursor
    ? await caller.staffDirectoryPage({ limit: 1, cursor: first.nextCursor })
    : null
  if (second) {
    expect(second.total).toBe(expected.length)
    expect(second.data.map((m) => m.membershipId)).toEqual([expected[1]!.id])
  } else {
    expect(expected.length).toBe(1)
    expect(first.nextCursor).toBeNull()
  }
  const active = await caller.staffDirectoryPage({
    limit: 100,
    status: "ACTIVE",
  })
  expect(active.total).toBe(
    expected.filter((m) => m.status === "ACTIVE").length,
  )
  expect(active.data.map((m) => m.membershipId)).toEqual(
    expected
      .filter((m) => m.status === "ACTIVE")
      .slice(0, 100)
      .map((m) => m.id),
  )
  const currentStoreId = ctx.tenantContext.activeStore!.id
  const assigned = await db.membership.findMany({
    where: {
      tenantId,
      staffStoreAssignments: {
        some: { tenantId, storeId: currentStoreId, status: "ACTIVE" },
      },
    },
    orderBy: { id: "asc" },
    select: { id: true },
  })
  const storePage = await caller.staffDirectoryPage({
    assignmentStoreId: currentStoreId,
    limit: 100,
  })
  expect(storePage.scope).toBe("active_store_assignments")
  expect(storePage.total).toBe(assigned.length)
  expect(storePage.data.map((m) => m.membershipId)).toEqual(
    assigned.slice(0, 100).map((m) => m.id),
  )
  if (first.nextCursor)
    await expect(caller.staffDirectoryPage({
      limit: 1, cursor: first.nextCursor, status: "SUSPENDED",
    })).rejects.toThrow("original staff directory filters")
  await expect(
    listStaffDirectoryPage(db, {
      tenantId,
      actorUserId: randomUUID(),
      limit: 10,
    }),
  ).rejects.toThrow("staff-management access")
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    ctx,
    conversationId,
    () => {
      throw Error("Staff read drafted a mutation")
    },
    (answer) => answers.push(answer),
  )
  async function read(name: string, input: unknown) {
    const execute = tools[name]?.execute
    if (!execute) throw Error(`Staff tool missing: ${name}`)
    return execute(input, { toolCallId: randomUUID(), messages: [] })
  }
  const directory = await read("readStaffDirectory", {})
  expect(structuredClone(directory)).toMatchObject({
    status: "available",
    data: { total: expected.length, scope: "tenant_memberships" },
  })
  const exact = await read("readStaffMember", { membershipId: expected[0]!.id })
  expect(structuredClone(exact)).toMatchObject({
    status: "available",
    data: {
      membershipId: expected[0]!.id,
      email: expected[0]!.user.email,
      historyCoverage: "not_read",
    },
  })
  const empty = await read("readStaffDirectory", { search: randomUUID() })
  expect(structuredClone(empty)).toMatchObject({
    status: "available",
    data: { total: 0, data: [], nextCursor: null },
  })
  const foreign = await db.membership.findFirstOrThrow({
    where: {
      tenantId: { not: tenantId },
      tenant: { dataClassification: "QA" },
    },
    select: { id: true, tenantId: true },
  })
  const foreignStore = await db.store.findFirstOrThrow({
    where: { tenantId: foreign.tenantId },
    select: { id: true },
  })
  const foreignMember = await read("readStaffMember", {
    membershipId: foreign.id,
  })
  expect(structuredClone(foreignMember)).toMatchObject({
    status: "unavailable",
  })
  const foreignStoreRead = await read("readStaffDirectory", {
    assignmentStoreId: foreignStore.id,
  })
  expect(structuredClone(foreignStoreRead)).toMatchObject({
    status: "unavailable",
  })
  expect(answers.some((answer) => answer.value === "Unavailable")).toBe(true)
  const after = await facts()
  expect(after).toEqual(before)
  return {
    verified: true,
    matchingMemberships: expected.length,
    activeMemberships: active.total,
    assignedMemberships: assigned.length,
    first,
    second,
    directory,
    exact,
    empty,
    foreignMember,
    foreignStoreRead,
    answers,
    savedStaffFactsUnchanged: true,
    realPaginationVerified: second !== null,
  }
}
