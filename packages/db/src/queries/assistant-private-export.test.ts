import { expect, test } from "bun:test"
import {
  type AssistantPrivateExportClient,
  readAssistantPrivateExport,
  validateAssistantPrivateExportSnapshot,
} from "./assistant-private-export"
import {
  AssistantPrivateExportError,
  type AssistantPrivateExportSource,
  ASSISTANT_PRIVATE_EXPORT_LIMITS as limits,
  projectAssistantPrivateExport,
} from "./assistant-private-export-projection"

const now = new Date("2026-10-15T12:00:00.000Z")
const after = new Date("2026-10-16T12:00:00.000Z")
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error("Missing owned fixture row")
  return value
}
const secret = "SYNTHETIC-PRIVATE-PROOF-NEVER-EXPORTED"
function source(): AssistantPrivateExportSource {
  return {
    conversations: [
      {
        id: "chat",
        tenantId: "tenant",
        storeId: "store",
        ownerUserId: "actor",
        purpose: "GENERAL",
        status: "ACTIVE",
        title: "My chat",
        createdAt: now,
        updatedAt: now,
        workflowContext: null,
        setupDraft: {
          revision: 3,
          updatedAt: now,
          entities: [
            {
              id: "entity",
              kind: "PRODUCT",
              state: "PROPOSED",
              payload: {
                kind: "product",
                name: "Own draft",
                unitName: "Piece",
                photoAttachmentId: "private-photo-reference-fixture",
              },
              sortOrder: 0,
              updatedAt: now,
            },
          ],
        },
        messages: [
          {
            id: "message",
            sequence: 1,
            role: "user",
            createdAt: now,
            parts: [
              {
                type: "text",
                text: `My original request Confirm ${"x".repeat(43)} Bearer ${secret} https://private.example.test/?proof=${secret} ${"b".repeat(64)}`,
              },
              {
                type: "data-general-proposal-reference",
                data: {
                  proposalId: "proposal",
                  revision: 1,
                  payloadHash: secret,
                },
              },
              {
                type: "data-general-answer",
                data: {
                  title: "Recorded value",
                  value: "₦1.25",
                  scope: "This Store",
                  asOf: now.toISOString(),
                  detail: "Private saved answer",
                  target: { secret },
                  continuation: { secret },
                  handoff: { approvalToken: secret },
                },
              },
              { type: "tool-result", output: { token: secret } },
            ],
          },
        ],
      },
    ],
    proposals: [
      {
        id: "proposal",
        conversationId: "chat",
        actorUserId: "actor",
        action: "customer_create",
        status: "PENDING",
        revision: 1,
        payload: { action: "customer_create", name: "User staged name" },
        updatedAt: now,
      },
    ],
    attachments: [
      {
        id: "attachment",
        conversationId: "chat",
        tenantId: "tenant",
        storeId: "store",
        actorUserId: "actor",
        kind: "AUDIO",
        status: "READY",
        fileName: "own.wav",
        contentType: "audio/wav",
        sizeBytes: 100,
        transcript: "My recorded words",
        durationMs: 1200,
        retentionUntil: after,
        createdAt: now,
        updatedAt: now,
        contentDigest: "a".repeat(64),
        storageProvider: "local_test",
        storageStoreId: "private-store",
        storagePath: "/never-public/private-object",
        conversation: {
          ownerUserId: "actor",
          tenant: { dataClassification: "QA" },
        },
      },
    ],
    usage: [
      {
        actorUserId: "actor",
        provider: "ewatrade-rehearsal",
        model: "rehearsal",
        requestClass: "transcribe",
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        totalTokens: null,
        audioSeconds: 2,
        imageCount: null,
        outcome: "success",
        createdAt: now,
      },
    ],
    identities: [
      {
        id: "identity",
        userId: "actor",
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    grants: [
      {
        identityId: "identity",
        tenantId: "tenant",
        storeId: "store",
        consentedAt: now,
        expiresAt: after,
        idleExpiresAt: after,
        revokedAt: null,
        updatedAt: now,
        identity: { userId: "actor" },
        membership: { userId: "actor" },
      },
    ],
    inbox: [
      {
        id: "inbox",
        kind: "ACTION",
        state: "COMPLETED",
        receivedAt: now,
        completedAt: now,
        updatedAt: now,
        identity: null,
        binding: {
          identity: { userId: "actor" },
          conversation: { ownerUserId: "actor" },
        },
      },
    ],
    outbox: [
      {
        id: "outbox",
        inboxId: "inbox",
        state: "DELIVERED",
        createdAt: now,
        sentAt: now,
        deliveredAt: now,
        readAt: null,
        updatedAt: now,
      },
    ],
  }
}

function fails(
  build: (input: AssistantPrivateExportSource) => void,
  code: AssistantPrivateExportError["code"],
) {
  const input = source()
  build(input)
  try {
    projectAssistantPrivateExport(input, "actor", now)
    throw Error("Expected export refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(AssistantPrivateExportError)
    expect((error as AssistantPrivateExportError).code).toBe(code)
  }
}

test("private export projects owned content while separating immutable byte targets and protected structured parts", () => {
  const input = source()
  Object.assign(required(input.usage[0]), { approvalToken: secret })
  Object.assign(required(input.attachments[0]), { providerPayload: secret })
  for (const purpose of ["GENERAL", "SETUP", "PRODUCT_CREATE"]) {
    required(input.conversations[0]).purpose = purpose
    const output = projectAssistantPrivateExport(input, "actor", now)
    const json = JSON.stringify(output.manifest)
    expect(output.manifest.version).toBe(1)
    expect(output.manifest.conversations[0]?.purpose).toBe(purpose)
    expect(json).toContain("My original request")
    expect(json).toContain("[decision proof omitted]")
    expect(json).not.toContain("x".repeat(43))
    expect(json).not.toContain("b".repeat(64))
    expect(json).not.toContain("private.example.test")
    expect(json).toContain("My recorded words")
    expect(json).toContain("Own draft")
    expect(json).toContain("User staged name")
    expect(json).toContain("₦1.25")
    for (const forbidden of [
      secret,
      "private-photo-reference-fixture",
      "private-store",
      "/never-public",
      "payloadHash",
      "approvalToken",
      "continuation",
      "providerPayload",
      "target",
      "handoff",
    ])
      expect(json).not.toContain(forbidden)
    expect(output.attachments).toEqual([
      {
        id: "attachment",
        tenantId: "tenant",
        conversationId: "chat",
        contentDigest: "a".repeat(64),
        contentType: "audio/wav",
        sizeBytes: 100,
        storagePath: "/never-public/private-object",
        storageProvider: "local_test",
        storageStoreId: "private-store",
        dataClassification: "QA",
        updatedAt: now,
        retentionUntil: after,
      },
    ])
    expect(
      output.manifest.exclusions.some(
        (item) => item.category === "message_parts",
      ),
    ).toBe(true)
  }
})

test("foreign ownership is refused for all private actor and channel joins", () => {
  for (const alter of [
    (input: AssistantPrivateExportSource) => {
      required(input.conversations[0]).ownerUserId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.proposals[0]).actorUserId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.attachments[0]).actorUserId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.attachments[0]).conversation.ownerUserId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.attachments[0]).storeId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.usage[0]).actorUserId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.identities[0]).userId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.grants[0]).identity.userId = "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(required(input.inbox[0]).binding).conversation.ownerUserId =
        "foreign"
    },
    (input: AssistantPrivateExportSource) => {
      required(input.outbox[0]).inboxId = "foreign"
    },
  ])
    fails(alter, "SHARED_SCOPE_REVIEW_REQUIRED")
})

