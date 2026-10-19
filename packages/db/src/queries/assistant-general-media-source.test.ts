import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  assessGeneralMediaCitation,
  generalMediaCitationSchema,
} from "@ewatrade/assistant/general/media-provenance"
import { generalTurnInputSchema } from "../../../../apps/api/src/assistant/general-turn-contract"
import type { Prisma } from "../../generated/prisma/client"
import {
  type AssistantGeneralMediaSourceInput,
  readAssistantGeneralMediaSourceInTransaction as read,
} from "./assistant-general-media-source"
import { assistantGeneralMediaSourceFixture as fixture } from "./test-helpers/assistant-general-media-source"

type Fixture = ReturnType<typeof fixture>
function input(
  f: Fixture,
  attachment = true,
): AssistantGeneralMediaSourceInput {
  return {
    scope: { ...f.scope },
    conversationId: f.conversation.id,
    messageId: f.message.id,
    source: attachment
      ? { kind: "attachment", attachmentId: f.attachment.id, partIndex: 1 }
      : { kind: "message", partIndex: 0 },
  }
}
function attachmentPart(
  f: Fixture,
  kind: string,
  extra: Prisma.JsonObject = {},
) {
  f.message.parts = [
    { type: "text", text: "Saved caption" },
    {
      type: "data-setup-attachment",
      data: { attachmentId: f.attachment.id, kind, ...extra },
    },
  ]
}
function privateProjection(value: unknown) {
  const serialized = JSON.stringify(value)
  for (const secret of [
    "PRIVATE_PROVIDER",
    "PRIVATE_PATH",
    "PRIVATE_BUCKET",
    "PRIVATE_NAME",
    "fileName",
    "storagePath",
    "providerRequestId",
    "customerPhone",
  ])
    expect(serialized).not.toContain(secret)
}
describe("fresh actor-owned GENERAL media source", () => {
  test("actual admitted opaque message IDs survive turn, exact source, citation and assessment without normalization", async () => {
    const exact80 = "  原始/?#=%《》  ".padEnd(80, "界")
    for (const messageId of [
      "原始 message /?",
      "https://original/id?query#hash",
      "   ",
      exact80,
    ]) {
      const f = fixture()
      const turn = generalTurnInputSchema.parse({
        conversationId: f.conversation.id,
        requestId: "request-opaque-identity",
        message: {
          id: messageId,
          role: "user",
          parts: [{ type: "text", text: "Original 😀" }],
        },
      })
      f.message.id = turn.message.id
      f.message.parts = turn.message.parts
      const source = await read(f.tx, input(f, false))
      if (source.kind !== "message")
        throw Error("Expected exact original message")
      expect(source.messageId).toBe(messageId)
      const citation = generalMediaCitationSchema.parse({
        id: "citation-original",
        messageId: source.messageId,
        locator: {
          kind: "message_span",
          partIndex: source.partIndex,
          span: { start: 0, end: source.text.length },
          quote: source.text,
        },
        artifact: { kind: "message", textDigest: source.textDigest },
        certainty: "source_clear",
        coverage: "complete",
      })
      expect(citation.messageId).toBe(messageId)
      expect(
        assessGeneralMediaCitation(citation, source, source.origin, new Date()),
      ).toEqual({
        status: "source_matches",
        semantic: true,
        requiresFieldReview: false,
        coverage: "complete",
      })
      expect(
        assessGeneralMediaCitation(
          { ...citation, messageId: `${messageId}x` },
          source,
          source.origin,
          new Date(),
        ),
      ).toEqual({ status: "unavailable", reason: "source_changed" })
    }
    const f = fixture()
    const overlong = `${exact80}x`
    expect(
      generalTurnInputSchema.safeParse({
        conversationId: f.conversation.id,
        requestId: "request-overlong-identity",
        message: {
          id: overlong,
          role: "user",
          parts: [{ type: "text", text: "Original" }],
        },
      }).success,
    ).toBe(false)
    await expect(
      read(f.tx, { ...input(f, false), messageId: overlong }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" })
    expect(f.reads).toEqual([])
    expect(
      generalMediaCitationSchema.safeParse({
        id: "citation-original",
        messageId: overlong,
        locator: {
          kind: "message_span",
          partIndex: 0,
          span: { start: 0, end: 8 },
          quote: "Original",
        },
        artifact: { kind: "message", textDigest: "a".repeat(64) },
        certainty: "source_clear",
        coverage: "complete",
      }).success,
    ).toBe(false)
    // A stored empty original is still read faithfully; it cannot substantiate
    // an invented citation or become command/approval authority.
    f.message.parts = [{ type: "text", text: "" }]
    const blank = await read(f.tx, input(f, false))
    if (blank.kind !== "message") throw Error("Expected saved blank original")
    expect(blank.text).toBe("")
    expect(
      generalMediaCitationSchema.safeParse({
        id: "citation-blank",
        messageId: blank.messageId,
        locator: {
          kind: "message_span",
          partIndex: 0,
          span: { start: 0, end: 1 },
          quote: "",
        },
        artifact: { kind: "message", textDigest: blank.textDigest },
        certainty: "source_clear",
        coverage: "complete",
      }).success,
    ).toBe(false)
  })
  test("existing maximum chat/message/attachment IDs and eighth sent part remain exact", async () => {
    const f = fixture()
    f.conversation.id = "c".repeat(128)
    f.message.id = "m".repeat(80)
    f.message.conversationId = f.conversation.id
    f.attachment.id = "a".repeat(64)
    f.attachment.conversationId = f.conversation.id
    f.attachment.messageId = f.message.id
    attachmentPart(f, "PDF")
    const source = await read(f.tx, input(f))
    expect(source.messageId).toBe(f.message.id)
    expect(source.origin.conversationId).toBe(f.conversation.id)
    if (source.kind !== "attachment") throw Error("Expected attachment")
    expect(source.attachmentId).toBe(f.attachment.id)
    f.message.parts = Array.from({ length: 8 }, (_, index) => ({
      type: "text",
      text: `Part ${index}`,
    }))
    const finalInput = input(f, false)
    finalInput.source.partIndex = 7
    await expect(read(f.tx, finalInput)).resolves.toMatchObject({
      kind: "message",
      partIndex: 7,
      text: "Part 7",
    })
    const invalid = { ...finalInput, messageId: "m".repeat(81) }
    await expect(read(f.tx, invalid)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    })
  })
  test("exact original text/part and UTF-8 digest are retained without trimming or model excerpts", async () => {
    const f = fixture()
    const text = `  ${"Original 😀\n".repeat(1300)}END  `
    f.message.parts = [{ type: "text", text }]
    const result = await read(f.tx, input(f, false))
    expect(result).toEqual({
      kind: "message",
      origin: {
        actorUserId: f.scope.userId,
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
        conversationId: f.conversation.id,
      },
      messageId: f.message.id,
      partIndex: 0,
      text,
      textDigest: createHash("sha256").update(text).digest("hex"),
    })
    expect(f.reads.some((r) => r.table === "assistantAttachment")).toBe(false)
    privateProjection(result)
  })
  test("complete retained twenty-page PDF is preserved; exact saved admission digest and allowlist only", async () => {
    const f = fixture()
    const pages = Array.from({ length: 20 }, (_, index) => ({
      page: index + 1,
      text: `${index + 1}:${"X".repeat(1995)}`,
    }))
    f.attachment.extraction = {
      type: "pages",
      pages,
      totalPages: 20,
      truncated: false,
    }
    const result = await read(f.tx, input(f))
    if (result.kind !== "attachment") throw Error("Expected attachment")
    expect<unknown>(result.extraction).toEqual(f.attachment.extraction)
    expect(result.processingGeneration).toBe(2)
    expect(result.contentDigest).toBe("a".repeat(64))
    expect(result.extractionDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(result.retentionUntil).toBe("2099-01-01T00:00:00.000Z")
    privateProjection(result)
    expect(f.denied).toEqual([])
    const last = pages[19]
    if (!last) throw Error("Missing original page")
    expect(
      assessGeneralMediaCitation(
        {
          id: "citation-1",
          messageId: result.messageId,
          artifact: {
            kind: "attachment",
            attachmentId: result.attachmentId,
            processingGeneration: result.processingGeneration,
            contentDigest: result.contentDigest,
            extractionDigest: result.extractionDigest,
          },
          locator: {
            kind: "pdf_span",
            page: 20,
            span: { start: last.text.length - 3, end: last.text.length },
            quote: "XXX",
          },
          certainty: "source_clear",
          coverage: "complete",
        },
        result,
        result.origin,
        new Date(),
      ),
    ).toEqual({
      status: "source_matches",
      semantic: true,
      requiresFieldReview: false,
      coverage: "complete",
    })
    f.attachment.extraction = {
      type: "pages",
      pages: pages.map((page) =>
        page.page === 20
          ? { ...page, text: `${page.text}changed final original text` }
          : page,
      ),
      totalPages: 20,
      truncated: false,
    }
    const changed = await read(f.tx, input(f))
    if (changed.kind !== "attachment") throw Error("Expected PDF")
    expect(changed.extractionDigest).not.toBe(result.extractionDigest)
  })
  test("full AUDIO transcript and extraction both bind digest; unchanged key order is semantically stable", async () => {
    const f = fixture()
    f.attachment.kind = "AUDIO"
    attachmentPart(f, "AUDIO")
    f.attachment.transcript = `${"T".repeat(7997)}END`
    f.attachment.extraction = {
      type: "transcript",
      language: "en",
      durationSeconds: 120,
    }
    const first = await read(f.tx, input(f))
    if (first.kind !== "attachment") throw Error("Expected audio")
    expect(first.transcript).toBe(f.attachment.transcript)
    f.attachment.extraction = {
      durationSeconds: 120,
      language: "en",
      type: "transcript",
    }
    expect(await read(f.tx, input(f))).toEqual(first)
    f.attachment.transcript = `${"T".repeat(7997)}NEW`
    const changed = await read(f.tx, input(f))
    if (changed.kind !== "attachment") throw Error("Expected audio")
    expect(changed.extractionDigest).not.toBe(first.extractionDigest)
    f.attachment.extraction = {
      type: "transcript",
      language: "fr",
      durationSeconds: 120,
    }
    const metadata = await read(f.tx, input(f))
    if (metadata.kind !== "attachment") throw Error("Expected audio")
    expect(metadata.extractionDigest).not.toBe(changed.extractionDigest)
    expect(
      assessGeneralMediaCitation(
        {
          id: "citation-audio",
          messageId: first.messageId,
          artifact: {
            kind: "attachment",
            attachmentId: first.attachmentId,
            processingGeneration: first.processingGeneration,
            contentDigest: first.contentDigest,
            extractionDigest: first.extractionDigest,
          },
          locator: {
            kind: "transcript_span",
            span: { start: 7997, end: 8000 },
            quote: "END",
          },
          certainty: "source_clear",
          coverage: "unknown",
        },
        first,
        first.origin,
        new Date(),
      ),
    ).toEqual({
      status: "source_matches",
      semantic: true,
      requiresFieldReview: true,
      coverage: "unknown",
    })
  })
  test("IMAGE is presence only, with no saved image-derived business facts exposed", async () => {
    const f = fixture()
    f.attachment.kind = "IMAGE"
    attachmentPart(f, "IMAGE")
    f.attachment.extraction = {
      type: "text",
      text: "Photo attached; not analysed.",
      truncated: false,
    }
    const first = await read(f.tx, input(f))
    f.attachment.extraction = {
      type: "image",
      productName: "PRIVATE_IMAGE_INFERENCE",
      customerPhone: "PRIVATE_CONTACT",
      providerRequestId: "PRIVATE_PROVIDER_REQUEST",
    }
    const changed = await read(f.tx, input(f))
    if (first.kind !== "attachment" || changed.kind !== "attachment")
      throw Error("Expected image")
    expect(first.extraction).toBeNull()
    expect(changed.extraction).toBeNull()
    expect(changed.extractionDigest).not.toBe(first.extractionDigest)
    expect(JSON.stringify(changed)).not.toContain("PRIVATE_IMAGE")
    privateProjection(changed)
    expect(
      assessGeneralMediaCitation(
        {
          id: "citation-image",
          messageId: changed.messageId,
          artifact: {
            kind: "attachment",
            attachmentId: changed.attachmentId,
            processingGeneration: changed.processingGeneration,
            contentDigest: changed.contentDigest,
            extractionDigest: changed.extractionDigest,
          },
          locator: { kind: "attachment_presence" },
          certainty: "not_assessed",
          coverage: "complete",
        },
        changed,
        changed.origin,
        new Date(),
      ),
    ).toMatchObject({ status: "source_matches", semantic: false })
  })
  test("partial/skipped/empty PDF pages stay partial, never manufactured whole-file completeness", async () => {
    for (const extraction of [
      {
        type: "pages",
        pages: [{ page: 2, text: "Saved page" }],
        totalPages: 2,
        truncated: false,
      },
      {
        type: "pages",
        pages: [{ page: 1, text: "Saved page" }],
        totalPages: 1,
        truncated: true,
      },
      {
        type: "pages",
        pages: [
          { page: 1, text: "  " },
          { page: 2, text: "Saved page" },
        ],
        totalPages: 2,
        truncated: false,
      },
    ]) {
      const f = fixture()
      f.attachment.extraction = extraction
      const result = await read(f.tx, input(f))
      if (result.kind !== "attachment") throw Error("Expected PDF")
      expect<unknown>(result.extraction).toEqual(extraction)
      const page = extraction.pages.find((p) => p.text === "Saved page")
      if (!page) throw Error("Missing page")
      expect(
        assessGeneralMediaCitation(
          {
            id: "partial",
            messageId: result.messageId,
            artifact: {
              kind: "attachment",
              attachmentId: result.attachmentId,
              processingGeneration: result.processingGeneration,
              contentDigest: result.contentDigest,
              extractionDigest: result.extractionDigest,
            },
            locator: {
              kind: "pdf_span",
              page: page.page,
              span: { start: 0, end: 5 },
              quote: "Saved",
            },
            certainty: "source_clear",
            coverage: "partial",
          },
          result,
          result.origin,
          new Date(),
        ),
      ).toEqual({
        status: "source_matches",
        semantic: true,
        requiresFieldReview: true,
        coverage: "partial",
      })
    }
  })
  test("all existing operational roles use actual scoped Store grant; no Owner-only or attendant fiction", async () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]) {
      const f = fixture()
      f.member.role = role
      f.member.staffAccessMode = "SCOPED"
      await expect(read(f.tx, input(f))).resolves.toMatchObject({
        kind: "attachment",
      })
      f.member.staffStoreAssignments.length = 0
      if (role === "OWNER" || role === "ADMIN")
        await expect(read(f.tx, input(f))).resolves.toMatchObject({
          kind: "attachment",
        })
      else
        await expect(read(f.tx, input(f))).rejects.toMatchObject({
          code: "FORBIDDEN",
        })
    }
  })
  test("ACTIVE membership with no acceptedAt retains existing GENERAL eligibility", async () => {
    const f = fixture()
    f.member.acceptedAt = null
    f.member.role = "CASHIER"
    f.member.staffAccessMode = "SCOPED"
    await expect(read(f.tx, input(f))).resolves.toMatchObject({
      kind: "attachment",
    })
    f.member.status = "SUSPENDED"
    await expect(read(f.tx, input(f))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })
  test("persisted actor/Tenant/Store/membership/grant revocation refuses before any original content read", async () => {
    const changes: Array<(f: Fixture) => void> = [
      (f) => {
        f.user.id = "foreign"
      },
      (f) => {
        f.tenant.isActive = false
      },
      (f) => {
        f.tenant.qaPurgeStartedAt = new Date()
      },
      (f) => {
        f.store.status = "INACTIVE"
      },
      (f) => {
        f.store.tenantId = "foreign"
      },
      (f) => {
        f.member.status = "SUSPENDED"
      },
      (f) => {
        f.member.userId = "foreign"
      },
      (f) => {
        f.member.role = "SUPPORT"
      },
      (f) => {
        f.member.role = "MEMBER"
      },
      (f) => {
        f.member.staffAccessRevision = 0
      },
      (f) => {
        f.member.role = "OPERATOR"
        f.member.staffAccessMode = "SCOPED"
        f.member.staffStoreAssignments = []
      },
    ]
    for (const change of changes) {
      const f = fixture()
      change(f)
      await expect(read(f.tx, input(f))).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(f.reads.some((r) => r.table.startsWith("assistant"))).toBe(false)
      expect(f.denied).toEqual([])
    }
  })
  test("PROCESSING/COMPLETED privacy blocks independently of private-write rollout flag", async () => {
    const old = process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED
    try {
      for (const enabled of ["true", "false"])
        for (const status of ["PROCESSING", "COMPLETED"]) {
          process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED =
            enabled
          const f = fixture()
          f.user.accountPrivacyRequests.push({ status })
          await expect(read(f.tx, input(f))).rejects.toMatchObject({
            code: "FORBIDDEN",
          })
          expect(f.reads.some((r) => r.table.startsWith("assistant"))).toBe(
            false,
          )
        }
      const f = fixture()
      f.user.accountPrivacyRequests.push({ status: "RECEIVED" })
      await expect(read(f.tx, input(f))).resolves.toMatchObject({
        kind: "attachment",
      })
    } finally {
      if (old === undefined)
        Reflect.deleteProperty(
          process.env,
          "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED",
        )
      else
        process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED = old
    }
  })
  test("exact actor-owned ACTIVE GENERAL chat and sent user message required; Setup/shared/assistant text cannot substitute", async () => {
    const changes: Array<(f: Fixture) => void> = [
      (f) => {
        f.conversation.ownerUserId = "other-owner"
      },
      (f) => {
        f.conversation.tenantId = "foreign"
      },
      (f) => {
        f.conversation.storeId = "foreign"
      },
      (f) => {
        f.conversation.purpose = "SETUP"
      },
      (f) => {
        f.conversation.purpose = "PRODUCT_CREATE"
      },
      (f) => {
        f.conversation.status = "COMPLETED"
      },
      (f) => {
        f.message.conversationId = "other-chat"
      },
      (f) => {
        f.message.role = "assistant"
      },
      (f) => {
        f.message.id = "other-message"
      },
      (f) => {
        f.message.parts = null
      },
      (f) => {
        f.message.parts = [
          {
            type: "data-general-answer",
            data: { text: "Not original user text" },
          },
        ]
      },
    ]
    for (const change of changes) {
      const f = fixture()
      const original = input(f, false)
      change(f)
      await expect(read(f.tx, original)).rejects.toMatchObject({
        code: "UNAVAILABLE",
      })
      expect(f.reads.some((r) => r.table === "assistantAttachment")).toBe(false)
    }
  })
  test("attachment exact actor/Tenant/Store/chat/message, READY/retention/generation/kind/digest are never inferred", async () => {
    const changes: Array<(f: Fixture) => void> = [
      (f) => {
        f.attachment.actorUserId = "other-owner"
      },
      (f) => {
        f.attachment.tenantId = "foreign"
      },
      (f) => {
        f.attachment.storeId = "foreign"
      },
      (f) => {
        f.attachment.conversationId = "other-chat"
      },
      (f) => {
        f.attachment.messageId = "other-message"
      },
      (f) => {
        f.attachment.messageId = ""
      },
      (f) => {
        f.attachment.status = "PROCESSING"
      },
      (f) => {
        f.attachment.status = "FAILED"
      },
      (f) => {
        f.attachment.retentionUntil = new Date(0)
      },
      (f) => {
        f.attachment.processingAttempts = 0
      },
      (f) => {
        f.attachment.contentDigest = "client-claim"
      },
      (f) => {
        f.attachment.kind = "SPREADSHEET"
      },
      (f) => {
        f.attachment.kind = "TEXT"
      },
      (f) => {
        attachmentPart(f, "AUDIO")
      },
      (f) => {
        attachmentPart(f, "PDF", { expired: true })
      },
      (f) => {
        f.message.parts = [
          { type: "text", text: "Caption" },
          { type: "data-setup-attachment", data: { attachmentId: "other" } },
        ]
      },
    ]
    for (const change of changes) {
      const f = fixture()
      const original = input(f)
      change(f)
      await expect(read(f.tx, original)).rejects.toMatchObject({
        code: "UNAVAILABLE",
      })
      expect(f.denied).toEqual([])
    }
  })
  test("unsupported extraction shape refuses; original snapshots do not leak extra PDF/audio fields", async () => {
    for (const extraction of [
      null,
      { type: "text", text: "Not PDF", truncated: false },
      {
        type: "pages",
        pages: [{ page: 1, text: "Text", customerPhone: "PRIVATE" }],
        totalPages: 1,
        truncated: false,
      },
      {
        type: "pages",
        pages: [],
        totalPages: 0,
        truncated: false,
        storagePath: "PRIVATE",
      },
    ]) {
      const f = fixture()
      f.attachment.extraction = extraction
      await expect(read(f.tx, input(f))).rejects.toMatchObject({
        code: "UNAVAILABLE",
      })
    }
    const f = fixture()
    f.attachment.transcript = "Unexpected PDF transcript"
    await expect(read(f.tx, input(f))).rejects.toMatchObject({
      code: "UNAVAILABLE",
    })
  })
  test("input is strict and snapshotted before awaiting authority; fresh re-read observes revocation", async () => {
    const f = fixture()
    const bad = {
      ...input(f),
      contentDigest: "a".repeat(64),
      now: new Date("2000-01-01T00:00:00Z"),
    }
    await expect(read(f.tx, bad)).rejects.toMatchObject({ code: "UNAVAILABLE" })
    expect(f.reads).toEqual([])
    const original = input(f)
    const pending = read(f.tx, original)
    original.scope.userId = "changed"
    original.scope.storeId = "changed"
    original.source.partIndex = 0
    expect((await pending).origin.actorUserId).toBe(f.scope.userId)
    f.member.status = "SUSPENDED"
    await expect(read(f.tx, input(f))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })
  test("actual predicates and projection retain exact originals without shared-owner reader, private paths or write delegates", async () => {
    const f = fixture()
    await read(f.tx, input(f))
    const attachmentRead = f.reads.find(
      (r) => r.table === "assistantAttachment",
    )
    expect(attachmentRead?.args).toMatchObject({
      where: {
        id: f.attachment.id,
        actorUserId: f.scope.userId,
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
        conversationId: f.conversation.id,
        messageId: f.message.id,
        status: "READY",
        retentionUntil: { gt: expect.any(Date) },
        conversation: {
          id: f.conversation.id,
          ownerUserId: f.scope.userId,
          purpose: "GENERAL",
          status: "ACTIVE",
        },
      },
      select: {
        contentDigest: true,
        transcript: true,
        extraction: true,
        processingAttempts: true,
      },
    })
    expect(JSON.stringify(attachmentRead)).not.toContain("storage")
    expect(f.reads.map((r) => r.table)).toEqual([
      "user",
      "tenant",
      "store",
      "membership",
      "membership",
      "assistantConversation",
      "assistantMessage",
      "assistantAttachment",
    ])
    expect(f.denied).toEqual([])
  })
})
