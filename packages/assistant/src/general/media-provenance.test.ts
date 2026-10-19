import { expect, test } from "bun:test"
import {
  type GeneralMediaCurrentSource,
  assessGeneralMediaCitation,
  generalMediaAcknowledgementClaimSchema,
  generalMediaCitationSchema,
  generalMediaFieldReviewSchema,
  generalMediaReviewBindingSchema,
  generalMediaUnacknowledgedFields,
} from "./media-provenance"

const origin = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  conversationId: "chat",
}
const now = new Date("2026-10-15T12:00:00.000Z")
const hash = "a".repeat(64)

test("field review keeps the complete native target identity at its actual ceiling", () => {
  const binding = review().binding
  const target = {
    id: "原生 /?=# %:《》".padEnd(191, "n"),
    revision: "current",
  }
  expect(
    generalMediaReviewBindingSchema.parse({ ...binding, target }).target,
  ).toEqual(target)
  expect(
    generalMediaReviewBindingSchema.safeParse({
      ...binding,
      target: { ...target, id: `${target.id}x` },
    }).success,
  ).toBe(false)
})
function citation() {
  return generalMediaCitationSchema.parse({
    id: "citation-1",
    messageId: "message-1",
    locator: {
      kind: "pdf_span",
      page: 2,
      span: { start: 0, end: 5 },
      quote: "Ishaq",
    },
    artifact: {
      kind: "attachment",
      attachmentId: "attachment",
      processingGeneration: 1,
      contentDigest: hash,
      extractionDigest: hash,
    },
    certainty: "not_assessed",
    coverage: "complete",
  })
}
function pdf(): Extract<GeneralMediaCurrentSource, { kind: "attachment" }> {
  return {
    kind: "attachment",
    origin,
    messageId: "message-1",
    attachmentId: "attachment",
    attachmentKind: "PDF",
    status: "READY",
    processingGeneration: 1,
    contentDigest: hash,
    extractionDigest: hash,
    retentionUntil: "2026-11-01T00:00:00.000Z",
    transcript: null,
    extraction: {
      type: "pages",
      pages: [
        { page: 1, text: "Original readable introduction" },
        { page: 2, text: "Ishaq owes 1000" },
      ],
      totalPages: 2,
      truncated: false,
    },
  }
}
function review() {
  return generalMediaFieldReviewSchema.parse({
    binding: {
      origin,
      proposalId: "proposal",
      proposalRevision: 3,
      payloadHash: hash,
      target: { id: "customer", revision: "3" },
      sourceSetDigest: hash,
      fieldSetDigest: hash,
    },
    payload: { action: "customer_create", name: "Ishaq" },
    citations: [citation()],
    fields: [
      {
        id: "field-name",
        path: ["name"],
        valueDigest: hash,
        citationIds: ["citation-1"],
        uncertainty: "uncertain",
      },
    ],
  })
}

test("actual PDF page and UTF16 quote match without granting proposal authority", () => {
  expect(assessGeneralMediaCitation(citation(), pdf(), origin, now)).toEqual({
    status: "source_matches",
    semantic: true,
    requiresFieldReview: true,
    coverage: "complete",
  })
  const source = pdf()
  source.extraction = {
    type: "pages",
    pages: [{ page: 2, text: "Changed customer" }],
    totalPages: 2,
    truncated: false,
  }
  expect(assessGeneralMediaCitation(citation(), source, origin, now)).toEqual({
    status: "unavailable",
    reason: "locator_mismatch",
  })
})