test("row, JSON and original-byte bounds refuse the whole export without truncating or returning downloads", () => {
  fails((input) => {
    input.conversations = Array.from({ length: limits.conversations + 1 }, () =>
      required(input.conversations[0]),
    )
  }, "EXPORT_LIMIT")
  fails((input) => {
    required(input.conversations[0]).messages = Array.from(
      { length: limits.messages + 1 },
      () => required(required(input.conversations[0]).messages[0]),
    )
  }, "EXPORT_LIMIT")
  fails((input) => {
    required(input.attachments[0]).sizeBytes = limits.originalBytes + 1
  }, "EXPORT_LIMIT")
  fails((input) => {
    required(input.conversations[0]).messages = Array.from(
      { length: 140 },
      (_, sequence) => ({
        id: String(sequence),
        sequence,
        role: "user",
        createdAt: now,
        parts: [{ type: "text", text: "x".repeat(16000) }],
      }),
    )
  }, "EXPORT_LIMIT")
})

test("expired and missing original ownership stay explicit; expiry changes the response snapshot", () => {
  const input = source()
  const original = projectAssistantPrivateExport(input, "actor", now)
  const expired = projectAssistantPrivateExport(input, "actor", after)
  expect(expired.attachments).toEqual([])
  expect(expired.manifest.attachments[0]?.original.availability).toBe("expired")
  expect(expired.manifest.attachments[0]?.transcript).toBeNull()
  expect(expired.snapshotDigest).not.toBe(original.snapshotDigest)
  required(input.attachments[0]).storageStoreId = null
  const unavailable = projectAssistantPrivateExport(input, "actor", now)
  expect(unavailable.attachments).toEqual([])
  expect(unavailable.manifest.attachments[0]?.original.availability).toBe(
    "unavailable",
  )
})

