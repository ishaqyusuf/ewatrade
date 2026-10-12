import {
  createAndConfirmServiceIntakeInTransaction,
  recordCommercialOrderPaymentInTransaction,
  transitionServiceJobLineInTransaction,
} from "@ewatrade/db/queries"
import { signedIntakeCheck as check } from "./service-intake-signed-rollback-guards"
import type { Prisma } from "@ewatrade/db/types"

/** Test scaffolding only: caller must deliberately roll back the owning transaction. */
async function seedCompletionCatalogFixture(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    actorUserId: string
    nonce: string
  },
) {
  if (
    process.env.RUN_D05_QA_SIGNED_ROLLBACK !== "1" ||
    process.env.APP_ENV !== "local" ||
    process.env.NODE_ENV !== "development" ||
    input.tenantId !== "cmuzedcda000hbw9kd6e50z8u" ||
    input.storeId !== "cmuzedcow000jbw9kluarpxfs" ||
    input.actorUserId !== "cmuzedc7e000gbw9ky1dioc9f" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.nonce)
  )
    throw Error("Exact local D05 rollback fixture required")
  const { tenantId, storeId, actorUserId, nonce } = input
  const itemId = `${nonce}:item`
  const trackedId = `${nonce}:tracked`
  const chargeId = `${nonce}:charge`
  const customerId = `${nonce}:customer`
  // No command receipt is fabricated: this is fixture setup, not a Catalog
  // command evaluation. Native Intake preparation validates the inserted graph.
  // A single parameterized statement saves setup round trips; no root/nested call.
  const [saved] = await tx.$queryRaw<
    Array<{
      customerId: string
      trackedId: string
      chargeId: string
      services: number
      variants: number
      offerings: number
      policies: number
      availability: number
    }>
  >`WITH guard AS (
    SELECT s."currencyCode" FROM "Tenant" t
    JOIN "Membership" actor ON actor."tenantId"=t.id
    JOIN "User" owner ON owner.id=actor."userId"
    JOIN "Store" s ON s."tenantId"=t.id
    WHERE current_database()='ewatrade_qa_v1'
      AND t.id=${tenantId} AND t."dataClassification"='QA' AND t."isActive"=true
      AND actor."userId"=${actorUserId} AND actor.role='OWNER' AND actor.status='ACTIVE'
      AND owner.email='video.20261008-video-v1.web.bakery@ishaq.qa.test'
      AND s.id=${storeId} AND s.status='ACTIVE'
    FOR SHARE OF t, actor, s
  ), item AS (
    INSERT INTO "CatalogItem" (id,"tenantId",slug,kind,status,name,"updatedAt")
    SELECT ${itemId},${tenantId},${`d05-completion-rollback-${nonce}`},'SERVICE'::"CatalogItemKind",'ACTIVE'::"CatalogRecordStatus",${`D05 rollback ${nonce}`},CURRENT_TIMESTAMP FROM guard RETURNING id
  ), service AS (
    INSERT INTO "CatalogService" (id,"catalogItemId","updatedAt")
    SELECT ${`${nonce}:service`},item.id,CURRENT_TIMESTAMP FROM item RETURNING id
  ), variants AS (
    INSERT INTO "SellableVariant" (id,"catalogItemId",key,name,status,"isDefault","sortOrder","updatedAt")
    SELECT v.id,item.id,v.key,v.name,'ACTIVE'::"CatalogRecordStatus",v."isDefault",v."sortOrder",CURRENT_TIMESTAMP
    FROM item CROSS JOIN (VALUES (${`${nonce}:tracked-variant`},'tracked','Tracked',true,0),(${`${nonce}:charge-variant`},'charge','Charge',false,1)) AS v(id,key,name,"isDefault","sortOrder") RETURNING id
  ), offerings AS (
    INSERT INTO "SellableOffering" (id,"tenantId","catalogItemId","variantId",key,kind,status,name,"pricingPolicy","fixedPriceMinor","currencyCode","updatedAt")
    SELECT v.id,${tenantId},item.id,variants.id,v.key,'SERVICE'::"SellableOfferingKind",'ACTIVE'::"CatalogRecordStatus",v.name,'FIXED'::"OfferingPricingPolicy",v.price,guard."currencyCode",CURRENT_TIMESTAMP
    FROM item CROSS JOIN guard CROSS JOIN (VALUES (${trackedId},${`${nonce}:tracked-variant`},'tracked','Tracked gated',1000),(${chargeId},${`${nonce}:charge-variant`},'charge','Charge only',500)) AS v(id,"variantId",key,name,price)
    JOIN variants ON variants.id=v."variantId" RETURNING id
  ), policies AS (
    INSERT INTO "ServiceOffering" (id,"offeringId","workPolicy","authorizationPolicy","quantityScale","updatedAt")
    SELECT ${`${nonce}:policy:`} || o.id,o.id,
      CASE WHEN o.id=${trackedId} THEN 'TRACKED' ELSE 'CHARGE_ONLY' END::"ServiceWorkPolicy",
      CASE WHEN o.id=${trackedId} THEN 'ON_ORDER_CONFIRMATION' ELSE 'ON_ORDER_CONFIRMATION' END::"WorkAuthorizationPolicy",0,CURRENT_TIMESTAMP FROM offerings o RETURNING id
  ), availability AS (
    INSERT INTO "StoreOfferingAvailability" (id,"storeId","offeringId","isAvailable","updatedAt")
    SELECT ${`${nonce}:availability:`} || o.id,${storeId},o.id,true,CURRENT_TIMESTAMP FROM offerings o RETURNING id
  ), customer AS (
    INSERT INTO "Customer" (id,"tenantId",name,"updatedAt")
    SELECT ${customerId},${tenantId},${`D05 customer ${nonce}`},CURRENT_TIMESTAMP FROM item RETURNING id
  ) SELECT customer.id AS "customerId",${trackedId}::text AS "trackedId",${chargeId}::text AS "chargeId",
    (SELECT count(*)::int FROM service) AS services,
    (SELECT count(*)::int FROM variants) AS variants,
    (SELECT count(*)::int FROM offerings) AS offerings,
    (SELECT count(*)::int FROM policies) AS policies,
    (SELECT count(*)::int FROM availability) AS availability FROM customer`
  if (
    !saved ||
    saved.customerId !== customerId ||
    saved.trackedId !== trackedId ||
    saved.chargeId !== chargeId ||
    saved.services !== 1 ||
    saved.variants !== 2 ||
    saved.offerings !== 2 ||
    saved.policies !== 2 ||
    saved.availability !== 2
  )
    throw Error("Exact complete D05 rollback fixture was not inserted")
  return saved
}

