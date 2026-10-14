import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { appendFileSync } from "node:fs"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import { getActiveTenantForUser } from "@ewatrade/db/queries"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type {
  Prisma,
  PrismaClient,
} from "../../../../packages/db/generated/prisma/client"
import type { GeneralContext } from "./general-context"
import {
  SectionUnrun,
  assertEffectiveTarget,
  assertSectionFits,
  createSavepointDb,
  injectReceiptFailure,
  plannedIdsLine,
  runSectionsInSequence,
  sectionOutcome,
  withRolloutOverride,
} from "./general-stock-custody-runner-tools"
import {
  type CustodyVerifierEnv,
  custodyBalanceSections,
  custodyVerifierSections,
} from "./general-stock-custody.integration-check"

// G04 custody verifier sections on the authorized Development QA target, run
// ONLY through scripts/qa-assistant-stock-custody.mjs (its marker and pinned
// target are required; normal test discovery skips everything). Each
// requested section gets synthetic Tenant/Owner/Store/session/conversation
// fixtures inside one Serializable transaction (maxWait 10 s, timeout 30 s,
// statement 20 s, lock 10 s) that always throws the rollback sentinel; each
// command runs in its own savepoint. Planned IDs are written to the
// launcher's plan file before any write, for its read-only absence audit.
const marker = process.env.QA_STOCK_CUSTODY_RUN
const enabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" && Boolean(marker)
const describeConnected = enabled ? describe : describe.skip
const authorizedHost =
  "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech"
const requested = (process.env.QA_STOCK_CUSTODY_SECTIONS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)
const budgets: Record<string, number> = (() => {
  try {
    return JSON.parse(process.env.QA_STOCK_CUSTODY_BUDGETS ?? "{}")
  } catch {
    return {}
  }
})()
class Rollback extends Error {}

/**
 * The child's own exact-target check before connecting: launcher marker and
 * profile, then protocol, routing parameters and the effective target an
 * unconnected pg.Client resolves (host, 5432, ewatrade_qa_v1).
 */
async function assertLauncherTarget() {
  if (
    !marker ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local"
  )
    throw new Error("Custody verifier runs only through its launcher.")
  const url = process.env.EWATRADE_DATABASE_URL ?? ""
  const { default: pg } = await import("pg")
  const probe = new pg.Client({ connectionString: url })
  assertEffectiveTarget(url, {
    host: probe.host,
    port: probe.port,
    database: probe.database,
  })
}

/** A fixture-owned client that reports every statement it sends. */
async function connect() {
  const { PrismaClient } = await import(
    "../../../../packages/db/generated/prisma/client"
  )
  const { PrismaPg } = await import("@prisma/adapter-pg")
  const created = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 20_000,
      query_timeout: 25_000,
    }),
    log: [{ emit: "event", level: "query" }],
  })
  created.$on("query", () => {
    statements++
  })
  return created
}
let client: Awaited<ReturnType<typeof connect>>
let statements = 0
let medianMs = Number.POSITIVE_INFINITY
const report = (value: unknown) =>
  console.info(JSON.stringify({ g04Custody: value }))

describeConnected("G04 custody verifier sections (rolled back)", () => {
  beforeAll(async () => {
    await assertLauncherTarget()
    client = await connect()
    const [actual] = await client.$queryRawUnsafe<Array<{ database: string }>>(
      "SELECT current_database() AS database",
    )
    if (actual?.database !== "ewatrade_qa_v1")
      throw Error("Runtime database is not the authorized QA target")
    const pings: number[] = []
    for (let index = 0; index < 5; index++) {
      const started = performance.now()
      await client.$queryRawUnsafe("SELECT 1")
      pings.push(Math.round(performance.now() - started))
    }
    pings.sort((a, b) => a - b)
    medianMs = pings[2] ?? Number.POSITIVE_INFINITY
    report({ preflight: { pings, medianMs } })
  }, 40_000)
  afterAll(async () => {
    await client?.$disconnect()
  })

  // One explicitly sequenced case: the first section that does not complete
  // stops the run and every later section is reported UNRUN before the
  // failure is thrown (no reliance on later test callbacks or --bail).
  test("requested sections in order", async () => {
    const outcomes = await runSectionsInSequence(requested, runOne, report)
    expect(outcomes.every((row) => row.outcome === "completed")).toBe(true)
  }, 95_000)
})