test("invalid legacy draft or structured credentials never become raw JSON fallback", () => {
  const input = source()
  required(input.proposals[0]).payload = {
    action: "customer_create",
    name: "Own",
    approvalToken: secret,
  }
  required(
    required(required(input.conversations[0]).setupDraft).entities[0],
  ).payload = {
    kind: "product",
    privateUrl: secret,
  }
  required(input.conversations[0]).workflowContext = {
    snapshot: { token: secret },
    handoffDigest: secret,
  }
  const output = projectAssistantPrivateExport(input, "actor", now)
  expect(output.manifest.proposals[0]?.payload).toBeNull()
  expect(
    output.manifest.conversations[0]?.setupDraft?.entities[0]?.payload,
  ).toBeNull()
  expect(output.manifest.conversations[0]?.productForm).toBeNull()
  expect(JSON.stringify(output.manifest)).not.toContain(secret)
  expect(output.manifest.exclusions.map((row) => row.category)).toEqual(
    expect.arrayContaining([
      "proposal_payload",
      "draft_payload",
      "workflow_context",
    ]),
  )
})

function database(
  input: AssistantPrivateExportSource,
  status = "RECEIVED",
  mixed = 0,
) {
  const calls: string[] = []
  const tables = {
    accountPrivacyRequest: {
      findUnique: async (query: unknown) => {
        expect(query).toEqual({
          where: { requestKey: "account-deletion:actor" },
          select: { status: true },
        })
        return { status }
      },
    },
    assistantRun: {
      count: async (query: unknown) => {
        calls.push("actor-check")
        expect(JSON.stringify(query)).toContain('"ownerUserId":{"not":"actor"}')
        return mixed
      },
    },
  }
  const record = (
    name: string,
    rows: unknown[] | (() => unknown[]),
    extra = {},
  ) => ({
    ...extra,
    findMany: async (query: {
      take: number
      where: unknown
      select: unknown
    }) => {
      calls.push(name)
      expect(query.take).toBeGreaterThan(0)
      expect(JSON.stringify(query.where)).toContain("actor")
      expect(query.select).toBeDefined()
      return typeof rows === "function" ? rows() : rows
    },
  })
  const db = {
    ...tables,
    assistantConversation: record("conversation", () =>
      input.conversations.map(
        ({ messages: _messages, setupDraft, ...row }) => ({
          ...row,
          setupDraft: setupDraft ? { ...setupDraft, id: "draft" } : null,
        }),
      ),
    ),
    assistantMessage: record("messages", () =>
      input.conversations.flatMap((row) =>
        row.messages.map((message) => ({ ...message, conversationId: row.id })),
      ),
    ),
    setupDraftEntity: record("entities", () =>
      input.conversations.flatMap(
        (row) =>
          row.setupDraft?.entities.map((entity) => ({
            ...entity,
            draftId: "draft",
          })) ?? [],
      ),
    ),
    assistantActionProposal: record(
      "proposal",
      input.proposals,
      tables.assistantRun,
    ),
    assistantAttachment: record(
      "attachment",
      input.attachments,
      tables.assistantRun,
    ),
    assistantUsageEvent: record("usage", input.usage),
    assistantWhatsAppIdentity: record("identity", input.identities),
    assistantWhatsAppGrant: record("grant", input.grants),
    assistantWhatsAppInbox: record("inbox", input.inbox),
    assistantWhatsAppOutbox: record("outbox", input.outbox),
  } as unknown as AssistantPrivateExportClient
  return { db, calls }
}

test("actual query privacy/attribution fences run before content and final snapshot refuses changed or expired sources", async () => {
  for (const status of ["PROCESSING", "COMPLETED"]) {
    const { db, calls } = database(source(), status)
    await expect(
      readAssistantPrivateExport(db, "actor", { now }),
    ).rejects.toMatchObject({ code: "PRIVACY_BLOCKED" })
    expect(calls).toEqual([])
  }
  const foreign = database(source(), "RECEIVED", 1)
  await expect(
    readAssistantPrivateExport(foreign.db, "actor", { now }),
  ).rejects.toMatchObject({ code: "SHARED_SCOPE_REVIEW_REQUIRED" })
  expect(foreign.calls).not.toContain("conversation")
  const input = source()
  const { db } = database(input)
  const first = await readAssistantPrivateExport(db, "actor", { now })
  await expect(
    validateAssistantPrivateExportSnapshot(db, "actor", first.snapshotDigest, {
      now,
    }),
  ).resolves.toMatchObject({ snapshotDigest: first.snapshotDigest })
  await expect(
    validateAssistantPrivateExportSnapshot(db, "actor", first.snapshotDigest, {
      now: after,
    }),
  ).rejects.toMatchObject({ code: "SCOPE_CHANGED" })
  required(required(input.conversations[0]).messages[0]).parts = [
    { type: "text", text: "Fresh source changed" },
  ]
  await expect(
    validateAssistantPrivateExportSnapshot(db, "actor", first.snapshotDigest, {
      now,
    }),
  ).rejects.toMatchObject({ code: "SCOPE_CHANGED" })
})
