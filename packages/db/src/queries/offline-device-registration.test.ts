import { describe, expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import { OfflineStaffAccessError } from "./offline-staff-access"
import { RetailOpsOfflineDeviceError } from "./retail-ops-subscriptions"

const input = {
  actorUserId: "actor-a",
  tenantId: "tenant-a",
  storeId: "store-a",
  deviceId: "device-a",
  deviceName: "Updated phone",
  appVersion: "2.0",
  platform: "ANDROID" as const,
}
const actor = {
  role: "CASHIER",
  status: "ACTIVE",
  staffAccessMode: "LEGACY",
  isActive: true,
}
const original = {
  id: "registered-device-a",
  tenantId: input.tenantId,
  deviceId: input.deviceId,
  storeId: input.storeId as string | null,
  registeredByUserId: input.actorUserId as string | null,
  status: "ACTIVE",
  deviceName: "Old phone",
  appVersion: "1.0",
  platform: "IOS",
  registeredAt: new Date("2026-01-01"),
  lastSeenAt: new Date("2026-01-02"),
  revokedAt: null,
  revokedByUserId: null,
}
type Device = typeof original
type Stage =
  | "tenant"
  | "membership"
  | "key"
  | "row"
  | "device-status"
  | "revocation"
  | "metadata"
  | "store"
  | "device"
  | "upsert"

// This fixture executes the real helper and staff guard. It records SQL intent;
// it does not emulate PostgreSQL row/advisory lock scheduling or transactions.
function fixture(
  options: {
    staff?: typeof actor | null
    store?: { id: string } | null
    existing?: Device | null
    revocation?: { id: string } | null
    metadata?: unknown
    failAt?: Stage
    error?: Error
  } = {},
) {
  const calls: Array<{ stage: Stage; args: unknown }> = []
  let existing = options.existing ?? null
  let transactionOptions: unknown
  const record = (stage: Stage, args: unknown) => {
    calls.push({ stage, args })
    if (options.failAt === stage) throw options.error
  }
  const runSql = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim()
    const stage = sql.includes('FROM "Membership"')
      ? "membership"
      : sql.includes("pg_advisory_xact_lock")
        ? "key"
        : sql.includes('FROM "OfflineDevice"')
          ? "row"
          : "tenant"
    record(stage, { sql, values })
    if (stage === "membership")
      return options.staff === null ? [] : [options.staff ?? actor]
    if (stage === "row") return existing ? [{ id: existing.id }] : []
    return [{ id: input.tenantId }]
  }
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes("pg_advisory_xact_lock"))
        throw Error("Advisory lock has no row value; use $executeRaw")
      return runSql(strings, ...values)
    },
    $executeRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      await runSql(strings, ...values)
      return 0
    },
    store: {
      findFirst: async (args: Prisma.StoreFindFirstArgs) => {
        record("store", args)
        return options.store === null
          ? null
          : (options.store ?? { id: input.storeId })
      },
    },
    tenant: {
      findFirstOrThrow: async (args: Prisma.TenantFindFirstOrThrowArgs) => {
        record("metadata", args)
        return { metadata: options.metadata ?? {} }
      },
    },
    offlineDeviceRevocation: {
      findFirst: async (args: Prisma.OfflineDeviceRevocationFindFirstArgs) => {
        record("revocation", args)
        return options.revocation ?? null
      },
    },
    offlineDevice: {
      findUnique: async (args: Prisma.OfflineDeviceFindUniqueArgs) => {
        record(args.select?.status ? "device-status" : "device", args)
        return existing
      },
      upsert: async (args: Prisma.OfflineDeviceUpsertArgs) => {
        record("upsert", args)
        const result = existing
          ? { ...existing, ...args.update }
          : { ...original, ...args.create }
        // Only the binding is reused by the second invocation in refresh tests.
        existing = { ...original }
        return result
      },
    },
  }
  const db = {
    $transaction: async (
      fn: (transaction: typeof tx) => Promise<unknown>,
      opts: unknown,
    ) => {
      transactionOptions = opts
      return fn(tx)
    },
  } as unknown as PrismaClient
  return { db, calls, transactionOptions: () => transactionOptions }
}

