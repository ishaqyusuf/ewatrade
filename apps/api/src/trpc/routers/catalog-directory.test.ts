import { expect, test } from "bun:test"
import { createCallerFactory, createTRPCRouter } from "../init"
import { catalogRouter } from "./catalog"

const router = createTRPCRouter({ catalog: catalogRouter })
function fixture(
  options: {
    user?: boolean
    role?: string
    scoped?: boolean
    revoked?: boolean
    noStore?: boolean
    foreignQa?: boolean
  } = {},
) {
  const calls: { select: unknown; where: unknown }[] = []
  const role = options.role ?? "OWNER"
  const store = options.noStore ? null : { id: "store" }
  const caller = createCallerFactory(router)({
    db: {
      catalogItem: {
        findMany: async (input: { select: unknown; where: unknown }) => {
          calls.push(input)
          return []
        },
        count: async () => 0,
      },
    },
    session:
      options.user === false
        ? null
        : { session: { id: "session", token: "inert" }, user: { id: "actor" } },
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role },
      activeStore: store,
      stores: store ? [store] : [],
      staffAccess: options.scoped
        ? {
            mode: "SCOPED",
            businessRole: role,
            status: "ACTIVE",
            catalogEditor: false,
            assignments: options.revoked
              ? []
              : [{ storeId: "store", role: "OPERATOR", status: "ACTIVE" }],
          }
        : undefined,
    },
    qaSessionScope: options.foreignQa
      ? { tenantId: "foreign", membershipId: "membership", storeId: "store" }
      : null,
  } as never)
  return { caller, calls }
}

test("directory read derives Tenant and Store from protected context", async () => {
  const state = fixture()
  expect(await state.caller.catalog.listDirectoryPage({ limit: 25 })).toEqual({
    items: [],
    nextCursor: undefined,
  })
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0]?.where).toMatchObject({
    tenantId: "tenant",
    systemRole: null,
  })
  expect(state.calls[0]?.select).not.toHaveProperty("photos")
  expect(state.calls[0]?.select).toMatchObject({
    photoAssets: { where: { storeId: "store" } },
  })
})

test("unauthenticated, denied-role, missing Store and foreign QA calls perform no directory reads", async () => {
  for (const [options, code] of [
    [{ user: false }, "UNAUTHORIZED"],
    [{ role: "MEMBER" }, "FORBIDDEN"],
    [{ noStore: true }, "NOT_FOUND"],
    [{ foreignQa: true }, "FORBIDDEN"],
  ] as const) {
    const state = fixture(options)
    await expect(
      state.caller.catalog.listDirectoryPage({}),
    ).rejects.toMatchObject({ code })
    expect(state.calls).toEqual([])
  }
})

test("client authority fields are rejected and scoped staff remain within assigned Stores", async () => {
  const state = fixture({ scoped: true, role: "OPERATOR" })
  await state.caller.catalog.listDirectoryPage({})
  expect(state.calls[0]?.select).toMatchObject({
    product: {
      select: {
        stockBalanceSources: { where: { storeId: { in: ["store"] } } },
      },
    },
  })
  const forged = fixture()
  await expect(
    forged.caller.catalog.listDirectoryPage({ tenantId: "foreign" } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(forged.calls).toEqual([])
  const revoked = fixture({ scoped: true, role: "OPERATOR", revoked: true })
  await expect(
    revoked.caller.catalog.listDirectoryPage({}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(revoked.calls).toEqual([])
})
