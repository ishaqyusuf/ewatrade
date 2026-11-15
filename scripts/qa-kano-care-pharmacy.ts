import assert from "node:assert/strict"
import path from "node:path"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

// Deliberately specific: synthetic local walkthrough fixture for the Kano Care
// demo pharmacy, not a pharmacy, licence or release approval. Mirrors
// qa-freshcare-service-commerce.ts. Usage: bun scripts/qa-kano-care-pharmacy.ts [--apply]
const storeId = "cmuzed8be0007bw9kqpeqb95e"
const tenantSlug = "video-20261008-video-v1-web-pharmacy-qa"
const email = "video.20261008-video-v1.web.pharmacy@ishaq.qa.test"
const reference = "local-qa-only:KanoCarePharmacy:2026-11-15"
// The scopes setPrescriptionStoreActivation checks for a pickup-only Store.
const scopes = [
  ["web", "web"],
  ["staff", "staff"],
  ["staff", "intake"],
  ["staff", "quote"],
  ["web", "intake"],
  ["web", "quote"],
  ["web", "payment"],
  ["staff", "pickup"],
  ["web", "pickup"],
] as const

const root = path.resolve(import.meta.dir, "..")
const loaded = loadRootEnvironment(root, {
  ...process.env,
  APP_ENV: "local",
  DEV_PROFILE: "local",
  NODE_ENV: "development",
})
assert(
  loaded.profileExists && loaded.profile === "local",
  "Explicit local profile required",
)
Object.assign(
  process.env,
  applyDatabaseProfile(loaded.env, loadProductionDatabaseUrl(root)),
)
const { prisma } = await import("@ewatrade/db")
const { setServiceCommercePolicyDecision } = await import(
  "@ewatrade/db/queries"
)
try {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      tenantId: true,
      countryCode: true,
      status: true,
      tenant: {
        select: {
          slug: true,
          dataClassification: true,
          qaSourceDomain: true,
          qaPurgeStartedAt: true,
        },
      },
    },
  })
  assert(
    store?.tenant.slug === tenantSlug &&
      store.status === "ACTIVE" &&
      store.countryCode === "NG",
    "Exact Kano Care demo Store required",
  )
  assert(
    store.tenant.dataClassification === "QA" &&
      store.tenant.qaSourceDomain === "ishaq.qa.test" &&
      !store.tenant.qaPurgeStartedAt,
    "Active synthetic QA business required",
  )
  const owner = await prisma.membership.findFirst({
    where: {
      tenantId: store.tenantId,
      role: "OWNER",
      status: "ACTIVE",
      acceptedAt: { not: null },
      user: { email },
    },
    select: { userId: true },
  })
  assert(owner, "Exact accepted synthetic owner required")
  const decisions = await prisma.serviceCommercePolicyDecision.findMany({
    where: { storeId, tenantId: store.tenantId, vertical: "PHARMACY" },
    select: {
      channel: true,
      subject: true,
      approvalReference: true,
      revision: true,
    },
  })
  console.info(
    JSON.stringify({
      storeId,
      syntheticOnly: true,
      apply: process.argv.includes("--apply"),
      existingDecisions: decisions.length,
    }),
  )
  if (process.argv.includes("--apply")) {
    const effectiveAt = new Date()
    const expiresAt = new Date(effectiveAt.getTime() + 24 * 60 * 60 * 1000)
    for (const [channel, subject] of scopes) {
      const previous = decisions.find(
        (d) =>
          d.channel.toLowerCase() === channel &&
          d.subject.toLowerCase() === subject,
      )
      assert(
        !previous || previous.approvalReference === reference,
        "Refusing to replace a non-fixture policy decision",
      )
      await setServiceCommercePolicyDecision(prisma, {
        actorUserId: owner.userId,
        reviewedByUserId: owner.userId,
        tenantId: store.tenantId,
        storeId,
        channel,
        subject,
        vertical: "pharmacy",
        jurisdictionCode: "NG",
        outcome: "allowed",
        effectiveAt,
        expiresAt,
        expectedRevision: previous?.revision ?? 0,
        approvalReference: reference,
        evidenceReference: ".brain/features/dashboard-service-jobs.md",
        reason:
          "Synthetic Kano Care demo pharmacy local walkthrough fixture only; expires in 24h. No real pharmacy, licence, provider or release approval.",
      })
    }
    console.info(
      JSON.stringify({ applied: scopes.length, expiresAt, syntheticOnly: true }),
    )
  }
} finally {
  await prisma.$disconnect()
}
