import { expect, test } from "bun:test"
import { uploadCatalogPhotoDraft } from "./photo-client"

test("an unknown upload outcome retries the same intent and current scope", async () => {
  const bytes = new Uint8Array([1, 2, 3])
  const commands: string[] = []
  let writes = 0
  const input: Parameters<typeof uploadCatalogPhotoDraft>[0] = {
    clientOperationId: "stable-operation",
    storeId: "one",
    contentType: "image/png",
    assertCurrent: () => {},
    readBytes: async () => bytes,
    digest: async () => "a".repeat(64),
    createIntent: async (request) => {
      commands.push(request.clientOperationId)
      return { assetId: "asset-one", state: "UPLOADING" }
    },
    upload: async () => {
      if (++writes === 1) throw new Error("Unknown outcome")
      return { assetId: "asset-one", state: "PENDING_REVIEW" }
    },
  }
  await expect(uploadCatalogPhotoDraft(input)).rejects.toThrow(
    "Unknown outcome",
  )
  expect(await uploadCatalogPhotoDraft(input)).toBe("asset-one")
  expect(commands).toEqual(["stable-operation", "stable-operation"])
})
test("scope changes and removed/conflicting receipts cannot become item photo ids", async () => {
  let current = true
  let writes = 0
  const input: Parameters<typeof uploadCatalogPhotoDraft>[0] = {
    clientOperationId: "stable-operation",
    storeId: "one",
    contentType: "image/png",
    assertCurrent: () => {
      if (!current) throw new Error("Scope changed")
    },
    readBytes: async () => new Uint8Array([1]),
    digest: async () => "a".repeat(64),
    createIntent: async () => {
      current = false
      return { assetId: "asset-one", state: "UPLOADING" }
    },
    upload: async () => {
      writes++
      return { assetId: "asset-two", state: "PENDING_REVIEW" }
    },
  }
  await expect(uploadCatalogPhotoDraft(input)).rejects.toThrow("Scope changed")
  expect(writes).toBe(0)
  current = true
  input.createIntent = async () => ({ assetId: "asset-one", state: "REMOVED" })
  await expect(uploadCatalogPhotoDraft(input)).rejects.toThrow(
    "no longer available",
  )
  input.createIntent = async () => ({
    assetId: "asset-one",
    state: "UPLOADING",
  })
  await expect(uploadCatalogPhotoDraft(input)).rejects.toThrow(
    "could not be confirmed",
  )
})
