import { expect, spyOn, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import { auth } from "@ewatrade/auth"
import { PrismaClient, prisma } from "@ewatrade/db"
import { AccountAgeBand, MembershipStatus } from "@ewatrade/db/enums"
import { Hono } from "hono"
import {
  type TRPCContext,
  createCallerFactory,
  createTRPCContext,
  createTRPCRouter,
  protectedProcedure,
} from "./init"

const router = createTRPCRouter({
  first: protectedProcedure.query(({ ctx }) => ctx.tenantId),
  second: protectedProcedure.query(
    ({ ctx }) => ctx.tenantContext.activeStore?.id,
  ),
  write: protectedProcedure.mutation(() => "accepted"),
})

type State = {
  ageBand: AccountAgeBand
  preferenceActive: boolean
  authenticated: boolean
  qa: boolean
  failure?: Error
}

// Actual Hono -> createTRPCContext -> protected middleware/query path. Only SDK
// and repository I/O are inert, with spies restored after every case. No live DB.
async function fixture(
  work: (f: {
    state: State
    request: (method?: string, headers?: HeadersInit) => Promise<TRPCContext>
    counts: { preference: number; age: number; tenant: number; proof: number }
    preferences: Parameters<typeof prisma.membership.findFirst>[0][]
  }) => Promise<void>,
) {
  const state: State = {
    ageBand: "ADULT",
    preferenceActive: true,
    authenticated: true,
    qa: false,
  }
  const counts = { preference: 0, age: 0, tenant: 0, proof: 0 }
  const preferences: Parameters<typeof prisma.membership.findFirst>[0][] = []
  const now = new Date()
  const session = {
    session: {
      id: "session",
      token: "inert-token",
      userId: "actor",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: "actor",
      name: "Actor",
      email: "actor@example.invalid",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  }
  const getSession = Object.assign(
    async () =>
      state.authenticated
        ? {
            ...session,
            session: {
              ...session.session,
              token: state.qa ? "qas_inert" : session.session.token,
            },
          }
        : null,
    { options: auth.api.getSession.options, path: auth.api.getSession.path },
  )
  const sessionSpy = spyOn(auth.api, "getSession").mockImplementation(
    getSession as never,
  )
  const membershipRead = async (
    input: Parameters<typeof prisma.membership.findFirst>[0],
  ) => {
    if (state.failure) throw state.failure
    if (input?.select?.tenant) {
      counts.tenant++
      return {
        id: "membership",
        role: "OWNER",
        tenantId: "tenant",
        staffAccessMode: "LEGACY",
        catalogEditor: false,
        staffStoreAssignments: [],
        retailOpsStaffProfile: null,
        tenant: {
          id: "tenant",
          slug: "business",
          name: "Business",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          currencyCode: "NGN",
          dataClassification: "LIVE",
          timezone: "Africa/Lagos",
          qaPurgeStartedAt: null,
          metadata: {},
          subscription: null,
          stores: [
            {
              id: "store",
              slug: "store",
              name: "Store",
              status: "ACTIVE",
              currencyCode: "NGN",
              metadata: {},
            },
          ],
        },
      } as never
    }
    counts.preference++
    preferences.push(structuredClone(input))
    expect(input?.where).toEqual({
      userId: "actor",
      status: "ACTIVE",
      tenant: { slug: "business", isActive: true },
    })
    return state.preferenceActive
      ? ({
          id: "membership",
          ...(input?.select?.user ? { user: { ageBand: state.ageBand } } : {}),
        } as never)
      : null
  }
  const ageRead = async (
    input: Parameters<typeof prisma.user.findUnique>[0],
  ) => {
    counts.age++
    expect(input).toEqual({ where: { id: "actor" }, select: { ageBand: true } })
    return { ageBand: state.ageBand } as never
  }
  const proofRead = async () => {
    counts.proof++
    return [] as never
  }
  const ports = {
    membership: { findFirst: membershipRead },
    user: { findUnique: ageRead },
    $queryRaw: proofRead,
  }
  const descriptors = Object.keys(ports).map(
    (key) => [key, Object.getOwnPropertyDescriptor(prisma, key)] as const,
  )
  for (const [key, value] of Object.entries(ports))
    Object.defineProperty(prisma, key, { value, configurable: true })
  const app = new Hono()
  let result: TRPCContext | undefined
  let failure: unknown
  app.all("/", async (c) => {
    try {
      result = await createTRPCContext(undefined, c)
    } catch (error) {
      failure = error
    }
    return c.text("inert")
  })
  const request = async (method = "GET", headers?: HeadersInit) => {
    result = undefined
    failure = undefined
    await app.request("http://inert.invalid/", {
      method,
      headers: headers ?? { cookie: "ewatrade.active_tenant_slug=business" },
    })
    if (failure) throw failure
    if (!result) throw Error("Missing actual request context")
    return result
  }
  try {
    await work({ state, request, counts, preferences })
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(prisma, key, descriptor)
      else Reflect.deleteProperty(prisma, key)
    }
    sessionSpy.mockRestore()
  }
}

test("remembered-business GET projects age once and parallel protected queries use it without another User read", async () => {
  await fixture(async ({ request, counts, preferences }) => {
    const ctx = await request()
    expect(counts).toEqual({ preference: 1, age: 0, tenant: 0, proof: 0 })
    const caller = createCallerFactory(router)(ctx)
    expect(
      await Promise.all([caller.first(), caller.second(), caller.first()]),
    ).toEqual(["tenant", "store", "tenant"])
    expect(counts).toEqual({ preference: 1, age: 0, tenant: 1, proof: 0 })
    expect(preferences).toEqual([
      expect.objectContaining({
        select: { id: true, user: { select: { ageBand: true } } },
      }),
    ])
  })
})

test("all canonical age bands preserve rejection before protected Tenant lookup", async () => {
  await fixture(async ({ state, request, counts }) => {
    for (const band of [
      "UNDECLARED",
      "AGE_13_TO_15",
      "AGE_16_TO_17",
      "ADULT",
    ] as const) {
      state.ageBand = band
      const caller = createCallerFactory(router)(await request())
      const before = counts.tenant
      if (band === "UNDECLARED") {
        await expect(caller.first()).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        })
        expect(counts.tenant).toBe(before)
      } else expect(await caller.first()).toBe("tenant")
    }
    expect(counts.age).toBe(0)
  })
})

