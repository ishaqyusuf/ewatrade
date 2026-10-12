import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { CatalogError } from "../../../../packages/db/src/queries/catalog-errors"
import { readServiceIntakeReceiptInTransaction } from "../../../../packages/db/src/queries/service-intake-receipt"
import {
  ServiceIntakeReviewError,
  prepareReviewedServiceIntakeInTransaction,
  reviewServiceIntakeInTransaction,
} from "../../../../packages/db/src/queries/service-intake-review"

import { seedServiceIntakeRollbackFixture } from "./service-intake-rollback-fixture"
import type { serviceIntakeRollbackTimings } from "./service-intake-rollback-timing"

import { runServiceIntakeRollbackCases } from "./service-intake-rollback-cases"
export { ServiceIntakeRollbackFailure } from "./service-intake-rollback-cases"

/** Coordinator schedules this exact-owned suite; no persistent fixture or provider effects. */
export async function verifyServiceIntakeRollback(db: PrismaClient) {
  const tenantId = "cmuzedcda000hbw9kd6e50z8u"
  const storeId = "cmuzedcow000jbw9kluarpxfs"
  const actorUserId = "cmuzedc7e000gbw9ky1dioc9f"
  if (process.env.RUN_D04_QA_ROLLBACK !== "1")
    throw Error("Coordinator-scheduled D04 rollback only")
  const [identity] = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  if (identity?.database !== "ewatrade_qa_v1")
    throw Error("Exact owned QA database required")
  await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: actorUserId,
      status: "ACTIVE",
      role: "OWNER",
      tenant: { dataClassification: "QA", isActive: true },
    },
    select: { id: true },
  })
  await db.store.findFirstOrThrow({
    where: { id: storeId, tenantId, status: "ACTIVE" },
    select: { id: true },
  })
  const facts = async () =>
    (
      await db.$queryRaw<Array<{ hash: string }>>`SELECT md5(jsonb_build_object(
    'tenant',(SELECT to_jsonb(t) FROM "Tenant" t WHERE t.id=${tenantId}),
    'ledgerAccounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "CustomerLedgerAccount" a WHERE a."tenantId"=${tenantId}),
    'ledgerEntries',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "CustomerLedgerEntry" e WHERE e."tenantId"=${tenantId}),
    'ledgerCommands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "CustomerLedgerCommand" c WHERE c."tenantId"=${tenantId}),
    'ledgerAllocations',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "CustomerLedgerAllocation" l JOIN "CustomerLedgerAccount" a ON a.id=l."accountId" WHERE a."tenantId"=${tenantId}),
    'ledgerReleases',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "CustomerLedgerAllocationRelease" r JOIN "CustomerLedgerAllocation" l ON l.id=r."allocationId" JOIN "CustomerLedgerAccount" a ON a.id=l."accountId" WHERE a."tenantId"=${tenantId}),
    'ledgerReceipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "CustomerLedgerReceipt" r JOIN "CustomerLedgerAccount" a ON a.id=r."accountId" WHERE a."tenantId"=${tenantId}),
    'financeBooks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "FinanceBook" b WHERE b."tenantId"=${tenantId}),
    'financeAccounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "FinanceAccount" a JOIN "FinanceBook" b ON b.id=a."bookId" WHERE b."tenantId"=${tenantId}),
    'financeCommands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "FinanceCommand" c JOIN "FinanceBook" b ON b.id=c."bookId" WHERE b."tenantId"=${tenantId}),
    'financeJournals',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "FinanceJournalEntry" j JOIN "FinanceBook" b ON b.id=j."bookId" WHERE b."tenantId"=${tenantId}),
    'financeJournalLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "FinanceJournalLine" l JOIN "FinanceBook" b ON b.id=l."bookId" WHERE b."tenantId"=${tenantId}),
    'financePeriods',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "FinancePeriod" p JOIN "FinanceBook" b ON b.id=p."bookId" WHERE b."tenantId"=${tenantId}),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "ServiceStoreSettings" s WHERE s."tenantId"=${tenantId}),
    'customers',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "Customer" c WHERE c."tenantId"=${tenantId}),
    'catalog',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "CatalogItem" c WHERE c."tenantId"=${tenantId}),
    'catalogCommands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "CatalogCommandReceipt" c WHERE c."tenantId"=${tenantId}),
    'catalogServices',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "CatalogService" s JOIN "CatalogItem" c ON c.id=s."catalogItemId" WHERE c."tenantId"=${tenantId}),
    'variants',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM "SellableVariant" v JOIN "CatalogItem" c ON c.id=v."catalogItemId" WHERE c."tenantId"=${tenantId}),
    'offerings',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM "SellableOffering" o WHERE o."tenantId"=${tenantId}),
    'serviceOfferings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "ServiceOffering" s JOIN "SellableOffering" o ON o.id=s."offeringId" WHERE o."tenantId"=${tenantId}),
    'availability',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StoreOfferingAvailability" a JOIN "SellableOffering" o ON o.id=a."offeringId" WHERE o."tenantId"=${tenantId}),
    'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM "CommercialOrder" o WHERE o."tenantId"=${tenantId}),
    'orderLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "CommercialOrderLine" l JOIN "CommercialOrder" o ON o.id=l."orderId" WHERE o."tenantId"=${tenantId}),
    'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "OfferingSnapshot" s JOIN "CommercialOrderLine" l ON l.id=s."orderLineId" JOIN "CommercialOrder" o ON o.id=l."orderId" WHERE o."tenantId"=${tenantId}),
    'authorizations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "CommercialServiceAuthorization" a WHERE a."tenantId"=${tenantId}),
    'fulfillments',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM "CommercialServiceFulfillment" f WHERE f."tenantId"=${tenantId}),
    'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "CommercialOrderPayment" p WHERE p."tenantId"=${tenantId}),
    'intakes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "ServiceIntake" i WHERE i."tenantId"=${tenantId}),
    'intakeLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "ServiceIntakeLine" l JOIN "ServiceIntake" i ON i.id=l."intakeId" WHERE i."tenantId"=${tenantId}),
    'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "ServiceJob" j WHERE j."tenantId"=${tenantId}),
    'jobLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "ServiceJobLine" l JOIN "ServiceJob" j ON j.id=l."serviceJobId" WHERE j."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "ServiceWorkAssignment" a JOIN "ServiceJob" j ON j.id=a."serviceJobId" WHERE j."tenantId"=${tenantId}),
    'commitments',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "ServiceDueCommitment" c JOIN "ServiceJob" j ON j.id=c."serviceJobId" WHERE j."tenantId"=${tenantId}),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "ServiceWorkEvent" e WHERE e."tenantId"=${tenantId}),
    'messages',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM "ServiceNotificationIntent" n WHERE n."tenantId"=${tenantId})
  )::text) AS hash`
    )[0]?.hash
  const startedAt = new Date().toISOString()
  const check = (condition: boolean, message: string) => {
    if (!condition) throw Error(message)
  }
  const prepareCase = async (
    rawTx: Prisma.TransactionClient,
    timings: ReturnType<typeof serviceIntakeRollbackTimings>,
  ) => {
    const tx = timings.transaction(rawTx)
    const nonce = randomUUID()
    const fixture = await timings.phase("fixture-batch", () =>
      seedServiceIntakeRollbackFixture(tx, {
        tenantId,
        storeId,
        actorUserId,
        nonce,
      }),
    )
    const input = {
      actorUserId,
      tenantId,
      storeId,
      customerId: fixture.customerId,
      requestedAssigneeId: actorUserId,
      dueCommitmentAt: new Date("2026-10-15T10:00:00.123Z"),
      instructions: "Original intake instructions",
      lines: [
        { offeringId: fixture.trackedId, quantity: "2" },
        { offeringId: fixture.chargeId, quantity: "1" },
      ],
    }
    const prepared = await timings.phase("canonical-review", () =>
      prepareReviewedServiceIntakeInTransaction(tx, input),
    )
    check(
      prepared.review.totalMinor === 2500 &&
        prepared.review.trackedLineCount === 1,
      "Canonical review totals or work policy changed",
    )
    const readReceipt = (intakeId: string) =>
      readServiceIntakeReceiptInTransaction(tx, {
        tenantId,
        storeId,
        actorUserId,
        intakeId,
      })
    const editSources = async () => {
      await timings.phase("customer-edit", () =>
        tx.customer.update({
          where: { id: fixture.customerId },
          data: { name: "Changed later" },
        }),
      )
      await timings.phase("offering-edit", () =>
        tx.sellableOffering.update({
          where: { id: fixture.trackedId },
          data: { name: "Changed later", fixedPriceMinor: 2000 },
        }),
      )
    }
    // Refusals may not create any Intake/Order, including under another command key.
    const graphCounts = () =>
      timings.phase("refusal-graph-check", async () => ({
        intakes: await tx.serviceIntake.count({ where: { tenantId } }),
        orders: await tx.commercialOrder.count({ where: { tenantId } }),
      }))
    return {
      tx,
      nonce,
      fixture,
      input,
      prepared,
      readReceipt,
      editSources,
      graphCounts,
    }
  }
  const cases = await runServiceIntakeRollbackCases<
    Prisma.TransactionClient,
    Record<string, unknown>
  >({
    facts,
    transaction: (run, limits) => db.$transaction(run, limits),
    cases: {
      "creation-replay-receipt": async (rawTx, timings) => {
        const { tx, nonce, fixture, prepared, readReceipt } = await prepareCase(
          rawTx,
          timings,
        )
        const saved = await timings.phase("canonical-execution", () =>
          prepared.execute(`${nonce}:intake`),
        )
        const replay = await timings.phase("canonical-replay", () =>
          prepared.execute(`${nonce}:intake`),
        )
        check(
          saved.intakeId === replay.intakeId &&
            saved.orderId === replay.orderId &&
            saved.jobs[0]?.id === replay.jobs[0]?.id,
          "Replay duplicated graph",
        )
        check(
          saved.jobs.length === 1 && saved.jobs[0]?.lines.length === 1,
          "Charge-only line created tracked work",
        )
        check(
          saved.jobs[0]?.lines[0]?.authorizationStatus === "PENDING_PAYMENT",
          "Unpaid work was released",
        )
        const order = await timings.phase("owning-order-check", () =>
          tx.commercialOrder.findUniqueOrThrow({
            where: { id: saved.orderId },
          }),
        )
        check(
          order.customerId === fixture.customerId,
          "Saved Customer financial identity was lost",
        )
        check(
          (await timings.phase("no-notification-check", () =>
            tx.serviceNotificationIntent.count({
              where: { serviceJob: { intakeId: saved.intakeId } },
            }),
          )) === 0,
          "Unexpected customer message intent",
        )
        const originalReceipt = await timings.phase("original-receipt", () =>
          readReceipt(saved.intakeId),
        )
        return {
          nonce,
          originalReceipt,
          replay: { intakeId: replay.intakeId, orderId: replay.orderId },
          checks: {
            exactTotals: true,
            trackedOnly: true,
            paymentGate: true,
            customerIdentity: true,
            exactReplay: true,
            noMessageIntent: true,
          },
        }
      },
      "immutable-snapshot": async (rawTx, timings) => {
        const { nonce, prepared, readReceipt, editSources } = await prepareCase(
          rawTx,
          timings,
        )
        const saved = await timings.phase("canonical-execution", () =>
          prepared.execute(`${nonce}:intake`),
        )
        const originalReceipt = await timings.phase("original-receipt", () =>
          readReceipt(saved.intakeId),
        )
        await editSources()
        const currentReceipt = await timings.phase(
          "receipt-after-source-edits",
          () => readReceipt(saved.intakeId),
        )
        check(
          JSON.stringify(originalReceipt) === JSON.stringify(currentReceipt),
          "Owning receipt replaced original Customer or Offering facts",
        )
        return {
          nonce,
          originalReceipt,
          checks: { exactTotals: true, originalFacts: true },
        }
      },
      "stale-review": async (rawTx, timings) => {
        const { nonce, prepared, editSources, graphCounts } = await prepareCase(
          rawTx,
          timings,
        )
        const before = await graphCounts()
        await editSources()
        let staleRejected = false
        try {
          await timings.phase("stale-rejection", () =>
            prepared.execute(`${nonce}:stale`),
          )
        } catch (error) {
          if (
            !(error instanceof CatalogError) ||
            error.code !== "REVISION_CONFLICT"
          )
            throw error
          staleRejected = true
        }
        check(staleRejected, "Changed target accepted without new review")
        check(
          JSON.stringify(before) === JSON.stringify(await graphCounts()),
          "Stale refusal created Intake or Order",
        )
        return {
          nonce,
          checks: {
            exactTotals: true,
            staleRejected,
            refusalGraphUnchanged: true,
          },
        }
      },
      "revoked-authority": async (rawTx, timings) => {
        const { tx, nonce, input, graphCounts } = await prepareCase(
          rawTx,
          timings,
        )
        const before = await graphCounts()
        const membership = await timings.phase("revocation-target", () =>
          tx.membership.findFirstOrThrow({
            where: { tenantId, userId: actorUserId },
            select: { id: true },
          }),
        )
        await timings.phase("revocation-edit", () =>
          tx.membership.update({
            where: { id: membership.id },
            data: { status: "SUSPENDED" },
          }),
        )
        let revokedRejected = false
        try {
          await timings.phase("revoked-rejection", () =>
            reviewServiceIntakeInTransaction(tx, input),
          )
        } catch (error) {
          if (
            !(error instanceof ServiceIntakeReviewError) ||
            error.code !== "FORBIDDEN"
          )
            throw error
          revokedRejected = true
        }
        check(revokedRejected, "Revoked authority accepted")
        check(
          JSON.stringify(before) === JSON.stringify(await graphCounts()),
          "Revoked refusal created Intake or Order",
        )
        return {
          nonce,
          checks: {
            exactTotals: true,
            revokedRejected,
            refusalGraphUnchanged: true,
          },
        }
      },
    },
  })
  // Returning success requires all four complete cases; no partial case is ticket proof.
  return {
    version: 3,
    startedAt,
    cases,
    rolledBack: true,
    savedStatePreserved: true,
  }
}