test("PDF producer skipping unreadable pages remains partial even when truncated is false", () => {
  const candidate = citation()
  candidate.certainty = "source_clear"
  const source = pdf()
  // The producer continues past a scanned/empty page without setting truncated.
  // A retained empty page is likewise not evidence of readable full coverage.
  for (const pages of [
    [{ page: 2, text: "Ishaq owes 1000" }],
    [
      { page: 1, text: "" },
      { page: 2, text: "Ishaq owes 1000" },
    ],
    [
      { page: 1, text: " \n\t" },
      { page: 2, text: "Ishaq owes 1000" },
    ],
  ]) {
    source.extraction = {
      type: "pages",
      pages,
      totalPages: 2,
      truncated: false,
    }
    expect(assessGeneralMediaCitation(candidate, source, origin, now)).toEqual({
      status: "unavailable",
      reason: "source_changed",
    })
    expect(
      assessGeneralMediaCitation(
        { ...candidate, coverage: "partial" },
        source,
        origin,
        now,
      ),
    ).toEqual({
      status: "source_matches",
      semantic: true,
      requiresFieldReview: true,
      coverage: "partial",
    })
  }
  expect(assessGeneralMediaCitation(candidate, pdf(), origin, now)).toEqual({
    status: "source_matches",
    semantic: true,
    requiresFieldReview: false,
    coverage: "complete",
  })
})

test("actor, Tenant, Store, chat, message, generation and both source digests remain exact", () => {
  for (const key of [
    "actorUserId",
    "tenantId",
    "storeId",
    "conversationId",
  ] as const) {
    const source = pdf()
    source.origin = { ...origin, [key]: "foreign" }
    expect(assessGeneralMediaCitation(citation(), source, origin, now)).toEqual(
      { status: "unavailable", reason: "scope_changed" },
    )
  }
  const changes: Array<(source: ReturnType<typeof pdf>) => void> = [
    (source) => {
      source.messageId = "other-message"
    },
    (source) => {
      source.attachmentId = "other-attachment"
    },
    (source) => {
      source.processingGeneration++
    },
    (source) => {
      source.contentDigest = "b".repeat(64)
    },
    (source) => {
      source.extractionDigest = "b".repeat(64)
    },
    (source) => {
      source.status = "PROCESSING"
    },
    (source) => {
      source.status = "FAILED"
    },
  ]
  for (const change of changes) {
    const source = pdf()
    change(source)
    expect(assessGeneralMediaCitation(citation(), source, origin, now)).toEqual(
      { status: "unavailable", reason: "source_changed" },
    )
  }
})

test("expired/missing source cannot be reused and partial extraction cannot masquerade as full coverage", () => {
  for (const expiry of [
    now.toISOString(),
    "2000-01-01T00:00:00.000Z",
    "invalid",
  ]) {
    const source = pdf()
    source.retentionUntil = expiry
    expect(assessGeneralMediaCitation(citation(), source, origin, now)).toEqual(
      { status: "unavailable", reason: "source_expired" },
    )
  }
  const source = pdf()
  source.extraction = {
    type: "pages",
    pages: [{ page: 2, text: "Ishaq" }],
    totalPages: 21,
    truncated: true,
  }
  expect(assessGeneralMediaCitation(citation(), source, origin, now)).toEqual({
    status: "unavailable",
    reason: "source_changed",
  })
  const partial = citation()
  partial.coverage = "partial"
  partial.certainty = "source_clear"
  expect(assessGeneralMediaCitation(partial, source, origin, now)).toEqual({
    status: "source_matches",
    semantic: true,
    requiresFieldReview: true,
    coverage: "partial",
  })
})

test("AUDIO requires explicit field review even when the candidate calls its transcript clear", () => {
  const source = pdf()
  source.attachmentKind = "AUDIO"
  source.transcript = "Ishaq"
  source.extraction = { type: "transcript", language: null, durationSeconds: 1 }
  const candidate = generalMediaCitationSchema.parse({
    ...citation(),
    locator: {
      kind: "transcript_span",
      span: { start: 0, end: 5 },
      quote: "Ishaq",
    },
    certainty: "source_clear",
    coverage: "unknown",
  })
  expect(assessGeneralMediaCitation(candidate, source, origin, now)).toEqual({
    status: "source_matches",
    semantic: true,
    requiresFieldReview: true,
    coverage: "unknown",
  })
  source.transcript = "Aisha"
  expect(
    assessGeneralMediaCitation(candidate, source, origin, now).status,
  ).toBe("unavailable")
})

