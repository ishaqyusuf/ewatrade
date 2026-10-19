import { afterAll, expect, spyOn, test } from "bun:test"
import {
  issueReviewedCommerceQuoteInTransaction,
  prepareReviewedCommerceQuoteIssue,
} from "./commerce-quote-reviewed-issue"
import {
  reviewedIssueFixture,
  reviewedIssueIntent,
  reviewedIssuePublication,
} from "./test-helpers/commerce-quote-reviewed-issue"

// Actual preparation, parent review, authority, options, issuer and linked release.
// Persistence is an explicit in-memory stand-in, not rollback/SQL acceptance.
function forbiddenNetwork(): never {
  throw Error("No model/provider/network in source fixture")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(forbiddenNetwork, { preconnect: forbiddenNetwork }),
)
afterAll(() => network.mockRestore())
async function configured<T>(run: (production: () => void) => Promise<T>) {
  const keys = [
    "APP_ENV",
    "DEV_PROFILE",
    "STORE_CONVERSATION_TEXT_SAFETY_PROVIDER",
  ] as const
  const prior = keys.map((key) => [key, process.env[key]] as const)
  try {
    process.env.APP_ENV = "local"
    process.env.DEV_PROFILE = "local"
    process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = "qa-fixture"
    return await run(() => {
      process.env.APP_ENV = "production"
      process.env.DEV_PROFILE = "production"
    })
  } finally {
    for (const [key, value] of prior)
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
  }
}
async function execute(
  f: ReturnType<typeof reviewedIssueFixture>,
  handle: unknown,
): Promise<
  Awaited<ReturnType<typeof issueReviewedCommerceQuoteInTransaction>>
