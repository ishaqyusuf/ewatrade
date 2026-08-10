import { describe, expect, test } from "bun:test"

import { storeStaffServiceCommerceMediaUpload } from "./media-upload"

describe("staff Service Commerce media upload", () => {
  test("verifies bytes before private storage and enqueues identifier-only safety", async () => {
    const calls: unknown[] = []
    const result = await storeStaffServiceCommerceMediaUpload(
      {
        actorUserId: "attendant_1",
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
        clientMediaId: "client_media_1",
        fileName: "red-bag.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        source: { id: "inquiry_1", kind: "commerce_inquiry" },
        sourceLineId: "line_1",
        sourceVersion: "source_version_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
      {
        enqueueSafety: async (input) => calls.push(["enqueue", input]),
        record: async (input) => {
          calls.push(["record", input.signatureMimeType])
          return {
            attachment: { id: "attachment_1" },
            media: { id: "media_1", lifecycle: "pending_upload" },
            replayed: false,
          } as never
        },
        recordStored: async (input) => calls.push(["stored", input.objectKey]),
        requestSafety: async (input) =>
          calls.push(["safety", input.mediaAssetId]),
        store: async () => ({ storageReference: "private:media_1" }),
      },
    )

    expect(result).toMatchObject({ replayed: false })
    expect(calls).toEqual([
      ["record", "image/jpeg"],
      ["stored", "private:media_1"],
      ["safety", "media_1"],
      [
        "enqueue",
        {
          mediaAssetId: "media_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
      ],
    ])
  })
})
