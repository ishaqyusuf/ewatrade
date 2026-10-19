import { afterAll, expect, spyOn, test } from "bun:test"
import { createCipheriv, createHmac, randomBytes } from "node:crypto"
import superjson from "superjson"
import { createGeneralBookingDraftInTransaction as create } from "./general-booking-draft-store"
import {
  type CompleteGeneralBookingAppReview,
  readGeneralBookingAppReviewInTransaction as read,
} from "./general-booking-review-projection"
import {
  bookingReviewProjectionFixture as fixture,
  bookingProjectionIds as ids,
  bookingProjectionKey as key,
  bookingProjectionNow as now,
  projectionAction,
  projectionWork,
} from "./general-booking-review-projection-fixture"
import {
  type BookingReviewTransportPage,
  assembleGeneralBookingReviewTransport as assemble,
  beginGeneralBookingReviewTransport as begin,
  completeGeneralBookingReviewTransport as complete,
  createGeneralBookingReviewTransportPacket as packet,
  readGeneralBookingReviewTransportPage as page,
} from "./general-booking-review-transport"
import {
  openBookingReviewCheckpoint as open,
  sealBookingReviewCheckpoint as seal,
} from "./general-booking-review-transport-checkpoint"
import {
  BookingReviewTransportError,
  bookingReviewDataSnapshot,
} from "./general-booking-review-transport-data"
import {
  bookingReviewEnvelopeBytes as bytes,
  bookingReviewEnvelopeFits as fits,
  BOOKING_REVIEW_ENVELOPE_RESERVE_BYTES as reserve,
  BOOKING_REVIEW_WIRE_MAX_BYTES as wireMax,
} from "./general-booking-review-transport-envelope"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No network/provider in pure booking transport tests"),
)
afterAll(() => network.mockRestore())
const actions = [
  "service_booking_hold",
  "service_booking_confirm",
  "service_booking_arrive",
  "service_booking_start",
  "service_booking_complete",
  "service_booking_cancel",
  "service_booking_no_show",
  "service_booking_reschedule",
] as const
async function source(
  action: (typeof actions)[number] = "service_booking_hold",
  large = false,
) {
  const clock = spyOn(Date, "now").mockReturnValue(now)
  try {
    const f = fixture()
    const payload = await projectionAction(f, action)
    if (large) projectionWork(f, 2001)
    await create(f.tx, { ...f.scope, payload }, ids, key)
    const result = await read(
      f.tx,
      { ...f.scope, draftRef: ids.proposalId },
      key,
    )
    if (result.kind !== "complete")
      throw Error("Actual complete source required")
    return { f, result, scope: { ...f.scope } }
  } finally {
    clock.mockRestore()
  }
}
function scopeOf(result: CompleteGeneralBookingAppReview) {
  const r = result.privateBinding.row
  return {
    actorUserId: r.actorUserId,
    tenantId: r.tenantId,
    storeId: r.storeId,
    conversationId: r.conversationId,
  }
}
function transport(result: CompleteGeneralBookingAppReview) {
  const handle = packet(result)
  const scope = scopeOf(result)
  const start = begin(handle, scope, key, now)
  let checkpoint = start.checkpoint
  const pages: BookingReviewTransportPage[] = []
  for (const d of start.manifest.pages) {
    const response = page(
      handle,
      { reviewRef: start.manifest.reviewRef, index: d.index, checkpoint },
      scope,
      key,
      now,
    )
    pages.push(response)
    checkpoint = response.checkpoint
  }
  return { handle, scope, start, pages, checkpoint }
}

