import { afterAll, expect, mock, test } from "bun:test"
import type { PrismaClient } from "@ewatrade/db"
import { validateComposition } from "@ewatrade/storefront-contracts/manifest"
import { getTemplateManifest } from "@ewatrade/storefront-templates"
import * as catalogRepository from "../../../../packages/db/src/queries/public-storefront"
import * as activityRepository from "../../../../packages/db/src/queries/storefront-activity"
import * as designRepository from "../../../../packages/db/src/queries/storefront-design-runs"
import * as siteRepository from "../../../../packages/db/src/queries/storefront-sites"

// Run this file alone: substitute only the broad barrel, preserving every actual
// storefront repository/command/JWT/projection implementation. The storage port
// below emulates Prisma delegates; it never constructs a database client.
mock.module("@ewatrade/db/queries", () => ({
  ...siteRepository,
  ...activityRepository,
  ...designRepository,
  ...catalogRepository,
}))

const previousFetch = globalThis.fetch
const previousSecret = process.env.BETTER_AUTH_SECRET
const previousModelKey = process.env.ASSISTANT_OPENAI_API_KEY
const previousDatabaseUrl = process.env.EWATRADE_DATABASE_URL
process.env.ASSISTANT_OPENAI_API_KEY = "offline-content-test-key-never-sent"
process.env.EWATRADE_DATABASE_URL = "postgresql://offline@localhost:1/unused"
const forbidNetwork = () => {
  throw new Error("Network is forbidden in storefront local command tests.")
}
globalThis.fetch = Object.assign(forbidNetwork, { preconnect: forbidNetwork })
process.env.BETTER_AUTH_SECRET =
  "local-only-storefront-signing-fixture-32-characters"
afterAll(() => {
  globalThis.fetch = previousFetch
  if (previousSecret === undefined)
    Reflect.deleteProperty(process.env, "BETTER_AUTH_SECRET")
  else process.env.BETTER_AUTH_SECRET = previousSecret
  if (previousModelKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_OPENAI_API_KEY")
  else process.env.ASSISTANT_OPENAI_API_KEY = previousModelKey
  if (previousDatabaseUrl === undefined)
    Reflect.deleteProperty(process.env, "EWATRADE_DATABASE_URL")
  else process.env.EWATRADE_DATABASE_URL = previousDatabaseUrl
  mock.restore()
})

const commands = await import("./site-commands")
const contentCommands = await import("./content-commands")
const { storefrontDesignHandler } = await import(
  "../../../../packages/jobs/src/handlers/storefront-design"
)
const { storefrontContentFields } = await import(
  "@ewatrade/storefront-templates"
)
const { storefrontContentBriefSchema } = await import(
  "@ewatrade/storefront-contracts/content"
)
type Row = Record<string, unknown>
type Args = { where?: Row; data?: Row; take?: number }
const clone = <T>(value: T): T => structuredClone(value)
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "tenantId_businessEventKey")
      return matches(row, expected as Row)
    if (expected && typeof expected === "object") {
      const predicate = expected as Row
      if (Array.isArray(predicate.in)) return predicate.in.includes(row[key])
      if (typeof predicate.startsWith === "string")
        return String(row[key]).startsWith(predicate.startsWith)
      if (typeof predicate.gte === "number")
        return Number(row[key]) >= predicate.gte
      if (predicate.gt instanceof Date)
        return (
          row[key] instanceof Date &&
          row[key].getTime() > predicate.gt.getTime()
        )
      throw new Error(`Unsupported local ORM predicate: ${key}`)
    }
    return row[key] === expected
  })
}

