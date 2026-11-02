import { expect, test } from "bun:test"
import { createCallerFactory, createTRPCRouter } from "../init"
import { catalogRouter } from "./catalog"

const router = createTRPCRouter({ catalog: catalogRouter })

type Scan = { where: Record<string, unknown>; select?: unknown }

function fixture(
  options: {
    user?: boolean
    role?: string
    scoped?: boolean
    revoked?: boolean
    noStore?: boolean
  } = {},
) {
  const calls: Scan[] = []
  const role = options.role ?? "OWNER"
  const active = options.noStore ? null : { id: "store-active" }
  const stores = active ? [{ id: "store-first" }, active] : []
  const caller = createCallerFactory(router)({
    db: {
      catalogItem: {
        findMany: async (input: Scan) => {
          calls.push(input)
          return []
        },
        count: async () => 0,
        findFirst: async () => null,
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
      activeStore: active,
      stores,
      staffAccess: options.scoped
        ? {
            mode: "SCOPED",
            businessRole: role,
            status: "ACTIVE",
            catalogEditor: false,
            assignments: options.revoked
              ? []
              : [
                  {
                    storeId: "store-active",
                    role: "OPERATOR",
                    status: "ACTIVE",
                  },
                ],
          }
        : undefined,
    },
    qaSessionScope: null,
  } as never)
  return { caller, calls }
}

const stockStore = (call?: Scan) =>
  (
    call?.select as {
      product: { select: { stockBalanceSources: { where: unknown } } }
    }
  )?.product.select.stockBalanceSources.where

test("summary reads the caller's Tenant and active Store only", async () => {
  const state = fixture()
  expect(await state.caller.catalog.attentionSummary({})).toEqual({
    all: 0,
    product: 0,
    service: 0,
    no_price: 0,
    not_counted: 0,
    out_of_stock: 0,
    storeId: "store-active",
  })
  expect(state.calls[0]?.where).toMatchObject({
    tenantId: "tenant",
    systemRole: null,
  })
  expect(stockStore(state.calls[0])).toEqual({ storeId: "store-active" })
})

test("the attention filter is judged in the active Store", async () => {
  const state = fixture({ scoped: true, role: "OPERATOR" })
  await state.caller.catalog.listItemsPage({ attention: "out_of_stock" })
  expect(stockStore(state.calls[0])).toEqual({ storeId: "store-active" })
  // No problem items, so the page asks for none.
  expect(state.calls[1]?.where).toMatchObject({
    id: { in: [] },
    tenantId: "tenant",
  })
})

test("denied, unauthenticated, storeless and forged calls read nothing", async () => {
  for (const [options, code] of [
    [{ user: false }, "UNAUTHORIZED"],
    [{ role: "MEMBER" }, "FORBIDDEN"],
    [{ noStore: true }, "NOT_FOUND"],
    [{ scoped: true, role: "OPERATOR", revoked: true }, "FORBIDDEN"],
  ] as const) {
    const state = fixture(options)
    await expect(
      state.caller.catalog.attentionSummary({}),
    ).rejects.toMatchObject({ code })
    expect(state.calls).toEqual([])
  }
  const forged = fixture()
  for (const input of [{ tenantId: "foreign" }, { storeId: "store-first" }]) {
    await expect(
      forged.caller.catalog.attentionSummary(input as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  await expect(
    forged.caller.catalog.listItemsPage({ attention: "low" } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(forged.calls).toEqual([])
})
