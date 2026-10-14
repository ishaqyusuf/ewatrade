import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import {
  createSimpleCatalogItemInTransaction,
  moveInventoryCustody,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

/**
 * G04 custody move through signed proposals on an owned QA Store. UNRUN until
 * a reviewed runner is scheduled on the guarded QA target. Each section is
 * independently callable: it creates its own synthetic Product and Store
 * balance (on hand 10, reserved 2) and depends on no other section's state,
 * so the runner can wrap each one in its own fully rolled-back transaction
 * and gate it on its own budget. The confirming Owner is the staff target
 * (Owners are canonical assignees), so no extra people are created.
 */
/** What a context-free section needs: a database and synthetic identities. */
export type CustodyBalanceEnv = {
  db: GeneralContext["db"]
  tenantId: string
  storeId: string
  userId: string
}
export type CustodyVerifierEnv = {
  ctx: GeneralContext
  failingDb: GeneralContext["db"]
  conversationId: string
}

/**
 * The minimal custody fixture: a synthetic Product (through the canonical
 * in-transaction catalog command, no extra savepoint) and a Store balance of
 * on hand 10, reserved 2. It needs no assistant context, session or terms.
 */
async function balanceFixture(env: CustodyBalanceEnv) {
  const { db, tenantId, storeId, userId } = env
  const item = await createSimpleCatalogItemInTransaction(
    db as unknown as Parameters<typeof createSimpleCatalogItemInTransaction>[0],
    {
      tenantId,
      storeId,
      actorUserId: userId,
      clientOperationId: randomUUID(),
      kind: "product",
      name: `Custody composition QA ${randomUUID().slice(0, 8)}`,
      canonicalUnitName: "Piece",
      priceMinor: 100,
    },
  )
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
    include: {
      productUnitOffering: {
        include: { inventoryUnit: { include: { configurationVersion: true } } },
      },
    },
  })
  const unit = offering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("QA custody unit missing")
  const store = await db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "10",
      reservedQuantity: "2",
    },
  })
  const staffBalance = () =>
    db.stockBalanceSource.findUnique({
      where: {
        storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
          storeId,
          variantId: offering.variantId,
          inventoryUnitId: unit.id,
          custodyType: "STAFF",
          custodyReferenceId: userId,
        },
      },
    })
  const onHand = async (id: string) =>
    (
      await db.stockBalanceSource.findUniqueOrThrow({ where: { id } })
    ).onHandQuantity.toFixed()
  return { store, staffBalance, onHand }
}

async function fixture(env: CustodyVerifierEnv) {
  const original = env.ctx
  const db = original.db
  const tenantId = original.tenantContext.tenant.id
  const storeId = original.tenantContext.activeStore?.id
  const userId = original.session.user.id
  if (!storeId || original.tenantContext.tenant.dataClassification !== "QA")
    throw Error("Owned QA Store required")
  const headers = new Headers(original.requestHeaders)
  headers.set("x-assistant-client", "dashboard")
  const ctx: GeneralContext = { ...original, requestHeaders: headers }
  const balance = await balanceFixture({ db, tenantId, storeId, userId })
  const { store, staffBalance, onHand } = balance
  async function draft(action: GeneralAction) {
    const result = await draftGeneralProposal(ctx, env.conversationId, action)
    const row = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: result.proposalId },
    })
    const app = generalProposalForApp(row)
    const review = await generalProposalWithReview(ctx, row)
    expect(review.review?.length).toBeGreaterThan(0)
    return {
      proposalId: app.id,
      revision: app.revision,
      approvalToken: app.approvalToken,
      decision: "confirm" as const,
    }
  }
  const assign = (quantity: string, reason: string): GeneralAction => ({
    action: "stock_custody_move",
    sourceBalanceSourceId: store.id,
    target: { type: "staff", userId },
    quantity,
    reason,
  })
  /** A form (non-assistant) move through the canonical command. */
  const formMove = async (
    sourceId: string,
    target: "staff" | "store",
    quantity: string,
    reason: string,
  ) =>
    moveInventoryCustody(db, {
      actorUserId: userId,
      clientOperationId: randomUUID(),
      expectedSourceRevision: (
        await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: sourceId },
        })
      ).revision,
      quantity,
      reason,
      schemaVersion: 1,
      source: "qa",
      sourceBalanceSourceId: sourceId,
      targetCustodyReferenceId: target === "staff" ? userId : "",
      targetCustodyType: target,
      tenantId,
    })
  // Role changes always restore the member's actual prior role, read first.
  const membershipId = original.tenantContext.membership.id
  async function withRole(role: "CASHIER", run: () => Promise<void>) {
    const { role: prior } = await db.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { role: true },
    })
    await db.membership.update({ where: { id: membershipId }, data: { role } })
    try {
      await run()
    } finally {
      await db.membership.update({
        where: { id: membershipId },
        data: { role: prior },
      })
    }
  }
  return {
    ctx,
    db,
    tenantId,
    userId,
    store,
    staffBalance,
    onHand,
    draft,
    assign,
    formMove,
    withRole,
  }
}

