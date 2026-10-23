import { expect, test } from "bun:test"
import type { TRPCContext } from "../init"
import { createCallerFactory } from "../init"
import { storesRouter } from "./stores"

function fixture() {
  let contact = {
    id: "store-a",
    name: "Store A",
    supportPhone: null as string | null,
    countryCode: "NG" as string | null,
  }
  let role = "OWNER"
  let active = true
  let membershipStatus = "ACTIVE"
  let storeStatus = "ACTIVE"
  const writes: unknown[] = []
  const db = {
    $queryRaw: async () => [],
    $transaction: async (run: (tx: unknown) => unknown) => run(db),
    membership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const roles = where.role as { in?: string[] } | undefined
        return where.tenantId === "tenant-a" &&
          where.userId === "owner-a" &&
          (where.status === undefined || where.status === membershipStatus) &&
          (!roles?.in || roles.in.includes(role))
          ? { tenant: { isActive: active, qaPurgeStartedAt: null } }
          : null
      },
    },
    store: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        where.id === contact.id &&
        where.tenantId === "tenant-a" &&
        (where.status === undefined || where.status === storeStatus)
          ? { ...contact }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: Pick<typeof contact, "supportPhone" | "countryCode">
      }) => {
        if (
          where.id !== contact.id ||
          where.tenantId !== "tenant-a" ||
          where.supportPhone !== contact.supportPhone ||
          where.countryCode !== contact.countryCode ||
          storeStatus !== "ACTIVE"
        )
          return { count: 0 }
        writes.push(data)
        contact = { ...contact, ...data }
        return { count: 1 }
      },
    },
  }
  const context = {
    db,
    requestId: "store-contact-test",
    session: {
      session: { id: "session", token: "ordinary-session" },
      user: { id: "owner-a" },
    },
    tenantContext: {
      tenant: { id: "tenant-a", qaPurgeStartedAt: null },
      membership: { id: "membership-a", role: "OWNER" },
      activeStore: { id: "store-a" },
      stores: [{ id: "store-a" }, { id: "store-b" }],
    },
  }
  return {
    caller: createCallerFactory(storesRouter)(
      context as unknown as TRPCContext,
    ),
    db,
    context,
    writes,
    setRole: (value: string) => {
      role = value
    },
    setActive: (value: boolean) => {
      active = value
    },
    setMembershipStatus: (value: string) => {
      membershipStatus = value
    },
    setStoreStatus: (value: string) => {
      storeStatus = value
    },
  }
}

test("Owner reads selected Store contact, saves a normalized phone and safely repeats", async () => {
  const f = fixture()
  const original = await f.caller.contact({})
  expect(original).toEqual({
    id: "store-a",
    name: "Store A",
    supportPhone: null,
    countryCode: "NG",
  })
  const input = {
    storeId: original.id,
    expected: {
      supportPhone: original.supportPhone,
      countryCode: original.countryCode,
    },
    supportPhone: "0803 123 4567",
    countryCode: "ng",
  }
  expect(await f.caller.updateContact(input)).toEqual({
    ...original,
    supportPhone: "+2348031234567",
  })
  expect(await f.caller.updateContact(input)).toEqual({
    ...original,
    supportPhone: "+2348031234567",
  })
  expect(f.writes).toHaveLength(1)
})

const change = {
  storeId: "store-a",
  expected: { supportPhone: null, countryCode: "NG" },
  supportPhone: "0803 123 4567",
  countryCode: "NG",
}

test("a stale editor cannot overwrite a different saved contact; explicit null clears", async () => {
  const f = fixture()
  const saved = await f.caller.updateContact(change)
  await expect(
    f.caller.updateContact({ ...change, supportPhone: "0803 765 4321" }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(await f.caller.contact({})).toEqual(saved)
  expect(
    await f.caller.updateContact({
      ...change,
      expected: {
        supportPhone: saved.supportPhone,
        countryCode: saved.countryCode,
      },
      supportPhone: null,
      countryCode: null,
    }),
  ).toMatchObject({ supportPhone: null, countryCode: null })
  expect(f.writes).toHaveLength(2)
})

test("validation refuses invalid phones, unknown country, missing originals and scope injection", async () => {
  const f = fixture()
  for (const input of [
    { ...change, supportPhone: "invalid" },
    { ...change, supportPhone: "08031234567 ext 12" },
    { ...change, supportPhone: "" },
    { ...change, supportPhone: "08031234567", countryCode: null },
    { ...change, countryCode: "XX" },
    { ...change, expected: undefined },
    { ...change, tenantId: "foreign" },
  ])
    await expect(
      f.caller.updateContact(input as typeof change),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(f.writes).toHaveLength(0)
})

test("cached Owner authority cannot survive revocation, demotion or Tenant suspension", async () => {
  for (const invalidate of [
    (f: ReturnType<typeof fixture>) => f.setRole("OPERATOR"),
    (f: ReturnType<typeof fixture>) => f.setMembershipStatus("SUSPENDED"),
    (f: ReturnType<typeof fixture>) => f.setActive(false),
  ]) {
    const f = fixture()
    invalidate(f)
    await expect(f.caller.contact({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(f.caller.updateContact(change)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(f.writes).toHaveLength(0)
  }
})

test("foreign, inactive and unselected Stores never read or change contact details", async () => {
  const f = fixture()
  for (const storeId of ["foreign-store", "store-b"]) {
    await expect(f.caller.contact({ storeId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(
      f.caller.updateContact({ ...change, storeId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  }
  f.setStoreStatus("ARCHIVED")
  await expect(f.caller.updateContact(change)).rejects.toMatchObject({
    code: "NOT_FOUND",
  })
  f.context.tenantContext.activeStore = undefined as never
  await expect(f.caller.contact({})).rejects.toMatchObject({
    code: "NOT_FOUND",
  })
  expect(f.writes).toHaveLength(0)
})

test("Admin may update, while non-manager and signed-out callers are refused", async () => {
  const admin = fixture()
  admin.setRole("ADMIN")
  admin.context.tenantContext.membership.role = "ADMIN"
  expect(await admin.caller.updateContact(change)).toMatchObject({
    supportPhone: "+2348031234567",
  })
  for (const role of ["CASHIER", "OPERATOR", "MANAGER"]) {
    const f = fixture()
    f.context.tenantContext.membership.role = role
    await expect(f.caller.contact({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(f.caller.updateContact(change)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  }
  const signedOut = fixture()
  const caller = createCallerFactory(storesRouter)({
    ...signedOut.context,
    session: null,
  } as unknown as TRPCContext)
  await expect(caller.contact({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
  await expect(caller.updateContact(change)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
})
