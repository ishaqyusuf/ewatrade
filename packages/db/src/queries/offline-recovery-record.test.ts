import { expect, test } from "bun:test"
import { offlineReplaySchema } from "../../../../apps/api/src/schemas/offline"
import { CatalogError } from "./catalog-errors"
import { offlineCommandEnvelopeHash } from "./offline-commands"
import {
  readOfflineRecoveryRecord,
  withoutOfflineRecoveryRecord,
} from "./offline-recovery-record"

const marker = {
  version: 1 as const,
  kind: "suspended_staff" as const,
  membershipId: "membership-a",
  accessRevision: 4,
  accessChangedAt: "2026-10-17T07:00:00.000Z",
  lifecycleEventId: "suspension-a",
  receivedAt: "2026-10-17T08:00:00.000Z",
}
const envelope = {
  clientCommandId: "original-command",
  createdAtClient: new Date("2026-10-17T06:00:00.000Z"),
  dependencyClientIds: ["dependency-a"],
  eventVersion: 1,
  payload: {
    kind: "commercial_order" as const,
    lines: [
      { custom: "quick_sale" as const, amountMinor: 500, description: "Rice" },
    ],
    initialPayment: {
      amountMinor: 500,
      clientPaymentId: "payment-original",
      moneyAccountId: "account-original",
      method: "cash" as const,
    },
  },
}

test("strict marker parses into detached server annotation and leaves original payload unchanged", () => {
  const annotation = { ...marker }
  const payload = { ...envelope.payload, _offlineRecovery: annotation }
  const before = structuredClone(payload)
  const parsed = readOfflineRecoveryRecord(payload)
  expect(parsed).toEqual(marker)
  if (!parsed) throw Error("Expected recovery marker")
  parsed.membershipId = "changed-result"
  expect(annotation.membershipId).toBe(marker.membershipId)
  expect(payload).toEqual(before)
})

test("absent annotation preserves supported legacy payload and invalid roots fail closed", () => {
  expect(readOfflineRecoveryRecord(envelope.payload)).toBeNull()
  expect(withoutOfflineRecoveryRecord(envelope.payload)).toEqual(
    envelope.payload,
  )
  for (const invalid of [null, undefined, [], "payload", 5])
    expect(() => readOfflineRecoveryRecord(invalid)).toThrow(CatalogError)
})

test("malformed, incomplete, extra and unsupported server marker shapes fail closed", () => {
  const { receivedAt: _receivedAt, ...incomplete } = marker
  for (const invalid of [
    null,
    undefined,
    [],
    "suspended_staff",
    {},
    incomplete,
    { ...marker, version: 2 },
    { ...marker, kind: "active_staff" },
    { ...marker, membershipId: "" },
    { ...marker, lifecycleEventId: "" },
    { ...marker, accessRevision: 0 },
    { ...marker, accessRevision: 1.5 },
    { ...marker, accessRevision: "4" },
    { ...marker, receivedAt: "yesterday" },
    { ...marker, accessChangedAt: "2026-02-30T07:00:00.000Z" },
    { ...marker, extraAuthority: true },
  ])
    expect(() =>
      readOfflineRecoveryRecord({
        ...envelope.payload,
        _offlineRecovery: invalid,
      }),
    ).toThrow(CatalogError)
})

test("public replay schema rejects server marker, author and Tenant overrides", () => {
  const input = {
    commands: [envelope],
    deviceId: "registered-device",
    storeId: "store-a",
  }
  expect(offlineReplaySchema.safeParse(input).success).toBe(true)
  for (const fields of [
    { _offlineRecovery: marker },
    { actorUserId: "forged-author" },
    { tenantId: "foreign-tenant" },
  ]) {
    expect(
      offlineReplaySchema.safeParse({
        ...input,
        commands: [
          { ...envelope, payload: { ...envelope.payload, ...fields } },
        ],
      }).success,
    ).toBe(false)
  }
  expect(
    offlineReplaySchema.safeParse({ ...input, tenantId: "foreign-tenant" })
      .success,
  ).toBe(false)
  expect(
    offlineReplaySchema.safeParse({
      ...input,
      commands: [{ ...envelope, _offlineRecovery: marker }],
    }).success,
  ).toBe(false)
})

test("annotation removal preserves original immutable envelope hash and account/author fields", () => {
  const originalHash = offlineCommandEnvelopeHash(envelope)
  const payload = { ...envelope.payload, _offlineRecovery: marker }
  const originalPayload = withoutOfflineRecoveryRecord(payload)
  expect(originalPayload).toEqual(envelope.payload)
  expect(originalPayload).not.toHaveProperty("_offlineRecovery")
  expect(
    offlineCommandEnvelopeHash({ ...envelope, payload: originalPayload }),
  ).toBe(originalHash)
  expect(payload._offlineRecovery).toEqual(marker)
  const stored = { ...payload, actorUserId: "original-author" }
  expect(withoutOfflineRecoveryRecord(stored)).toMatchObject({
    actorUserId: "original-author",
    initialPayment: {
      moneyAccountId: "account-original",
      clientPaymentId: "payment-original",
    },
  })
  expect(
    offlineCommandEnvelopeHash({
      ...envelope,
      payload: {
        ...envelope.payload,
        initialPayment: {
          ...envelope.payload.initialPayment,
          moneyAccountId: "other-account",
        },
      },
    }),
  ).not.toBe(originalHash)
})

test("envelope hash remains JSON-order independent and Date/JSON round-trip compatible", () => {
  const restored = offlineReplaySchema.parse({
    commands: [JSON.parse(JSON.stringify(envelope))],
    deviceId: "registered-device",
  }).commands[0]
  if (!restored) throw Error("Expected strict restored envelope")
  expect(offlineCommandEnvelopeHash(restored)).toBe(
    offlineCommandEnvelopeHash(envelope),
  )
  expect(
    offlineCommandEnvelopeHash({
      ...envelope,
      payload: {
        initialPayment: envelope.payload.initialPayment,
        lines: envelope.payload.lines,
        kind: "commercial_order",
      },
    }),
  ).toBe(offlineCommandEnvelopeHash(envelope))
})