/** A: more than on hand − reserved is refused before any draft is stored. */
export async function sectionRefusal(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  const before = await f.db.assistantActionProposal.count({
    where: { tenantId: f.tenantId },
  })
  // Only the custody adapter's own quantity refusal counts: a missing
  // conversation, an authority failure or any other rejection fails here,
  // and so does an unexpected success.
  await expect(
    draftGeneralProposal(
      f.ctx,
      env.conversationId,
      f.assign("9", "More than movable"),
    ),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Only 8 Piece can move: on hand 10, reserved 2.",
  })
  expect(
    await f.db.assistantActionProposal.count({
      where: { tenantId: f.tenantId },
    }),
  ).toBe(before)
  expect(await f.onHand(f.store.id)).toBe("10")
}

/** B: an injected receipt failure leaves no movement or custody balance. */
export async function sectionInjectedFailure(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  const first = await f.draft(f.assign("4", "QA delivery round"))
  await expect(
    withPerformanceTrace(
      "job",
      () => decideGeneralProposal({ ...f.ctx, db: env.failingDb }, first),
      (trace) => console.info("Custody rollback:", JSON.stringify(trace)),
    ),
  ).rejects.toThrow("Injected receipt failure")
  expect(await f.onHand(f.store.id)).toBe("10")
  expect(await f.staffBalance()).toBeNull()
}

/** C: confirmation moves once; a replay returns the same receipt. */
export async function sectionConfirmReplay(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  const proposal = await f.draft(f.assign("4", "QA delivery round"))
  const saved = await decideGeneralProposal(f.ctx, proposal)
  expect(saved.receipt?.kind).toBe("inventory")
  expect(await f.onHand(f.store.id)).toBe("6")
  expect((await f.staffBalance())?.onHandQuantity.toFixed()).toBe("4")
  expect((await decideGeneralProposal(f.ctx, proposal)).receipt).toEqual(
    saved.receipt,
  )
  expect(await f.onHand(f.store.id)).toBe("6")
}

/**
 * D: combined drift. A form return changes BOTH the drafted Store source and
 * the staff target, so this can pass on source drift alone; target-only
 * drift is UNRUN.
 */
export async function sectionCombinedDrift(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  await f.formMove(f.store.id, "staff", "3", "Earlier form assignment")
  const drifting = await f.draft(f.assign("1", "Second round"))
  const held = await f.staffBalance()
  if (!held) throw Error("Staff custody missing")
  await f.formMove(
    held.id,
    "store",
    "1",
    "Form return changes both the staff balance and the Store source",
  )
  await expect(decideGeneralProposal(f.ctx, drifting)).rejects.toThrow()
  expect(await f.onHand(f.store.id)).toBe("8")
}

/**
 * E: the canonical command's idempotency, without proposals. It needs no
 * assistant context, so it runs on the minimal balance fixture only.
 */
export async function sectionIdempotency(env: CustodyBalanceEnv) {
  const f = await balanceFixture(env)
  const revision = (
    await env.db.stockBalanceSource.findUniqueOrThrow({
      where: { id: f.store.id },
    })
  ).revision
  const keyed = {
    actorUserId: env.userId,
    clientOperationId: randomUUID(),
    expectedSourceRevision: revision,
    quantity: "1",
    reason: "Keyed move",
    schemaVersion: 1 as const,
    source: "qa",
    sourceBalanceSourceId: f.store.id,
    targetCustodyReferenceId: env.userId,
    targetCustodyType: "staff" as const,
    tenantId: env.tenantId,
  }
  const first = await moveInventoryCustody(env.db, keyed)
  expect((await moveInventoryCustody(env.db, keyed)).id).toBe(first.id)
  await expect(
    moveInventoryCustody(env.db, { ...keyed, quantity: "2" }),
  ).rejects.toThrow("already used with different input")
  expect(await f.onHand(f.store.id)).toBe("9")
}