test("all eight actual canonical draft→safe projection→complete transport preserve every safe fact", async () => {
  for (const action of actions) {
    const { f, result } = await source(action)
    const writes = f.canonical.writes.length
    const t = transport(result)
    expect(assemble(t.start.manifest, t.pages)).toEqual(result.review)
    expect(
      complete(
        t.handle,
        {
          reviewRef: t.start.manifest.reviewRef,
          finalCheckpoint: t.checkpoint,
          acknowledged: true,
        },
        t.scope,
        key,
        now,
      ),
    ).toEqual({
      reviewRef: t.start.manifest.reviewRef,
      draftRef: ids.proposalId,
      revision: 1,
    })
    const publicText = JSON.stringify({ ...t.start, pages: t.pages })
    for (const privateKey of [
      "actorUserId",
      "tenantId",
      "storeId",
      "canonicalTarget",
      "approvalTokenHash",
      "idempotencyKey",
      "payloadHash",
      "targetRevision",
      "privateBinding",
    ])
      expect(publicText).not.toContain(`"${privateKey}"`)
    expect(publicText).not.toContain(result.privateBinding.row.targetRevision)
    expect(JSON.stringify(t.handle)).toBe("{}")
    expect(f.canonical.writes).toHaveLength(writes)
    expect(network).not.toHaveBeenCalled()
  }
})

test("2001 actual work lines, changes and nested whole-Order obligations survive multi-page assembly", async () => {
  const { result } = await source("service_booking_complete", true)
  const t = transport(result)
  expect(t.pages.length).toBeGreaterThan(1)
  const document = assemble(t.start.manifest, t.pages)
  if (!("work" in document.details) || !document.details.work)
    throw Error("Expected complete work")
  expect(document.coverage.workLines).toBe(2001)
  expect(document.details.work.lines).toHaveLength(2001)
  expect(document.details.work.changes).toHaveLength(2001)
  expect(document.details.work.obligations?.[0]?.serviceJobLines).toHaveLength(
    2001,
  )
  expect(document.details.work.lines[2000]?.allocatedQuantity).toBe("0.000001")
  expect(document).toEqual(result.review)
  for (const response of [...t.pages, t.start])
    expect(bytes(response) + reserve).toBeLessThanOrEqual(wireMax)
  const changed = structuredClone(result)
  if (!("work" in changed.review.details) || !changed.review.details.work)
    throw Error("Expected full work")
  const last = changed.review.details.work.lines[2000]
  if (!last) throw Error("Expected final native line")
  last.allocatedQuantity = "0.000002"
  expect(() =>
    page(
      packet(changed),
      {
        reviewRef: t.start.manifest.reviewRef,
        index: 0,
        checkpoint: t.start.checkpoint,
      },
      t.scope,
      key,
      now,
    ),
  ).toThrow()
})

test("actual maximum opaque draft and conversation identities survive scalar checkpoint wire headroom", async () => {
  const clock = spyOn(Date, "now").mockReturnValue(now)
  try {
    const f = fixture()
    f.scope.conversationId = "\u0001".repeat(128)
    f.conversation.id = f.scope.conversationId
    const actualIds = {
      proposalId: "原".repeat(191),
      idempotencyKey: "工".repeat(191),
    }
    const payload = await projectionAction(f, "service_booking_hold")
    await create(f.tx, { ...f.scope, payload }, actualIds, key)
    const result = await read(
      f.tx,
      { ...f.scope, draftRef: actualIds.proposalId },
      key,
    )
    if (result.kind !== "complete") throw Error("Expected supported full IDs")
    const t = transport(result)
    expect(assemble(t.start.manifest, t.pages).draft).toEqual(
      result.review.draft,
    )
    const scalarRequest = {
      json: {
        conversationId: f.scope.conversationId,
        draftRef: actualIds.proposalId,
        revision: 1,
        reviewRef: t.start.manifest.reviewRef,
        finalCheckpoint: "A".repeat(2048),
        acknowledged: true,
      },
    }
    expect(
      Buffer.byteLength(JSON.stringify(scalarRequest), "utf8"),
    ).toBeLessThan(8192)
  } finally {
    clock.mockRestore()
  }
})

