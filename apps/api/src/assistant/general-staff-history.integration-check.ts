import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { listStaffHistoryPageInTransaction } from "@ewatrade/db/queries"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { createGeneralTools } from "./general-tools"
import type { GeneralContext } from "./general-context"

async function staffHistoryFacts(db: GeneralContext["db"], tenantId: string) {
  return (
    await db.$queryRaw<Array<{ facts: unknown }>>`SELECT jsonb_build_object(
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffAccessAuditEvent" a WHERE a."tenantId"=${tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${tenantId})
  ) AS facts`
  )[0]!.facts
}

/** Synthetic audit-row projection evidence only; no staff status/grant change, all writes roll back. */
export async function verifyStaffHistoryRollback(ctx: GeneralContext) {
  const db = ctx.db,
    tenantId = ctx.tenantContext.tenant.id,
    userId = ctx.session.user.id,
    storeId = ctx.tenantContext.activeStore!.id
  const member = await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: { dataClassification: "QA" },
    },
    select: { id: true },
  })
  const foreign = await db.membership.findFirstOrThrow({
    where: {
      tenantId: { not: tenantId },
      tenant: { dataClassification: "QA" },
    },
    select: { userId: true, tenantId: true },
  })
  const foreignStore = await db.store.findFirstOrThrow({
    where: { tenantId: foreign.tenantId },
    select: { id: true },
  })
  const before = await staffHistoryFacts(db, tenantId),
    nonce = randomUUID(),
    at = new Date(),
    end = new Date(at.getTime() + 1)
  let report: unknown = null,
    rolledBack = false
  const started = performance.now()
  try {
    await db.$transaction(
      async (tx) => {
        const [existingLifecycle, existingAccess] = await Promise.all([
          tx.retailOpsStaffLifecycleEvent.count({
            where: { tenantId, happenedAt: at },
          }),
          tx.staffAccessAuditEvent.count({
            where: { tenantId, createdAt: at },
          }),
        ])
        expect(existingLifecycle + existingAccess).toBe(0)
        await tx.retailOpsStaffLifecycleEvent.createMany({
          data: [
            {
              id: `${nonce}-l3`,
              tenantId,
              membershipId: member.id,
              staffUserId: userId,
              actorUserId: userId,
              type: "SUSPENDED",
              fromStatus: "ACTIVE",
              toStatus: "SUSPENDED",
              happenedAt: at,
              reason: "QA synthetic history projection; rolls back",
            },
            {
              id: `${nonce}-l2`,
              tenantId,
              membershipId: member.id,
              staffUserId: userId,
              actorUserId: foreign.userId,
              type: "REACTIVATED",
              fromStatus: "SUSPENDED",
              toStatus: "ACTIVE",
              happenedAt: at,
            },
            {
              id: `${nonce}-l1`,
              tenantId,
              staffUserId: foreign.userId,
              actorUserId: userId,
              type: "INVITED",
              toStatus: "INVITED",
              happenedAt: at,
            },
          ],
        })
        const snapshot = {
          mode: "SCOPED",
          catalogEditor: true,
          defaultStoreId: storeId,
          assignments: [
            { storeId, role: "MANAGER", status: "ACTIVE" },
            { storeId: foreignStore.id, role: "MANAGER" },
          ],
          privateToken: "QA_PRIVATE_SNAPSHOT_DO_NOT_EXPOSE",
        }
        await tx.staffAccessAuditEvent.createMany({
          data: [
            {
              id: `${nonce}-a2`,
              tenantId,
              membershipId: member.id,
              actorUserId: userId,
              operation: "access_changed",
              revision: 2147000001,
              before: snapshot,
              after: { mode: "SCOPED", assignments: [], catalogEditor: false },
              createdAt: at,
            },
            {
              id: `${nonce}-a1`,
              tenantId,
              membershipId: member.id,
              actorUserId: userId,
              operation: "scoped_access_confirmed",
              revision: 2147000002,
              after: snapshot,
              createdAt: at,
            },
          ],
        })
        const input = {
          tenantId,
          actorUserId: userId,
          from: at.toISOString(),
          to: end.toISOString(),
          limit: 2,
        }
        const first = await listStaffHistoryPageInTransaction(tx, input)
        expect(first.total).toBe(5)
        expect(first.data.map((e) => e.id)).toEqual([
          `${nonce}-l3`,
          `${nonce}-l2`,
        ])
        expect(first.data[1]!.actor.coverage).toBe("unavailable")
        const second = await listStaffHistoryPageInTransaction(tx, {
          ...input,
          cursor: first.nextCursor!,
        })
        expect(second.total).toBe(5)
        expect(second.data.map((e) => e.id)).toEqual([
          `${nonce}-l1`,
          `${nonce}-a2`,
        ])
        expect(second.data[0]!.subject.coverage).toBe("unavailable")
        const third = await listStaffHistoryPageInTransaction(tx, {
          ...input,
          cursor: second.nextCursor!,
        })
        expect(third.data.map((e) => e.id)).toEqual([`${nonce}-a1`])
        expect(third.nextCursor).toBeNull()
        const store = await listStaffHistoryPageInTransaction(tx, {
          ...input,
          storeId,
          limit: 10,
        })
        expect(store.total).toBe(2)
        expect(store.coverage.lifecycle).toBe("not_requested")
        expect(store.data.map((e) => e.id)).toEqual([
          `${nonce}-a2`,
          `${nonce}-a1`,
        ])
        const actor = await listStaffHistoryPageInTransaction(tx, {
          ...input,
          actorMembershipId: member.id,
          limit: 10,
        })
        expect(actor.total).toBe(4)
        const serialized = JSON.stringify([first, second, third, store, actor])
        expect(serialized).not.toContain(foreign.userId)
        expect(serialized).not.toContain(foreignStore.id)
        expect(serialized).not.toContain("QA_PRIVATE_SNAPSHOT_DO_NOT_EXPOSE")
        expect(first.coverage.history).toBe("partial")
        report = {
          first,
          second,
          third,
          store,
          actor,
          exactFiveEventsVerified: true,
          syntheticAuditRowsOnly: true,
        }
        throw Error("STAFF_HISTORY_PROJECTION_ROLLBACK")
      },
      { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STAFF_HISTORY_PROJECTION_ROLLBACK"
    )
      rolledBack = true
    else throw error
  }
  expect(rolledBack).toBe(true)
  expect(await staffHistoryFacts(db, tenantId)).toEqual(before)
  return {
    verified: true,
    report,
    elapsedMs: performance.now() - started,
    allSavedStaffFactsUnchanged: true,
    noStaffStatusOrGrantChange: true,
  }
}

