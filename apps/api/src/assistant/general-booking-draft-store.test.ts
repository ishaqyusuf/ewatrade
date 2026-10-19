import { afterAll, expect, spyOn, test } from "bun:test"
import {
  type GeneralBookingAction,
  generalBookingActionSchema,
} from "@ewatrade/assistant/general/booking-action"
import {
  confirmPreparedServiceCommerceBookingInTransaction,
  createPreparedServiceCommerceBookingHoldInTransaction,
  inspectServiceCommerceBookingConfirmationInTransaction,
  prepareServiceCommerceBookingConfirmation,
  prepareServiceCommerceBookingHold,
} from "../../../../packages/db/src/queries/service-commerce-bookings/booking-commands"
import { bookingAvailabilityScope as nativeScope } from "../../../../packages/db/src/queries/test-helpers/booking-availability"
import { generalBookingDraftFixture } from "../../../../packages/db/src/queries/test-helpers/general-booking-draft"
import { parseBookingDraftScope } from "./general-booking-draft-contract"
import {
  createGeneralBookingDraftInTransaction as create,
  editGeneralBookingDraftInTransaction as edit,
  generalBookingDraftApprovalToken,
  inspectGeneralBookingDraftRowInTransaction as inspect,
  readGeneralBookingDraftInTransaction as read,
} from "./general-booking-draft-store"
import { generalBookingNativeInput } from "./general-booking-input"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No network/provider in inert booking draft tests"),
)
afterAll(() => network.mockRestore())
const now = Date.parse("2031-02-03T08:00:00.000Z")
const key = "INERT_BOOKING_SIGNING_KEY_NOT_A_CREDENTIAL_".repeat(2)
const ids = {
  proposalId: "proposal-booking",
  idempotencyKey: "booking-command",
}
type Fixture = ReturnType<typeof generalBookingDraftFixture>

test("actual GENERAL opaque conversation identities preserve whitespace and punctuation exactly", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const conversationId = " 原始 chat /? "
    f.scope.conversationId = conversationId
    f.conversation.id = conversationId
    const app = await create(f.tx, { ...f.scope, payload: hold() }, ids, key)
    expect(
      (await read(f.tx, { ...f.scope, draftRef: app.draftRef }, key)).row
        .conversationId,
    ).toBe(conversationId)
    await expect(
      read(
        f.tx,
        {
          ...f.scope,
          conversationId: conversationId.trim(),
          draftRef: app.draftRef,
        },
        key,
      ),
    ).rejects.toThrow()
  }))

test("configuration and booking revisions refresh only through explicit full edit and fresh canonical review", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    f.canonical.state.config.revision = 1
    await expect(read(f.tx, request(f), key)).rejects.toThrow()
    await edit(
      f.tx,
      {
        ...f.scope,
        request: {
          draftRef: ids.proposalId,
          revision: 1,
          payload: { ...payload, expectedConfigurationRevision: 1 },
        },
      },
      key,
    )
    const refreshed = await read(f.tx, request(f), key)
    if (refreshed.nativeInput.kind !== "hold") throw Error("Expected hold")
    expect(refreshed.nativeInput.input.expectedConfigurationRevision).toBe(1)
    const g = generalBookingDraftFixture()
    const cancel = await action(g, "service_booking_cancel")
    await create(g.tx, { ...g.scope, payload: cancel }, ids, key)
    Object.assign(g.canonical.bookings[0] ?? {}, { revision: 1 })
    await expect(read(g.tx, request(g), key)).rejects.toThrow()
    await edit(
      g.tx,
      {
        ...g.scope,
        request: {
          draftRef: ids.proposalId,
          revision: 1,
          payload: {
            ...cancel,
            expectedRevision: 1,
            reasonCode: " UPDATED_REASON ",
          },
        },
      },
      key,
    )
    const next = await read(g.tx, request(g), key)
    if (next.nativeInput.kind !== "revise") throw Error("Expected revision")
    expect(next.nativeInput.input.expectedRevision).toBe(1)
    expect(next.nativeInput.input.reasonCode).toBe(" UPDATED_REASON ")
    expect(next.nativeInput.input.clientOperationId).toBe(ids.idempotencyKey)
  }))

