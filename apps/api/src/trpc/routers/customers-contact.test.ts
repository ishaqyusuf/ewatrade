import { expect, test } from "bun:test"
import { staffProcedureAction } from "../../utils/staff-procedure-policy"
import { type TRPCContext, createCallerFactory } from "../init"
import { customersRouter } from "./customers"

// Real customers router and protected middleware with an inert database port.
const saved = {
  id: "customer-a",
  name: "Halima",
  email: "halima@example.invalid",
  phone: "+2348000000001",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
}

function fixture(
  options: {
    role?: string
    tenantId?: string
    activeStore?: boolean
    storeRecord?: boolean
  } = {},
) {
  const {
    role = "OWNER",
    tenantId = "tenant-a",
    activeStore = true,
    storeRecord = true,
  } = options
  const reads: string[] = []
  let history: Promise<void> | undefined
  const db = {
    customer: {
      findFirst: async ({
        where,
      }: { where: { id?: string; tenantId?: string } }) => {
        reads.push("customer")
        return where.id === saved.id && where.tenantId === "tenant-a"
          ? { ...saved }
          : null
      },
    },
    store: {
      findFirst: async () => {
        reads.push("store")
        return storeRecord ? { salesRepOrderVisibility: "OWN_SALES" } : null
      },
    },
    commercialOrder: {
      findMany: async () => {
        reads.push("history")
        await history
        return []
      },
    },
    commercialOrderPayment: {
      findMany: async () => {
        reads.push("history")
        return []
      },
    },
    user: {
      findMany: async () => {
        reads.push("history")
        return []
      },
    },
    $queryRaw: async () => [],
    $transaction: async (run: (tx: unknown) => unknown) => run(db),
  }
  const ctx = {
    db,
    requestId: "customer-contact-test",
    session: {
      session: { id: "session", token: "test" },
      user: { id: "rep-a" },
    },
    tenantContext: {
      tenant: {
        id: tenantId,
        currencyCode: "NGN",
        retailOpsPlanId: "growth",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role },
      activeStore: activeStore ? { id: "store-a" } : undefined,
      stores: activeStore ? [{ id: "store-a" }] : [],
    },
  }
  return {
    caller: createCallerFactory(customersRouter)(ctx as unknown as TRPCContext),
    ctx,
    reads,
    holdHistory: () => {
      const gate = Promise.withResolvers<void>()
      history = gate.promise
      return gate
    },
  }
}

const outcome = (run: () => Promise<unknown>) =>
  run().then(
    () => "ok",
    (error: { code?: string }) => error.code ?? String(error),
  )

test("the contact projection reads one Customer and returns only contact fields", async () => {
  const f = fixture()
  expect(await f.caller.contact({ customerId: "customer-a" })).toEqual({
    id: "customer-a",
    name: "Halima",
    email: "halima@example.invalid",
    phone: "+2348000000001",
  })
  expect(f.reads).toEqual(["customer"])
})

test("getById waits for held Order history while the contact read never touches it", async () => {
  const f = fixture()
  const gate = f.holdHistory()
  let legacyDone = false
  const legacy = f.caller
    .getById({ customerId: "customer-a" })
    .then((value) => {
      legacyDone = true
      return value
    })
  const contact = await f.caller.contact({ customerId: "customer-a" })
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(contact.name).toBe("Halima")
  expect(legacyDone).toBe(false)
  expect(f.reads).toContain("history")
  expect(f.reads.filter((read) => read === "customer")).toHaveLength(2)
  gate.resolve()
  expect((await legacy).orders).toEqual([])
})

test("contact admission matches getById for every role without reading history", async () => {
  const results: Record<string, string> = {}
  for (const role of [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "OPERATOR",
    "MEMBER",
  ]) {
    const legacy = await outcome(() =>
      fixture({ role }).caller.getById({ customerId: "customer-a" }),
    )
    const f = fixture({ role })
    const contact = await outcome(() =>
      f.caller.contact({ customerId: "customer-a" }),
    )
    expect(contact).toBe(legacy)
    expect(f.reads).not.toContain("history")
    results[role] = contact
  }
  expect(results.OWNER).toBe("ok")
  expect(results.MEMBER).toBe("FORBIDDEN")
})

test("missing and other-Tenant Customers share getById's not-found refusal", async () => {
  for (const [options, customerId] of [
    [{}, "missing"],
    [{ tenantId: "tenant-b" }, "customer-a"],
  ] as const) {
    expect(
      await outcome(() => fixture(options).caller.getById({ customerId })),
    ).toBe("NOT_FOUND")
    expect(
      await outcome(() => fixture(options).caller.contact({ customerId })),
    ).toBe("NOT_FOUND")
  }
})

test("a sales rep keeps getById's Store-scope admission on the contact read", async () => {
  const rep = fixture({ role: "CASHIER" })
  expect(
    await outcome(() => rep.caller.contact({ customerId: "customer-a" })),
  ).toBe("ok")
  expect(rep.reads).toEqual(["customer", "store"])
  for (const options of [
    { role: "CASHIER", activeStore: false },
    { role: "CASHIER", storeRecord: false },
  ]) {
    const legacy = await outcome(() =>
      fixture(options).caller.getById({ customerId: "customer-a" }),
    )
    const f = fixture(options)
    const contact = await outcome(() =>
      f.caller.contact({ customerId: "customer-a" }),
    )
    expect(legacy).not.toBe("ok")
    expect(contact).toBe(legacy)
    expect(f.reads).not.toContain("history")
  }
  expect(
    await outcome(() =>
      fixture({ role: "CASHIER", activeStore: false }).caller.contact({
        customerId: "missing",
      }),
    ),
  ).toBe("NOT_FOUND")
})

test("signed-out callers are refused and scoped staff share getById's audited grant", async () => {
  const f = fixture()
  const caller = createCallerFactory(customersRouter)({
    ...f.ctx,
    session: null,
  } as unknown as TRPCContext)
  expect(
    await outcome(() => caller.contact({ customerId: "customer-a" })),
  ).toBe("UNAUTHORIZED")
  expect(staffProcedureAction("customers.contact", "query")).toBe("read")
  expect(staffProcedureAction("customers.contact", "query")).toBe(
    staffProcedureAction("customers.getById", "query"),
  )
})
