import { expect, test } from "bun:test"
import {
  quoteIssueIntent,
  quoteIssueOptionIntent,
} from "@ewatrade/assistant/general/quote-issue-intent"
import {
  type GeneralQuoteIssueDraft,
  GeneralQuoteIssueDraftEditError,
  applyGeneralQuoteIssueDraftEdit,
  parseGeneralQuoteIssueDraftEditRequest,
  readAndApplyGeneralQuoteIssueDraftEdit,
} from "./general-quote-issue-draft-edit"
import { generalQuoteIssueNativeInput } from "./general-quote-issue-intent"
import {
  QUOTE_WIRE_MAX_BYTES,
  QuoteWireBodyError,
} from "./general-quote-issue-wire-body"

function option(index = 0, inquiry = false) {
  return quoteIssueOptionIntent.parse({
    label: `Choice ${index}`,
    availabilityOutcome: "partial",
    fulfilmentType: "delivery",
    customerNote: `Option ${index} ${"中".repeat(480)}`,
    fulfilmentPromise: "Ready after confirmation",
    discountMinor: 10,
    taxMinor: 20,
    fulfilmentFeeMinor: 30,
    lines: Array.from({ length: 100 }, (_, lineIndex) => ({
      sourceLineId: `source-line-${lineIndex}`,
      offeringId: `offering-${lineIndex}`,
      ...(inquiry
        ? { availabilityAttestationId: `attestation-${lineIndex}` }
        : {}),
      outcome: ["included", "alternative", "declined", "unavailable"][
        lineIndex % 4
      ],
      quantity: "0001.2500000",
      unitPriceMinor: 100,
      customerNote: `Saved line ${lineIndex} ${"\u0001".repeat(470)}`,
    })),
  })
}

function current(inquiry = false): GeneralQuoteIssueDraft {
  return {
    draftRef: "server-draft-1",
    revision: 1,
    intent: quoteIssueIntent.parse({
      source: {
        kind: inquiry ? "commerce_inquiry" : "service_request",
        id: "saved-source",
      },
      operation: {
        kind: "revise",
        quoteId: "saved-quote",
        quoteVersionId: "saved-version",
      },
      expiresAt: "2027-01-02T10:00:00.123+01:00",
      options: [option(0, inquiry)],
    }),
  }
}

function request(draft: GeneralQuoteIssueDraft, edit: unknown) {
  return { draftRef: draft.draftRef, expectedRevision: draft.revision, edit }
}

function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
}

function refuses(
  draft: GeneralQuoteIssueDraft,
  raw: unknown,
  reason: GeneralQuoteIssueDraftEditError["reason"],
) {
  const before = structuredClone(draft)
  try {
    applyGeneralQuoteIssueDraftEdit(draft, raw)
    throw Error("Expected edit refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(GeneralQuoteIssueDraftEditError)
    expect(error).toMatchObject({ reason })
  }
  expect(draft).toEqual(before)
}

test("full20by100 inquiry draft composes append/edit/remove/move without losing business fields or mutating saved revisions", () => {
  let draft = current(true)
  for (let index = 1; index < 20; index++) {
    freeze(draft)
    const before = structuredClone(draft)
    draft = applyGeneralQuoteIssueDraftEdit(
      draft,
      request(draft, {
        kind: "set_option",
        index,
        option: option(index, true),
      }),
    )
    expect(before.revision).toBe(index)
    expect(draft.revision).toBe(index + 1)
  }
  const complete = quoteIssueIntent.parse(draft.intent)
  expect(complete.options).toHaveLength(20)
  expect(complete.options.map((entry) => entry.lines.length)).toEqual(
    Array(20).fill(100),
  )
  expect(complete.options).toEqual(
    Array.from({ length: 20 }, (_, index) => option(index, true)),
  )
  const replacement = {
    ...option(7, true),
    label: "Edited choice",
    fulfilmentType: "pickup",
  }
  const beforeEdit = structuredClone(draft)
  freeze(draft)
  draft = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, { kind: "set_option", index: 7, option: replacement }),
  )
  expect(draft.intent).toEqual({
    ...complete,
    options: complete.options.map((entry, index) =>
      index === 7 ? replacement : entry,
    ),
  })
  expect(beforeEdit.intent).toEqual(complete)
  const removed = complete.options[3]
  if (!removed) throw Error("Expected fourth choice")
  draft = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, { kind: "remove_option", index: 3 }),
  )
  expect(quoteIssueIntent.parse(draft.intent).options).toHaveLength(19)
  draft = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, { kind: "set_option", index: 19, option: removed }),
  )
  const beforeMove = quoteIssueIntent.parse(draft.intent)
  draft = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, { kind: "move_option", fromIndex: 19, toIndex: 0 }),
  )
  const afterMove = quoteIssueIntent.parse(draft.intent)
  expect(afterMove.options).toEqual([
    removed,
    ...beforeMove.options.slice(0, 19),
  ])
  expect(afterMove.source).toEqual(complete.source)
  expect(afterMove.operation).toEqual(complete.operation)
  expect(afterMove.expiresAt).toBe(complete.expiresAt)
  expect(draft.revision).toBe(24)
  const native = generalQuoteIssueNativeInput(
    afterMove,
    { actorUserId: "actor", tenantId: "tenant", storeId: "store" },
    {
      clientOperationId: "same-server-command",
      existingClientQuoteId: "saved-native-quote",
    },
  )
  expect(native.options).toHaveLength(20)
  expect(
    native.options?.map(
      ({ clientOptionId: _serverId, ...business }) => business,
    ),
  ).toEqual(afterMove.options)
  expect(native.sourceType).toBe("commerce_inquiry")
  expect(native.operation).toEqual(afterMove.operation)
})