/** Only storage mechanics live here; real repositories own scope/CAS/replay/audit. */
function memoryDatabase(
  options: {
    planId?: string
    classification?: "LIVE" | "QA"
    /** Public catalog emulation; receives each `catalogItem.findMany` call. */
    catalog?: (args: Row) => Row[]
    catalogCount?: (args: Row) => number
  } = {},
) {
  let state = {
    sites: [] as Row[],
    releases: [] as Row[],
    events: [] as Row[],
    outbox: [] as Row[],
    scopes: [] as Row[],
    runs: [] as Row[],
    budgets: [] as Row[],
    usage: [] as Row[],
    configuration: {
      enabled: true,
      provider: "OPENAI",
      model: "gpt-4.1-mini",
      maxDailyRuns: 2,
      maxDailyTokens: 80000,
      reservedTokens: 40000,
      maxOutputTokens: 1000,
      maxInputBytes: 32000,
    } as Row | null,
    membershipRole: "OWNER",
    storeStatus: "ACTIVE",
    loseNextPublicationFence: false,
  }
  const tenant = {
    id: "tenant-local",
    name: "Synthetic local shop",
    slug: "synthetic-local-shop",
    isActive: true,
    dataClassification: options.classification ?? "QA",
    metadata: options.planId
      ? {
          retailOps: {
            subscription: {
              planId: options.planId,
              source: "local_command_fixture",
              grantedAt: "2026-10-01T00:00:00.000Z",
            },
          },
        }
      : { retailOpsPlanId: "starter" },
    subscription: null,
  }
  const store = {
    id: "store-local",
    tenantId: tenant.id,
    name: "Synthetic local Store",
    description: "Offline command fixture",
    currencyCode: "NGN",
    countryCode: "NG",
    supportPhone: null,
  }
  const actor = { tenantId: tenant.id, actorUserId: "owner-local" }
  const transactionOptions: unknown[] = []
  const rows = (table: "sites" | "releases", args: Args) =>
    state[table].filter((row) => matches(row, args.where))
  const event = (args: Args) =>
    state.events.find((row) => matches(row, args.where)) ?? null
  const updateRows = (rows: Row[], where: Row, data: Row) => {
    const found = rows.filter((row) => matches(row, where))
    for (const row of found)
      for (const [key, value] of Object.entries(data))
        row[key] =
          value && typeof value === "object" && "increment" in value
            ? Number(row[key]) + Number(value.increment)
            : clone(value)
    return { count: found.length }
  }
  const tx = {
    $queryRaw: async (
      query:
        | TemplateStringsArray
        | { strings: readonly string[]; values: unknown[] },
      ...parameters: unknown[]
    ) => {
      const parts = "strings" in query ? query.strings : query
      const values = "strings" in query ? query.values : parameters
      const sql = parts.join("?")
      if (sql.includes('FROM "SiteDesignRun"'))
        return state.runs
          .filter(
            (row) =>
              row.id === values[0] &&
              row.tenantId === values[1] &&
              row.storeId === values[2] &&
              row.siteId === values[3],
          )
          .map(({ id }) => ({ id }))
      if (sql.includes('FROM "AssistantBudget"'))
        return clone(state.budgets.filter((row) => row.scopeKey === values[0]))
      if (sql.includes('FROM "Site"'))
        return state.sites
          .filter(
            (row) =>
              row.id === values[0] &&
              row.tenantId === values[1] &&
              row.storeId === values[2],
          )
          .map(({ id }) => ({ id }))
      if (sql.includes('FROM "Membership"'))
        return values[0] === tenant.id && values[1] === actor.actorUserId
          ? [{ id: "membership-local" }]
          : []
      return values[0] === tenant.id ? [{ id: tenant.id }] : []
    },
    membership: {
      findFirst: async ({ where = {} }: Args) =>
        matches(
          {
            tenantId: tenant.id,
            userId: actor.actorUserId,
            status: "ACTIVE",
            role: state.membershipRole,
          },
          where,
        )
          ? { tenant: clone(tenant) }
          : null,
    },
    store: {
      findFirst: async ({ where = {} }: Args) =>
        matches({ ...store, status: state.storeStatus }, where)
          ? clone(store)
          : null,
      findMany: async ({ where = {} }: Args) =>
        matches(store, where) ? [clone(store)] : [],
    },
    tenant: {
      findUnique: async ({ where = {} }: Args) =>
        matches(tenant, where) ? clone(tenant) : null,
      findFirst: async ({ where = {}, select }: Args & { select?: Row }) => {
        if (!matches(tenant, where)) return null
        const stores = select?.stores as { where?: Row } | undefined
        return {
          ...clone(tenant),
          stores: matches(
            { ...store, status: state.storeStatus },
            stores?.where,
          )
            ? [clone(store)]
            : [],
        }
      },
    },
    site: {
      findMany: async (args: Args) =>
        clone(rows("sites", args).slice(0, args.take)),
      findFirst: async (args: Args) => clone(rows("sites", args)[0] ?? null),
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: `site-${state.sites.length + 1}`,
          activeReleaseId: null,
          ...clone(data),
        }
        state.sites.push(row)
        return clone(row)
      },
      updateMany: async ({ where = {}, data = {} }: Args) => {
        if (data.status === "PUBLISHED" && state.loseNextPublicationFence) {
          state.loseNextPublicationFence = false
          return { count: 0 }
        }
        const found = rows("sites", { where })
        for (const row of found)
          for (const [key, value] of Object.entries(data))
            row[key] =
              value && typeof value === "object" && "increment" in value
                ? Number(row[key]) + Number(value.increment)
                : clone(value)
        return { count: found.length }
      },
    },
    siteRelease: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: `release-${state.releases.length + 1}`,
          createdAt: new Date(),
          ...clone(data),
        }
        state.releases.push(row)
        return clone(row)
      },
      findFirst: async (args: Args) => clone(rows("releases", args)[0] ?? null),
      findMany: async (args: Args) =>
        clone(rows("releases", args).reverse().slice(0, args.take)),
    },
    businessActivityEvent: {
      createMany: async ({ data }: { data: Row[] }) => {
        let count = 0
        for (const row of data)
          if (
            !state.events.some(
              (old) =>
                old.tenantId === row.tenantId &&
                old.businessEventKey === row.businessEventKey,
            )
          ) {
            state.events.push({
              id: `event-${state.events.length + 1}`,
              ...clone(row),
            })
            count++
          }
        return { count }
      },
      findUnique: async (args: Args) => clone(event(args)),
      findUniqueOrThrow: async (args: Args) => {
        const found = event(args)
        if (!found) throw new Error("Missing local audit event")
        return clone(found)
      },
    },
    businessActivityStoreScope: {
      createMany: async ({ data }: { data: Row[] }) =>
        state.scopes.push(...clone(data)),
    },
    businessActivityOutbox: {
      create: async ({ data }: { data: Row }) => state.outbox.push(clone(data)),
    },
    catalogItem: {
      findMany: async (args: Row) => clone(options.catalog?.(args) ?? []),
      findFirst: async () => null,
      count: async (args: Row) => options.catalogCount?.(args) ?? 0,
    },
    catalogCategory: { findMany: async () => [] },
    stockBalanceSource: { groupBy: async () => [] },
    systemConfiguration: {
      findUnique: async () => ({ value: clone(state.configuration) }),
    },
    assistantBudget: {
      upsert: async ({ where = {}, create }: Args & { create: Row }) => {
        let row = state.budgets.find((entry) => matches(entry, where))
        if (!row) {
          row = { requests: 0, tokens: 0, ...clone(create) }
          state.budgets.push(row)
        }
        return clone(row)
      },
      update: async ({ where = {}, data = {} }: Args) => {
        updateRows(state.budgets, where, data)
        return clone(state.budgets.find((row) => matches(row, where)))
      },
      updateMany: async ({ where = {}, data = {} }: Args) =>
        updateRows(state.budgets, where, data),
    },
    assistantUsageEvent: {
      create: async ({ data }: { data: Row }) => {
        state.usage.push(clone(data))
        return clone(data)
      },
    },
    qaAccessAuditEvent: { create: async () => ({ id: "qa-blocked" }) },
    siteDesignRun: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: `run-${state.runs.length + 1}`,
          status: "QUEUED",
          attempts: 0,
          providerStartedAt: null,
          acceptedAt: null,
          leaseToken: null,
          leaseUntil: null,
          output: null,
          outputHash: null,
          actualTokens: null,
          usageSettledAt: null,
          createdAt: new Date(),
          completedAt: null,
          ...clone(data),
        }
        state.runs.push(row)
        return clone(row)
      },
      findFirst: async ({ where = {} }: Args) =>
        clone(state.runs.find((row) => matches(row, where)) ?? null),
      findUnique: async ({ where = {} }: Args) =>
        clone(state.runs.find((row) => matches(row, where)) ?? null),
      findMany: async ({ where = {}, take }: Args) =>
        clone(
          state.runs
            .filter((row) => matches(row, where))
            .reverse()
            .slice(0, take),
        ),
      update: async ({ where = {}, data = {} }: Args) => {
        updateRows(state.runs, where, data)
        return clone(state.runs.find((row) => matches(row, where)))
      },
      updateMany: async ({ where = {}, data = {} }: Args) =>
        updateRows(state.runs, where, data),
    },
  }
  // Serialized storage port emulates held transaction locks; this is not SQL lock proof.
  let queue = Promise.resolve()
  const db = {
    ...tx,
    async $transaction<T>(
      run: (client: typeof tx) => Promise<T>,
      options: unknown,
    ) {
      const previous = queue
      let release = () => {}
      queue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      transactionOptions.push(options)
      const before = clone(state)
      try {
        return await run(tx)
      } catch (error) {
        state = before
        throw error
      } finally {
        release()
      }
    },
  } as unknown as PrismaClient
  return { db, actor, state: () => state, transactionOptions }
}

