import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { getCustomerLedgerAllocationHistory } from "./allocation-history"
const actor = {
  actorUserId: "owner",
  tenantId: "tenant",
  accountId: "account",
  allocationId: "allocation",
  expectedRevision: "1",
}
test("release history rejects unbounded and noncanonical pages before persistence", async () => {
  const unreachable = {} as PrismaClient
  for (const patch of [
    { expectedRevision: "01" },
    { expectedRevision: "-1" },
    { afterSequence: "2.1" },
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
  ])
    await expect(
      getCustomerLedgerAllocationHistory(unreachable, { ...actor, ...patch }),
    ).rejects.toThrow("bounded release history")
})

// Structural transaction fixture: tests scoped reads without touching financial fixtures.
function fixture({
  revision = 4n,
  authorized = true,
  accountVisible = true,
} = {}) {
  const calls: { name: string; args: unknown }[] = []
  const date = new Date("2026-10-02T10:00:00.000Z")
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        authorized ? { tenant: { isActive: true } } : null,
    },
    customerLedgerAccount: {
      findFirst: async (args: unknown) => {
        calls.push({ name: "account", args })
        return accountVisible
          ? { id: "account", revision, lastSequence: 8n, currencyCode: "NGN" }
          : null
      },
    },
    customerLedgerAllocation: {
      findFirst: async (args: unknown) => {
        calls.push({ name: "allocation", args })
        return {
          id: "allocation",
          amountMinor: 900n,
          sequence: 2n,
          creditEntryId: "credit",
          chargeEntryId: "charge",
          actorUserId: "owner",
          createdAt: date,
        }
      },
    },
    customerLedgerAllocationRelease: {
      findMany: async (args: unknown) => {
        calls.push({ name: "releases", args })
        return [3n, 5n].map((sequence) => ({
          id: `r-${sequence}`,
          sequence,
          amountMinor: 100n,
          reason: "Correct allocation",
          actorUserId: "owner",
          createdAt: date,
          orderSettlementReversal: null,
        }))
      },
      aggregate: async (args: unknown) => {
        calls.push({ name: "total", args })
        return { _sum: { amountMinor: 400n } }
      },
    },
  }
  const db = {
    $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient
  return { db, calls }
}
test("allocation history scopes tenant/account and keeps total releases independent of page", async () => {
  const { db, calls } = fixture()
  const result = await getCustomerLedgerAllocationHistory(db, {
    ...actor,
    expectedRevision: "4",
    afterSequence: "2",
    limit: 1,
  })
  expect(result).toMatchObject({
    currentRevision: "4",
    releasedAmountMinor: "400",
    remainingAmountMinor: "500",
    nextCursor: "3",
    reconciliationRequired: false,
  })
  expect(result.releases).toHaveLength(1)
  expect(calls.find((c) => c.name === "account")?.args).toMatchObject({
    where: { id: "account", tenantId: "tenant" },
  })
  expect(calls.find((c) => c.name === "allocation")?.args).toMatchObject({
    where: { id: "allocation", accountId: "account", sequence: { lte: 8n } },
  })
  expect(calls.find((c) => c.name === "releases")?.args).toMatchObject({
    where: { allocationId: "allocation", sequence: { lte: 8n, gt: 2n } },
    take: 2,
    orderBy: { sequence: "asc" },
  })
  expect(calls.find((c) => c.name === "total")?.args).toMatchObject({
    where: { allocationId: "allocation", sequence: { lte: 8n } },
  })
})
test("revoked manager, foreign account and stale revision refuse release reads", async () => {
  for (const [options, message] of [
    [{ authorized: false }, "active business Owners"],
    [{ accountVisible: false }, "not found"],
    [{ revision: 5n }, "account changed"],
  ] as const) {
    const { db, calls } = fixture(options)
    await expect(
      getCustomerLedgerAllocationHistory(db, {
        ...actor,
        expectedRevision: "4",
      }),
    ).rejects.toThrow(message)
    expect(calls.some((c) => c.name === "releases")).toBe(false)
  }
  const { db } = fixture()
  await expect(
    getCustomerLedgerAllocationHistory(db, {
      ...actor,
      expectedRevision: "4",
      afterSequence: "9",
    }),
  ).rejects.toThrow("beyond current")
})