/** Actual fresh protected router and General tool reads, without mutation/model execution. */
export async function verifyStaffHistoryToolReads(
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
      storeId: ctx.tenantContext.activeStore!.id,
    },
    select: { id: true },
  })
  const before = await staffHistoryFacts(db, tenantId)
  const [count] = await db.$queryRaw<
    Array<{ total: number }>
  >`SELECT ((SELECT count(*) FROM "RetailOpsStaffLifecycleEvent" WHERE "tenantId"=${tenantId})+(SELECT count(*) FROM "StaffAccessAuditEvent" WHERE "tenantId"=${tenantId}))::int AS total`
  const foreign = await db.membership.findFirstOrThrow({
    where: {
      tenantId: { not: tenantId },
      tenant: { dataClassification: "QA" },
    },
    select: { id: true, tenantId: true },
  })
  const store = await db.store.findFirstOrThrow({
    where: { tenantId: foreign.tenantId },
    select: { id: true },
  })
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    ctx,
    conversationId,
    () => {
      throw Error("History read drafted a mutation")
    },
    (answer) => answers.push(answer),
  )
  const execute = tools.readStaffHistory?.execute
  if (!execute)
    throw Error(
      "Planned history tool requires temporary test-process visibility",
    )
  const read = (input: unknown) =>
    execute(input, { toolCallId: randomUUID(), messages: [] })
  const all = await read({})
  expect(structuredClone(all)).toMatchObject({
    status: "available",
    data: {
      total: count!.total,
      scope: "tenant_staff_history",
      coverage: {
        history: "partial",
        lifecycle: "available",
        access: "available",
      },
    },
  })
  const foreignActor = await read({ actorMembershipId: foreign.id })
  const foreignStore = await read({ storeId: store.id })
  expect(structuredClone(foreignActor)).toMatchObject({ status: "unavailable" })
  expect(structuredClone(foreignStore)).toMatchObject({ status: "unavailable" })
  expect(answers).toHaveLength(3)
  expect(answers[0]!.detail).toContain(
    "Legacy writes may have no durable events",
  )
  expect(await staffHistoryFacts(db, tenantId)).toEqual(before)
  return {
    verified: true,
    recordedEvents: count!.total,
    all,
    foreignActor,
    foreignStore,
    answers,
    allSavedStaffFactsUnchanged: true,
  }
}
