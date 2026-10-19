import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { offlineCommandEnvelopeHash } from "./offline-commands"
import {
  type OfflineQuickSaleCorrectionRecord,
  assertOfflineOrderIdentityNotRetired,
  readOfflineQuickSaleCorrectionRecord,
} from "./offline-quick-sale-correction-record"

const marker = {
  version: 1,
  kind: "blank_quick_sale_replaced",
  originalClientCommandId: "original-command",
  originalPayloadHash: "a".repeat(64),
  replacementClientCommandId: "replacement-command",
  replacementPayloadHash: "b".repeat(64),
  replacedByUserId: "original-author",
  replacedAt: "2026-10-17T08:00:00.000Z",
} satisfies OfflineQuickSaleCorrectionRecord

test("strict valid tombstone reads a detached annotation without mutating stored state", () => {
  const state = {
    _offlineQuickSaleCorrection: structuredClone(marker),
    other: "preserved",
  }
  const before = structuredClone(state)
  const parsed = readOfflineQuickSaleCorrectionRecord(state)
  expect(parsed).toEqual(marker)
  if (!parsed) throw Error("Expected correction marker")
  parsed.replacementClientCommandId = "mutated-result"
  expect(state).toEqual(before)
})

test("missing annotation is a no-op across supported historical states", () => {
  for (const state of [
    null,
    undefined,
    0,
    false,
    "legacy",
    [],
    {},
    { orderId: "order-a" },
  ])
    expect(readOfflineQuickSaleCorrectionRecord(state)).toBeNull()
  expect(
    readOfflineQuickSaleCorrectionRecord(
      Object.create({ _offlineQuickSaleCorrection: marker }),
    ),
  ).toBeNull()
})

test("reserved annotation is fail-closed for malformed, incomplete, extra and unsupported shapes", () => {
  const { replacedAt: _missing, ...incomplete } = marker
  for (const invalid of [
    undefined,
    null,
    [],
    "marker",
    {},
    incomplete,
    { ...marker, version: 2 },
    { ...marker, kind: "other" },
    { ...marker, originalClientCommandId: "short" },
    { ...marker, replacementClientCommandId: "x".repeat(161) },
    { ...marker, originalPayloadHash: "A".repeat(64) },
    { ...marker, replacementPayloadHash: "z".repeat(64) },
    { ...marker, originalPayloadHash: "a".repeat(63) },
    { ...marker, replacedByUserId: "" },
    { ...marker, replacedAt: "yesterday" },
    { ...marker, replacedAt: "2026-02-30T08:00:00.000Z" },
    { ...marker, allowReplay: true },
  ]) {
    try {
      readOfflineQuickSaleCorrectionRecord({
        _offlineQuickSaleCorrection: invalid,
      })
      throw Error("Malformed reserved marker accepted")
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError)
      if (!(error instanceof CatalogError)) throw error
      expect(error.code).toBe("IDEMPOTENCY_MISMATCH")
    }
  }
})

function fixture(command: unknown = null, error?: Error) {
  const reads: Prisma.OfflineCommandFindUniqueArgs[] = []
  const tx = {
    offlineCommand: {
      findUnique: async (args: Prisma.OfflineCommandFindUniqueArgs) => {
        reads.push(structuredClone(args))
        if (error) throw error
        return command
      },
    },
  }
  // Only the actual helper's read port is present: a lock, write, canonical
  // command or audit attempt would fail instead of being silently accepted.
  return { tx: tx as unknown as Prisma.TransactionClient, reads }
}
const input = { tenantId: "tenant-original", clientOrderId: "original-command" }

test("identity lookup is exact Tenant/client identity and nonlocking with no extra reads or writes", async () => {
  const f = fixture()
  await assertOfflineOrderIdentityNotRetired(f.tx, input)
  expect(f.reads).toEqual([
    {
      where: {
        tenantId_clientCommandId: {
          tenantId: input.tenantId,
          clientCommandId: input.clientOrderId,
        },
      },
      select: { authoritativeState: true, payloadHash: true },
    },
  ])
  const other = { tenantId: "tenant-other", clientOrderId: "command-other" }
  await assertOfflineOrderIdentityNotRetired(f.tx, other)
  expect(f.reads[1]?.where).toEqual({
    tenantId_clientCommandId: {
      tenantId: other.tenantId,
      clientCommandId: other.clientOrderId,
    },
  })
})

test("ordinary stored rows remain eligible regardless of historical state/status", async () => {
  for (const authoritativeState of [null, {}, { orderId: "order-a" }, "legacy"])
    await assertOfflineOrderIdentityNotRetired(
      fixture({ authoritativeState, payloadHash: marker.originalPayloadHash })
        .tx,
      input,
    )
})

test("a valid tombstone denies every stale status and never depends on a matching stored hash", async () => {
  for (const status of [
    "PENDING",
    "REVIEW_REQUIRED",
    "CONFLICT",
    "REJECTED",
    "APPLIED",
    "DISCARDED",
  ])
    for (const payloadHash of [marker.originalPayloadHash, "c".repeat(64)]) {
      const stored = {
        status,
        payloadHash,
        authoritativeState: {
          _offlineQuickSaleCorrection: structuredClone(marker),
        },
      }
      const before = structuredClone(stored)
      const f = fixture(stored)
      await expect(
        assertOfflineOrderIdentityNotRetired(f.tx, input),
      ).rejects.toThrow(CatalogError)
      expect(f.reads).toHaveLength(1)
      expect(stored).toEqual(before)
    }
})

test("malformed reserved tombstone denies canonical creation at the actual lookup boundary", async () => {
  for (const invalid of [null, {}, { ...marker, extra: true }]) {
    const f = fixture({
      authoritativeState: { _offlineQuickSaleCorrection: invalid },
    })
    await expect(
      assertOfflineOrderIdentityNotRetired(f.tx, input),
    ).rejects.toThrow(CatalogError)
    expect(f.reads).toHaveLength(1)
  }
})

test("unexpected lookup errors propagate unchanged", async () => {
  const error = Error("Lookup unavailable")
  const f = fixture(null, error)
  await expect(assertOfflineOrderIdentityNotRetired(f.tx, input)).rejects.toBe(
    error,
  )
})

test("annotation and identity reads never alter original immutable envelope/hash", async () => {
  const envelope = {
    clientCommandId: input.clientOrderId,
    createdAtClient: new Date("2026-10-16T08:00:00.000Z"),
    dependencyClientIds: ["dependency-original"],
    eventVersion: 1,
    payload: {
      kind: "commercial_order" as const,
      lines: [{ custom: "quick_sale" as const, amountMinor: 1500 }],
    },
  }
  const hash = offlineCommandEnvelopeHash(envelope)
  const before = structuredClone(envelope)
  const stored = {
    payload: envelope.payload,
    payloadHash: hash,
    authoritativeState: {
      _offlineQuickSaleCorrection: { ...marker, originalPayloadHash: hash },
    },
  }
  await expect(
    assertOfflineOrderIdentityNotRetired(fixture(stored).tx, input),
  ).rejects.toThrow(CatalogError)
  expect(stored.payloadHash).toBe(hash)
  expect(envelope).toEqual(before)
  expect(offlineCommandEnvelopeHash(envelope)).toBe(hash)
})