/** Genuine native positive-price Intake -> payment -> work, entirely in caller rollback. */
export async function seedCompletionSignedFixture(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    actorUserId: string
    nonce: string
    receivingAccountId: string
    settled: boolean
    stage: "queued" | "ready" | "completed"
  },
) {
  const catalog = await seedCompletionCatalogFixture(tx, input)
  const intake = await createAndConfirmServiceIntakeInTransaction(tx, {
    actorUserId: input.actorUserId,
    clientIntakeId: `${input.nonce}:intake`,
    customerId: catalog.customerId,
    schemaVersion: 1,
    storeId: input.storeId,
    tenantId: input.tenantId,
    lines: [
      {
        offeringId: catalog.trackedId,
        quantity: "2",
        expectedFixedPriceMinor: 1000,
      },
    ],
    instructions:
      "D05 bounded source rollback fixture; no customer delivery requested",
  })
  const jobId = intake.jobs[0]?.id,
    lineId = intake.jobs[0]?.lines[0]?.id
  check(
    intake.jobs.length === 1 &&
      intake.jobs[0]?.lines.length === 1 &&
      jobId &&
      lineId,
    "Exactly one genuine tracked native Job/Line required",
  )
  check(
    intake.notificationIntentIds.length === 0,
    "Fixture unexpectedly created a customer update",
  )
  let paymentId: string | null = null
  if (input.settled) {
    const payment = await recordCommercialOrderPaymentInTransaction(tx, {
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      clientPaymentId: `${input.nonce}:payment`,
      orderId: intake.orderId,
      amountMinor: 2000,
      method: "cash",
      moneyAccountId: input.receivingAccountId,
      reference: `D05 rollback ${input.nonce}`,
    })
    check(
      payment.amountPaidMinor === 2000 &&
        payment.balanceDueMinor === 0 &&
        payment.paymentStatus === "paid",
      "Canonical positive-price payment did not settle exact fixture Order",
    )
    paymentId = payment.id
  }
  const statuses =
    input.stage === "queued"
      ? []
      : input.stage === "ready"
        ? (["ready_for_handoff"] as const)
        : (["ready_for_handoff", "completed"] as const)
  for (const status of statuses) {
    const current = await tx.serviceJobLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { revision: true },
    })
    await transitionServiceJobLineInTransaction(tx, {
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      lineId,
      expectedRevision: current.revision,
      clientCommandId: `${input.nonce}:${status}`,
      toStatus: status,
      schemaVersion: 1,
      source: "d05_signed_rollback_fixture",
    })
  }
  const order = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: intake.orderId },
  })
  const job = await tx.serviceJob.findUniqueOrThrow({ where: { id: jobId } })
  const line = await tx.serviceJobLine.findUniqueOrThrow({
    where: { id: lineId },
  })
  check(
    order.totalMinor === 2000 &&
      order.amountPaidMinor === (input.settled ? 2000 : 0) &&
      job.commercialOrderId === order.id &&
      job.tenantId === input.tenantId &&
      job.storeId === input.storeId &&
      line.serviceJobId === job.id &&
      line.authorizationStatus === "AUTHORIZED" &&
      line.allocatedQuantity.toString() === "2" &&
      line.status ===
        (input.stage === "queued"
          ? "QUEUED"
          : input.stage === "ready"
            ? "READY_FOR_HANDOFF"
            : "COMPLETED"),
    "Native fixture lost original scope, balance, readiness or allocation",
  )
  return { job, line, order, paymentId }
}