> {
  return Reflect.apply(issueReviewedCommerceQuoteInTransaction, undefined, [
    f.tx,
    handle,
  ])
}
test("opaque preflight screens outside transaction then emits only exact native saved receipt facts", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    const input = reviewedIssueIntent()
    const checked = await f.review(input)
    const reads = f.reads.length
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      reviewedIssuePublication,
    )
    expect(f.reads).toHaveLength(reads)
    expect(f.writes).toEqual([])
    expect(Object.isFrozen(handle)).toBe(true)
    expect(JSON.stringify(handle)).toBe("{}")
    production()
    f.state.allowWrites = true
    const receipt = await execute(f, handle)
    expect(receipt).toEqual({
      operation: "issue",
      quoteId: "quote-new",
      quoteVersionId: "version-new",
      sourceType: "service_request",
      sourceId: "request-1",
      origin: { tenantId: "tenant-1", storeId: "store-1" },
      currencyCode: "NGN",
      version: 1,
      status: "ISSUED",
      releaseState: "released",
      approvalId: null,
      policyRevision: null,
      createdAt: expect.any(String),
      issuedAt: expect.any(String),
      expiresAt: null,
      optionCount: 1,
    })
    expect(f.savedOptions).toHaveLength(1)
    expect(f.savedLines).toHaveLength(1)
    expect(f.state.sourceRow.status).toBe("QUOTED")
    expect(f.denied).toEqual([])
    expect(network).not.toHaveBeenCalled()
    const readback = f.reads
      .filter(
        (row) =>
          row.table === "commerceQuoteVersion" && row.method === "findFirst",
      )
      .at(-1)
    expect(readback?.input).not.toHaveProperty("select.acceptanceTokenDigest")
    for (const key of [
      "token",
      "Token",
      "screenedTexts",
      "intentIdentity",
      "payloadHash",
      "authorize",
    ])
      expect(JSON.stringify(receipt)).not.toContain(key)
  })
})
test("actual linked issuer uses outside-screened proof in unavailable-provider production and persists invitation/unread intents only", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    f.state.links = [{ conversationId: "conversation" }]
    const input = reviewedIssueIntent()
    const checked = await f.review(input)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    expect((await execute(f, handle)).releaseState).toBe("released")
    expect(f.messages.map((row) => row.kind)).toEqual([
      "ACTION_MESSAGE",
      "ACCOUNT_INVITATION",
    ])
    expect(f.presentations).toHaveLength(1)
    expect(f.invitations).toHaveLength(1)
    expect(f.notifications).toHaveLength(1)
    expect(f.denied).toEqual([])
    expect(network).not.toHaveBeenCalled()
  })
})
test("pending preparation returns exact private approval policy and leaves source and linked effects deferred", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    f.state.releasePolicy = {
      mode: "APPROVAL_REQUIRED",
      revision: 3,
      selectedApproverMembershipIds: ["checker-1"],
    }
    f.state.team = [
      { capability: "ATTENDANT", membershipId: "member-1" },
      { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
    ]
    f.state.links = Array.from({ length: 101 }, (_, index) => ({
      conversationId: `chat-${index}`,
    }))
    const input = reviewedIssueIntent()
    const checked = await f.review(input)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    const result = await execute(f, handle)
    expect(result).toMatchObject({
      status: "DRAFT",
      releaseState: "pending_approval",
      approvalId: "approval-new",
      policyRevision: 3,
      issuedAt: null,
    })
    expect(f.state.sourceRow.status).toBe("SUBMITTED")
    expect(f.messages).toEqual([])
    expect(f.notifications).toEqual([])
    expect(
      f.reads.some((row) => row.table === "storeConversationRequestLink"),
    ).toBe(false)
    expect(f.denied).toEqual([])
  })
})
test("forged or serialized handles refuse before any transaction access", async () => {
  const tx = new Proxy(
    {},
    {
      get: () => {
        throw Error("No transaction access")
      },
    },
  )
  for (const handle of [
    null,
    {},
    true,
    Object.freeze({ prepared: true }),
    JSON.parse("{}"),
  ])
    await expect(
      Reflect.apply(issueReviewedCommerceQuoteInTransaction, undefined, [
        tx,
        handle,
      ]),
    ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
})
test("failed screening and malformed digest never issue an opaque handle or touch persistence", async () => {
  await configured(async () => {
    for (const text of ["[[qa-reject]]", "[[qa-review]]"]) {
      const f = reviewedIssueFixture()
      const input = { ...reviewedIssueIntent(), customerNote: text }
      await expect(
        prepareReviewedCommerceQuoteIssue(
          input,
          "a".repeat(64),
          reviewedIssuePublication,
        ),
      ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
      expect(f.reads).toEqual([])
      expect(f.writes).toEqual([])
    }
    for (const revision of ["", "a", "G".repeat(64), "a".repeat(65)])
      await expect(
        prepareReviewedCommerceQuoteIssue(
          reviewedIssueIntent(),
          revision,
          reviewedIssuePublication,
        ),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
  })
})
test("fresh source/access/policy/links drift refuses before native mutations, and the original handle remains retryable", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    const input = reviewedIssueIntent()
    const checked = await f.review(input)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    f.state.sourceRow.revision++
    await expect(execute(f, handle)).rejects.toThrow("review changed")
    expect(f.writes).toEqual([])
    f.state.sourceRow.revision--
    f.state.member.staffAccessRevision++
    await expect(execute(f, handle)).rejects.toThrow("review changed")
    expect(f.writes).toEqual([])
    f.state.member.staffAccessRevision--
    f.state.links = [{ conversationId: "new-link" }]
    await expect(execute(f, handle)).rejects.toThrow("review changed")
    expect(f.writes).toEqual([])
    f.state.links = []
    expect((await execute(f, handle)).quoteVersionId).toBe("version-new")
    expect(f.denied).toEqual([])
  })
})
test("input, nested intention, expiry, publication and wider callbacks are snapshotted before screening yields", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    let callbacks = 0
    const input = {
      ...reviewedIssueIntent(),
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      authorize: () => {
        callbacks++
        throw Error("No caller authority callback")
      },
      protectActionId: () => {
        callbacks++
        throw Error("No caller protect callback")
      },
    }
    const publication = { ...reviewedIssuePublication }
    const checked = await f.review(input, publication)
    const pending = prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      publication,
    )
    input.sourceId = "foreign"
    input.clientVersionId = "changed-command"
    input.expiresAt.setUTCFullYear(2040)
    const line = input.lines?.[0]
    if (!line) throw Error("Expected saved intention")
    line.customerNote = "Changed note"
    publication.documentHash = "b".repeat(64)
    const handle = await pending
    production()
    f.state.allowWrites = true
    expect(await execute(f, handle)).toMatchObject({
      sourceId: "request-1",
      expiresAt: "2030-01-01T00:00:00.000Z",
    })
    expect(f.savedLines[0]?.customerNote).toBe("Saved unavailable explanation")
    expect(callbacks).toBe(0)
    expect(f.denied).toEqual([])
  })
})
test("readback absence or mismatched exact saved result refuses without returning native capability material", async () => {
  await configured(async () => {
    for (const defect of [
      "missing",
      "scope",
      "command",
      "version",
      "status",
      "options",
      "approval",
    ]) {
      const f = reviewedIssueFixture()
      const input = reviewedIssueIntent()
      const checked = await f.review(input)
      const handle = await prepareReviewedCommerceQuoteIssue(
        input,
        checked.target.revision,
        reviewedIssuePublication,
      )
      if (defect === "missing") f.state.readbackMissing = true
      if (defect === "scope")
        f.state.readbackPatch.quote = { tenantId: "foreign" }
      if (defect === "command")
        f.state.readbackPatch.clientVersionId = "foreign"
      if (defect === "version") f.state.readbackPatch.version = 2
      if (defect === "status") f.state.readbackPatch.status = "DRAFT"
      if (defect === "options") f.state.readbackPatch._count = { options: 0 }
      if (defect === "approval")
        f.state.readbackPatch.quoteApproval = { id: "unexpected" }
      f.state.allowWrites = true
      await expect(execute(f, handle)).rejects.toMatchObject({
        code: "QUOTE_CONFLICT",
      })
      // This synthetic fixture does not roll back: the REAL caller must own
      // Serializable command + proposal receipt and roll back on this refusal.
      expect(f.denied).toEqual([])
    }
  })
})