test("known schema revision ceiling refuses edit before write and readback expiry cannot yield app approval", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    f.row().revision = 2_147_483_647
    f.row().approvalTokenHash = proposalDigest(
      generalBookingDraftApprovalToken(f.row(), key),
    )
    const writes = f.writes.length
    await expect(
      edit(
        f.tx,
        {
          ...f.scope,
          request: {
            draftRef: ids.proposalId,
            revision: 2_147_483_647,
            payload,
          },
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "stale_draft" })
    expect(f.writes).toHaveLength(writes)
    const g = generalBookingDraftFixture()
    g.control.expireReadback = true
    await expect(
      create(g.tx, { ...g.scope, payload }, ids, key),
    ).rejects.toMatchObject({ reason: "invalid_binding" })
    expect(g.rows).toHaveLength(1) // Inert mutation retained; actual owning TX must rollback.
  }))

test("durable pending storage retains complete2001line native work graph only in fresh SERVERONLY review", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = await action(f, "service_booking_complete")
    Object.assign(f.canonical.bookings[0] ?? {}, {
      commercialOrderId: "order-1",
      serviceJobId: "job-1",
    })
    f.canonical.jobs.push({
      id: "job-1",
      tenantId: nativeScope.tenantId,
      storeId: nativeScope.storeId,
      commercialOrderId: "order-1",
      revision: 4,
    })
    for (let i = 0; i < 2001; i++)
      f.canonical.jobLines.push({
        id: `line-${i}`,
        serviceJobId: "job-1",
        revision: 0,
        status: "IN_PROGRESS",
        authorizationStatus: "AUTHORIZED",
        allocatedQuantity: "0.000001",
        reworkOfLineId: null,
        completedAt: null,
        serviceJob: {
          commercialOrderId: "order-1",
          storeId: nativeScope.storeId,
          tenantId: nativeScope.tenantId,
        },
      })
    f.canonical.orderLines.push({
      id: "original-line",
      orderId: "order-1",
      order: { storeId: nativeScope.storeId, tenantId: nativeScope.tenantId },
      kind: "SERVICE",
      quantity: "0.002001",
      productFulfillments: [],
      snapshot: {
        serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
        serviceWorkPolicy: "TRACKED",
      },
      serviceAuthorization: null,
      serviceFulfillment: null,
      serviceJobLines: f.canonical.jobLines,
    })
    const before = f.canonical.writes.length
    const app = await create(f.tx, { ...f.scope, payload }, ids, key)
    expect(Object.keys(app).sort()).toEqual([
      "draftRef",
      "expiresAt",
      "revision",
      "status",
    ])
    const saved = await read(f.tx, request(f), key)
    const details = saved.review.review.details
    if (!("work" in details) || !details.work)
      throw Error("Expected full work review")
    expect(details.work.lines).toHaveLength(2001)
    expect(details.work.changes).toHaveLength(2001)
    expect(
      details.work.lines.every((line) => line.allocatedQuantity === "0.000001"),
    ).toBe(true)
    expect(details.work.wouldCompleteOrder).toBe(true)
    expect(f.canonical.writes).toHaveLength(before)
    expect(
      f.canonical.jobLines.every((line) => line.status === "IN_PROGRESS"),
    ).toBe(true)
    expect(JSON.stringify(f.row().payload)).not.toContain("allocatedQuantity")
    Object.assign(f.canonical.jobLines[2000] ?? {}, { revision: 1 })
    await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
      reason: "stale_review",
    })
  }))

test("COMPLETED inspection preserves exact actual native receipt after expiry/key rotation/readiness change without authorizing replay", () =>
  clocked(async (setNow) => {
    const f = generalBookingDraftFixture()
    await create(f.tx, { ...f.scope, payload: hold() }, ids, key)
    const pending = await read(f.tx, request(f), key)
    if (pending.nativeInput.kind !== "hold") throw Error("Expected hold")
    // Explicit inert canonical effect setup, not GENERAL confirmation acceptance.
    const actual = await createPreparedServiceCommerceBookingHoldInTransaction(
      f.canonical.tx,
      prepareServiceCommerceBookingHold(
        pending.nativeInput.input,
        () => "PRIVATE_TOKEN",
      ),
      nativeScope,
    )
    Object.assign(f.row(), {
      status: "COMPLETED",
      decidedAt: new Date(now),
      executedResult: {
        kind: "service_booking_command",
        effect: actual.receipt,
      },
    })
    setNow(now + 86400_000)
    f.canonical.state.profile.bookingEnabled = false
    const inspected = await inspect(f.tx, request(f))
    expect(inspected.row.status).toBe("COMPLETED")
    expect(inspected.nativeInput.input.clientOperationId).toBe(
      ids.idempotencyKey,
    )
    expect<unknown>(inspected.row.executedResult).toEqual({
      kind: "service_booking_command",
      effect: actual.receipt,
    })
    const writes = f.canonical.writes.length
    await expect(
      read(f.tx, request(f), "ROTATED_".repeat(8)),
    ).rejects.toMatchObject({ reason: "terminal" })
    expect(f.canonical.writes).toHaveLength(writes)
    Object.assign(f.row(), {
      status: "EXECUTING",
      errorCode: "HISTORICAL_UNCERTAIN",
    })
    expect((await inspect(f.tx, request(f))).row.status).toBe("EXECUTING")
    Object.assign(f.row(), { status: "CANCELLED", errorCode: null })
    await expect(inspect(f.tx, request(f))).rejects.toMatchObject({
      reason: "invalid_binding",
    })
  }))