test("cross-request fresh reconstruction accepts ONLY named observation changes and stable key ordering", async () => {
  const { result } = await source()
  const first = packet(result)
  const scope = scopeOf(result)
  const initial = begin(first, scope, key, now)
  const fresh = structuredClone(result)
  fresh.observations.asOf = new Date(now + 1).toISOString()
  fresh.observations.observedHoldExpiresAt = new Date(now + 4000).toISOString()
  fresh.review.source = {
    status: fresh.review.source.status,
    revision: fresh.review.source.revision,
    id: fresh.review.source.id,
  }
  const rebuilt = packet(fresh)
  const response = page(
    rebuilt,
    {
      reviewRef: initial.manifest.reviewRef,
      index: 0,
      checkpoint: initial.checkpoint,
    },
    scope,
    key,
    now + 1,
  )
  expect(response.documentHash).toBe(initial.manifest.documentHash)
  expect(response.observations).toEqual(fresh.observations)
  expect(assemble(initial.manifest, [response])).toEqual(result.review)
  const changed = structuredClone(fresh)
  if (changed.review.details.kind !== "hold") throw Error("Expected hold")
  changed.review.details.slot.configuration.updatedAt = new Date(
    now + 2,
  ).toISOString()
  expect(() =>
    page(
      packet(changed),
      {
        reviewRef: initial.manifest.reviewRef,
        index: 0,
        checkpoint: initial.checkpoint,
      },
      scope,
      key,
      now + 2,
    ),
  ).toThrow(BookingReviewTransportError)
})

test("exact-step retry and repeated completion are idempotent; skip, backward token and splicing refuse", async () => {
  const { result } = await source("service_booking_complete", true)
  const t = transport(result)
  const ref = t.start.manifest.reviewRef
  const raw = { reviewRef: ref, index: 0, checkpoint: t.start.checkpoint }
  expect(page(packet(result), raw, t.scope, key, now).fragment).toBe(
    t.pages[0]?.fragment,
  )
  expect(() =>
    page(t.handle, { ...raw, index: 1 }, t.scope, key, now),
  ).toThrow()
  expect(() =>
    page(t.handle, { ...raw, checkpoint: t.checkpoint }, t.scope, key, now),
  ).toThrow()
  const other = begin(t.handle, t.scope, key, now)
  expect(() =>
    page(
      t.handle,
      { ...raw, reviewRef: other.manifest.reviewRef },
      t.scope,
      key,
      now,
    ),
  ).toThrow()
  expect(() =>
    complete(
      t.handle,
      {
        reviewRef: ref,
        finalCheckpoint: t.start.checkpoint,
        acknowledged: true,
      },
      t.scope,
      key,
      now,
    ),
  ).toThrow()
  const input = {
    reviewRef: ref,
    finalCheckpoint: t.checkpoint,
    acknowledged: true as const,
  }
  expect(complete(t.handle, input, t.scope, key, now)).toEqual(
    complete(packet(result), input, t.scope, key, now),
  )
  expect(() => assemble(t.start.manifest, [...t.pages].reverse())).toThrow()
  expect(() => assemble(t.start.manifest, t.pages.slice(1))).toThrow()
})

test("private parent/row/source/version bindings and every exact current server scope are fenced", async () => {
  const { result } = await source()
  const t = transport(result)
  const request = {
    reviewRef: t.start.manifest.reviewRef,
    index: 0,
    checkpoint: t.start.checkpoint,
  }
  for (const field of [
    "actorUserId",
    "tenantId",
    "storeId",
    "conversationId",
  ] as const)
    expect(() =>
      page(t.handle, request, { ...t.scope, [field]: "foreign" }, key, now),
    ).toThrow()
  for (const change of [
    "target",
    "payload",
    "role",
    "updatedAt",
    "command",
    "signature",
  ] as const) {
    const changed = structuredClone(result)
    const row = changed.privateBinding.row
    if (change === "target") {
      row.targetRevision = "b".repeat(64)
      changed.privateBinding.canonicalTarget.revision = row.targetRevision
    }
    if (change === "payload") row.payloadHash = "b".repeat(64)
    if (change === "role") row.roleSnapshot = "CASHIER"
    if (change === "updatedAt") row.updatedAt = new Date(now + 1).toISOString()
    if (change === "command") row.idempotencyKey = "other-command"
    if (change === "signature") row.approvalTokenHash = "b".repeat(64)
    expect(() => page(packet(changed), request, t.scope, key, now)).toThrow()
  }
  expect(() =>
    page(t.handle, request, t.scope, `${key}_ROTATED`, now),
  ).toThrow()
  expect(() =>
    page(
      t.handle,
      request,
      t.scope,
      key,
      Date.parse(result.review.draft.expiresAt),
    ),
  ).toThrow()
})

