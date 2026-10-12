import type { Prisma } from "@ewatrade/db/types"

/** Test scaffolding only: caller must deliberately roll back the owning transaction. */
export async function seedServiceIntakeRollbackFixture(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    actorUserId: string
    nonce: string
  },
) {
  if (
    process.env.RUN_D04_QA_ROLLBACK !== "1" ||
    process.env.APP_ENV !== "local" ||
    process.env.NODE_ENV !== "development" ||
    input.tenantId !== "cmuzedcda000hbw9kd6e50z8u" ||
    input.storeId !== "cmuzedcow000jbw9kluarpxfs" ||
    input.actorUserId !== "cmuzedc7e000gbw9ky1dioc9f" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.nonce)
  )
    throw Error("Exact local D04 rollback fixture required")
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
    SELECT ${itemId},${tenantId},${`d04-rollback-${nonce}`},'SERVICE'::"CatalogItemKind",'ACTIVE'::"CatalogRecordStatus",${`D04 rollback ${nonce}`},CURRENT_TIMESTAMP FROM guard RETURNING id
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
      CASE WHEN o.id=${trackedId} THEN 'AFTER_REQUIRED_PAYMENT' ELSE 'ON_ORDER_CONFIRMATION' END::"WorkAuthorizationPolicy",0,CURRENT_TIMESTAMP FROM offerings o RETURNING id
  ), availability AS (
    INSERT INTO "StoreOfferingAvailability" (id,"storeId","offeringId","isAvailable","updatedAt")
    SELECT ${`${nonce}:availability:`} || o.id,${storeId},o.id,true,CURRENT_TIMESTAMP FROM offerings o RETURNING id
  ), customer AS (
    INSERT INTO "Customer" (id,"tenantId",name,"updatedAt")
    SELECT ${customerId},${tenantId},${`D04 customer ${nonce}`},CURRENT_TIMESTAMP FROM item RETURNING id
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
    throw Error("Exact complete D04 rollback fixture was not inserted")
  return saved
}
