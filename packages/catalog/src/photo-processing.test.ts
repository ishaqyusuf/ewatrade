import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import sharp from "sharp"
import { processCatalogPhoto } from "./photo-processing"

describe("Catalog image processing", () => {
  test("preserves the whole subject, bounds dimensions and derives verified thumbnails", async () => {
    const bytes = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 80, g: 140, b: 60 },
      },
    })
      .png()
      .toBuffer()
    const result = await processCatalogPhoto({
      bytes,
      contentType: "image/png",
    })
    expect([result.display.width, result.display.height]).toEqual([1600, 800])
    expect([result.thumbnail.width, result.thumbnail.height]).toEqual([
      320, 160,
    ])
    for (const photo of Object.values(result)) {
      expect(photo.contentType).toBe("image/webp")
      expect(photo.contentDigest).toBe(
        createHash("sha256").update(photo.bytes).digest("hex"),
      )
      expect(photo.sizeBytes).toBe(photo.bytes.byteLength)
      expect((await sharp(photo.bytes).metadata()).format).toBe("webp")
    }
  })
  test("applies orientation and removes EXIF, without enlarging small photos", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const result = await processCatalogPhoto({
      bytes,
      contentType: "image/jpeg",
    })
    expect([result.display.width, result.display.height]).toEqual([20, 40])
    const metadata = await sharp(result.display.bytes).metadata()
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(metadata.orientation).toBeUndefined()
  })
  test("decodes an owned HEIC fixture into portable WebP", async () => {
    const bytes = await readFile(
      new URL("./fixtures/catalog-owned.heic", import.meta.url),
    )
    const result = await processCatalogPhoto({
      bytes,
      contentType: "image/heic",
    })
    expect([result.display.width, result.display.height]).toEqual([128, 192])
    expect((await sharp(result.display.bytes).metadata()).format).toBe("webp")
  })
  test("rejects truncated signatures, mislabeled content, pixel bombs and cancellation", async () => {
    const valid = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer()
    await expect(
      processCatalogPhoto({
        bytes: valid.subarray(0, 8),
        contentType: "image/png",
      }),
    ).rejects.toThrow("could not be processed")
    await expect(
      processCatalogPhoto({ bytes: valid, contentType: "image/jpeg" }),
    ).rejects.toThrow("could not be processed")
    const huge = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: "red" },
    })
      .png()
      .toBuffer()
    await expect(
      processCatalogPhoto({ bytes: huge, contentType: "image/png" }),
    ).rejects.toThrow("could not be processed")
    await expect(
      processCatalogPhoto({
        bytes: valid,
        contentType: "image/png",
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow("could not be processed")
    await expect(
      processCatalogPhoto({
        bytes: new Uint8Array(12),
        contentType: "image/heic",
      }),
    ).rejects.toThrow("could not be processed")
  })
})
