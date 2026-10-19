import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"
import { Hono } from "hono"
import {
  AssistantPrivateExportError,
  type AssistantPrivateExportSource,
  projectAssistantPrivateExport,
} from "../../../../packages/db/src/queries/assistant-private-export-projection"
import {
  type AssistantPrivateExportDependencies,
  assistantPrivateExportResponse,
} from "./assistant-export"

function fixture() {
  const now = new Date()
  const future = new Date(now.getTime() + 60_000)
  const bytes = new TextEncoder().encode("Synthetic owned original bytes")
  const source: AssistantPrivateExportSource = {
    conversations: [
      {
        id: "chat",
        ownerUserId: "actor",
        tenantId: "tenant",
        storeId: "store",
        purpose: "GENERAL",
        status: "ACTIVE",
        title: "Own chat",
        createdAt: now,
        updatedAt: now,
        workflowContext: null,
        setupDraft: null,
        messages: [
          {
            id: "message",
            sequence: 1,
            role: "user",
            parts: [{ type: "text", text: "My own request" }],
            createdAt: now,
          },
        ],
      },
    ],
    attachments: [
      {
        id: "original",
        conversationId: "chat",
        tenantId: "tenant",
        storeId: "store",
        actorUserId: "actor",
        kind: "FILE",
        status: "READY",
        fileName: "own.txt",
        contentType: "text/plain",
        sizeBytes: bytes.byteLength,
        transcript: null,
        durationMs: null,
        retentionUntil: future,
        createdAt: now,
        updatedAt: now,
        contentDigest: createHash("sha256").update(bytes).digest("hex"),
        storageProvider: "local_test",
        storageStoreId: "internal-store",
        storagePath: "PRIVATE_INTERNAL_PATH",
        conversation: {
          ownerUserId: "actor",
          tenant: { dataClassification: "QA" },
        },
      },
    ],
    proposals: [],
    usage: [],
    identities: [],
    grants: [],
    inbox: [],
    outbox: [],
  }
  let active = true
  let privacy: string | null = null
  let reads = 0
  const deps: AssistantPrivateExportDependencies = {
    context: async () =>
      ({
        session: {
          user: { id: "actor" },
          session: { id: "session", token: "synthetic-private-session" },
        },
        qaSessionScope: null,
        isInternalRequest: false,
        db: {
          session: {
            findFirst: async () =>
              active ? { userId: "actor", createdAt: now } : null,
          },
          accountPrivacyRequest: {
            findUnique: async () => (privacy ? { status: privacy } : null),
          },
        },
      }) as never,
    read: async (_db, userId) =>
      projectAssistantPrivateExport(source, userId, new Date()),
    validate: async (_db, userId, digest) => {
      const current = projectAssistantPrivateExport(source, userId, new Date())
      if (current.snapshotDigest !== digest)
        throw new AssistantPrivateExportError("SCOPE_CHANGED")
      return current
    },
    readOriginal: async () => {
      reads += 1
      return bytes
    },
  }
  const app = new Hono()
  app.get("/export", (context) => assistantPrivateExportResponse(context, deps))
  return {
    app,
    deps,
    source,
    bytes,
    reads: () => reads,
    revoke: () => {
      active = false
    },
    block: () => {
      privacy = "PROCESSING"
    },
  }
}

test("HTTP export includes exact original bytes and owned presentation, with no internal storage or Session fields", async () => {
  const owned = fixture()
  const response = await owned.app.request("/export")
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("content-disposition")).toContain("attachment;")
  const body = await response.json()
  expect(body.scope).toBe("own_private_assistant")
  expect(body.conversations[0].messages[0].parts[0].text).toBe("My own request")
  expect(body.originals).toEqual([
    {
      attachmentId: "original",
      availability: "available",
      encoding: "base64",
      content: Buffer.from(owned.bytes).toString("base64"),
    },
  ])
  const serialized = JSON.stringify(body)
  for (const secret of [
    "PRIVATE_INTERNAL_PATH",
    "internal-store",
    "synthetic-private-session",
    "snapshotDigest",
    "contentDigest",
  ])
    expect(serialized).not.toContain(secret)
})

test("a removed original is explicit, while unavailable storage and integrity failures never return a partial archive", async () => {
  const missing = fixture()
  missing.deps.readOriginal = async () => {
    throw new PrivateObjectStorageError("OBJECT_NOT_FOUND")
  }
  const response = await missing.app.request("/export")
  expect(response.status).toBe(200)
  expect((await response.json()).originals).toEqual([
    {
      attachmentId: "original",
      availability: "unavailable",
      reason: "The original object is no longer retained.",
    },
  ])
  for (const failure of ["storage", "integrity"]) {
    const owned = fixture()
    owned.deps.readOriginal = async () => {
      if (failure === "storage") throw Error("PRIVATE_PROVIDER_SECRET")
      return new Uint8Array([0])
    }
    const refused = await owned.app.request("/export")
    expect(refused.status).toBe(503)
    const text = await refused.text()
    expect(text).not.toContain("PRIVATE_PROVIDER_SECRET")
    expect(text).not.toContain("originals")
    expect(refused.headers.get("content-disposition")).toBeNull()
  }
})

test("revocation, privacy processing, source edits and retention expiry during bytes I/O refuse the whole download", async () => {
  for (const change of ["session", "privacy", "source", "retention"]) {
    const owned = fixture()
    const chat = owned.source.conversations[0]
    const attachment = owned.source.attachments[0]
    if (!chat || !attachment) throw Error("Expected exact owned export fixture")
    owned.deps.readOriginal = async () => {
      if (change === "session") owned.revoke()
      if (change === "privacy") owned.block()
      if (change === "source") chat.updatedAt = new Date(Date.now() + 1)
      if (change === "retention") attachment.retentionUntil = new Date(0)
      return owned.bytes
    }
    const response = await owned.app.request("/export")
    expect(response.status).toBe(
      change === "session" ? 401 : change === "privacy" ? 403 : 409,
    )
    expect(response.headers.get("content-disposition")).toBeNull()
    expect(await response.text()).not.toContain("originals")
  }
})