test("pure Service edits remain compatible with actual server native construction and retain the existing server command key", () => {
  const draft = current()
  const scope = { actorUserId: "actor", tenantId: "tenant", storeId: "store" }
  const command = {
    clientOperationId: "server-command",
    existingClientQuoteId: "native-original",
  }
  const first = generalQuoteIssueNativeInput(draft.intent, scope, command)
  const result = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, {
      kind: "set_option",
      index: 0,
      option: {
        ...option(),
        customerNote: "Edited note",
        fulfilmentType: "unspecified",
      },
    }),
  )
  const native = generalQuoteIssueNativeInput(result.intent, scope, command)
  expect(native.clientQuoteId).toBe(first.clientQuoteId)
  expect(native.clientVersionId).toBe(first.clientVersionId)
  expect(native.options?.[0]?.clientOptionId).toBe(
    first.options?.[0]?.clientOptionId,
  )
  expect(native.options?.[0]?.lines).toEqual(first.options?.[0]?.lines)
  expect(native.options?.[0]?.customerNote).toBe("Edited note")
  expect(native.options?.[0]?.fulfilmentType).toBe("unspecified")
  expect(native.sourceId).toBe(first.sourceId)
  expect(native.operation).toEqual(first.operation)
})

test("exact draft ID and expected revision refuse foreign or stale edits without changing trusted state", () => {
  const draft = current()
  freeze(draft)
  const edit = { kind: "remove_option", index: 0 }
  refuses(
    draft,
    { ...request(draft, edit), draftRef: "another-server-draft" },
    "stale_draft",
  )
  refuses({ ...draft, revision: 2 }, request(draft, edit), "stale_draft")
  for (const bad of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2_147_483_648,
  ])
    refuses(
      draft,
      { ...request(draft, edit), expectedRevision: bad },
      "invalid_edit",
    )
  for (const bad of ["", " server-draft-1", "server-draft-1 ", "x".repeat(192)])
    refuses(draft, { ...request(draft, edit), draftRef: bad }, "invalid_edit")
})

test("strict patch accepts no scope, source, operation, native identity or proof fields at any level", () => {
  const draft = current()
  const edit = { kind: "set_option", index: 0, option: option() }
  for (const key of [
    "actorUserId",
    "tenantId",
    "storeId",
    "source",
    "operation",
    "clientOperationId",
    "clientQuoteId",
    "clientVersionId",
    "approvalToken",
    "screenedTexts",
  ])
    refuses(draft, { ...request(draft, edit), [key]: "forged" }, "invalid_edit")
  for (const key of [
    "source",
    "operation",
    "clientOptionId",
    "totalMinor",
    "currencyCode",
    "approvalToken",
  ])
    refuses(draft, request(draft, { ...edit, [key]: "forged" }), "invalid_edit")
  for (const key of [
    "clientOptionId",
    "totalMinor",
    "subtotalMinor",
    "currencyCode",
  ])
    refuses(
      draft,
      request(draft, { ...edit, option: { ...edit.option, [key]: "forged" } }),
      "invalid_edit",
    )
  const line = edit.option.lines[0]
  if (!line) throw Error("Expected priced line")
  for (const key of [
    "catalogSourceVerified",
    "balanceRevision",
    "configurationVersionId",
    "availabilityAttestationType",
    "optionSelections",
    "screenedTexts",
    "token",
  ])
    refuses(
      draft,
      request(draft, {
        ...edit,
        option: { ...edit.option, lines: [{ ...line, [key]: "forged" }] },
      }),
      "invalid_edit",
    )
})

