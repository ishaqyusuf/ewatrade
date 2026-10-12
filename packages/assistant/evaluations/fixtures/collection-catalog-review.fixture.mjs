import { catalogArchive } from "../../../../apps/api/src/assistant/general-catalog-archive.ts"
// Source diagnostic only. Run with an unreachable placeholder
// EWATRADE_DATABASE_URL and bun --env-file=/dev/null. No real database queries.
import { openCollectionIntentInTransaction } from "../../../db/src/queries/collection-intents.ts"
process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "c".repeat(32)
const stamp = new Date("2026-10-12T10:00:00Z")
const saved = {
  id: "intent",
  tenantId: "tenant-a",
  orderId: "order-a",
  provider: "deterministic",
  amountMinor: 4000,
  currencyCode: "NGN",
  expiresAt: new Date(stamp.getTime() + 3600000),
  storeId: "store-a",
}
const input = {
  tenantId: "tenant-a",
  orderId: "order-a",
  clientIntentId: "link-1",
  provider: "deterministic",
  amountMinor: 4000,
  currencyCode: "NGN",
  expiresAt: saved.expiresAt,
  now: stamp,
  actor: {
    kind: "staff",
    userId: "user-a",
    storeIds: ["store-a"],
    canAcceptPayment: true,
  },
}
const tx = { collectionIntent: { findUnique: async () => saved } }
for (const [name, patch] of [
  [
    "revoked payment authority",
    { actor: { ...input.actor, canAcceptPayment: false } },
  ],
  [
    "different Store scope",
    { actor: { ...input.actor, storeIds: ["store-b"] } },
  ],
  [
    "customer link names other order",
    { actor: { kind: "customer_link", sourceId: "order-b" } },
  ],
  ["changed expiry", { expiresAt: new Date(stamp.getTime() + 7200000) }],
]) {
  try {
    const result = await openCollectionIntentInTransaction(tx, {
      ...input,
      ...patch,
    })
    console.log(
      JSON.stringify({
        probe: name,
        replay: result.replay,
        returnedIntent: result.intent.id,
      }),
    )
  } catch (error) {
    console.log(JSON.stringify({ probe: name, refused: error.code }))
  }
}
const unit = (id, status = "ACTIVE") => ({
  id,
  name: id,
  status,
  revision: 1,
  updatedAt: stamp,
  _count: { stockReservations: 0 },
})
const item = {
  id: "item-a",
  name: "Rice",
  status: "ACTIVE",
  updatedAt: stamp,
  variants: [
    {
      id: "variant-a",
      name: "White",
      status: "ACTIVE",
      updatedAt: stamp,
      offerings: [unit("off-active"), unit("off-draft", "DRAFT")],
    },
  ],
}
const ctx = {
  session: { user: { id: "user-a" }, session: { id: "session" } },
  tenantContext: {
    tenant: { id: "tenant-a", dataClassification: "QA" },
    membership: { role: "MANAGER" },
    activeStore: { id: "store-a", name: "Main" },
    stores: [{ id: "store-a" }],
    staffAccess: { status: "ACTIVE", mode: "LEGACY" },
  },
  db: { catalogItem: { findFirst: async () => item } },
}
const payload = {
  action: "catalog_archive",
  catalogItemId: "item-a",
  targets: [{ kind: "offering", offeringId: "off-active" }],
  reason: "Stop selling",
}
const review = await catalogArchive.review(ctx, payload)
console.log(
  JSON.stringify({
    probe: "archive only ACTIVE unit while DRAFT remains",
    review: review.lines,
  }),
)
try {
  const overlap = await catalogArchive.review(ctx, {
    ...payload,
    targets: [
      { kind: "variant", variantId: "variant-a" },
      { kind: "offering", offeringId: "off-active" },
    ],
  })
  console.log(
    JSON.stringify({
      probe: "variant and child offering overlap",
      accepted: true,
      review: overlap.lines,
    }),
  )
} catch (error) {
  console.log(
    JSON.stringify({
      probe: "variant and child offering overlap",
      refused: error.code,
      message: error.message,
    }),
  )
}
