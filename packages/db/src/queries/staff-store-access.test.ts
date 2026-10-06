import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { setStaffStoreAccess } from "./staff-store-access"

function fixture(
  options: {
    actorRole?: string
    actorStatus?: string
    stores?: number
    changed?: number
  } = {},
) {
  const writes: Array<{ kind: string; input: unknown }> = []
  const write = (kind: string) => async (input: unknown) => {
    writes.push({ kind, input })
    return {}
  }
  const tx = {
    $queryRaw: async () => [
      {
        id: "actor",
        role: options.actorRole ?? "OWNER",
        status: options.actorStatus ?? "ACTIVE",
      },
    ],
    store: { count: async () => options.stores ?? 2 },
    membership: {
      findFirst: async () => ({
        id: "staff",
        role: "OPERATOR",
        status: "INVITED",
        staffAccessMode: "LEGACY",
        catalogEditor: false,
        staffStoreAssignments: [],
      }),
      updateMany: async (input: unknown) => {
        writes.push({ kind: "membership", input })
        return { count: options.changed ?? 1 }
      },
    },
    staffStoreAssignment: {
      updateMany: write("revoke"),
      upsert: write("assignment"),
    },
    retailOpsStaffProfile: { updateMany: write("default") },
    staffAccessAuditEvent: { create: write("audit") },
  } as unknown as Prisma.TransactionClient
  return { tx, writes }
}
const input = {
  tenantId: "business",
  membershipId: "staff",
  actorUserId: "owner",
  expectedRevision: 1,
  catalogEditor: false,
  defaultStoreId: "farm",
  assignments: [
    { storeId: "farm", role: "OPERATOR" as const },
    { storeId: "shop", role: "CASHIER" as const },
  ],
}

describe("Store authority writes", () => {
  test("Owner grants independent Store roles and appends an audit snapshot", async () => {
    const { tx, writes } = fixture()
    await setStaffStoreAccess(tx, input)
    expect(writes.filter((row) => row.kind === "assignment")).toHaveLength(2)
    expect(writes.find((row) => row.kind === "audit")?.input).toMatchObject({
      data: {
        revision: 2,
        after: { assignments: input.assignments, catalogEditor: false },
      },
    })
  })
  test("Manager cannot delegate Store roles", async () => {
    const { tx, writes } = fixture({ actorRole: "MANAGER" })
    await expect(setStaffStoreAccess(tx, input)).rejects.toThrow(
      "Only Owner/Admin",
    )
    expect(writes).toHaveLength(0)
  })
  test("suspended Owner cannot delegate", async () => {
    const { tx, writes } = fixture({ actorStatus: "SUSPENDED" })
    await expect(setStaffStoreAccess(tx, input)).rejects.toThrow(
      "Only Owner/Admin",
    )
    expect(writes).toHaveLength(0)
  })
  test("foreign or archived Stores fail before authority writes", async () => {
    const { tx, writes } = fixture({ stores: 1 })
    await expect(setStaffStoreAccess(tx, input)).rejects.toThrow("unavailable")
    expect(writes).toHaveLength(0)
  })
  test("duplicate Stores and unrelated default are rejected", async () => {
    const { tx, writes } = fixture()
    await expect(
      setStaffStoreAccess(tx, {
        ...input,
        assignments: [
          { storeId: "farm", role: "OPERATOR" },
          { storeId: "farm", role: "CASHIER" },
        ],
      }),
    ).rejects.toThrow("distinct Stores")
    await expect(
      setStaffStoreAccess(tx, { ...input, defaultStoreId: "other" }),
    ).rejects.toThrow("distinct Stores")
    expect(writes).toHaveLength(0)
  })
  test("catalog editing cannot be granted to an Operator", async () => {
    const { tx, writes } = fixture()
    await expect(
      setStaffStoreAccess(tx, { ...input, catalogEditor: true }),
    ).rejects.toThrow("Catalog editing requires Manager")
    expect(writes).toHaveLength(0)
  })
  test("revision conflict prevents assignments and audit writes", async () => {
    const { tx, writes } = fixture({ changed: 0 })
    await expect(setStaffStoreAccess(tx, input)).rejects.toThrow(
      "Refresh before saving",
    )
    expect(writes.map((row) => row.kind)).toEqual(["membership"])
  })
})