test("source-specific complete validation rejects Service attestations and Inquiry lines without original IDs", () => {
  const service = current()
  refuses(
    service,
    request(service, { kind: "set_option", index: 0, option: option(0, true) }),
    "invalid_edit",
  )
  const inquiry = current(true)
  const missingSource = quoteIssueOptionIntent.parse({
    label: "Unavailable",
    availabilityOutcome: "unavailable",
    lines: [{ outcome: "unavailable" }],
  })
  refuses(
    inquiry,
    request(inquiry, { kind: "set_option", index: 0, option: missingSource }),
    "invalid_edit",
  )
  expect(
    applyGeneralQuoteIssueDraftEdit(
      service,
      request(service, { kind: "set_option", index: 0, option: missingSource }),
    ).intent.options[0],
  ).toEqual(missingSource)
})

test("index operations never create gaps, empty final drafts, more than20options or101lines", () => {
  const draft = current()
  for (const index of [-1, 1.5, 2, 19, 20])
    refuses(
      draft,
      request(draft, { kind: "set_option", index, option: option() }),
      "invalid_edit",
    )
  for (const index of [0, 1, 19])
    refuses(
      draft,
      request(draft, { kind: "remove_option", index }),
      "invalid_edit",
    )
  for (const [fromIndex, toIndex] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, 20],
  ])
    refuses(
      draft,
      request(draft, { kind: "move_option", fromIndex, toIndex }),
      "invalid_edit",
    )
  const full = {
    ...draft,
    intent: {
      ...quoteIssueIntent.parse(draft.intent),
      options: Array.from({ length: 20 }, (_, index) => option(index)),
    },
  }
  refuses(
    full,
    request(full, { kind: "set_option", index: 20, option: option() }),
    "invalid_edit",
  )
  const complete = option()
  refuses(
    draft,
    request(draft, {
      kind: "set_option",
      index: 0,
      option: { ...complete, lines: [...complete.lines, complete.lines[0]] },
    }),
    "invalid_edit",
  )
  refuses(
    draft,
    request(draft, {
      kind: "set_option",
      index: 0,
      option: { ...complete, lines: [] },
    }),
    "invalid_edit",
  )
  const samePosition = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, { kind: "move_option", fromIndex: 0, toIndex: 0 }),
  )
  expect(samePosition.intent).toEqual(quoteIssueIntent.parse(draft.intent))
  expect(samePosition.revision).toBe(2)
})

test("expiry supports exact UTC/offset milliseconds, removes only expiry on null and rejects unsupported precision or calendars", () => {
  const draft = current()
  for (const expiresAt of [
    "2027-01-02T10:00:00Z",
    "2027-01-02T11:00:00.123+01:00",
    "2028-02-29T10:00:00.1Z",
  ]) {
    const edited = applyGeneralQuoteIssueDraftEdit(
      draft,
      request(draft, { kind: "set_expiry", expiresAt }),
    )
    expect(edited.intent.expiresAt).toBe(expiresAt)
    expect(edited.intent.options).toEqual(
      quoteIssueIntent.parse(draft.intent).options,
    )
  }
  const removed = applyGeneralQuoteIssueDraftEdit(
    draft,
    request(draft, { kind: "set_expiry", expiresAt: null }),
  )
  expect(Object.hasOwn(removed.intent, "expiresAt")).toBe(false)
  for (const expiresAt of [
    "2027-02-29T10:00:00Z",
    "2027-01-02T10:00:00.1234Z",
    "2027-01-02T10:00:00",
    "not-a-date",
    undefined,
  ])
    refuses(
      draft,
      request(draft, { kind: "set_expiry", expiresAt }),
      "invalid_edit",
    )
})

test("revision increments exactly once up to storage capacity, then refuses without overflow", () => {
  const draft = { ...current(), revision: 2_147_483_646 }
  const edit = { kind: "move_option", fromIndex: 0, toIndex: 0 }
  const final = applyGeneralQuoteIssueDraftEdit(draft, request(draft, edit))
  expect(final.revision).toBe(2_147_483_647)
  refuses(final, request(final, edit), "revision_exhausted")
  refuses({ ...draft, revision: 0 }, request(draft, edit), "invalid_current")
  refuses(
    { ...draft, intent: { forged: true } },
    request(draft, edit),
    "invalid_current",
  )
})

