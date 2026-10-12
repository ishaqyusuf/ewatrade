import { describe, expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  setStaffStoreAccess,
  updateRetailOpsStaffStoreAccess,
  updateRetailOpsStaffStoreAccessInTransaction,
} from "./staff-store-access"

function fixture(
  options: {
    actorRole?: string
    actorStatus?: string
    stores?: number
    changed?: number
    mode?: "LEGACY" | "SCOPED"
    targetRole?: string
    targetStatus?: string
    missing?: boolean
    auditError?: Error
  } = {},
) {
  const writes: Array<{ kind: string; input: unknown }> = []
  const locks: string[] = []
  const write = (kind: string) => async (input: unknown) => {
    writes.push({ kind, input })
    return {}
  }
  const tx = {
    $transaction: () => {
      throw new Error("Nested transaction forbidden")
    },
    $queryRaw: async (sql: TemplateStringsArray) => {
      locks.push(sql.join("?"))
      return [
        {
          id: "actor",
          role: options.actorRole ?? "OWNER",
          status: options.actorStatus ?? "ACTIVE",
        },
      ]
    },
    store: { count: async () => options.stores ?? 2 },
    membership: {
      findUnique: async () =>
        options.missing
          ? null
          : { id: "staff", staffAccessMode: options.mode ?? "LEGACY" },
      findFirst: async () => ({
        id: "staff",
        role: options.targetRole ?? "OPERATOR",
        status: options.targetStatus ?? "INVITED",
        staffAccessMode: options.mode ?? "LEGACY",
        catalogEditor: false,
        retailOpsStaffProfile: { defaultStoreId: "old-store" },
        staffStoreAssignments: [
          { storeId: "old-store", role: "MANAGER", status: "ACTIVE" },
        ],
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
    staffAccessAuditEvent: {
      create: async (input: unknown) => {
        writes.push({ kind: "audit", input })
        if (options.auditError) throw options.auditError
        return { id: "original-access-event" }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, writes, locks }
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

const updateInput = {
  ...input,
  staffUserId: "staff-user",
  confirmLegacyCutover: true,
}

describe("caller-owned Store access update", () => {
  test("returns the original canonical audit ID after the existing authority and target locks", async () => {
    const { tx, writes, locks } = fixture()
    expect(
      await updateRetailOpsStaffStoreAccessInTransaction(tx, updateInput),
    ).toEqual({
      membershipId: "staff",
      revision: 2,
      accessEventId: "original-access-event",
    })
    expect(locks[0]).toContain("FOR SHARE OF m")
    expect(locks[0]).toContain('t."isActive" = true')
    expect(locks[1]).toContain("FOR UPDATE")
    expect(writes.at(-1)).toMatchObject({
      kind: "audit",
      input: {
        select: { id: true },
        data: {
          tenantId: "business",
          membershipId: "staff",
          actorUserId: "owner",
          operation: "scoped_access_confirmed",
          revision: 2,
          before: {
            mode: "LEGACY",
            businessRole: "OPERATOR",
            membershipStatus: "INVITED",
            defaultStoreId: "old-store",
            assignments: [
              { storeId: "old-store", role: "MANAGER", status: "ACTIVE" },
            ],
          },
          after: {
            mode: "SCOPED",
            assignments: input.assignments,
            defaultStoreId: "farm",
            catalogEditor: false,
          },
        },
      },
    })
  })

  test("native root opens exactly one bounded transaction and preserves its original result", async () => {
    const { tx } = fixture()
    const calls: unknown[] = []
    const db = {
      $transaction: async (
        work: (client: Prisma.TransactionClient) => Promise<unknown>,
        options: unknown,
      ) => {
        calls.push(options)
        return work(tx)
      },
    } as unknown as PrismaClient
    expect(await updateRetailOpsStaffStoreAccess(db, updateInput)).toEqual({
      membershipId: "staff",
      revision: 2,
    })
    expect(calls).toEqual([{ maxWait: 10_000, timeout: 30_000 }])
  })

  test("legacy cutover requires explicit confirmation without any authority write", async () => {
    const { tx, writes } = fixture()
    await expect(
      updateRetailOpsStaffStoreAccessInTransaction(tx, {
        ...updateInput,
        confirmLegacyCutover: false,
      }),
    ).rejects.toThrow("Review and confirm")
    expect(writes).toHaveLength(0)
  })

  test.each([
    [{ actorRole: "MANAGER" }, "Only Owner/Admin"],
    [{ actorStatus: "SUSPENDED" }, "Only Owner/Admin"],
    [{ stores: 1 }, "unavailable"],
    [{ missing: true }, "not found"],
    [{ targetRole: "OWNER" }, "cannot receive"],
    [{ targetRole: "ADMIN" }, "cannot receive"],
    [{ targetStatus: "REMOVED" }, "cannot receive"],
  ] as const)("keeps canonical refusal %j", async (options, message) => {
    const { tx, writes } = fixture(options)
    await expect(
      updateRetailOpsStaffStoreAccessInTransaction(tx, updateInput),
    ).rejects.toThrow(message)
    expect(writes).toHaveLength(0)
  })

  test("stale revision cannot create assignments or an audit identity", async () => {
    const { tx, writes } = fixture({ changed: 0 })
    await expect(
      updateRetailOpsStaffStoreAccessInTransaction(tx, updateInput),
    ).rejects.toThrow("Refresh before saving")
    expect(writes.map((row) => row.kind)).toEqual(["membership"])
    expect(writes[0]?.input).toMatchObject({
      where: { tenantId: "business", staffAccessRevision: 1 },
    })
  })

  test("revoked-all access preserves the canonical empty scoped snapshot", async () => {
    const { tx, writes } = fixture({ mode: "SCOPED", stores: 0 })
    await updateRetailOpsStaffStoreAccessInTransaction(tx, {
      ...updateInput,
      confirmLegacyCutover: false,
      assignments: [],
      defaultStoreId: null,
    })
    expect(writes.filter((row) => row.kind === "assignment")).toHaveLength(0)
    expect(writes.find((row) => row.kind === "revoke")?.input).toMatchObject({
      where: { membershipId: "staff", storeId: { notIn: [] } },
      data: { status: "REVOKED" },
    })
    expect(writes.at(-1)?.input).toMatchObject({
      data: {
        operation: "access_changed",
        after: { assignments: [], defaultStoreId: null, catalogEditor: false },
      },
    })
  })

  test("original audit failure propagates to the caller instead of fabricating receipt success", async () => {
    const error = new Error("audit write failed")
    const { tx } = fixture({ auditError: error })
    await expect(
      updateRetailOpsStaffStoreAccessInTransaction(tx, updateInput),
    ).rejects.toBe(error)
  })
})