test("full20by100 intention retains every source/option/line without smaller helper caps", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    const base = f.state.lines[0]
    if (!base) throw Error("Expected original saved Request line")
    f.state.lines = Array.from({ length: 100 }, (_, index) => ({
      ...base,
      id: `line-${index}`,
    }))
    const {
      lines: _lines,
      availabilityOutcome: _availability,
      ...intent
    } = reviewedIssueIntent()
    const input = {
      ...intent,
      options: Array.from({ length: 20 }, (_, choice) => ({
        clientOptionId: `option-${choice}`,
        label: `Choice ${choice}`,
        availabilityOutcome: "unavailable" as const,
        lines: f.state.lines.map((line) => ({
          sourceLineId: line.id,
          outcome: "unavailable" as const,
        })),
      })),
    }
    const review = await f.review(input)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      review.target.revision,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    expect((await execute(f, handle)).optionCount).toBe(20)
    expect(f.savedOptions).toHaveLength(20)
    expect(f.savedLines).toHaveLength(2000)
    expect(f.savedOptions.map((option) => option.totalMinor)).toEqual(
      Array(20).fill(0),
    )
    expect(f.denied).toEqual([])
  })
})

test("pending receipt readback binds every approval identity, status, requester and exact policy revision", async () => {
  await configured(async () => {
    for (const [key, value] of [
      ["tenantId", "foreign"],
      ["storeId", "foreign"],
      ["quoteId", "foreign"],
      ["quoteVersionId", "foreign"],
      ["sourceId", "foreign"],
      ["sourceType", "COMMERCE_INQUIRY"],
      ["status", "APPROVED"],
      ["policyRevision", 4],
      ["requesterMembershipId", "foreign"],
    ]) {
      const f = reviewedIssueFixture()
      f.state.releasePolicy = {
        mode: "APPROVAL_REQUIRED",
        revision: 3,
        selectedApproverMembershipIds: ["checker-1"],
      }
      f.state.team = [
        { capability: "ATTENDANT", membershipId: "member-1" },
        { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
      ]
      const input = reviewedIssueIntent()
      const checked = await f.review(input)
      const handle = await prepareReviewedCommerceQuoteIssue(
        input,
        checked.target.revision,
        reviewedIssuePublication,
      )
      if (typeof key !== "string") throw Error("Expected approval field name")
      f.state.readbackApprovalPatch[key] = value
      f.state.allowWrites = true
      await expect(execute(f, handle)).rejects.toThrow(
        "saved quotation approval",
      )
      expect(f.denied).toEqual([])
    }
  })
})

test("wrong expected digest cannot convert screened intent into a native write", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    const input = reviewedIssueIntent()
    const checked = await f.review(input)
    const wrong =
      checked.target.revision === "a".repeat(64)
        ? "b".repeat(64)
        : "a".repeat(64)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      wrong,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    await expect(execute(f, handle)).rejects.toThrow("review changed")
    expect(f.writes).toEqual([])
    expect(f.denied).toEqual([])
  })
})