const hold = () => {
  const parsed = generalBookingActionSchema.parse({
    action: "service_booking_hold",
    source: { kind: "service", id: "request-1" },
    offeringId: "offering-1",
    resourceId: "resource-1",
    quantity: 1,
    expectedConfigurationRevision: 0,
    slotStartAt: new Date(now + 2 * 3600_000).toISOString(),
    slotEndAt: new Date(now + 2.5 * 3600_000).toISOString(),
  })
  if (parsed.action !== "service_booking_hold")
    throw Error("Expected actual parsed hold action")
  return parsed
}
async function clocked(
  run: (setNow: (value: number) => void) => Promise<void>,
) {
  const clock = spyOn(Date, "now").mockReturnValue(now)
  try {
    await run((at) => {
      clock.mockReturnValue(at)
    })
  } finally {
    clock.mockRestore()
  }
}
async function activeHold(f: Fixture) {
  const native = generalBookingNativeInput(hold(), nativeScope, "seed-hold")
  if (native.kind !== "hold") throw Error("Expected hold input")
  const result = await createPreparedServiceCommerceBookingHoldInTransaction(
    f.canonical.tx,
    prepareServiceCommerceBookingHold(native.input, () => "PRIVATE_TOKEN"),
    nativeScope,
  )
  return result.receipt.holdId
}
async function action(
  f: Fixture,
  name: GeneralBookingAction["action"],
): Promise<GeneralBookingAction> {
  if (name === "service_booking_hold") return hold()
  const holdId = await activeHold(f)
  if (name === "service_booking_confirm")
    return generalBookingActionSchema.parse({
      action: name,
      source: { kind: "service", id: "request-1" },
      holdId,
    })
  const input = {
    ...nativeScope,
    source: { kind: "service" as const, id: "request-1" },
    holdId,
    clientOperationId: "seed-confirm",
  }
  const inspection =
    await inspectServiceCommerceBookingConfirmationInTransaction(
      f.canonical.tx,
      input,
    )
  const result = await confirmPreparedServiceCommerceBookingInTransaction(
    f.canonical.tx,
    prepareServiceCommerceBookingConfirmation(inspection, {
      issueCapabilityToken: () => "PRIVATE_TOKEN",
      protectRecipient: () => "PRIVATE_CIPHER",
    }),
    nativeScope,
  )
  if (result.receipt.kind !== "booking_event")
    throw Error("Expected exact booking event")
  if (name === "service_booking_start")
    Object.assign(f.canonical.bookings[0] ?? {}, { status: "ARRIVED" })
  if (name === "service_booking_complete")
    Object.assign(f.canonical.bookings[0] ?? {}, { status: "IN_SERVICE" })
  return generalBookingActionSchema.parse({
    action: name,
    bookingId: result.receipt.bookingId,
    expectedRevision: 0,
    ...([
      "service_booking_cancel",
      "service_booking_no_show",
      "service_booking_reschedule",
    ].includes(name)
      ? { reasonCode: "CUSTOMER_REQUEST" }
      : {}),
    ...(name === "service_booking_reschedule"
      ? {
          resourceId: "resource-1",
          newSlotStartAt: new Date(now + 3 * 3600_000).toISOString(),
          newSlotEndAt: new Date(now + 3.5 * 3600_000).toISOString(),
        }
      : {}),
  })
}
function request(f: Fixture) {
  return { ...f.scope, draftRef: ids.proposalId }
}