test("constructor and scalar progress snapshot data before access; getters/proxies/serializers/cycles never run", async () => {
  const { result } = await source()
  let calls = 0
  const hidden = structuredClone(result)
  Object.defineProperty(hidden.review.draft, "ref", {
    get() {
      calls++
      return "foreign"
    },
    enumerable: false,
  })
  expect(() => packet(hidden)).toThrow()
  const proxy = new Proxy(result, {
    get() {
      calls++
      throw Error("Must not execute")
    },
  })
  expect(() => packet(proxy)).toThrow()
  const serializer = {
    ...result,
    toJSON() {
      calls++
      return result
    },
  }
  expect(() => packet(serializer)).toThrow()
  const cycle = structuredClone(result)
  Object.defineProperty(cycle, "cycle", { value: cycle, enumerable: true })
  expect(() => packet(cycle)).toThrow()
  const t = transport(result)
  const raw = {
    reviewRef: t.start.manifest.reviewRef,
    index: 0,
    checkpoint: t.start.checkpoint,
  }
  Object.defineProperty(raw, "index", {
    get() {
      calls++
      return 0
    },
    enumerable: false,
  })
  expect(() => page(t.handle, raw, t.scope, key, now)).toThrow()
  const maliciousPages = [...t.pages]
  Object.defineProperty(maliciousPages, "0", {
    get() {
      calls++
      return t.pages[0]
    },
    enumerable: true,
  })
  expect(() => assemble(t.start.manifest, maliciousPages)).toThrow()
  expect(calls).toBe(0)
})

test("input snapshots survive caller mutation; no arbitrary transport/private fields or inconsistent complete counts", async () => {
  const { result } = await source()
  const original = structuredClone(result.review)
  const p = packet(result)
  result.review.source.id = "caller-mutated"
  result.privateBinding.row.targetRevision = "c".repeat(64)
  const scope = scopeOf(result)
  const initial = begin(p, scope, key, now)
  const response = page(
    p,
    {
      reviewRef: initial.manifest.reviewRef,
      index: 0,
      checkpoint: initial.checkpoint,
    },
    scope,
    key,
    now,
  )
  expect(assemble(initial.manifest, [response])).toEqual(original)
  const bad = structuredClone(result)
  bad.review.coverage.workLines++
  expect(() => packet(bad)).toThrow()
  const extra = { ...result, approvalToken: "must-not-enter" }
  expect(() => packet(extra)).toThrow()
  const smuggled = {
    reviewRef: initial.manifest.reviewRef,
    finalCheckpoint: response.checkpoint,
    acknowledged: true as const,
    actorUserId: "smuggled",
  }
  expect(() => complete(p, smuggled, scope, key, now)).toThrow()
})

test("full 64 MiB logical resource refusal happens before giant escaped JSON allocation, never clips", async () => {
  const { result } = await source()
  if (result.review.details.kind !== "hold") throw Error("Expected hold")
  result.review.details.slot.resource.name = "\u0001".repeat(12 * 1024 * 1024)
  expect(() => packet(result)).toThrow(BookingReviewTransportError)
  expect(() =>
    bookingReviewDataSnapshot({ text: "a".repeat(100) }, 20),
  ).toThrow()
})

