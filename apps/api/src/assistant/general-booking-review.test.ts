import { afterAll, expect, spyOn, test } from "bun:test"
import type { Prisma } from "@ewatrade/db/types"
import type { GeneralTransactionContext } from "./general-actions"
import { generalBookingDraftApprovalToken } from "./general-booking-draft-contract"
import { createGeneralBookingDraft } from "./general-booking-drafts"
import {
  beginGeneralBookingReview as begin,
  completeGeneralBookingReview as complete,
  readGeneralBookingReviewPage as page,
} from "./general-booking-review"
import {
  bookingReviewProjectionFixture,
  bookingProjectionIds as ids,
  bookingProjectionKey as key,
  bookingProjectionNow as now,
  projectionHold,
} from "./general-booking-review-projection-fixture"
import {
  type BookingReviewTransportPage,
  assembleGeneralBookingReviewTransport,
} from "./general-booking-review-transport"
import type { GeneralContext } from "./general-context"
import * as proposals from "./general-proposals"
import { generalBookingFreshFixtureFrom } from "./test-helpers/general-booking-fresh"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No provider/network in inert fresh review composer tests"),
)
afterAll(() => network.mockRestore())
async function environment(run: () => Promise<void>) {
  const saved = {
    APP_ENV: process.env.APP_ENV,
    ASSISTANT_APPROVAL_SIGNING_KEY: process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
  }
  const clock = spyOn(Date, "now").mockReturnValue(now)
  process.env.APP_ENV = "production"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = key
  try {
    await run()
  } finally {
    clock.mockRestore()
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}
async function staged() {
  const f = await generalBookingFreshFixtureFrom(
    bookingReviewProjectionFixture(),
  )
  const request = {
    conversationId: f.scope.conversationId,
    draftRef: ids.proposalId,
    revision: 1,
  }
  await createGeneralBookingDraft(
    f.ctx,
    {
      conversationId: request.conversationId,
      payload: projectionHold(),
    },
    ids,
  )
  return { ...f, request }
}
type Fixture = Awaited<ReturnType<typeof staged>>
async function progress(f: Fixture) {
  const first = await begin(f.ctx, f.request)
  let checkpoint = first.checkpoint
  const pages: BookingReviewTransportPage[] = []
  for (const descriptor of first.manifest.pages) {
    const response = await page(f.ctx, {
      ...f.request,
      reviewRef: first.manifest.reviewRef,
      index: descriptor.index,
      checkpoint,
    })
    pages.push(response)
    checkpoint = response.checkpoint
  }
  return {
    first,
    pages,
    request: {
      ...f.request,
      reviewRef: first.manifest.reviewRef,
      finalCheckpoint: checkpoint,
      acknowledged: true as const,
    },
  }
}

test("actual fresh guard→single actual parent per request→complete app review releases only exact existing localV1", () =>
  environment(async () => {
    const f = await staged()
    const writes = f.writes.length
    const work = await progress(f)
    expect(JSON.stringify(work.first)).not.toContain("approvalToken")
    expect(JSON.stringify(work.pages)).not.toContain("approvalToken")
    expect(
      assembleGeneralBookingReviewTransport(work.first.manifest, work.pages)
        .action,
    ).toBe("service_booking_hold")
    const result = await complete(f.ctx, work.request)
    expect(result).toEqual({
      kind: "ready",
      draftRef: ids.proposalId,
      revision: 1,
      approvalToken: generalBookingDraftApprovalToken(f.row(), key),
      expiresAt: f.row().expiresAt.toISOString(),
    })
    expect(Object.keys(result).sort()).toEqual([
      "approvalToken",
      "draftRef",
      "expiresAt",
      "kind",
      "revision",
    ])
    expect(f.counters()).toEqual({ transactions: 4, depth: 0 })
    expect(f.locks).toEqual([
      "Membership",
      "Store",
      "Membership",
      "Store",
      "Membership",
      "Store",
      "Membership",
      "Store",
    ])
    // Exactly one saved proposal lookup per operation, including staging;
    // transport and approval release do not trigger a second saved/full read.
    expect(f.reads.filter((r) => r.method === "findFirst")).toHaveLength(4)
    expect(f.writes).toHaveLength(writes)
    expect(f.canonical.writes).toEqual([])
    expect(network).not.toHaveBeenCalled()
  }))

test("strict 8192 parsed snapshot rejects scope/time/effect/batch/getter input before opening transaction", () =>
  environment(async () => {
    const f = await staged()
    for (const extra of [
      { actorUserId: "foreign" },
      { storeId: "foreign" },
      { tenantId: "foreign" },
      { now: now },
      { approvalToken: "client" },
      { payload: projectionHold() },
      { batch: [] },
      { checkpoint: "client" },
    ])
      await expect(
        begin(f.ctx, { ...f.request, ...extra }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      begin(f.ctx, { ...f.request, draftRef: "x".repeat(9000) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    let calls = 0
    const hidden = { ...f.request }
    Object.defineProperty(hidden, "draftRef", {
      get() {
        calls++
        return ids.proposalId
      },
      enumerable: false,
    })
    await expect(begin(f.ctx, hidden)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    expect(calls).toBe(0)
    expect(f.counters().transactions).toBe(1)
  }))

test("snapshot exact draft/revision before first fresh await; stale revision is never silently current", () =>
  environment(async () => {
    const f = await staged()
    const raw = { ...f.request }
    const pending = begin(f.ctx, raw)
    raw.conversationId = "changed"
    raw.draftRef = "changed"
    raw.revision = 99
    const first = await pending
    expect(first.manifest.draft.ref).toBe(ids.proposalId)
    expect(first.manifest.draft.revision).toBe(1)
    const work = await progress(f)
    await expect(
      begin(f.ctx, { ...f.request, revision: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      page(f.ctx, {
        ...f.request,
        revision: 2,
        reviewRef: work.first.manifest.reviewRef,
        index: 0,
        checkpoint: work.first.checkpoint,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      complete(f.ctx, { ...work.request, revision: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }))

test("every Begin/Page/Complete repeats actual persisted Session/privacy/legal/role/Store/grant authority", () =>
  environment(async () => {
    for (const phase of ["begin", "page", "complete"]) {
      for (const change of [
        "session",
        "privacy",
        "legal",
        "role",
        "store",
        "grant",
        "actor",
      ]) {
        const f = await staged()
        const work = await progress(f)
        if (change === "session") f.state.sessionAvailable = false
        if (change === "privacy")
          f.user.accountPrivacyRequests.push({ status: "PROCESSING" })
        if (change === "legal")
          f.state.acceptedLegalHash = "wrong-current-legal"
        if (change === "role") f.member.role = "SUPPORT"
        if (change === "store") f.store.status = "INACTIVE"
        if (change === "grant") f.member.staffStoreAssignments.length = 0
        if (change === "actor") f.ctx.session.user.id = "foreign-actor"
        const workBefore = f.canonical.writes.length
        const request =
          phase === "begin"
            ? begin(f.ctx, f.request)
            : phase === "page"
              ? page(f.ctx, {
                  ...f.request,
                  reviewRef: work.first.manifest.reviewRef,
                  index: 0,
                  checkpoint: work.first.checkpoint,
                })
              : complete(f.ctx, work.request)
        await expect(request).rejects.toThrow()
        expect(f.canonical.writes).toHaveLength(workBefore)
        expect(f.row().status).toBe("PENDING")
      }
    }
  }))

test("current full source/config and signed private row drift retire prior pages/completion", () =>
  environment(async () => {
    for (const change of [
      "source",
      "configuration",
      "signature",
      "expiry",
      "revision",
    ]) {
      const f = await staged()
      const work = await progress(f)
      if (change === "source") f.canonical.state.source.revision++
      if (change === "configuration") f.canonical.state.config.revision++
      if (change === "signature") f.row().approvalTokenHash = "b".repeat(64)
      if (change === "expiry") f.row().expiresAt = new Date(0)
      if (change === "revision") f.row().revision++
      await expect(
        page(f.ctx, {
          ...f.request,
          reviewRef: work.first.manifest.reviewRef,
          index: 0,
          checkpoint: work.first.checkpoint,
        }),
      ).rejects.toThrow()
      await expect(complete(f.ctx, work.request)).rejects.toThrow()
      expect(f.row().status).toBe("PENDING")
      expect(f.canonical.writes).toEqual([])
    }
  }))

test("completion cannot substitute acknowledgement, incomplete progress or a foreign checkpoint", () =>
  environment(async () => {
    const f = await staged()
    const work = await progress(f)
    await expect(
      complete(f.ctx, { ...work.request, acknowledged: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      complete(f.ctx, {
        ...work.request,
        finalCheckpoint: work.first.checkpoint,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    const another = await begin(f.ctx, f.request)
    await expect(
      complete(f.ctx, {
        ...work.request,
        reviewRef: another.manifest.reviewRef,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(await complete(f.ctx, work.request)).toEqual(
      await complete(f.ctx, work.request),
    )
    expect(f.canonical.writes).toEqual([])
  }))

test("key changes during actual source read or after transaction success withhold even a built response", () =>
  environment(async () => {
    for (const phase of ["during", "after"]) {
      const f = await staged()
      const work = await progress(f)
      const rotated = `${key}_ROTATED`
      if (phase === "during")
        f.control.onConversation = async () => {
          process.env.ASSISTANT_APPROVAL_SIGNING_KEY = rotated
        }
      const db = new Proxy(f.ctx.db, {
        get(target, name) {
          const original = Reflect.get(target, name)
          if (name !== "$transaction" || phase !== "after") return original
          return async (
            operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options: unknown,
          ) => {
            const response = await Reflect.apply(original, target, [
              operation,
              options,
            ])
            process.env.ASSISTANT_APPROVAL_SIGNING_KEY = rotated
            return response
          }
        },
      })
      await expect(
        complete({ ...f.ctx, db }, work.request),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(f.canonical.writes).toEqual([])
      process.env.ASSISTANT_APPROVAL_SIGNING_KEY = key
    }
  }))

test("late expiry after fresh transaction success withholds prepared response without native effects", () =>
  environment(async () => {
    const f = await staged()
    const work = await progress(f)
    const expires = f.row().expiresAt.getTime()
    const lateClock = spyOn(Date, "now").mockReturnValue(now)
    const db = new Proxy(f.ctx.db, {
      get(target, name) {
        const original = Reflect.get(target, name)
        if (name !== "$transaction") return original
        return async (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: unknown,
        ) => {
          const result = await Reflect.apply(original, target, [
            operation,
            options,
          ])
          lateClock.mockReturnValue(expires)
          return result
        }
      },
    })
    try {
      await expect(
        complete({ ...f.ctx, db }, work.request),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(f.row().status).toBe("PENDING")
      expect(f.canonical.writes).toEqual([])
    } finally {
      lateClock.mockRestore()
    }
  }))

test("exact linked-chat callback guard is tested over actual fresh Session TX; NOT linked-principal authentication", () =>
  environment(async () => {
    const f = await staged()
    const work = await progress(f)
    const original = proposals.inFreshGeneralTransaction
    let pinned = f.request.conversationId
    async function callbackStandIn<T>(
      ctx: GeneralContext,
      operation: (current: GeneralTransactionContext) => Promise<T>,
    ): Promise<T> {
      return original(ctx, (current) =>
        operation({ ...current, assistantConversationId: pinned }),
      )
    }
    const guard = spyOn(
      proposals,
      "inFreshGeneralTransaction",
    ).mockImplementation(callbackStandIn)
    try {
      expect((await begin(f.ctx, f.request)).manifest.draft.ref).toBe(
        ids.proposalId,
      )
      const reads = f.reads.length
      pinned = "different-linked-chat"
      await expect(begin(f.ctx, f.request)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await expect(
        page(f.ctx, {
          ...f.request,
          reviewRef: work.first.manifest.reviewRef,
          index: 0,
          checkpoint: work.first.checkpoint,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(complete(f.ctx, work.request)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(f.reads).toHaveLength(reads)
      expect(f.counters()).toEqual({ transactions: 7, depth: 0 })
      expect(f.canonical.writes).toEqual([])
    } finally {
      guard.mockRestore()
    }
  }))

test("unexpected storage errors propagate unchanged, never become partial safe data", () =>
  environment(async () => {
    const f = await staged()
    const failure = Error("INERT unexpected storage failure")
    f.state.failure = failure
    await expect(begin(f.ctx, f.request)).rejects.toBe(failure)
    expect(f.canonical.writes).toEqual([])
  }))
