import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { projectChannelProposalReview } from "./channel-proposal-review"
import type { GeneralTransactionContext } from "./general-actions"
import { paymentLinksCreate } from "./general-payment-links"
import { proposalDigest } from "./proposal-security"

const original = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "manual-payment-assistant-test-key-32-characters"
})
afterAll(() => {
  if (original === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = original
})
const payload = () =>
  generalActionSchema.parse({
    action: "payment_links_create",
    orderIds: ["order1"],
    bankAccountId: "bank1",
    allowPartial: true,
    lifetimeMinutes: 1440,
  })
function harness() {
  const row = {
    id: "order1",
    customerId: null,
    totalMinor: 10000,
    amountPaidMinor: 1000,
    paymentStatus: "PARTIALLY_PAID",
    status: "CONFIRMED",
    currencyCode: "NGN",
    orderNumber: "ABC",
    updatedAt: new Date("2026-10-26T00:00:00Z"),
    _count: { payments: 1 },
  }
  let available = true
  const calls: unknown[] = []
  const ctx = {
    db: {
      commercialOrder: {
        findMany: async (input: unknown) => {
          calls.push(input)
          return available ? [row] : []
        },
      },
      financeAccount: {
        findFirst: async () => ({
          id: "bank1",
          name: "Main bank",
          bankName: "GTBank",
          bankAccountNumber: "0123456789",
          bankAccountHolder: "Business",
          paymentMethods: ["BANK_TRANSFER"],
        }),
      },
    },
    session: { user: { id: "owner1" } },
    tenantContext: {
      tenant: { id: "tenant1", dataClassification: "QA" },
      membership: { role: "OWNER" },
      activeStore: { id: "store1" },
      staffAccess: { status: "ACTIVE", mode: "LEGACY" },
    },
  } as unknown as GeneralTransactionContext
  return {
    ctx,
    row,
    calls,
    unavailable: () => {
      available = false
    },
  }
}
test("assistant link action accepts bounded exact targets, never paid flags or automatic sends", () => {
  expect(payload().action).toBe("payment_links_create")
  expect(
    generalActionSchema.safeParse({
      action: "payment_links_create",
      orderIds: Array.from({ length: 6 }, (_, i) => `o${i}`),
      bankAccountId: "bank1",
    }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...payload(), sendWhatsApp: true }).success,
  ).toBe(false)
  const capability = capabilityManifest.find(
    (c) => c.id === "sales.payment_links.create",
  )
  expect(capability).toMatchObject({
    effect: "record",
    clients: ["dashboard", "mobile", "whatsapp"],
  })
})
test("review resolves current Store and due balance; changed amount invalidates the review target", async () => {
  const h = harness()
  const p = payload()
  if (p.action !== "payment_links_create") throw Error("Bad action")
  const review = await paymentLinksCreate.review?.(h.ctx, p)
  expect(review?.lines.join("\n")).toContain("ABC · NGN 90.00 due")
  expect(review?.lines.join("\n")).toContain("no payment is recorded")
  expect(h.calls[0]).toMatchObject({
    where: { tenantId: "tenant1", storeId: "store1", id: { in: ["order1"] } },
  })
  h.row.amountPaidMinor = 2000
  const changed = await paymentLinksCreate.validate(h.ctx, p, false)
  expect(changed?.revision).not.toBe(review?.target?.revision)
})
test("unavailable, duplicate and already-paid targets refuse before any link write", async () => {
  const h = harness()
  const p = payload()
  if (p.action !== "payment_links_create") throw Error("Bad action")
  await expect(
    paymentLinksCreate.validate(
      h.ctx,
      { ...p, orderIds: ["order1", "order1"] },
      false,
    ),
  ).rejects.toThrow("once")
  h.row.amountPaidMinor = 10000
  await expect(paymentLinksCreate.validate(h.ctx, p, false)).rejects.toThrow(
    "already paid",
  )
  h.unavailable()
  await expect(paymentLinksCreate.validate(h.ctx, p, false)).rejects.toThrow(
    "no longer available",
  )
})

test("the canonical payment-link review is complete for native WhatsApp; missing bank facts require app review", async () => {
  const h = harness()
  const p = payload()
  if (p.action !== "payment_links_create") throw Error("Bad action")
  const review = await paymentLinksCreate.review?.(h.ctx, p)
  if (!review?.presentation) throw Error("Canonical presentation missing")
  const now = Date.now()
  const expiresAt = new Date(now + 300000)
  const source = {
    id: "proposal1",
    revision: 1,
    action: p.action,
    actionVersion: 1,
    payloadHash: proposalDigest(p),
    status: "PENDING",
    expiresAt,
  }
  const proposal = {
    id: source.id,
    revision: 1,
    payload: p,
    status: "PENDING",
    expiresAt: expiresAt.toISOString(),
    receipt: null,
    approvalToken: "server-only-proof",
    review: review.lines,
    presentation: review.presentation,
  }
  const scope = {
    businessName: "QA business",
    storeName: "Main",
    currencyCode: "NGN",
  }
  const projected = projectChannelProposalReview(source, proposal, scope, now)
  expect(projected.kind).toBe("review")
  expect(JSON.stringify(projected)).not.toContain("server-only-proof")
  expect(
    projectChannelProposalReview(
      source,
      {
        ...proposal,
        presentation: {
          ...review.presentation,
          facts: review.presentation.facts?.filter(
            (fact) => fact.label !== "Bank",
          ),
        },
      },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
})