test("actual single/batch SuperJSON encoded bytes include 2048 token reserve and exact cap±1", () => {
  const base = { text: "", checkpoint: "A".repeat(2048) }
  const overhead = bytes(base)
  const exact = { ...base, text: "x".repeat(wireMax - reserve - overhead) }
  expect(bytes(exact) + reserve).toBe(wireMax)
  expect(fits(exact)).toBe(true)
  expect(fits({ ...exact, text: `${exact.text}x` })).toBe(false)
  expect(fits({ ...exact, text: exact.text.slice(1) })).toBe(true)
  const values = ['💚é漢字\u0000\n\\"\ud800', base, exact]
  for (const value of values) {
    const single = JSON.stringify({
      result: { data: superjson.serialize(value) },
    })
    const batch = JSON.stringify([
      { result: { data: superjson.serialize(value) } },
    ])
    expect(bytes(value)).toBe(Buffer.byteLength(batch, "utf8"))
    expect(bytes(value)).toBe(Buffer.byteLength(single, "utf8") + 2)
  }
})

test("astral/control/escaped and lone-surrogate text splits without corrupting complete safe document", async () => {
  const { result } = await source()
  if (result.review.details.kind !== "hold") throw Error("Expected hold")
  result.review.details.slot.resource.name = '💚漢字\u0001\n\\"\ud800'.repeat(
    30_000,
  )
  const t = transport(result)
  expect(t.pages.length).toBeGreaterThan(1)
  expect(assemble(t.start.manifest, t.pages)).toEqual(result.review)
  for (const p of t.pages) {
    const last = p.fragment.charCodeAt(p.fragment.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    expect(bytes(p) + reserve).toBeLessThanOrEqual(wireMax)
  }
})

test("default server clock rechecks expiry after manifest/page/completion work", async () => {
  const { result } = await source()
  const t = transport(result)
  const expiresAt = Date.parse(result.review.draft.expiresAt)
  for (const operation of ["begin", "page", "complete"]) {
    const clock = spyOn(Date, "now")
      .mockReturnValue(expiresAt)
      .mockReturnValueOnce(now)
    try {
      expect(() => {
        if (operation === "begin") return begin(t.handle, t.scope, key)
        if (operation === "page")
          return page(
            t.handle,
            {
              reviewRef: t.start.manifest.reviewRef,
              index: 0,
              checkpoint: t.start.checkpoint,
            },
            t.scope,
            key,
          )
        return complete(
          t.handle,
          {
            reviewRef: t.start.manifest.reviewRef,
            finalCheckpoint: t.checkpoint,
            acknowledged: true,
          },
          t.scope,
          key,
        )
      }).toThrow(BookingReviewTransportError)
    } finally {
      clock.mockRestore()
    }
  }
})

test("bounded bkr1 AES-GCM rejects tampering, malformed encodings, wrong domain/version/key and expired progress", () => {
  const state = {
    v: 1 as const,
    reviewRef: "A".repeat(43),
    binding: "a".repeat(64),
    nextIndex: 0,
    pageCount: 2,
    expiresAt: now + 1000,
  }
  const token = seal(state, key, now)
  expect(token.length).toBeLessThanOrEqual(2048)
  expect(open(token, key, now)).toEqual(state)
  expect(seal(state, key, now)).not.toBe(token)
  const encryptionKey = createHmac("sha256", key)
    .update("ewatrade:assistant:booking-review-checkpoint:key:v1")
    .digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
  cipher.setAAD(Buffer.from("ewatrade:unrelated-domain:v1"))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ])
  const wrongDomain = [
    "bkr1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
  const tagParts = token.split(".")
  const originalTag = tagParts[2]
  if (!originalTag) throw Error("Expected tag")
  tagParts[2] = `${originalTag[0] === "A" ? "B" : "A"}${originalTag.slice(1)}`
  for (const bad of [
    `${token}.extra`,
    token.replace("bkr1", "bkr2"),
    `${token}=`,
    "x".repeat(2049),
    token.replace(/^bkr1\.[^.]+/, "bkr1.AA"),
    token.replace(/\.[^.]+\./, ".AA."),
    tagParts.join("."),
    wrongDomain,
  ])
    expect(() => open(bad, key, now)).toThrow(BookingReviewTransportError)
  expect(() => open(token, `${key}rotated`, now)).toThrow()
  expect(() => open(token, key, now + 1000)).toThrow()
  expect(() => seal({ ...state, nextIndex: 3 }, key, now)).toThrow()
  expect(() => seal(state, "short", now)).toThrow()
})
