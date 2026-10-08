import { describe, expect, mock, test } from "bun:test"

const sent = mock(async () => null as unknown)
const createIntent = mock(async () => {
  throw new Error("A Catalog upload must not be opened for this photo.")
})

mock.module("@ewatrade/db/assistant-attachments", () => ({
  readSentAssistantAttachment: sent,
}))
mock.module("@ewatrade/db/catalog-photos", () => ({
  createCatalogPhotoIntent: createIntent,
  getCatalogPhotoUploadTarget: mock(async () => ({})),
  recordVerifiedCatalogPhotoUpload: mock(async () => ({})),
}))

const { prepareSetupProductPhoto, SETUP_PHOTO_NOT_ADDED } = await import(
  "./setup-photo"
)

const scope = {
  tenantId: "tenant_1",
  storeId: "store_1",
  userId: "user_1",
  dataClassification: "LIVE" as const,
}
const input = {
  entityId: "ent_1",
  conversationId: "conv_1",
  attachmentId: "att_1",
}
const photo = {
  id: "att_1",
  tenantId: "tenant_1",
  conversationId: "conv_1",
  kind: "IMAGE",
  contentType: "image/png",
  contentDigest: "a".repeat(64),
  sizeBytes: 1024,
}

describe("setup product photos", () => {
  test("an expired or byte-less photo is skipped before any Catalog upload", async () => {
    for (const row of [
      { ...photo, storagePath: null, errorCode: "RETENTION_EXPIRED" },
      {
        ...photo,
        storagePath: "assistant/x.png",
        errorCode: "RETENTION_EXPIRED",
      },
      { ...photo, storagePath: null, errorCode: null },
    ]) {
      sent.mockImplementationOnce(async () => row)
      const result = await prepareSetupProductPhoto({} as never, scope, input)
      expect(result).toEqual({ skipped: SETUP_PHOTO_NOT_ADDED })
    }
    expect(createIntent).not.toHaveBeenCalled()
  })

  test("QA businesses and missing or non-image files add the product without a photo", async () => {
    expect(
      await prepareSetupProductPhoto(
        {} as never,
        { ...scope, dataClassification: "QA" },
        input,
      ),
    ).toEqual({ skipped: SETUP_PHOTO_NOT_ADDED })
    sent.mockImplementationOnce(async () => null)
    expect(await prepareSetupProductPhoto({} as never, scope, input)).toEqual({
      skipped: SETUP_PHOTO_NOT_ADDED,
    })
    sent.mockImplementationOnce(async () => ({
      ...photo,
      kind: "PDF",
      storagePath: "assistant/x.pdf",
      errorCode: null,
    }))
    expect(await prepareSetupProductPhoto({} as never, scope, input)).toEqual({
      skipped: SETUP_PHOTO_NOT_ADDED,
    })
    expect(createIntent).not.toHaveBeenCalled()
  })
})