test("current GENERAL refuses CSV/TEXT and semantic image analysis; original image presence remains evidence only", () => {
  for (const kind of ["SPREADSHEET", "TEXT", "IMAGE"] as const) {
    const source = pdf()
    source.attachmentKind = kind
    expect(assessGeneralMediaCitation(citation(), source, origin, now)).toEqual(
      { status: "unavailable", reason: "unsupported_general_source" },
    )
  }
  const source = pdf()
  source.attachmentKind = "IMAGE"
  const presence = generalMediaCitationSchema.parse({
    ...citation(),
    locator: { kind: "attachment_presence" },
  })
  expect(assessGeneralMediaCitation(presence, source, origin, now)).toEqual({
    status: "source_matches",
    semantic: false,
    requiresFieldReview: false,
    coverage: "complete",
  })
  const raw = { ...review(), citations: [presence] }
  expect(generalMediaFieldReviewSchema.safeParse(raw).success).toBe(false)
})

test("message spans preserve exact original parts and refuse partial surrogate citations", () => {
  const source: GeneralMediaCurrentSource = {
    kind: "message",
    origin,
    messageId: "message-1",
    partIndex: 0,
    textDigest: hash,
    text: "A😀B",
  }
  const base = {
    ...citation(),
    artifact: { kind: "message", textDigest: hash },
  }
  const valid = generalMediaCitationSchema.parse({
    ...base,
    locator: {
      kind: "message_span",
      partIndex: 0,
      span: { start: 1, end: 3 },
      quote: "😀",
    },
  })
  expect(assessGeneralMediaCitation(valid, source, origin, now).status).toBe(
    "source_matches",
  )
  const split = generalMediaCitationSchema.parse({
    ...base,
    locator: {
      kind: "message_span",
      partIndex: 0,
      span: { start: 1, end: 2 },
      quote: "\ud83d",
    },
  })
  expect(assessGeneralMediaCitation(split, source, origin, now)).toEqual({
    status: "unavailable",
    reason: "locator_mismatch",
  })
  const wrongPart = generalMediaCitationSchema.parse({
    ...valid,
    locator: { ...valid.locator, partIndex: 1 },
  })
  expect(
    assessGeneralMediaCitation(wrongPart, source, origin, now).status,
  ).toBe("unavailable")
})

test("original message identities preserve GENERAL's opaque strings while synthetic citation IDs stay strict", () => {
  for (const messageId of [
    "原始 message /?",
    "https://original/id?query#hash",
    "   ",
    "  原始/?#=%《》  ".padEnd(80, "界"),
  ])
    expect(
      generalMediaCitationSchema.parse({ ...citation(), messageId }).messageId,
    ).toBe(messageId)
  for (const messageId of ["", "界".repeat(81)])
    expect(
      generalMediaCitationSchema.safeParse({ ...citation(), messageId })
        .success,
    ).toBe(false)
  expect(
    generalMediaCitationSchema.safeParse({
      ...citation(),
      id: "https://synthetic/id",
    }).success,
  ).toBe(false)
})

test("strict source claims reject URLs, unknown authority/confidence fields, wrong locators and oversized spans", () => {
  const base = citation()
  for (const raw of [
    { ...base, approvalToken: "fake" },
    { ...base, confidence: 0.99 },
    { ...base, authorized: true },
    { ...base, id: "https://foreign" },
    { ...base, id: " trailing " },
    { ...base, artifact: { ...base.artifact, storagePath: "private" } },
    {
      ...base,
      locator: {
        kind: "pdf_span",
        page: 21,
        span: { start: 0, end: 5 },
        quote: "Ishaq",
      },
    },
    {
      ...base,
      locator: {
        kind: "pdf_span",
        page: 2,
        span: { start: 5, end: 0 },
        quote: "Ishaq",
      },
    },
    {
      ...base,
      locator: {
        kind: "pdf_span",
        page: 2,
        span: { start: 0, end: 6 },
        quote: "Ishaq",
      },
    },
    { ...base, artifact: { kind: "message", textDigest: hash } },
  ])
    expect(generalMediaCitationSchema.safeParse(raw).success).toBe(false)
})

