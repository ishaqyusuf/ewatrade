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
globalThis.fetch = (() => {
  throw new Error("Network is forbidden in storefront local command tests.")
}) as typeof fetch
process.env.BETTER_AUTH_SECRET =
  "local-only-storefront-signing-fixture-32-characters"
afterAll(() => {
  globalThis.fetch = previousFetch
  if (previousSecret === undefined)
    Reflect.deleteProperty(process.env, "BETTER_AUTH_SECRET")
  else process.env.BETTER_AUTH_SECRET = previousSecret
  mock.restore()
})

const commands = await import("./site-commands")
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
      throw new Error(`Unsupported local ORM predicate: ${key}`)
    }
    return row[key] === expected
  })
}

/** Only storage mechanics live here; real repositories own scope/CAS/replay/audit. */
function memoryDatabase() {
  let state = {
    sites: [] as Row[],
    releases: [] as Row[],
    events: [] as Row[],
    outbox: [] as Row[],
    scopes: [] as Row[],
    membershipRole: "OWNER",
    storeStatus: "ACTIVE",
    loseNextPublicationFence: false,
  }
  const tenant = {
    id: "tenant-local",
    name: "Synthetic local shop",
    slug: "synthetic-local-shop",
    isActive: true,
    dataClassification: "QA",
    metadata: { retailOpsPlanId: "starter" },
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
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?")
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
    catalogItem: { findMany: async () => [] },
  }
  const db = {
    async $transaction<T>(
      run: (client: typeof tx) => Promise<T>,
      options: unknown,
    ) {
      transactionOptions.push(options)
      const before = clone(state)
      try {
        return await run(tx)
      } catch (error) {
        state = before
        throw error
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
  const draftBeforeRollback = clone(fixture.state().sites[0].draftComposition)
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
  expect(fixture.state().sites[0].draftComposition).toEqual(draftBeforeRollback)
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
