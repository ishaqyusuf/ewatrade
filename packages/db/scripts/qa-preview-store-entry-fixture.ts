import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"
import { inspectApiPreviewReadiness } from "../../../scripts/check-api-preview-readiness.mjs"
import { readEnvironmentFile } from "../../../scripts/environment-profile.mjs"
import {
  MembershipRole,
  MembershipStatus,
  QaDataClassification,
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../generated/prisma/enums"
import { disposePreviewStoreEntryFixture } from "../src/queries/acceptance/service-commerce/fixture"
import {
  assignCustomerChannelAttendant,
  publishCustomerEntryPoint,
} from "../src/queries/customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../src/queries/service-commerce-access"

const previewEnvironment = readEnvironmentFile(
  new URL("../../../.env.preview", import.meta.url).pathname,
)
if (
  process.env.APP_ENV !== "preview" ||
  process.env.DEV_PROFILE !== "preview" ||
  process.env.NODE_ENV !== "development" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  process.env.EWATRADE_DATABASE_URL !==
    previewEnvironment.EWATRADE_DATABASE_URL ||
  inspectApiPreviewReadiness().length > 0
) {
  throw new Error("Verified isolated Preview database profile is required.")
}

const { prisma } = await import("../src/client")

async function disposeWithDeadlockRetry(input: {
  actorUserId: string
  tenantId: string
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await disposePreviewStoreEntryFixture(prisma, input)
      return
    } catch (error) {
      const deadlock =
        String(error).includes("deadlock detected") ||
        (error as { code?: string }).code === "P2034"
      if (!deadlock || attempt === 2) throw error
      await delay(500 * (attempt + 1))
    }
  }
}

if (process.argv[2] === "--cleanup") {
  const id = process.argv[3]
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  ) {
    throw new Error("An exact fixture UUID is required for cleanup.")
  }
  const slug = `preview-store-entry-${id}`
  try {
    const [tenant, actor] = await Promise.all([
      prisma.tenant.findUnique({ select: { id: true }, where: { slug } }),
      prisma.user.findUnique({
        select: { id: true },
        where: { email: `${slug}@example.invalid` },
      }),
    ])
    if (tenant && actor) {
      await disposeWithDeadlockRetry({
        actorUserId: actor.id,
        tenantId: tenant.id,
      })
    } else if (tenant || actor) {
      throw new Error(
        "Fixture ownership is incomplete; inspect before cleanup.",
      )
    }
    process.stdout.write(
      `${JSON.stringify({ fixtureId: id, status: "cleaned" })}\n`,
    )
  } finally {
    await prisma.$disconnect()
  }
  process.exit(0)
}

const fixtureId = randomUUID()
const slug = `preview-store-entry-${fixtureId}`
const actorEmail = `${slug}@example.invalid`
const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: false,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

let actorUserId: string | undefined
let tenantId: string | undefined
let cleaned = false

async function cleanOwnedFixture() {
  if (cleaned || !actorUserId) return
  if (tenantId) {
    await disposeWithDeadlockRetry({ actorUserId, tenantId })
  } else {
    await prisma.user.deleteMany({
      where: { email: actorEmail, id: actorUserId },
    })
  }
  cleaned = true
}

try {
  const actor = await prisma.user.create({
    data: {
      email: actorEmail,
      emailVerified: true,
      name: "Preview Store Entry Tester",
    },
  })
  actorUserId = actor.id
  const tenant = await prisma.tenant.create({
    data: {
      dataClassification: QaDataClassification.QA,
      enabledModes: [TenantMode.MERCHANT],
      name: "Preview Store Entry QA",
      qaMarkedAt: new Date(),
      qaSourceDomain: "example.invalid",
      slug,
      type: TenantType.MERCHANT,
      users: {
        create: {
          acceptedAt: new Date(Date.now() - 60_000),
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          userId: actor.id,
        },
      },
    },
  })
  tenantId = tenant.id
  const store = await prisma.store.create({
    data: {
      countryCode: "NG",
      name: "Preview Merchant QA",
      slug,
      status: StoreStatus.ACTIVE,
      tenantId: tenant.id,
    },
  })
  const membership = await prisma.membership.findFirstOrThrow({
    where: { tenantId: tenant.id, userId: actor.id },
  })
  await assignCustomerChannelAttendant(prisma, {
    actorUserId: actor.id,
    membershipId: membership.id,
    reason: "Run-owned Preview Store Entry QA",
    storeId: store.id,
    tenantId: tenant.id,
  })
  const now = Date.now()
  await prisma.serviceCommercePolicyDecision.createMany({
    data: [
      ServiceCommercePolicySubject.WEB,
      ServiceCommercePolicySubject.INTAKE,
      ServiceCommercePolicySubject.QUOTE,
      ServiceCommercePolicySubject.PROGRESSIVE_CATALOG,
    ].map((subject) => ({
      approvalReference: `synthetic-preview-only-${fixtureId}`,
      channel: ServiceCommercePolicyChannel.WEB,
      effectiveAt: new Date(now - 60_000),
      evidenceReference: `run-owned-fixture-${fixtureId}`,
      expiresAt: new Date(now + 20 * 60_000),
      jurisdictionCode: "NG",
      outcome: ServiceCommercePolicyOutcome.ALLOWED,
      reason: "Synthetic isolated Preview QA decision",
      reviewedByUserId: actor.id,
      storeId: store.id,
      subject,
      tenantId: tenant.id,
      vertical: ServiceCommercePolicyVertical.SERVICE,
    })),
  })
  const configured = await updateServiceCommerceStoreProfile(prisma, {
    actorUserId: actor.id,
    expectedRevision: 0,
    reason: "Configure run-owned Preview Store Entry QA",
    settings,
    storeId: store.id,
    tenantId: tenant.id,
  })
  await setServiceCommerceStoreProfileActivation(prisma, {
    active: true,
    actorUserId: actor.id,
    expectedRevision: configured.revision,
    reason: "Activate run-owned Preview Store Entry QA",
    storeId: store.id,
    tenantId: tenant.id,
  })
  const entry = await publishCustomerEntryPoint(prisma, {
    actorUserId: actor.id,
    storeId: store.id,
    tenantId: tenant.id,
  })

  process.stdout.write(
    `${JSON.stringify({ fixtureId, publicToken: entry.publicToken, status: "ready" })}\n`,
  )
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      process.off("SIGINT", finish)
      process.off("SIGTERM", finish)
      process.stdin.off("data", finish)
      process.stdin.pause()
      resolve()
    }
    const timer = setTimeout(finish, 15 * 60_000)
    process.once("SIGINT", finish)
    process.once("SIGTERM", finish)
    process.stdin.once("data", finish)
    process.stdin.resume()
  })
} finally {
  try {
    await cleanOwnedFixture()
    process.stdout.write(
      `${JSON.stringify({ fixtureId, status: "cleaned" })}\n`,
    )
  } finally {
    await prisma.$disconnect()
  }
}