/** One section: gate, planned IDs, rolled-back transaction, outcome. */
async function runOne(section: string) {
  const run =
    custodyVerifierSections[section as keyof typeof custodyVerifierSections]
  const balanceOnly =
    custodyBalanceSections[section as keyof typeof custodyBalanceSections]
  let stage = "gate"
  let rolledBack = false
  const startStatements = statements
  let failure: unknown
  try {
    if (!run && !balanceOnly)
      throw new SectionUnrun(`Unrun: unknown section ${section}`)
    assertSectionFits({ section, statements: budgets[section], medianMs })
    const ids = {
      section,
      tenantId: randomUUID(),
      userId: randomUUID(),
      storeId: randomUUID(),
    }
    // Recorded before any write, for the launcher's absence audit.
    const planFile = process.env.QA_STOCK_CUSTODY_PLAN_FILE
    if (!planFile) throw new SectionUnrun("Unrun: no plan file")
    appendFileSync(planFile, plannedIdsLine(ids))
    stage = "transaction"
    await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'")
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'")
        const db = createSavepointDb(tx) as unknown as PrismaClient
        stage = "setup"
        if (balanceOnly) {
          // Context-free section: only a user, QA Tenant and Store.
          await minimal(db, ids)
          stage = "section"
          await balanceOnly({
            db,
            tenantId: ids.tenantId,
            storeId: ids.storeId,
            userId: ids.userId,
          })
        } else if (run) {
          const ctx = await synthetic(db, ids)
          const env: CustodyVerifierEnv = {
            ctx: ctx.context,
            failingDb: injectReceiptFailure(db),
            conversationId: ctx.conversationId,
          }
          stage = "section"
          const entry = capabilityManifest.find(
            (capability) => capability.id === "inventory.custody.move",
          )
          if (!entry) throw Error("Custody capability missing")
          await withRolloutOverride(entry, "source", () => run(env))
        }
        stage = "rollback"
        throw new Rollback()
      },
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (error instanceof Rollback) rolledBack = true
    else failure = error
  }
  return sectionOutcome({
    section,
    stage,
    statements: statements - startStatements,
    rolledBack,
    error: failure,
  })
}

/** The minimal synthetic identities a context-free section needs. */
async function minimal(
  db: PrismaClient,
  ids: { tenantId: string; userId: string; storeId: string },
) {
  const run = randomUUID().slice(0, 12)
  await db.user.create({
    data: {
      id: ids.userId,
      email: `custody-${run}@example.invalid`,
      name: "Custody QA",
    },
  })
  await db.tenant.create({
    data: {
      id: ids.tenantId,
      slug: `custody-${run}`,
      name: "Custody QA",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      qaSourceDomain: "custody-verifier.test",
      qaMarkedAt: new Date(),
    },
  })
  await db.store.create({
    data: {
      id: ids.storeId,
      tenantId: ids.tenantId,
      name: "Custody QA Store",
      slug: `custody-${run}`,
      status: "ACTIVE",
    },
  })
}

/** Synthetic people, Store, session and conversation inside the section. */
async function synthetic(
  db: PrismaClient,
  ids: { tenantId: string; userId: string; storeId: string },
) {
  const run = randomUUID().slice(0, 12)
  const user = await db.user.create({
    data: {
      id: ids.userId,
      email: `custody-${run}@example.invalid`,
      name: "Custody QA",
      ageBand: "ADULT",
    },
  })
  const terms = currentEffectiveLegalPublication()
  if (terms)
    await db.legalAcceptance.create({
      data: {
        userId: user.id,
        version: terms.version,
        documentHash: terms.documentHash,
        surface: "custody-verifier",
      },
    })
  const tenant = await db.tenant.create({
    data: {
      id: ids.tenantId,
      slug: `custody-${run}`,
      name: "Custody QA",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      qaSourceDomain: "custody-verifier.test",
      qaMarkedAt: new Date(),
      users: { create: { userId: user.id, role: "OWNER", status: "ACTIVE" } },
    },
  })
  const store = await db.store.create({
    data: {
      id: ids.storeId,
      tenantId: tenant.id,
      name: "Custody QA Store",
      slug: `custody-${run}`,
      status: "ACTIVE",
    },
  })
  const session = await db.session.create({
    data: {
      userId: user.id,
      token: `custody-${run}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  })
  const tenantContext = await getActiveTenantForUser(db, {
    userId: user.id,
    tenantSlug: tenant.slug,
    storeId: store.id,
  })
  if (!tenantContext) throw Error("Synthetic context missing")
  const context: GeneralContext = {
    db,
    session: { session, user },
    tenantContext,
    tenantSlug: tenant.slug,
    tenantId: tenant.id,
    activeStoreId: store.id,
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    requestId: `custody-${run}`,
    cfRay: null,
    isInternalRequest: false,
    forcePrimary: false,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: null,
    qaSessionScope: null,
  }
  const conversation = await startGeneralConversation(db, {
    tenantId: tenant.id,
    storeId: store.id,
    userId: user.id,
  })
  return { context, conversationId: conversation.id }
}
// Prisma's TransactionClient type is only needed for the outer callback.
export type _OuterTransaction = Prisma.TransactionClient