/**
 * F: authority loss. A pending proposal and a completed one are both refused
 * under fresh role loss; the stored proposal, operations and balances stay.
 */
export async function sectionAuthorityLoss(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  const completed = await f.draft(f.assign("2", "Completed before role loss"))
  await decideGeneralProposal(f.ctx, completed)
  const pending = await f.draft(f.assign("1", "Pending at role loss"))
  const operationsBefore = await f.db.stockOperation.count({
    where: { tenantId: f.tenantId },
  })
  const storedBefore = await f.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: completed.proposalId },
  })
  await f.withRole("CASHIER", async () => {
    await expect(decideGeneralProposal(f.ctx, pending)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(decideGeneralProposal(f.ctx, completed)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    )
  })
  expect(
    await f.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: completed.proposalId },
    }),
  ).toEqual(storedBefore)
  expect(
    await f.db.stockOperation.count({ where: { tenantId: f.tenantId } }),
  ).toBe(operationsBefore)
  expect(await f.onHand(f.store.id)).toBe("8")
}

/**
 * G: a duplicate decision of one proposal records exactly one operation.
 * Under a serialized savepoint adapter the two decisions run one after the
 * other; cross-connection concurrency is UNRUN.
 */
export async function sectionDuplicate(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  const proposal = await f.draft(f.assign("1", "Duplicate round"))
  const { idempotencyKey } =
    await f.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: proposal.proposalId },
      select: { idempotencyKey: true },
    })
  await Promise.allSettled([
    decideGeneralProposal(f.ctx, proposal),
    decideGeneralProposal(f.ctx, proposal),
  ])
  expect(
    await f.db.stockOperation.count({
      where: { tenantId: f.tenantId, clientOperationId: idempotencyKey },
    }),
  ).toBe(1)
  expect(await f.onHand(f.store.id)).toBe("9")
  expect((await f.staffBalance())?.onHandQuantity.toFixed()).toBe("1")
}

/** H: a staff member's stock returns to the same Store. */
export async function sectionReturn(env: CustodyVerifierEnv) {
  const f = await fixture(env)
  await f.formMove(f.store.id, "staff", "5", "Form assignment to return")
  const held = await f.staffBalance()
  if (!held) throw Error("Staff custody missing")
  const back = await f.draft({
    action: "stock_custody_move",
    sourceBalanceSourceId: held.id,
    target: { type: "store" },
    quantity: "5",
    reason: "End of round",
  })
  const returned = await decideGeneralProposal(f.ctx, back)
  expect(returned.receipt?.title).toBe("Stock returned")
  expect(await f.onHand(f.store.id)).toBe("10")
  expect(await f.onHand(held.id)).toBe("0")
}

/**
 * Sections the runner may call, each in its own rolled-back transaction.
 * Declared UNRUN (not represented here): target-only drift, absent-target
 * creation drift with a second person, target eligibility revoke with a
 * non-owner target, and cross-connection concurrency.
 */
export const custodyVerifierSections = {
  A: sectionRefusal,
  B: sectionInjectedFailure,
  C: sectionConfirmReplay,
  D: sectionCombinedDrift,
  F: sectionAuthorityLoss,
  G: sectionDuplicate,
  H: sectionReturn,
} satisfies Record<string, (env: CustodyVerifierEnv) => Promise<void>>

/** Sections that need only the minimal balance fixture (no context). */
export const custodyBalanceSections = {
  E: sectionIdempotency,
} satisfies Record<string, (env: CustodyBalanceEnv) => Promise<void>>

/** Back-compatible single entry: every section in order (independent state). */
export async function verifyStockCustodyComposition(
  original: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
) {
  for (const section of Object.values(custodyVerifierSections))
    await section({ ctx: original, failingDb, conversationId })
  const storeId = original.tenantContext.activeStore?.id
  if (!storeId) throw Error("Owned QA Store required")
  for (const section of Object.values(custodyBalanceSections))
    await section({
      db: original.db,
      tenantId: original.tenantContext.tenant.id,
      storeId,
      userId: original.session.user.id,
    })
}
