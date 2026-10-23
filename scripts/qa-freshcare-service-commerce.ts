import assert from "node:assert/strict"
import path from "node:path"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

// Deliberately specific: this is a synthetic walkthrough fixture, not release approval.
const storeId = "cmvhyhojc0080fb9k2pul43tb"
const email = "freshcare-demo-20261021@ishaq.qa.test"
const reference = "local-qa-only:FreshCare:2026-10-21"
const scopes = [
  ["staff", "web"],
  ["staff", "quote"],
  ["web", "web"],
  ["web", "intake"],
  ["web", "quote"],
  ["web", "service_completion"],
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
      id: true,
      tenantId: true,
      countryCode: true,
      status: true,
      tenant: {
        select: {
          id: true,
          metadata: true,
          updatedAt: true,
          subscription: { select: { id: true } },
          slug: true,
          dataClassification: true,
          qaSourceDomain: true,
          qaPurgeStartedAt: true,
        },
      },
    },
  })
  assert(
    store?.tenant.slug === "freshcare-demo-qa" &&
      store.status === "ACTIVE" &&
      store.countryCode === "NG",
    "Exact FreshCare Store required",
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
  if (process.argv.includes("--restore-plan")) {
    assert(!store.tenant.subscription, "Refusing to change durable billing")
    const metadata = JSON.parse(JSON.stringify(store.tenant.metadata ?? {}))
    const fixture = metadata.qaFreshCareServiceWalkthrough
    assert(
      fixture?.reference === reference &&
        metadata.retailOps?.subscription?.source === "local_qa_walkthrough",
      "Exact current plan fixture required",
    )
    if (fixture.originalSubscription === null) {
      const { subscription: _subscription, ...rest } = metadata.retailOps
      metadata.retailOps = rest
    } else metadata.retailOps.subscription = fixture.originalSubscription
    fixture.restoredAt = new Date().toISOString()
    await prisma.tenant.update({
      where: { id: store.tenantId, updatedAt: store.tenant.updatedAt },
      data: { metadata },
    })
    console.info(
      JSON.stringify({
        storeId,
        restoredPlan: fixture.originalSubscription?.planId ?? "starter",
        syntheticOnly: true,
      }),
    )
  }
  if (process.argv.includes("--prepare-plan")) {
    assert(
      !store.tenant.subscription,
      "Refusing to change a durable billing subscription",
    )
    const metadata = JSON.parse(JSON.stringify(store.tenant.metadata ?? {}))
    assert(
      metadata && typeof metadata === "object" && !Array.isArray(metadata),
      "Object metadata required",
    )
    metadata.retailOps ??= {}
    const previous = metadata.retailOps.subscription ?? null
    assert(
      !previous ||
        previous.planId === "starter" ||
        previous.source === "local_qa_walkthrough",
      "Refusing to replace an unrelated plan",
    )
    metadata.qaFreshCareServiceWalkthrough ??= {
      originalSubscription: previous,
      reference,
    }
    metadata.retailOps.subscription = {
      ...previous,
      planId: "growth",
      status: "active",
      source: "local_qa_walkthrough",
      updatedAt: new Date().toISOString(),
    }
    await prisma.tenant.update({
      where: { id: store.tenantId, updatedAt: store.tenant.updatedAt },
      data: { metadata },
    })
    console.info(
      JSON.stringify({
        storeId,
        previousPlan: previous?.planId ?? "starter",
        plan: "growth",
        syntheticOnly: true,
        billingProviderChanged: false,
      }),
    )
  }
  const decisions = await prisma.serviceCommercePolicyDecision.findMany({
    where: { storeId, tenantId: store.tenantId, vertical: "SERVICE" },
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
  if (!process.argv.includes("--apply")) process.exitCode = 0
  else {
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
        vertical: "service",
        jurisdictionCode: "NG",
        outcome: "allowed",
        effectiveAt,
        expiresAt,
        expectedRevision: previous?.revision ?? 0,
        approvalReference: reference,
        evidenceReference:
          ".brain/qa/2026-10-21-services-owner-storefront-walkthrough.md",
        reason:
          "Synthetic FreshCare local walkthrough fixture only; expires in 24h. No real merchant, provider, pharmacy or release approval.",
      })
    }
    console.info(
      JSON.stringify({
        applied: scopes.length,
        expiresAt,
        syntheticOnly: true,
      }),
    )
  }
} finally {
  await prisma.$disconnect()
}