test("actual create/read/edit/replay covers all8 with compact app references and unchanged native key", () =>
  clocked(async () => {
    const actions: GeneralBookingAction["action"][] = [
      "service_booking_hold",
      "service_booking_confirm",
      "service_booking_arrive",
      "service_booking_start",
      "service_booking_complete",
      "service_booking_cancel",
      "service_booking_no_show",
      "service_booking_reschedule",
    ]
    for (const name of actions) {
      const f = generalBookingDraftFixture()
      const payload = await action(f, name)
      const domainWrites = f.canonical.writes.length
      const app = await create(f.tx, { ...f.scope, payload }, ids, key)
      expect(Object.keys(app).sort()).toEqual([
        "draftRef",
        "expiresAt",
        "revision",
        "status",
      ])
      expect(app).toEqual({
        draftRef: ids.proposalId,
        revision: 1,
        status: "PENDING",
        expiresAt: new Date(now + 15 * 60_000).toISOString(),
      })
      expect(await create(f.tx, { ...f.scope, payload }, ids, key)).toEqual(app)
      const saved = await read(f.tx, request(f), key)
      expect<unknown>(saved.payload).toEqual(payload)
      expect(saved.nativeInput.input.clientOperationId).toBe(ids.idempotencyKey)
      const targetRevision = f.row().targetRevision
      if (typeof targetRevision !== "string")
        throw Error("Expected saved target revision")
      expect(saved.review.target.revision).toBe(targetRevision)
      expect(f.row().payloadHash).toBe(proposalDigest(payload))
      expect(f.row().approvalTokenHash).toBe(
        proposalDigest(generalBookingDraftApprovalToken(f.row(), key)),
      )
      const oldApproval = f.row().approvalTokenHash
      f.canonical.state.source.revision++
      await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
        reason: "stale_review",
      })
      const edited = await edit(
        f.tx,
        {
          ...f.scope,
          request: { draftRef: app.draftRef, revision: 1, payload },
        },
        key,
      )
      expect(edited.revision).toBe(2)
      expect(f.row().idempotencyKey).toBe(ids.idempotencyKey)
      expect(f.row().approvalTokenHash).not.toBe(oldApproval)
      expect((await read(f.tx, request(f), key)).appRef).toEqual(edited)
      expect(f.rows).toHaveLength(1)
      expect(f.canonical.writes).toHaveLength(domainWrites)
      expect(network).not.toHaveBeenCalled()
    }
  }))

test("same source hold edits retain fixed action/source/Offering but allow exact native resource/quantity/slot/current config changes", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    for (const changed of [
      { ...payload, action: "service_booking_confirm", holdId: "foreign" },
      { ...payload, source: { kind: "service", id: "foreign" } },
      { ...payload, offeringId: "foreign" },
    ])
      await expect(
        edit(
          f.tx,
          {
            ...f.scope,
            request: {
              draftRef: ids.proposalId,
              revision: 1,
              payload: changed,
            },
          },
          key,
        ),
      ).rejects.toThrow()
    const next = generalBookingActionSchema.parse({
      ...payload,
      quantity: 2,
      slotStartAt: new Date(now + 3 * 3600_000).toISOString(),
      slotEndAt: new Date(now + 3.5 * 3600_000).toISOString(),
    })
    await edit(
      f.tx,
      {
        ...f.scope,
        request: { draftRef: ids.proposalId, revision: 1, payload: next },
      },
      key,
    )
    expect<unknown>((await read(f.tx, request(f), key)).payload).toEqual(next)
    await expect(
      edit(
        f.tx,
        {
          ...f.scope,
          request: { draftRef: ids.proposalId, revision: 1, payload: next },
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "stale_draft" })
  }))

test("confirmation links are editable under fresh native review while original hold/source and revision booking stay fixed", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = await action(f, "service_booking_confirm")
    await create(f.tx, { ...f.scope, payload }, ids, key)
    const linked = generalBookingActionSchema.parse({
      ...payload,
      commercialOrderId: "order-1",
    })
    await edit(
      f.tx,
      {
        ...f.scope,
        request: { draftRef: ids.proposalId, revision: 1, payload: linked },
      },
      key,
    )
    expect(
      (await read(f.tx, request(f), key)).nativeInput.input,
    ).toHaveProperty("commercialOrderId", "order-1")
    await expect(
      edit(
        f.tx,
        {
          ...f.scope,
          request: {
            draftRef: ids.proposalId,
            revision: 2,
            payload: { ...linked, holdId: "other" },
          },
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "invalid_binding" })
    const g = generalBookingDraftFixture()
    const revision = await action(g, "service_booking_cancel")
    await create(g.tx, { ...g.scope, payload: revision }, ids, key)
    await expect(
      edit(
        g.tx,
        {
          ...g.scope,
          request: {
            draftRef: ids.proposalId,
            revision: 1,
            payload: { ...revision, bookingId: "other" },
          },
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "invalid_binding" })
  }))