describe("owned offline device registration", () => {
  test("locks Tenant, fresh Membership, device key and existing row before scoped reads and upsert", async () => {
    const f = fixture()
    await registerOwnedOfflineDevice(f.db, input)
    expect(f.calls.map((call) => call.stage)).toEqual([
      "tenant",
      "membership",
      "key",
      "row",
      "device-status",
      "revocation",
      "metadata",
      "store",
      "device",
      "upsert",
    ])
    expect(f.calls[0]?.args).toEqual({
      sql: 'SELECT "id" FROM "Tenant" WHERE "id" = ? AND "isActive" = true FOR SHARE',
      values: [input.tenantId],
    })
    expect(f.calls[1]?.args).toEqual({
      sql: 'SELECT m."role", m."status", m."staffAccessMode", t."isActive" FROM "Membership" m JOIN "Tenant" t ON t."id" = m."tenantId" WHERE m."tenantId" = ? AND m."userId" = ? FOR SHARE OF m',
      values: [input.tenantId, input.actorUserId],
    })
    expect(f.calls[2]?.args).toEqual({
      sql: "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
      values: [JSON.stringify([input.tenantId, input.deviceId])],
    })
    expect(f.calls[3]?.args).toEqual({
      sql: 'SELECT "id" FROM "OfflineDevice" WHERE "tenantId" = ? AND "deviceId" = ? FOR UPDATE',
      values: [input.tenantId, input.deviceId],
    })
    expect(f.calls[4]?.args).toEqual({
      where: {
        tenantId_deviceId: {
          deviceId: input.deviceId,
          tenantId: input.tenantId,
        },
      },
      select: { status: true },
    })
    expect(f.calls[5]?.args).toEqual({
      where: {
        deviceId: input.deviceId,
        tenantId: input.tenantId,
        restoredAt: null,
      },
      select: { id: true },
    })
    expect(f.calls[6]?.args).toEqual({
      where: { id: input.tenantId, isActive: true },
      select: { metadata: true },
    })
    expect(f.calls[7]?.args).toEqual({
      where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
      select: { id: true },
    })
    expect(f.calls[8]?.args).toEqual({
      where: {
        tenantId_deviceId: {
          deviceId: input.deviceId,
          tenantId: input.tenantId,
        },
      },
    })
    expect(f.transactionOptions()).toEqual({ maxWait: 10_000, timeout: 30_000 })
  })

  for (const [name, staff] of [
    ["missing membership", null],
    ["suspended actor", { ...actor, status: "SUSPENDED" }],
    ["inactive Tenant", { ...actor, isActive: false }],
    ["customer role", { ...actor, role: "CUSTOMER" }],
    ["scoped Cashier", { ...actor, staffAccessMode: "SCOPED" }],
    [
      "scoped Operator",
      { ...actor, role: "OPERATOR", staffAccessMode: "SCOPED" },
    ],
    [
      "scoped Manager",
      { ...actor, role: "MANAGER", staffAccessMode: "SCOPED" },
    ],
  ] as const) {
    test(`refuses ${name} before device locks or mutation`, async () => {
      const f = fixture({ staff })
      await expect(
        registerOwnedOfflineDevice(f.db, input),
      ).rejects.toBeInstanceOf(OfflineStaffAccessError)
      expect(f.calls.map((call) => call.stage)).toEqual([
        "tenant",
        "membership",
      ])
    })
  }

  test("does not retain authority from an earlier successful registration", async () => {
    const staff = { ...actor }
    const f = fixture({ staff })
    await registerOwnedOfflineDevice(f.db, input)
    staff.status = "SUSPENDED"
    f.calls.length = 0
    await expect(
      registerOwnedOfflineDevice(f.db, input),
    ).rejects.toBeInstanceOf(OfflineStaffAccessError)
    expect(f.calls.map((call) => call.stage)).toEqual(["tenant", "membership"])
  })

  test("unavailable, inactive or foreign Store query result refuses before device lookup or upsert", async () => {
    const f = fixture({ store: null })
    await expect(
      registerOwnedOfflineDevice(f.db, input),
    ).rejects.toBeInstanceOf(CatalogError)
    expect(f.calls.at(-1)?.stage).toBe("store")
    expect(f.calls.some((call) => call.stage === "upsert")).toBe(false)
  })

  for (const [name, patch] of [
    ["another actor", { registeredByUserId: "actor-b" }],
    ["missing legacy owner", { registeredByUserId: null }],
    ["another Store", { storeId: "store-b" }],
    ["missing original Store", { storeId: null }],
  ] as const) {
    test(`refuses ${name} without restoring or rebinding`, async () => {
      const existing = { ...original, ...patch }
      const snapshot = structuredClone(existing)
      const f = fixture({ existing })
      await expect(
        registerOwnedOfflineDevice(f.db, input),
      ).rejects.toBeInstanceOf(CatalogError)
      expect(f.calls.at(-1)?.stage).toBe("device")
      expect(f.calls.some((call) => call.stage === "upsert")).toBe(false)
      expect(existing).toEqual(snapshot)
    })
  }

  test("refuses a REVOKED row before reading metadata, Store or changing registration", async () => {
    const f = fixture({ existing: { ...original, status: "REVOKED" } })
    await expect(
      registerOwnedOfflineDevice(f.db, input),
    ).rejects.toBeInstanceOf(RetailOpsOfflineDeviceError)
    expect(f.calls.map((call) => call.stage)).toEqual([
      "tenant",
      "membership",
      "key",
      "row",
      "device-status",
      "revocation",
    ])
  })

  for (const existing of [null, original]) {
    for (const source of ["durable", "legacy metadata"] as const) {
      test(`refuses ${source} revocation with ${existing ? "ACTIVE" : "missing"} device row`, async () => {
        const f = fixture({
          existing,
          revocation:
            source === "durable" ? { id: "unrestored-revocation" } : null,
          metadata:
            source === "legacy metadata"
              ? {
                  retailOps: {
                    revokedOfflineDevices: [
                      {
                        deviceId: input.deviceId,
                        actorUserId: input.actorUserId,
                        registeredAt: "2026-01-01T00:00:00.000Z",
                        lastSeenAt: "2026-01-02T00:00:00.000Z",
                        revokedAt: "2026-01-03T00:00:00.000Z",
                        revokedByUserId: "admin-a",
                        storeId: input.storeId,
                        platform: "android",
                      },
                    ],
                  },
                }
              : {},
        })
        await expect(
          registerOwnedOfflineDevice(f.db, input),
        ).rejects.toMatchObject({
          name: "RetailOpsOfflineDeviceError",
          code: "DEVICE_REVOKED",
        })
        expect(f.calls.some((call) => call.stage === "store")).toBe(false)
        expect(f.calls.some((call) => call.stage === "upsert")).toBe(false)
        expect(
          f.calls.filter((call) => call.stage === "metadata"),
        ).toHaveLength(source === "durable" ? 0 : 1)
      })
    }
  }

  test("new registration records exact original identity and refresh changes metadata only", async () => {
    const f = fixture()
    const created = await registerOwnedOfflineDevice(f.db, input)
    expect(created).toMatchObject({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      storeId: input.storeId,
      registeredByUserId: input.actorUserId,
      status: "ACTIVE",
      appVersion: "2.0",
      deviceName: "Updated phone",
      platform: "ANDROID",
    })
    const refreshed = await registerOwnedOfflineDevice(f.db, {
      ...input,
      deviceName: "Renamed",
      appVersion: "2.1",
    })
    expect(refreshed).toMatchObject({
      id: created.id,
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      storeId: input.storeId,
      registeredByUserId: input.actorUserId,
      status: "ACTIVE",
      registeredAt: original.registeredAt,
      deviceName: "Renamed",
      appVersion: "2.1",
      platform: "ANDROID",
      revokedAt: null,
      revokedByUserId: null,
    })
    expect(refreshed.lastSeenAt).toBeInstanceOf(Date)
    expect(
      f.calls.filter((call) => call.stage === "upsert").at(-1)?.args,
    ).toEqual({
      create: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        deviceId: input.deviceId,
        platform: input.platform,
        registeredByUserId: input.actorUserId,
        deviceName: "Renamed",
        appVersion: "2.1",
      },
      update: {
        deviceName: "Renamed",
        appVersion: "2.1",
        platform: "ANDROID",
        lastSeenAt: expect.any(Date),
      },
      where: {
        tenantId_deviceId: {
          tenantId: input.tenantId,
          deviceId: input.deviceId,
        },
      },
    })
  })

  for (const role of ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"]) {
    test(`active legacy ${role} can register; scoped management remains supported`, async () => {
      const f = fixture({
        staff: {
          ...actor,
          role,
          staffAccessMode: ["OWNER", "ADMIN"].includes(role)
            ? "SCOPED"
            : "LEGACY",
        },
      })
      await expect(
        registerOwnedOfflineDevice(f.db, input),
      ).resolves.toMatchObject({ registeredByUserId: input.actorUserId })
      expect(f.calls.filter((call) => call.stage === "upsert")).toHaveLength(1)
    })
  }

  for (const stage of [
    "tenant",
    "membership",
    "key",
    "row",
    "device-status",
    "revocation",
    "metadata",
    "store",
    "device",
    "upsert",
  ] as const) {
    test(`unexpected ${stage} failure propagates unchanged without a later write`, async () => {
      const error = new Error(`inert ${stage} failure`)
      const f = fixture({ failAt: stage, error })
      await expect(registerOwnedOfflineDevice(f.db, input)).rejects.toBe(error)
      expect(f.calls.some((call) => call.stage === stage)).toBe(true)
      expect(f.calls.filter((call) => call.stage === "upsert")).toHaveLength(
        stage === "upsert" ? 1 : 0,
      )
    })
  }
})