test("committed GENERAL result must be recovered before this new-version helper; retained handle cannot issue or rotate again", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    const input = reviewedIssueIntent()
    const checked = await f.review(input)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    const first = await execute(f, handle)
    const before = f.writes.length
    await expect(execute(f, handle)).rejects.toThrow()
    expect(f.writes).toHaveLength(before)
    expect(f.savedOptions).toHaveLength(1)
    expect(first.quoteVersionId).toBe("version-new")
    expect(f.denied).toEqual([])
  })
})

test("exact revision composes native supersession and next sequence while retaining the original source state", async () => {
  await configured(async (production) => {
    const f = reviewedIssueFixture()
    const current = {
      id: "old-version",
      quoteId: "quote-old",
      clientVersionId: "old-command",
      payloadHash: "a".repeat(64),
      version: 3,
      status: "ISSUED",
      currencyCode: "NGN",
      expiresAt: null,
      createdByUserId: "actor-1",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      issuedAt: new Date("2026-10-01T00:00:00Z"),
      acceptedAt: null,
      declinedAt: null,
      supersededAt: null,
      revokedAt: null,
      acceptedOrderId: null,
      optionSelection: null,
      quoteApproval: null,
    }
    f.state.version = current
    f.state.maxVersion = 3
    f.state.quote = {
      id: "quote-old",
      tenantId: "tenant-1",
      storeId: "store-1",
      sourceType: "SERVICE_REQUEST",
      sourceId: "request-1",
      clientQuoteId: "quote-command-1",
      currentVersionId: current.id,
      currentVersion: current,
    }
    f.state.sourceRow.status = "QUOTED"
    const originalRevision = f.state.sourceRow.revision
    const input = {
      ...reviewedIssueIntent(),
      operation: {
        kind: "revise" as const,
        quoteId: "quote-old",
        quoteVersionId: current.id,
      },
    }
    const checked = await f.review(input)
    const handle = await prepareReviewedCommerceQuoteIssue(
      input,
      checked.target.revision,
      reviewedIssuePublication,
    )
    production()
    f.state.allowWrites = true
    expect(await execute(f, handle)).toMatchObject({
      operation: "revise",
      quoteId: "quote-old",
      quoteVersionId: "version-new",
      version: 4,
      status: "ISSUED",
    })
    expect(current.status).toBe("SUPERSEDED")
    expect(f.state.sourceRow.revision).toBe(originalRevision)
    expect(f.denied).toEqual([])
  })
})