test("every local versioned signature field is bound; ordinary GENERAL token is incompatible", () =>
  clocked(async () => {
    const changes = [
      { actionVersion: 2 },
      { action: "service_booking_cancel" },
      { targetRevision: "b".repeat(64) },
      { targetRecordId: "other" },
      { roleSnapshot: "ADMIN" },
      { conversationId: "other" },
      { idempotencyKey: "other" },
      { payloadHash: "c".repeat(64) },
      { actorUserId: "other" },
      { tenantId: "other" },
      { storeId: "other" },
      { revision: 2 },
      { expiresAt: new Date(now + 20 * 60_000) },
    ]
    const f = generalBookingDraftFixture()
    await create(f.tx, { ...f.scope, payload: hold() }, ids, key)
    const row = structuredClone(f.row())
    const signature = generalBookingDraftApprovalToken(row, key)
    for (const changed of changes)
      expect(
        generalBookingDraftApprovalToken({ ...row, ...changed }, key),
      ).not.toBe(signature)
    expect(proposalApprovalToken(row, key)).not.toBe(signature)
    f.row().approvalTokenHash = proposalDigest(proposalApprovalToken(row, key))
    await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
      reason: "invalid_binding",
    })
  }))

test("expiry renews only explicit signed same pending draft; current signing key cannot silently rotate it", () =>
  clocked(async (setNow) => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    setNow(now + 16 * 60_000)
    await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
      reason: "expired",
    })
    await expect(
      edit(
        f.tx,
        {
          ...f.scope,
          request: { draftRef: ids.proposalId, revision: 1, payload },
        },
        "ROTATED_".repeat(8),
      ),
    ).rejects.toMatchObject({ reason: "invalid_binding" })
    const app = await edit(
      f.tx,
      {
        ...f.scope,
        request: { draftRef: ids.proposalId, revision: 1, payload },
      },
      key,
    )
    expect(app.revision).toBe(2)
    expect(Date.parse(app.expiresAt)).toBe(now + 31 * 60_000)
  }))

test("source/role/authority drift invalidates pending read; fresh exact edit replaces role and target", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    f.canonical.state.member.role = "ADMIN"
    await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
      reason: "stale_review",
    })
    await edit(
      f.tx,
      {
        ...f.scope,
        request: { draftRef: ids.proposalId, revision: 1, payload },
      },
      key,
    )
    expect(f.row().roleSnapshot).toBe("ADMIN")
    f.canonical.state.member.status = "INACTIVE"
    await expect(read(f.tx, request(f), key)).rejects.toThrow()
    expect(f.rows).toHaveLength(1)
  }))

test("exact IDs/key replay refuses foreign/tampered/different payload without duplicate staging", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    for (const other of [
      { ...ids, proposalId: "other" },
      { ...ids, idempotencyKey: "other" },
    ])
      await expect(
        create(f.tx, { ...f.scope, payload }, other, key),
      ).rejects.toMatchObject({ reason: "idempotency_conflict" })
    await expect(
      create(
        f.tx,
        { ...f.scope, payload: { ...payload, quantity: 2 } },
        ids,
        key,
      ),
    ).rejects.toMatchObject({ reason: "idempotency_conflict" })
    for (const changed of [
      { actorUserId: "foreign" },
      { tenantId: "foreign" },
      { storeId: "foreign" },
      { conversationId: "foreign" },
    ])
      await expect(
        read(f.tx, { ...request(f), ...changed }, key),
      ).rejects.toThrow()
    f.row().payload = { ...payload, quantity: 2 }
    await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
      reason: "invalid_binding",
    })
    expect(f.rows).toHaveLength(1)
  }))

test("strict full input snapshots before deferred read; callback/proxy/extras cannot stage authority", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    const input = { ...f.scope, payload: { ...payload } }
    const pending = create(f.tx, input, ids, key)
    input.payload = { ...payload, quantity: 2 }
    expect((await pending).revision).toBe(1)
    expect<unknown>((await read(f.tx, request(f), key)).payload).toEqual(
      payload,
    )
    let invoked = 0
    const getter = Object.defineProperty({}, "action", {
      enumerable: true,
      get: () => {
        invoked++
        return "service_booking_hold"
      },
    })
    await expect(
      create(
        f.tx,
        { ...f.scope, payload: getter },
        { proposalId: "other", idempotencyKey: "other" },
        key,
      ),
    ).rejects.toThrow()
    await expect(
      edit(
        f.tx,
        {
          ...f.scope,
          request: {
            draftRef: ids.proposalId,
            revision: 1,
            payload,
            approve: true,
          },
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "invalid_input" })
    expect(invoked).toBe(0)
    expect(f.rows).toHaveLength(1)
  }))

