import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PrivateObjectStorageError } from "./object-storage"
import { createOrderVideoStorage, parseVideoRange } from "./order-videos"

describe("Range header", () => {
  test("reads start-end, open ends and suffixes", () => {
    expect(parseVideoRange(null, 100)).toBeNull()
    expect(parseVideoRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 })
    expect(parseVideoRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 })
    expect(parseVideoRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 })
    expect(parseVideoRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 })
  })

  test("refuses ranges past the end", () => {
    expect(parseVideoRange("bytes=100-", 100)).toBe("unsatisfiable")
    expect(parseVideoRange("bytes=9-3", 100)).toBe("unsatisfiable")
    expect(parseVideoRange("items=0-1", 100)).toBeNull()
  })
})

describe("QA videos in the local test store", async () => {
  const root = await mkdtemp(join(tmpdir(), "order-videos-"))
  afterAll(() => rm(root, { recursive: true, force: true }))
  const environment = { APP_ENV: "local", LOCAL_PRIVATE_OBJECTS_DIR: root }
  // A 12-byte MP4 header followed by some payload.
  const bytes = Uint8Array.from([
    0,
    0,
    0,
    24,
    0x66,
    0x74,
    0x79,
    0x70,
    0x69,
    0x73,
    0x6f,
    0x6d,
    ...Array.from({ length: 52 }, (_, index) => index),
  ])
  const target = (
    overrides: Partial<{ contentDigest: string; id: string }>,
  ) => ({
    tenantId: "tenant",
    orderId: "order",
    attachmentId: overrides.id ?? "video",
    contentDigest:
      overrides.contentDigest ??
      createHash("sha256").update(bytes).digest("hex"),
    contentType: "video/mp4",
    sizeBytes: bytes.byteLength,
  })
  const body = (value: Uint8Array) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(value.subarray(0, 20))
        controller.enqueue(value.subarray(20))
        controller.close()
      },
    })

  test("keeps a video whose size, digest and signature match", async () => {
    const storage = createOrderVideoStorage("QA", environment)
    if (storage.mode !== "api") throw new Error("expected the local store")
    const saved = await storage.write(target({}), body(bytes))
    expect(saved.storagePath).toEndWith(".mp4")

    const whole = await storage.open(target({}), null)
    expect(whole.status).toBe(200)
    expect(
      new Uint8Array(await new Response(whole.body).arrayBuffer()),
    ).toEqual(bytes)

    const part = await storage.open(target({}), { start: 4, end: 7 })
    expect(part.status).toBe(206)
    expect(part.contentRange).toBe(`bytes 4-7/${bytes.byteLength}`)
    expect(
      new TextDecoder().decode(await new Response(part.body).arrayBuffer()),
    ).toBe("ftyp")
  })

  test("refuses bytes that don't match the intent", async () => {
    const storage = createOrderVideoStorage("QA", environment)
    if (storage.mode !== "api") throw new Error("expected the local store")
    await expect(
      storage.write(
        target({ id: "wrong", contentDigest: "a".repeat(64) }),
        body(bytes),
      ),
    ).rejects.toBeInstanceOf(PrivateObjectStorageError)
  })
})