test("field review uses actual typed action paths, exact citation set and unique IDs rather than arbitrary metadata", () => {
  const current = review()
  expect(current.payload.action).toBe("customer_create")
  const field = current.fields[0]
  if (!field) throw Error("Original field required")
  for (const changed of [
    { ...current, fields: [{ ...field, path: ["actorUserId"] }] },
    { ...current, fields: [{ ...field, path: ["constructor"] }] },
    { ...current, fields: [{ ...field, citationIds: ["foreign"] }] },
    { ...current, fields: [field, field] },
    { ...current, citations: [citation(), citation()] },
    { ...current, payload: { ...current.payload, actorUserId: "actor" } },
  ])
    expect(generalMediaFieldReviewSchema.safeParse(changed).success).toBe(false)
})

test("uncertain values remain unresolved until exact claims match every proposal/source/value/plan binding", () => {
  const current = review()
  expect(generalMediaUnacknowledgedFields(current, null)).toEqual([
    "field-name",
  ])
  const claim = generalMediaAcknowledgementClaimSchema.parse({
    binding: current.binding,
    fields: [{ fieldId: "field-name", valueDigest: hash }],
  })
  expect(generalMediaUnacknowledgedFields(current, claim)).toEqual([])
  // Empty means claims match, never that the actor or source was authenticated.
  for (const binding of [
    { ...current.binding, proposalRevision: 4 },
    { ...current.binding, payloadHash: "b".repeat(64) },
    { ...current.binding, sourceSetDigest: "b".repeat(64) },
    { ...current.binding, fieldSetDigest: "b".repeat(64) },
    {
      ...current.binding,
      target: { ...current.binding.target, revision: "4" },
    },
    { ...current.binding, origin: { ...origin, actorUserId: "other" } },
    {
      ...current.binding,
      plan: { planId: "plan", revision: 1, stepId: "step" },
    },
  ])
    expect(
      generalMediaUnacknowledgedFields(current, { ...claim, binding }),
    ).toEqual(["field-name"])
  expect(
    generalMediaUnacknowledgedFields(current, {
      ...claim,
      fields: [{ fieldId: "field-name", valueDigest: "b".repeat(64) }],
    }),
  ).toEqual(["field-name"])
  expect(
    generalMediaAcknowledgementClaimSchema.safeParse({
      ...claim,
      approved: true,
    }).success,
  ).toBe(false)
  expect(
    generalMediaAcknowledgementClaimSchema.safeParse({
      ...claim,
      fields: [...claim.fields, ...claim.fields],
    }).success,
  ).toBe(false)
})

test("full existing500×48 stock-count quantity review preserves every field without a smaller provenance cap", () => {
  const base = review()
  const parsed = generalMediaFieldReviewSchema.parse({
    ...base,
    payload: {
      action: "stock_count_create",
      reason: "Original counted quantities",
      lines: Array.from({ length: 500 }, (_, i) => ({
        balanceSourceId: `balance-${i}`,
        entries: Array.from({ length: 48 }, (_, j) => ({
          enteredInventoryUnitId: `unit-${j}`,
          enteredQuantity: "0",
        })),
      })),
    },
    citations: Array.from({ length: 500 }, (_, i) => ({
      ...citation(),
      id: `citation-${i}`,
      locator: {
        kind: "pdf_span",
        page: 2,
        span: { start: 0, end: 1 },
        quote: "0",
      },
    })),
    fields: Array.from({ length: 500 }, (_, i) =>
      Array.from({ length: 48 }, (_, j) => ({
        id: `quantity-${i}-${j}`,
        path: ["lines", i, "entries", j, "enteredQuantity"],
        valueDigest: hash,
        citationIds: [`citation-${i}`],
        uncertainty: "uncertain",
      })),
    ).flat(),
  })
  expect(parsed.fields).toHaveLength(24_000)
  expect(generalMediaUnacknowledgedFields(parsed, null)).toHaveLength(24_000)
  expect(parsed.fields.at(-1)?.path).toEqual([
    "lines",
    499,
    "entries",
    47,
    "enteredQuantity",
  ])
  const claim = generalMediaAcknowledgementClaimSchema.parse({
    binding: parsed.binding,
    fields: parsed.fields.map((field) => ({
      fieldId: field.id,
      valueDigest: field.valueDigest,
    })),
  })
  expect(generalMediaUnacknowledgedFields(parsed, claim)).toEqual([])
  // This proves shape/coverage only. Real source quotes and value hashes still
  // require server resolution; these synthetic digests authenticate nothing.
})