test("new GETs recheck the age fact and GET mutations cannot reuse the projection", async () => {
  await fixture(async ({ state, request, counts }) => {
    const first = createCallerFactory(router)(await request())
    expect(await first.first()).toBe("tenant")
    state.ageBand = "UNDECLARED"
    await expect(first.write()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
    const before = counts.tenant
    await expect(
      createCallerFactory(router)(await request()).first(),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    expect(counts.tenant).toBe(before)
    expect(counts.age).toBe(1)
  })
})

test("POST reads keep fresh age and the original preference-only projection", async () => {
  await fixture(async ({ request, counts, preferences }) => {
    const ctx = await request("POST")
    expect(ctx.readContext).toBeUndefined()
    const caller = createCallerFactory(router)(ctx)
    expect(await caller.first()).toBe("tenant")
    expect(await caller.second()).toBe("store")
    expect(counts).toEqual({ preference: 1, age: 2, tenant: 2, proof: 0 })
    expect(preferences).toEqual([
      expect.objectContaining({ select: { id: true } }),
    ])
  })
})

test("missing/revoked preference and explicit Tenant headers retain canonical fresh age fallback", async () => {
  await fixture(async ({ state, request, counts }) => {
    state.preferenceActive = false
    const fallback = await request()
    expect(fallback.tenantSlug).toBeNull()
    expect(await createCallerFactory(router)(fallback).first()).toBe("tenant")
    expect(counts.age).toBe(1)
    state.preferenceActive = true
    const explicit = await request("GET", {
      "x-tenant-slug": "strict-business",
      cookie: "ewatrade.active_tenant_slug=business",
    })
    expect(explicit.tenantSlug).toBe("strict-business")
    expect(await createCallerFactory(router)(explicit).first()).toBe("tenant")
    expect(counts).toEqual({ preference: 1, age: 2, tenant: 2, proof: 0 })
  })
})

test("missing/refused sessions never read preference or age; preference errors preserve their identity", async () => {
  await fixture(async ({ state, request, counts }) => {
    state.authenticated = false
    expect((await request()).session).toBeNull()
    state.authenticated = true
    state.qa = true
    expect((await request()).session).toBeNull()
    expect(counts).toEqual({ preference: 0, age: 0, tenant: 0, proof: 1 })
    state.qa = false
    state.failure = Error("inert preference read failure")
    await expect(request()).rejects.toBe(state.failure)
  })
})

test("the actual GET preference projection compiles to one joined PostgreSQL statement", async () => {
  await fixture(async ({ request, preferences }) => {
    await request()
    const queries: { sql: string; args: unknown[] }[] = []
    const adapter = {
      provider: "postgres" as const,
      adapterName: "inert-projection-capture",
      connect: async () => ({
        provider: "postgres" as const,
        adapterName: "inert-projection-capture",
        queryRaw: async (query: { sql: string; args: unknown[] }) => {
          queries.push(query)
          return { columnNames: [], columnTypes: [], rows: [] }
        },
        executeScript: async () => {
          throw Error("No scripts in projection proof")
        },
        executeRaw: async () => {
          throw Error("No writes in projection proof")
        },
        startTransaction: async () => {
          throw Error("No new transaction in projection proof")
        },
        getConnectionInfo: () => ({ supportsRelationJoins: true }),
        dispose: async () => {},
      }),
    }
    const client = new PrismaClient({ adapter })
    try {
      const input = preferences[0]
      if (!input) throw Error("Actual preference input absent")
      expect(await client.membership.findFirst(input)).toBeNull()
      expect(queries).toHaveLength(1)
      expect(queries[0]?.sql).toContain('"User"')
      expect(queries[0]?.sql).toContain('"ageBand"')
      expect(queries[0]?.args).toContain("actor")
      expect(queries[0]?.args).toContain("business")
      const query = queries[0]
      if (!query) throw Error("Compiled preference SQL absent")
      const memory = await PGlite.create()
      try {
        for (const [name, values] of Object.entries({
          AccountAgeBand,
          MembershipStatus,
        }))
          await memory.exec(
            `CREATE TYPE "${name}" AS ENUM (${Object.values(values)
              .map((value) => `'${value}'`)
              .join(",")})`,
          )
        await memory.exec(`
          CREATE TABLE "User" (id text PRIMARY KEY, "ageBand" "AccountAgeBand");
          CREATE TABLE "Tenant" (id text PRIMARY KEY, slug text UNIQUE, "isActive" boolean);
          CREATE TABLE "Membership" (id text PRIMARY KEY, "tenantId" text REFERENCES "Tenant", "userId" text REFERENCES "User", status "MembershipStatus");
          INSERT INTO "User" VALUES ('actor','ADULT'),('foreign','UNDECLARED');
          INSERT INTO "Tenant" VALUES ('tenant','business',true),('foreign','foreign',true);
          INSERT INTO "Membership" VALUES ('membership','tenant','actor','ACTIVE'),('foreign','foreign','foreign','ACTIVE');
        `)
        const read = async () =>
          (await memory.query(query.sql, query.args)).rows
        expect(await read()).toEqual([
          { id: "membership", userId: "actor", user: { ageBand: "ADULT" } },
        ])
        await memory.exec(
          `UPDATE "User" SET "ageBand"='UNDECLARED' WHERE id='actor'`,
        )
        expect(await read()).toEqual([
          {
            id: "membership",
            userId: "actor",
            user: { ageBand: "UNDECLARED" },
          },
        ])
        await memory.exec(
          `UPDATE "Membership" SET status='INVITED' WHERE id='membership'`,
        )
        expect(await read()).toEqual([])
        await memory.exec(
          `UPDATE "Membership" SET status='ACTIVE' WHERE id='membership'; UPDATE "Tenant" SET "isActive"=false WHERE id='tenant'`,
        )
        expect(await read()).toEqual([])
        await memory.exec(
          `UPDATE "Tenant" SET "isActive"=true WHERE id='tenant'; UPDATE "Membership" SET "userId"='foreign' WHERE id='membership'`,
        )
        expect(await read()).toEqual([])
      } finally {
        await memory.close()
      }
    } finally {
      await client.$disconnect()
    }
  })
})
