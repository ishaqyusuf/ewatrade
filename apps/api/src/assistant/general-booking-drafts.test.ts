import { afterAll, expect, spyOn, test } from "bun:test"
import { generalBookingActionSchema } from "@ewatrade/assistant/general/booking-action"
import {
  createGeneralBookingDraft,
  editGeneralBookingDraft,
  readGeneralBookingDraft,
} from "./general-booking-drafts"
import { generalBookingFreshFixture } from "./test-helpers/general-booking-fresh"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No provider/network in inert booking staging tests"),
)
afterAll(() => network.mockRestore())
const now = Date.parse("2031-02-03T08:00:00.000Z")
const ids = { proposalId: "booking-draft", idempotencyKey: "booking-command" }
const hold = () =>
  generalBookingActionSchema.parse({
    action: "service_booking_hold",
    source: { kind: "service", id: "request-1" },
    offeringId: "offering-1",
    resourceId: "resource-1",
    quantity: 1,
    expectedConfigurationRevision: 0,
    slotStartAt: new Date(now + 2 * 3_600_000).toISOString(),
    slotEndAt: new Date(now + 2.5 * 3_600_000).toISOString(),
  })
async function environment(run: () => Promise<void>) {
  const saved = {
    APP_ENV: process.env.APP_ENV,
    ASSISTANT_APPROVAL_SIGNING_KEY: process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
  }
  const clock = spyOn(Date, "now").mockReturnValue(now)
  process.env.APP_ENV = "production"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "INERT_BOOKING_SIGNING_KEY_NOT_A_CREDENTIAL_123456"
  try {
    await run()
  } finally {
    clock.mockRestore()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
}

test("actual fresh GENERAL guard stages, reads and edits actual signed booking drafts in one TX each", () =>
  environment(async () => {
    const f = await generalBookingFreshFixture()
    const conversationId = f.scope.conversationId
    const result = await createGeneralBookingDraft(
      f.ctx,
      { conversationId, payload: hold() },
      ids,
    )
    expect(Object.keys(result).sort()).toEqual([
      "draftRef",
      "expiresAt",
      "revision",
      "status",
    ])
    expect(result).toMatchObject({ draftRef: ids.proposalId, revision: 1 })
    const read = await readGeneralBookingDraft(f.ctx, {
      conversationId,
      draftRef: result.draftRef,
    })
    expect(read.row.actorUserId).toBe(f.ctx.session.user.id)
    expect(read.nativeInput.input.clientOperationId).toBe(ids.idempotencyKey)
    expect(read.review.review.operation).toBe("hold")
    const edited = await editGeneralBookingDraft(f.ctx, {
      conversationId,
      draftRef: result.draftRef,
      revision: 1,
      payload: { ...hold(), quantity: 2 },
    })
    expect(edited.revision).toBe(2)
    expect(f.row().payload).toMatchObject({ quantity: 2 })
    expect(f.counters()).toEqual({ transactions: 3, depth: 0 })
    expect(f.locks).toEqual([
      "Membership",
      "Store",
      "Membership",
      "Store",
      "Membership",
      "Store",
    ])
    expect(f.canonical.writes).toEqual([])
    expect(network).not.toHaveBeenCalled()
  }))

test("strict parsed input rejects client scope, command IDs, tokens and extras before opening TX", () =>
  environment(async () => {
    const f = await generalBookingFreshFixture()
    for (const extra of [
      { actorUserId: "foreign" },
      { tenantId: "foreign" },
      { storeId: "foreign" },
      { idempotencyKey: "client-chosen" },
      { approvalToken: "client-chosen" },
      { now: "client-clock" },
    ])
      await expect(
        createGeneralBookingDraft(
          f.ctx,
          { conversationId: f.scope.conversationId, payload: hold(), ...extra },
          ids,
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      editGeneralBookingDraft(f.ctx, {
        conversationId: f.scope.conversationId,
        draftRef: ids.proposalId,
        revision: 0,
        payload: hold(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      readGeneralBookingDraft(f.ctx, {
        conversationId: f.scope.conversationId,
        draftRef: ids.proposalId,
        payload: hold(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(f.counters().transactions).toBe(0)
    expect(f.writes).toEqual([])
  }))

test("request payload and trusted server allocation are snapshotted before fresh authority awaits", () =>
  environment(async () => {
    const f = await generalBookingFreshFixture()
    const request = { conversationId: f.scope.conversationId, payload: hold() }
    const allocation = { ...ids }
    const pending = createGeneralBookingDraft(f.ctx, request, allocation)
    request.conversationId = "caller-mutated"
    request.payload = generalBookingActionSchema.parse({
      ...hold(),
      quantity: 999,
    })
    allocation.proposalId = "caller-mutated"
    allocation.idempotencyKey = "caller-mutated"
    expect((await pending).draftRef).toBe(ids.proposalId)
    expect(f.row().idempotencyKey).toBe(ids.idempotencyKey)
    expect(f.row().payload).toMatchObject({ quantity: 1 })
    expect(f.row().conversationId).toBe(f.scope.conversationId)
  }))

test("persisted revoked or expired Session refuses before any saved proposal access", () =>
  environment(async () => {
    for (const change of ["revoked", "expired"]) {
      const f = await generalBookingFreshFixture()
      if (change === "revoked") f.state.sessionAvailable = false
      else f.session.session.expiresAt = new Date(0)
      await expect(
        createGeneralBookingDraft(
          f.ctx,
          { conversationId: f.scope.conversationId, payload: hold() },
          ids,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(f.rows).toEqual([])
      expect(f.reads).toEqual([])
      expect(f.counters()).toEqual({ transactions: 1, depth: 0 })
    }
  }))

test("fresh age/privacy/legal and current member/Store grants refuse stale optimistic context", () =>
  environment(async () => {
    for (const change of [
      "age",
      "privacy",
      "legal",
      "role",
      "store",
      "grant",
    ]) {
      const f = await generalBookingFreshFixture()
      if (change === "age") f.user.ageBand = "UNDECLARED"
      if (change === "privacy")
        f.user.accountPrivacyRequests.push({ status: "PROCESSING" })
      if (change === "legal") f.state.acceptedLegalHash = "wrong-current-hash"
      if (change === "role") f.member.role = "SUPPORT"
      if (change === "store") f.store.status = "INACTIVE"
      if (change === "grant") f.member.staffStoreAssignments.length = 0
      await expect(
        createGeneralBookingDraft(
          f.ctx,
          { conversationId: f.scope.conversationId, payload: hold() },
          ids,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.rows).toEqual([])
      expect(f.reads).toEqual([])
    }
  }))

test("exact opaque chat identity and saved server allocation replay without a second proposal", () =>
  environment(async () => {
    const f = await generalBookingFreshFixture()
    const conversationId = " 原始 chat /? "
    f.scope.conversationId = conversationId
    f.conversation.id = conversationId
    const request = { conversationId, payload: hold() }
    const first = await createGeneralBookingDraft(f.ctx, request, ids)
    expect(await createGeneralBookingDraft(f.ctx, request, ids)).toEqual(first)
    expect(f.rows).toHaveLength(1)
    expect(f.writes).toHaveLength(1)
    await expect(
      readGeneralBookingDraft(f.ctx, {
        conversationId: conversationId.trim(),
        draftRef: first.draftRef,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(f.canonical.writes).toEqual([])
  }))

test("fresh full-review drift and stale edits refuse without overwriting saved facts", () =>
  environment(async () => {
    const f = await generalBookingFreshFixture()
    const conversationId = f.scope.conversationId
    await createGeneralBookingDraft(
      f.ctx,
      { conversationId, payload: hold() },
      ids,
    )
    await editGeneralBookingDraft(f.ctx, {
      conversationId,
      draftRef: ids.proposalId,
      revision: 1,
      payload: { ...hold(), quantity: 2 },
    })
    await expect(
      editGeneralBookingDraft(f.ctx, {
        conversationId,
        draftRef: ids.proposalId,
        revision: 1,
        payload: { ...hold(), quantity: 3 },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    f.canonical.state.config.revision++
    await expect(
      readGeneralBookingDraft(f.ctx, {
        conversationId,
        draftRef: ids.proposalId,
      }),
    ).rejects.toThrow()
    expect(f.row().revision).toBe(2)
    expect(f.row().payload).toMatchObject({ quantity: 2 })
    expect(f.canonical.writes).toEqual([])
  }))

test("saved draft read/edit repeat actual fresh Session checks and propagate unexpected storage failures", () =>
  environment(async () => {
    const f = await generalBookingFreshFixture()
    const conversationId = f.scope.conversationId
    await createGeneralBookingDraft(
      f.ctx,
      { conversationId, payload: hold() },
      ids,
    )
    f.state.sessionAvailable = false
    await expect(
      readGeneralBookingDraft(f.ctx, {
        conversationId,
        draftRef: ids.proposalId,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      editGeneralBookingDraft(f.ctx, {
        conversationId,
        draftRef: ids.proposalId,
        revision: 1,
        payload: { ...hold(), quantity: 2 },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(f.row().revision).toBe(1)
    expect(f.row().payload).toMatchObject({ quantity: 1 })
    expect(f.writes).toHaveLength(1)
    f.state.sessionAvailable = true
    f.state.failure = Error("Inert storage failure")
    await expect(
      readGeneralBookingDraft(f.ctx, {
        conversationId,
        draftRef: ids.proposalId,
      }),
    ).rejects.toThrow("Inert storage failure")
    expect(f.counters()).toEqual({ transactions: 4, depth: 0 })
    expect(f.canonical.writes).toEqual([])
  }))