test("offline reviewed-component draft, signed preview, publication, replay and rollback preserve authority and immutable history", async () => {
  const fixture = memoryDatabase()
  const { db, actor } = fixture
  const initialized = await commands.initializeStorefront(db, actor, {
    storeId: "store-local",
    templateKey: "component-editorial",
  })
  expect(initialized).toMatchObject({
    ok: true,
    created: true,
    draft: { revision: 1 },
    activeReleaseId: null,
  })
  if (!initialized.ok) throw new Error("Fixture did not initialize")
  expect(getTemplateManifest(initialized.draft.composition).key).toBe(
    "component-editorial",
  )
  const siteId = initialized.siteId
  const oldSession = await commands.startStorefrontPreview(db, actor)
  const composition = clone(
    validateComposition(
      initialized.draft.composition,
      getTemplateManifest(initialized.draft.composition),
    ),
  )
  composition.theme.font = "serif"
  const saved = await commands.saveStorefrontDraft(db, actor, {
    expectedSiteId: siteId,
    expectedRevision: 1,
    composition,
  })
  expect(saved).toMatchObject({
    ok: true,
    draft: { revision: 2, composition: { theme: { font: "serif" } } },
    activeReleaseId: null,
  })
  expect(
    await commands.saveStorefrontDraft(db, actor, {
      expectedSiteId: siteId,
      expectedRevision: 1,
      composition,
    }),
  ).toMatchObject({
    ok: false,
    reason: "draft-conflict",
    current: { draftRevision: 2 },
  })
  await expect(
    commands.previewStorefrontDraft(db, actor, { session: oldSession.session }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const freshSession = await commands.startStorefrontPreview(db, actor)
  const preview = await commands.previewStorefrontDraft(db, actor, {
    session: freshSession.session,
  })
  expect(preview).toMatchObject({
    draftRevision: 2,
    snapshot: {
      mode: "preview",
      composition: { theme: { font: "serif" } },
      resources: {
        business: { name: "Synthetic local shop" },
        contact: { chatToken: null, whatsAppPhone: null },
      },
    },
  })
  expect(fixture.state().releases).toHaveLength(0)
  const publish = {
    expectedSiteId: siteId,
    expectedDraftRevision: 2,
    expectedActiveReleaseId: null,
    idempotencyKey: "local-publish-01",
    publicBrowsingConsent: true as const,
  }
  expect(() =>
    Reflect.apply(commands.publishStorefront, undefined, [
      db,
      actor,
      { ...publish, publicBrowsingConsent: false },
    ]),
  ).toThrow()
  const first = await commands.publishStorefront(db, actor, publish)
  expect(first).toMatchObject({
    ok: true,
    replayed: false,
    releaseId: "release-1",
    activeReleaseId: "release-1",
  })
  const firstFrozen = clone(fixture.state().releases[0])
  const auditCount = fixture.state().events.length
  expect(await commands.publishStorefront(db, actor, publish)).toMatchObject({
    ok: true,
    replayed: true,
    releaseId: "release-1",
  })
  expect(fixture.state().events).toHaveLength(auditCount)
  expect(
    await commands.publishStorefront(db, actor, {
      ...publish,
      expectedDraftRevision: 1,
    }),
  ).toMatchObject({ ok: false, reason: "idempotency-conflict" })
  const changed = clone(composition)
  changed.theme.font = "system"
  expect(
    await commands.saveStorefrontDraft(db, actor, {
      expectedSiteId: siteId,
      expectedRevision: 2,
      composition: changed,
    }),
  ).toMatchObject({ ok: true, draft: { revision: 3 } })
  expect(fixture.state().releases[0]).toEqual(firstFrozen)
  expect(
    await commands.publishStorefront(db, actor, {
      ...publish,
      idempotencyKey: "local-publish-02",
      expectedDraftRevision: 3,
    }),
  ).toMatchObject({ ok: false, reason: "active-release-conflict" })
  expect(
    await commands.publishStorefront(db, actor, {
      ...publish,
      idempotencyKey: "local-publish-02",
      expectedDraftRevision: 3,
      expectedActiveReleaseId: "release-1",
    }),
  ).toMatchObject({ ok: true, releaseId: "release-2" })
  const releasesBeforeRollback = clone(fixture.state().releases)
  const siteBeforeRollback = fixture.state().sites[0]
  if (!siteBeforeRollback)
    throw new Error("Expected the initialized Site fixture")
  const draftBeforeRollback = clone(siteBeforeRollback.draftComposition)
  const rollback = {
    expectedSiteId: siteId,
    releaseId: "release-1",
    expectedActiveReleaseId: "release-2",
    idempotencyKey: "local-rollback-01",
  }
  expect(await commands.rollbackStorefront(db, actor, rollback)).toMatchObject({
    ok: true,
    replayed: false,
    activeReleaseId: "release-1",
  })
  expect(await commands.rollbackStorefront(db, actor, rollback)).toMatchObject({
    ok: true,
    replayed: true,
    activeReleaseId: "release-1",
  })
  expect(fixture.state().releases).toEqual(releasesBeforeRollback)
  expect(fixture.state().sites[0]?.draftComposition).toEqual(
    draftBeforeRollback,
  )
  expect(
    fixture
      .state()
      .outbox.filter((row) => row.consumer === "storefront_release"),
  ).toHaveLength(3)
  fixture.state().membershipRole = "STAFF"
  await expect(
    commands.publishStorefront(db, actor, publish),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  fixture.state().membershipRole = "OWNER"
  const stateBeforeLostFence = clone(fixture.state())
  fixture.state().loseNextPublicationFence = true
  await expect(
    commands.publishStorefront(db, actor, {
      ...publish,
      expectedDraftRevision: 3,
      expectedActiveReleaseId: "release-1",
      idempotencyKey: "local-lost-fence",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(fixture.state().releases).toEqual(stateBeforeLostFence.releases)
  expect(fixture.state().events).toEqual(stateBeforeLostFence.events)
  expect(fixture.state().outbox).toEqual(stateBeforeLostFence.outbox)
  expect(
    fixture.transactionOptions.every(
      (value) => JSON.stringify(value) === '{"maxWait":10000,"timeout":30000}',
    ),
  ).toBe(true)
  expect(new Set(fixture.transactionOptions).size).toBe(
    fixture.transactionOptions.length,
  )
})

/** Public projection row the repository's shared item select returns. */
const catalogRow = (id: string) => ({
  id,
  name: `Item ${id}`,
  kind: "PRODUCT",
  description: null,
  categoryRecord: null,
  illustrations: [],
  product: { lowStockLevel: null },
  offerings: [
    {
      id: `${id}-o`,
      name: "Standard",
      fixedPriceMinor: 1000,
      currencyCode: "NGN",
      pricingPolicy: "FIXED",
      productUnitOffering: null,
      serviceOffering: null,
      variant: {
        id: `${id}-v`,
        name: "Standard",
        isDefault: true,
        stockBalanceSources: [],
      },
    },
  ],
})

test("Studio preview keeps scoped business totals for filtered and empty results, once per request", async () => {
  let rows = [catalogRow("match")]
  const counts: Row[] = []
  const fixture = memoryDatabase({
    planId: "growth",
    catalog: (args) => {
      const where = args.where as { AND?: Row[] } | undefined
      // These fixture rows have no unavailable policy or sold-out balance.
      return Array.isArray(where?.AND?.[1]?.OR) ? [] : rows
    },
    catalogCount: (args) => {
      const where = args.where as { AND?: Row[] } | undefined
      const kind = where?.AND?.find(
        (entry) => typeof entry.kind === "string",
      )?.kind
      if (!kind) return 0
      counts.push(args)
      return kind === "PRODUCT" ? 8 : 1
    },
  })
  const { db, actor } = fixture
  const initialized = await commands.initializeStorefront(db, actor, {
    storeId: "store-local",
    templateKey: "commerce-studio",
  })
  if (!initialized.ok) throw new Error("Fixture did not initialize")
  const session = await commands.startStorefrontPreview(db, actor)
  const preview = () =>
    commands.previewStorefrontDraft(db, actor, {
      session: session.session,
      query: { q: "match" },
      designs: [initialized.draft.composition],
    })
  const filtered = await preview()
  for (const snapshot of [filtered.snapshot, ...filtered.designSnapshots]) {
    expect(snapshot.resources.catalog.items).toHaveLength(1)
    expect(snapshot.resources.catalog.offeringCounts).toEqual({
      products: 8,
      services: 1,
    })
  }
  expect(counts).toHaveLength(2)
  expect(counts[0]).toMatchObject({
    where: {
      AND: [
        catalogRepository.publicCatalogItemWhere("tenant-local", "store-local"),
        { kind: "PRODUCT" },
      ],
    },
  })
  rows = []
  const empty = await preview()
  expect(empty.snapshot.resources.catalog.items).toEqual([])
  expect(empty.snapshot.resources.catalog.offeringCounts).toEqual({
    products: 8,
    services: 1,
  })
  expect(counts).toHaveLength(4)
  expect(fixture.state().releases).toHaveLength(0)
})

test("Studio preview loads Featured pins past the page with the bounded public read", async () => {
  // "far" is public but past the loaded page; "archived" is no longer public.
  const page = ["on-page"]
  const eligible = new Set(["on-page", "far"])
  const pinnedReads: Row[] = []
  const fixture = memoryDatabase({
    planId: "growth",
    catalog: (args) => {
      const where = args.where as
        | { AND?: [Row, { id?: { in?: string[] }; OR?: Row[] }] }
        | undefined
      const ids = where?.AND?.[1]?.id?.in
      // No fixture row belongs in the explicit out-of-stock bucket.
      if (where?.AND?.[1]?.OR) return []
      if (ids) {
        pinnedReads.push(args)
        return ids.filter((id) => eligible.has(id)).map(catalogRow)
      }
      return page.map(catalogRow)
    },
  })
  const { db, actor } = fixture
  const initialized = await commands.initializeStorefront(db, actor, {
    storeId: "store-local",
    templateKey: "commerce-studio",
  })
  if (!initialized.ok) throw new Error("Fixture did not initialize")
  const draft = validateComposition(
    initialized.draft.composition,
    getTemplateManifest(initialized.draft.composition),
  )
  expect(draft.template.version).toBe("1.2.0")
  const preview = async () =>
    commands.previewStorefrontDraft(db, actor, {
      session: (await commands.startStorefrontPreview(db, actor)).session,
    })
  // No pins: the preview makes no pinned read and carries no pinnedItems.
  const plain = await preview()
  expect(plain.snapshot.resources.catalog.pinnedItems).toBeUndefined()
  expect(pinnedReads).toHaveLength(0)

  const pinned = clone(draft)
  const featured = pinned.pages[0]?.sections.find(
    (section) => section.type === "commerce-studio-featured",
  )
  if (!featured) throw new Error("Featured missing")
  featured.settings.pinned = ["far", "archived", "on-page"]
  const saved = await commands.saveStorefrontDraft(db, actor, {
    expectedSiteId: initialized.siteId,
    expectedRevision: initialized.draft.revision,
    composition: pinned,
  })
  expect(saved.ok).toBe(true)
  const result = await preview()
  const catalog = result.snapshot.resources.catalog
  expect(catalog.items.map((item) => item.id)).toEqual(["on-page"])
  // Past-the-page public pin included; archived pin excluded; on-page pin not repeated.
  expect(catalog.pinnedItems?.map((item) => item.id)).toEqual(["far"])
  // One bounded read, only for pins missing from the page, under public eligibility.
  expect(pinnedReads).toHaveLength(1)
  expect(pinnedReads[0]).toMatchObject({
    where: {
      AND: [
        catalogRepository.publicCatalogItemWhere("tenant-local", "store-local"),
        { id: { in: ["far", "archived"] } },
      ],
    },
    take: 2,
  })
  // Unsaved candidate designs get the same read for their own pins.
  const candidate = clone(pinned)
  const candidateFeatured = candidate.pages[0]?.sections.find(
    (section) => section.type === "commerce-studio-featured",
  )
  if (!candidateFeatured) throw new Error("Featured missing")
  candidateFeatured.settings.pinned = ["on-page"]
  const designs = await commands.previewStorefrontDraft(db, actor, {
    session: (await commands.startStorefrontPreview(db, actor)).session,
    designs: [candidate],
  })
  expect(
    designs.designSnapshots[0]?.resources.catalog.pinnedItems,
  ).toBeUndefined()
  expect(pinnedReads).toHaveLength(2)
  expect(fixture.state().releases).toHaveLength(0)
})

test("Studio preview never loads a pin outside an included plan's cap", async () => {
  const reads: Row[] = []
  // Starter shows only the first 3 eligible entries; "far" is the 4th.
  const eligible = ["a", "b", "c", "far"]
  const fixture = memoryDatabase({
    catalog: (args) => {
      reads.push(args)
      const where = args.where as
        | { AND?: [Row, { id?: { in?: string[] } }] }
        | undefined
      const ids = where?.AND?.[1]?.id?.in
      const rows = ids ? eligible.filter((id) => ids.includes(id)) : eligible
      return rows.slice(0, args.take as number | undefined).map(catalogRow)
    },
  })
  const { db, actor } = fixture
  const initialized = await commands.initializeStorefront(db, actor, {
    storeId: "store-local",
    templateKey: "commerce-studio",
  })
  if (!initialized.ok) throw new Error("Fixture did not initialize")
  const pinned = validateComposition(
    initialized.draft.composition,
    getTemplateManifest(initialized.draft.composition),
  )
  const featured = pinned.pages[0]?.sections.find(
    (section) => section.type === "commerce-studio-featured",
  )
  if (!featured) throw new Error("Featured missing")
  featured.settings.pinned = ["far"]
  await commands.saveStorefrontDraft(db, actor, {
    expectedSiteId: initialized.siteId,
    expectedRevision: initialized.draft.revision,
    composition: pinned,
  })
  const result = await commands.previewStorefrontDraft(db, actor, {
    session: (await commands.startStorefrontPreview(db, actor)).session,
  })
  expect(
    result.snapshot.resources.catalog.items.map((item) => item.id),
  ).toEqual(["a", "b", "c"])
  expect(result.snapshot.resources.catalog.pinnedItems).toBeUndefined()
  // The cap check reads at most the cap; no ID lookup follows for an over-cap pin.
  expect(
    reads.some(
      (args) =>
        (args.where as { AND?: unknown[] } | undefined)?.AND !== undefined,
    ),
  ).toBe(false)
})

async function contentFixture(classification: "LIVE" | "QA" = "LIVE") {
  const fixture = memoryDatabase({ classification })
  const initialized = await commands.initializeStorefront(
    fixture.db,
    fixture.actor,
    { storeId: "store-local", templateKey: "catalog-v4" },
  )
  if (!initialized.ok) throw new Error("Content fixture did not initialize")
  const composition = validateComposition(
    initialized.draft.composition,
    getTemplateManifest(initialized.draft.composition),
  )
  const fields = storefrontContentFields(composition, "home").slice(0, 2)
  if (fields.length !== 2) throw new Error("Expected two copy areas")
  return {
    ...fixture,
    input: {
      expectedSiteId: initialized.siteId,
      expectedDraftRevision: initialized.draft.revision,
      clientRequestId: "content-intent-01",
      composition,
      pageKey: "home",
      fieldIds: fields.map((field) => field.id),
      context: {
        name: "Synthetic local shop",
        description: "Handmade baskets and repairs.",
        location: "Ibadan",
        offerings: "Baskets and repairs",
      },
      instructions: "Keep the copy warm and concise.",
      previous: [],
    },
    fields,
  }
}
function contentResult(
  fixture: Awaited<ReturnType<typeof contentFixture>>,
  text = "Explore our workshop",
) {
  const brief = storefrontContentBriefSchema.parse(
    fixture.state().runs[0]?.brief,
  )
  return {
    text: JSON.stringify({
      version: 1,
      fields: brief.fields.map((field) => ({
        id: field.id,
        text,
        sourceReferences: ["context.name"],
      })),
    }),
    tokens: 100,
  }
}

test("content intents retain exact snapshot, scoped authority, one reservation and design isolation", async () => {
  const fixture = await contentFixture()
  const { db, actor, input } = fixture
  expect(
    (
      await contentCommands.readStorefrontContentContext(db, actor, {
        expectedSiteId: input.expectedSiteId,
      })
    ).available,
  ).toBe(true)
  const site = clone(fixture.state().sites[0])
  const queued = await contentCommands.requestStorefrontContent(
    db,
    actor,
    input,
  )
  expect(queued).toMatchObject({
    replayed: false,
    run: { status: "QUEUED", output: null },
  })
  expect(fixture.state().runs).toHaveLength(1)
  expect(fixture.state().budgets[0]).toMatchObject({
    requests: 1,
    tokens: 40000,
  })
  expect(fixture.state().sites[0]).toEqual(site)
  const replay = await contentCommands.requestStorefrontContent(
    db,
    actor,
    input,
  )
  expect(replay).toMatchObject({ replayed: true, run: { id: queued.run.id } })
  expect(fixture.state().budgets[0]?.requests).toBe(1)
  expect(
    (await commands.readStorefrontGenerations(db, actor)).runs,
  ).toHaveLength(0)
  await expect(
    commands.readStorefrontGeneration(db, actor, {
      expectedSiteId: input.expectedSiteId,
      runId: queued.run.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    commands.cancelStorefrontGeneration(db, actor, {
      expectedSiteId: input.expectedSiteId,
      runId: queued.run.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    commands.acceptStorefrontDesign(db, actor, {
      expectedSiteId: input.expectedSiteId,
      runId: queued.run.id,
      expectedRevision: 1,
      directionId: "01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      instructions: "Different",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      expectedSiteId: "foreign-site",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  fixture.state().membershipRole = "STAFF"
  await expect(
    contentCommands.requestStorefrontContent(db, actor, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    contentCommands.readStorefrontContent(db, actor, {
      expectedSiteId: input.expectedSiteId,
      runId: queued.run.id,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  fixture.state().membershipRole = "OWNER"
  fixture.state().storeStatus = "INACTIVE"
  await expect(
    contentCommands.requestStorefrontContent(db, actor, input),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
})

test("content rejects stale revisions, unknown/duplicate fields, extra authority and absent facts before reserving", async () => {
  const fixture = await contentFixture()
  const { db, actor, input } = fixture
  await expect(
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      expectedDraftRevision: 0,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      fieldIds: ["foreign-field"],
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      fieldIds: [input.fieldIds[0], input.fieldIds[0]],
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      context: { ...input.context, description: "", offerings: "" },
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(() =>
    contentCommands.requestStorefrontContent(db, actor, {
      ...input,
      tenantId: "another-business",
    }),
  ).toThrow()
  expect(fixture.state().runs).toHaveLength(0)
  expect(fixture.state().budgets).toHaveLength(0)
  const qa = await contentFixture("QA")
  expect(
    (
      await contentCommands.readStorefrontContentContext(qa.db, qa.actor, {
        expectedSiteId: qa.input.expectedSiteId,
      })
    ).available,
  ).toBe(false)
  await expect(
    contentCommands.requestStorefrontContent(qa.db, qa.actor, qa.input),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  expect(qa.state().runs).toHaveLength(0)
  fixture.state().configuration = null
  await expect(
    contentCommands.requestStorefrontContent(db, actor, input),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
})

test("content workers claim once, validate the exact fields and settle one content usage receipt", async () => {
  const fixture = await contentFixture()
  const queued = await contentCommands.requestStorefrontContent(
    fixture.db,
    fixture.actor,
    fixture.input,
  )
  let calls = 0
  const generate = async (_configuration: unknown, prompt: string) => {
    calls++
    expect(prompt).toContain(fixture.input.instructions)
    expect(prompt).toContain("recommended minWords/maxWords")
    return contentResult(fixture)
  }
  await Promise.all([
    storefrontDesignHandler(
      { runId: queued.run.id },
      { db: fixture.db, generate },
    ),
    storefrontDesignHandler(
      { runId: queued.run.id },
      { db: fixture.db, generate },
    ),
  ])
  expect(calls).toBe(1)
  expect(fixture.state().runs[0]?.status).toBe("READY")
  expect(fixture.state().usage).toHaveLength(1)
  expect(fixture.state().usage[0]).toMatchObject({
    requestClass: "storefront-content",
    totalTokens: 100,
  })
  expect(fixture.state().budgets[0]).toMatchObject({ requests: 1, tokens: 100 })
  const read = await contentCommands.readStorefrontContent(
    fixture.db,
    fixture.actor,
    { expectedSiteId: fixture.input.expectedSiteId, runId: queued.run.id },
  )
  expect(read.output?.fields.map((field) => field.id)).toEqual(
    fixture.input.fieldIds,
  )
  expect(fixture.state().sites[0]?.draftRevision).toBe(1)
})

test("cancel before provider refunds only tokens; concurrent new intents remain within the shared allowance", async () => {
  const fixture = await contentFixture()
  const queued = await contentCommands.requestStorefrontContent(
    fixture.db,
    fixture.actor,
    fixture.input,
  )
  await contentCommands.cancelStorefrontContent(fixture.db, fixture.actor, {
    expectedSiteId: fixture.input.expectedSiteId,
    runId: queued.run.id,
  })
  expect(fixture.state().budgets[0]).toMatchObject({ requests: 1, tokens: 0 })
  let calls = 0
  await storefrontDesignHandler(
    { runId: queued.run.id },
    {
      db: fixture.db,
      generate: async () => {
        calls++
        return contentResult(fixture)
      },
    },
  )
  expect(calls).toBe(0)
  const outcomes = await Promise.allSettled(
    ["second", "third"].map((key) =>
      contentCommands.requestStorefrontContent(fixture.db, fixture.actor, {
        ...fixture.input,
        clientRequestId: `content-intent-${key}`,
      }),
    ),
  )
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1)
  expect(
    outcomes.filter((result) => result.status === "rejected"),
  ).toHaveLength(1)
  expect(fixture.state().runs).toHaveLength(2)
  expect(fixture.state().budgets[0]).toMatchObject({
    requests: 2,
    tokens: 40000,
  })
})

test("unknown provider outcomes hold the reservation and cannot be sent again", async () => {
  const fixture = await contentFixture()
  const queued = await contentCommands.requestStorefrontContent(
    fixture.db,
    fixture.actor,
    fixture.input,
  )
  let calls = 0
  const generate = async () => {
    calls++
    throw new Error("Ambiguous transport outcome")
  }
  await storefrontDesignHandler(
    { runId: queued.run.id },
    { db: fixture.db, generate },
  )
  expect(fixture.state().runs[0]).toMatchObject({
    status: "FAILED",
    errorCode: "PROVIDER_OUTCOME_UNKNOWN",
    usageSettledAt: null,
  })
  expect(fixture.state().budgets[0]?.tokens).toBe(40000)
  expect(fixture.state().usage).toHaveLength(0)
  await storefrontDesignHandler(
    { runId: queued.run.id },
    { db: fixture.db, generate },
  )
  expect(calls).toBe(1)
  expect(
    (
      await contentCommands.readStorefrontContent(fixture.db, fixture.actor, {
        expectedSiteId: fixture.input.expectedSiteId,
        runId: queued.run.id,
      })
    ).needsReconciliation,
  ).toBe(true)
})

test("revoked worker authority and changed writing guidance stop before a provider call", async () => {
  for (const reason of ["revoked", "guidance"] as const) {
    const fixture = await contentFixture()
    const queued = await contentCommands.requestStorefrontContent(
      fixture.db,
      fixture.actor,
      fixture.input,
    )
    if (reason === "revoked") fixture.state().membershipRole = "STAFF"
    else {
      const row = fixture.state().runs[0]
      if (!row) throw new Error("Missing queued run")
      const brief = storefrontContentBriefSchema.parse(row.brief)
      brief.profiles[0] = {
        ...brief.profiles[0],
        voice: "Unapproved replacement voice",
      } as (typeof brief.profiles)[number]
      row.brief = brief
      row.inputHash = siteRepository.siteContentHash({
        brief,
        manifests: row.manifests,
        configuration: row.configuration,
      })
    }
    let calls = 0
    await storefrontDesignHandler(
      { runId: queued.run.id },
      {
        db: fixture.db,
        generate: async () => {
          calls++
          return contentResult(fixture)
        },
      },
    )
    expect(calls).toBe(0)
    expect(fixture.state().runs[0]?.status).toBe("FAILED")
    expect(fixture.state().budgets[0]?.tokens).toBe(0)
  }
})

test("invalid generated claims settle known usage but never become a reviewable result", async () => {
  const fixture = await contentFixture()
  const queued = await contentCommands.requestStorefrontContent(
    fixture.db,
    fixture.actor,
    fixture.input,
  )
  await storefrontDesignHandler(
    { runId: queued.run.id },
    {
      db: fixture.db,
      generate: async () => contentResult(fixture, "Guaranteed free delivery"),
    },
  )
  expect(fixture.state().runs[0]).toMatchObject({
    status: "FAILED",
    errorCode: "DESIGN_OUTPUT_INVALID",
    output: null,
  })
  expect(fixture.state().budgets[0]?.tokens).toBe(100)
  expect(fixture.state().usage).toHaveLength(1)
})

test("cancellation during a provider call cannot expose late output and settles known usage only once", async () => {
  const fixture = await contentFixture()
  const queued = await contentCommands.requestStorefrontContent(
    fixture.db,
    fixture.actor,
    fixture.input,
  )
  const started = Promise.withResolvers<void>()
  const response = Promise.withResolvers<ReturnType<typeof contentResult>>()
  let calls = 0
  const worker = storefrontDesignHandler(
    { runId: queued.run.id },
    {
      db: fixture.db,
      generate: async () => {
        calls++
        started.resolve()
        return response.promise
      },
    },
  )
  await started.promise
  const cancelled = await contentCommands.cancelStorefrontContent(
    fixture.db,
    fixture.actor,
    { expectedSiteId: fixture.input.expectedSiteId, runId: queued.run.id },
  )
  expect(cancelled.status).toBe("CANCELLED")
  expect(fixture.state().budgets[0]?.tokens).toBe(40000)
  response.resolve(contentResult(fixture))
  await worker
  expect(calls).toBe(1)
  expect(fixture.state().runs[0]).toMatchObject({
    status: "CANCELLED",
    output: null,
    actualTokens: 100,
  })
  expect(fixture.state().budgets[0]?.tokens).toBe(100)
  expect(fixture.state().usage).toHaveLength(1)
  await contentCommands.cancelStorefrontContent(fixture.db, fixture.actor, {
    expectedSiteId: fixture.input.expectedSiteId,
    runId: queued.run.id,
  })
  expect(fixture.state().usage).toHaveLength(1)
})