test("raw single POST envelopes admit exact1MiB and reject +1byte before normalization for UTF8 and JSON escaping", () => {
  const draft = current()
  for (const padding of [" ", "\u3000", "\n"]) {
    const rawOption = {
      label: "Quote",
      availabilityOutcome: "unavailable",
      lines: [{ outcome: "unavailable" }],
    }
    const raw = request(draft, {
      kind: "set_option",
      index: 0,
      option: rawOption,
    })
    const remaining =
      QUOTE_WIRE_MAX_BYTES -
      Buffer.byteLength(JSON.stringify({ json: raw }), "utf8")
    const unitBytes = Buffer.byteLength(JSON.stringify(padding), "utf8") - 2
    rawOption.label = `${padding.repeat(Math.floor(remaining / unitBytes))}${" ".repeat(remaining % unitBytes)}Quote`
    expect(Buffer.byteLength(JSON.stringify({ json: raw }), "utf8")).toBe(
      QUOTE_WIRE_MAX_BYTES,
    )
    expect(parseGeneralQuoteIssueDraftEditRequest(raw).edit).toMatchObject({
      option: { label: "Quote" },
    })
    expect(
      applyGeneralQuoteIssueDraftEdit(draft, raw).intent.options[0]?.label,
    ).toBe("Quote")
    rawOption.label += " "
    expect(Buffer.byteLength(JSON.stringify({ json: raw }), "utf8")).toBe(
      QUOTE_WIRE_MAX_BYTES + 1,
    )
    refuses(draft, raw, "request_too_large")
  }
})

test("oversized raw exact quantities cannot hide behind canonical normalization", () => {
  const draft = current()
  const raw = request(draft, {
    kind: "set_option",
    index: 0,
    option: {
      label: "Free",
      availabilityOutcome: "full",
      lines: [
        {
          outcome: "included",
          offeringId: "offering",
          quantity: `${"0".repeat(QUOTE_WIRE_MAX_BYTES)}1`,
          unitPriceMinor: 0,
        },
      ],
    },
  })
  refuses(draft, raw, "request_too_large")
})

test("unsupported callbacks, getters, custom serialization, cycles and proxies refuse without executing code", () => {
  const draft = current()
  let calls = 0
  function callback(): never {
    calls++
    throw Error("Must not execute")
  }
  const raw = request(draft, { kind: "set_expiry", expiresAt: null })
  const getter = Object.defineProperty({ ...raw }, "unexpected", {
    enumerable: true,
    get: callback,
  })
  const hiddenKnownGetter = Object.defineProperty(
    { expectedRevision: 1, edit: raw.edit },
    "draftRef",
    { get: callback },
  )
  const hiddenOptionGetter = request(draft, {
    kind: "set_option",
    index: 0,
    option: Object.defineProperty(
      {
        availabilityOutcome: "unavailable",
        lines: [{ outcome: "unavailable" }],
      },
      "label",
      { get: callback },
    ),
  })
  const proxy = new Proxy(raw, {
    get: callback,
    ownKeys: callback,
    getPrototypeOf: callback,
  })
  const cyclic: { self?: unknown } = {}
  cyclic.self = cyclic
  for (const bad of [
    getter,
    hiddenKnownGetter,
    hiddenOptionGetter,
    proxy,
    { ...raw, authorize: callback },
    { ...raw, toJSON: callback },
    { ...raw, token: BigInt(1) },
    cyclic,
  ])
    refuses(draft, bad, "unsupported_request")
  expect(calls).toBe(0)
})

function httpBody(body: string | Uint8Array, headers?: Record<string, string>) {
  return new Request("https://fixture.invalid/quote-draft", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : new Uint8Array(body).buffer,
  })
}

async function refusesHTTP(
  draft: GeneralQuoteIssueDraft,
  body: Request,
  reason: string,
  bodyFailure = false,
) {
  const before = structuredClone(draft)
  try {
    await readAndApplyGeneralQuoteIssueDraftEdit(body, draft)
    throw Error("Expected body/edit refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(
      bodyFailure ? QuoteWireBodyError : GeneralQuoteIssueDraftEditError,
    )
    expect(error).toMatchObject({ reason })
  }
  expect(draft).toEqual(before)
}