test("CAS lost and corrupted readback refuse honestly; inert fixture does not pretend SQL rollback", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const payload = hold()
    await create(f.tx, { ...f.scope, payload }, ids, key)
    f.control.loseCAS = true
    await expect(
      edit(
        f.tx,
        {
          ...f.scope,
          request: { draftRef: ids.proposalId, revision: 1, payload },
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "stale_draft" })
    expect(f.row().revision).toBe(1)
    const g = generalBookingDraftFixture()
    g.control.corruptReadback = true
    await expect(
      create(g.tx, { ...g.scope, payload }, ids, key),
    ).rejects.toMatchObject({ reason: "invalid_binding" })
    expect(g.rows).toHaveLength(1) // Local delegate mutated; real caller MUST roll back.
  }))

test("terminal-first SERVERONLY inspection preserves uncertain metadata and refuses impossible pending proof", () =>
  clocked(async (setNow) => {
    const f = generalBookingDraftFixture()
    await create(f.tx, { ...f.scope, payload: hold() }, ids, key)
    const baseline = structuredClone(f.row())
    setNow(now + 24 * 3600_000)
    f.canonical.state.profile.bookingEnabled = false
    for (const status of ["EXECUTING", "FAILED", "EXPIRED"] as const) {
      Object.assign(f.row(), baseline, {
        status,
        errorCode: "HISTORICAL_UNKNOWN",
        decidedAt: new Date(now),
      })
      const saved = await inspect(f.tx, request(f))
      expect(saved.row.status).toBe(status)
      expect(saved.row.errorCode).toBe("HISTORICAL_UNKNOWN")
      await expect(read(f.tx, request(f), key)).rejects.toMatchObject({
        reason: "terminal",
      })
    }
    Object.assign(f.row(), baseline, {
      status: "CANCELLED",
      decidedAt: new Date(now),
    })
    expect((await inspect(f.tx, request(f))).row.status).toBe("CANCELLED")
    Object.assign(f.row(), baseline, {
      status: "PENDING",
      errorCode: "IMPOSSIBLE",
    })
    await expect(inspect(f.tx, request(f))).rejects.toMatchObject({
      reason: "invalid_binding",
    })
    Object.assign(f.row(), baseline, {
      status: "COMPLETED",
      executedResult: { kind: "fake_success" },
      decidedAt: new Date(now),
    })
    await expect(inspect(f.tx, request(f))).rejects.toMatchObject({
      reason: "invalid_binding",
    })
  }))

test("actual191 scope/proposal/key and quantity10k are retained without incidental128 narrowing", () =>
  clocked(async () => {
    const f = generalBookingDraftFixture()
    const replacements = new Map([
      [f.scope.actorUserId, "a".repeat(191)],
      [f.scope.tenantId, "t".repeat(191)],
      [f.scope.storeId, "s".repeat(191)],
    ])
    const seen = new WeakSet<object>()
    function rebind(value: unknown): void {
      if (
        !value ||
        typeof value !== "object" ||
        value instanceof Date ||
        seen.has(value)
      )
        return
      seen.add(value)
      for (const [name, entry] of Object.entries(value)) {
        if (typeof entry === "string" && replacements.has(entry))
          Reflect.set(value, name, replacements.get(entry))
        else rebind(entry)
      }
    }
    rebind(f.scope)
    rebind(f.conversation)
    rebind(f.canonical.state)
    f.canonical.state.resource.capacity = 10_000
    expect(parseBookingDraftScope(f.scope)).toEqual(f.scope)
    const fullIds = {
      proposalId: "p".repeat(191),
      idempotencyKey: "k".repeat(191),
    }
    const app = await create(
      f.tx,
      { ...f.scope, payload: { ...hold(), quantity: 10_000 } },
      fullIds,
      key,
    )
    const saved = await read(f.tx, { ...f.scope, draftRef: app.draftRef }, key)
    expect(saved.nativeInput.input.actorUserId).toHaveLength(191)
    expect(saved.nativeInput.input.clientOperationId).toBe(
      fullIds.idempotencyKey,
    )
    expect(app.draftRef).toBe(fullIds.proposalId)
    expect<unknown>(saved.payload).toEqual({ ...hold(), quantity: 10_000 })
  }))
