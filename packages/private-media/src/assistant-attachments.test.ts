import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  acceptsAssistantAttachmentBytes,
  assistantAttachmentStoragePath,
  createAssistantAttachmentStorage,
} from "./assistant-attachments"
import { createLocalTestPrivateObjectPort } from "./local-test-object-port"
import { readVerifiedUpload } from "./verified-upload"

const utf8 = (text: string) => new TextEncoder().encode(text)
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
])

function upload(bytes: Uint8Array, contentType: string, length = bytes.length) {
  return new Request("https://api.test/upload", {
    method: "PUT",
    body: new Blob([Uint8Array.from(bytes)]),
    headers: { "content-type": contentType, "content-length": String(length) },
  })
}

describe("verified upload", () => {
  const csv = utf8("Item,Price\nEggs,4500\n")
  const original = {
    sizeBytes: csv.length,
    contentDigest: sha(csv),
    contentType: "text/csv",
  }
  const options = {
    maxBytes: 1024,
    accepts: acceptsAssistantAttachmentBytes,
  }

  test("accepts exactly the promised bytes", async () => {
    const bytes = await readVerifiedUpload(
      upload(csv, "text/csv"),
      original,
      options,
    )
    expect(new TextDecoder().decode(bytes)).toContain("Eggs,4500")
  })

  test("refuses other bytes, another type header or an oversized intent", async () => {
    await expect(
      readVerifiedUpload(
        upload(utf8("Item,Price\nEggs,9999\n"), "text/csv"),
        original,
        options,
      ),
    ).rejects.toThrow("must match")
    await expect(
      readVerifiedUpload(upload(csv, "text/plain"), original, options),
    ).rejects.toThrow("must match")
    await expect(
      readVerifiedUpload(
        upload(csv, "text/csv"),
        { ...original, sizeBytes: 4096 },
        options,
      ),
    ).rejects.toThrow("too large")
  })
})

describe("attachment bytes", () => {
  test("binary types must match their signature, text must be UTF-8", () => {
    expect(acceptsAssistantAttachmentBytes(png, "image/png")).toBe(true)
    expect(acceptsAssistantAttachmentBytes(png, "image/jpeg")).toBe(false)
    expect(
      acceptsAssistantAttachmentBytes(
        new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true)
    expect(acceptsAssistantAttachmentBytes(utf8("a,b"), "text/csv")).toBe(true)
    expect(
      acceptsAssistantAttachmentBytes(
        new Uint8Array([0xff, 0xfe, 0]),
        "text/csv",
      ),
    ).toBe(false)
    expect(
      acceptsAssistantAttachmentBytes(png, "application/x-msdownload"),
    ).toBe(false)
  })

  test("storage paths are scoped and refuse unsafe identifiers", () => {
    const digest = sha(png)
    expect(
      assistantAttachmentStoragePath({
        tenantId: "tenant_1",
        conversationId: "conv_1",
        attachmentId: "att_1",
        contentDigest: digest,
        contentType: "image/png",
      }),
    ).toBe(`assistant/attachments/tenant_1/conv_1/att_1/${digest}.png`)
    expect(() =>
      assistantAttachmentStoragePath({
        tenantId: "../other",
        conversationId: "conv_1",
        attachmentId: "att_1",
        contentDigest: digest,
        contentType: "image/png",
      }),
    ).toThrow()
  })
})

describe("QA storage test adapter", () => {
  const target = {
    tenantId: "tenant_qa",
    conversationId: "conv_1",
    attachmentId: "att_1",
    contentDigest: sha(png),
    contentType: "image/png",
    sizeBytes: png.length,
  }

  async function storage(environment: Record<string, string> = {}) {
    const rootDir = await mkdtemp(join(tmpdir(), "assistant-attachments-"))
    const port = createLocalTestPrivateObjectPort<string>({
      rootDir,
      environment,
    })
    return createAssistantAttachmentStorage(
      { ...port, provider: "local_test", mode: "test" },
      "QA",
    )
  }

  test("round-trips verified bytes and replays the same object safely", async () => {
    const objects = await storage()
    await objects.stage({ target, bytes: png })
    await objects.stage({ target, bytes: png })
    expect(Array.from(await objects.read({ target }))).toEqual(Array.from(png))
  })

  test("is unavailable in production", async () => {
    const objects = await storage({ APP_ENV: "production" })
    await expect(objects.stage({ target, bytes: png })).rejects.toThrow()
  })

  test("QA data can never use the live adapter", async () => {
    const port = createLocalTestPrivateObjectPort<string>()
    expect(() =>
      createAssistantAttachmentStorage(
        { ...port, provider: "vercel_blob_private", mode: "live" },
        "QA",
      ),
    ).toThrow()
  })
})