test("actual Request admission composes a complete100line patch into a full20by100 saved draft", async () => {
  const draft = {
    ...current(true),
    intent: {
      ...quoteIssueIntent.parse(current(true).intent),
      options: Array.from({ length: 20 }, (_, index) => option(index, true)),
    },
  }
  freeze(draft)
  const before = structuredClone(draft)
  const replacement = {
    ...option(5, true),
    customerNote: "Updated from one admitted POST",
  }
  const raw = request(draft, {
    kind: "set_option",
    index: 5,
    option: replacement,
  })
  const body = JSON.stringify({ json: raw })
  expect(Buffer.byteLength(body)).toBeLessThan(QUOTE_WIRE_MAX_BYTES)
  const updated = await readAndApplyGeneralQuoteIssueDraftEdit(
    httpBody(body),
    draft,
  )
  expect(updated.revision).toBe(2)
  expect(updated.intent.options).toHaveLength(20)
  expect(updated.intent.options.map((entry) => entry.lines.length)).toEqual(
    Array(20).fill(100),
  )
  expect(updated.intent.options).toEqual(
    draft.intent.options.map((entry, index) =>
      index === 5 ? replacement : entry,
    ),
  )
  expect(draft).toEqual(before)
})

test("actual raw-byte admission refuses whitespace/normalized padding and low forged Content-Length before patch parsing", async () => {
  const draft = current()
  freeze(draft)
  const raw = request(draft, { kind: "set_expiry", expiresAt: null })
  await refusesHTTP(
    draft,
    httpBody(
      `${" ".repeat(QUOTE_WIRE_MAX_BYTES)}${JSON.stringify({ json: raw })}`,
    ),
    "body_byte_limit",
    true,
  )
  const oversizedNormalized = request(draft, {
    kind: "set_option",
    index: 0,
    option: {
      label: `${" ".repeat(QUOTE_WIRE_MAX_BYTES)}Normal after trimming`,
      availabilityOutcome: "unavailable",
      lines: [{ outcome: "unavailable" }],
    },
  })
  await refusesHTTP(
    draft,
    httpBody(JSON.stringify({ json: oversizedNormalized }), {
      "content-length": "0",
    }),
    "body_byte_limit",
    true,
  )
})

test("streaming admission keeps the original trusted draft snapshot across asynchronous caller mutation", async () => {
  const initial = current()
  const draft = { ...initial, intent: quoteIssueIntent.parse(initial.intent) }
  const original = structuredClone(draft)
  const raw = request(draft, { kind: "set_expiry", expiresAt: null })
  let deliver: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      deliver = () => {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({ json: raw })),
        )
        controller.close()
      }
    },
  })
  const pending = readAndApplyGeneralQuoteIssueDraftEdit(
    new Request("https://fixture.invalid/quote-draft", {
      method: "POST",
      body: stream,
    }),
    draft,
  )
  draft.draftRef = "changed-draft"
  draft.revision = 99
  draft.intent.source.id = "changed-source"
  if (draft.intent.operation.kind !== "revise")
    throw Error("Expected saved revision")
  draft.intent.operation.quoteVersionId = "changed-current-version"
  draft.intent.options[0] = option(99)
  if (!deliver) throw Error("Expected deferred request body")
  deliver()
  const result = await pending
  const { expiresAt: _previousExpiry, ...withoutExpiry } = original.intent
  expect(result).toEqual({
    draftRef: original.draftRef,
    revision: original.revision + 1,
    intent: withoutExpiry,
  })
})

test("actual Request envelope refuses metadata, batches, extras, malformed UTF8 and malformed JSON without changing draft", async () => {
  const draft = current()
  freeze(draft)
  const raw = request(draft, { kind: "set_expiry", expiresAt: null })
  for (const envelope of [
    { json: raw, meta: {} },
    { json: raw, other: "extra" },
    { 0: { json: raw } },
    [{ json: raw }],
    raw,
    {},
  ])
    await refusesHTTP(draft, httpBody(JSON.stringify(envelope)), "invalid_edit")
  await refusesHTTP(
    draft,
    httpBody(new Uint8Array([0xc3, 0x28])),
    "invalid_utf8",
    true,
  )
  await refusesHTTP(draft, httpBody('{"json":'), "invalid_json", true)
  await refusesHTTP(
    draft,
    httpBody(JSON.stringify({ json: raw }), { "content-encoding": "gzip" }),
    "unsupported_encoding",
    true,
  )
})
