import { expect, test } from "bun:test"
import type { GetBlobResult } from "@vercel/blob"
import { createVercelPrivateObjectPort } from "./vercel-blob"
const env = {
  BLOB_STORE_ID: "store_synthetic",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_synthetic_not-a-real-token",
}
const options = {
  access: "private" as const,
  abortSignal: AbortSignal.timeout(1000),
  useCache: false as const,
}
function storage(result: GetBlobResult | null) {
  return createVercelPrivateObjectPort(env, {
    get: async () => result,
    put: async () => {
      throw Error("write must not be called")
    },
    del: async () => {
      throw Error("delete must not be called")
    },
  }).port
}
test("conditional 304 is not accepted as proof private bytes are absent", async () => {
  const response: GetBlobResult = {
    statusCode: 304,
    stream: null,
    headers: new Headers(),
    blob: {
      url: "https://synthetic.private.blob.vercel-storage.com/original",
      downloadUrl: "https://synthetic.private.blob.vercel-storage.com/original",
      pathname: "original",
      contentDisposition: "attachment",
      cacheControl: "private",
      uploadedAt: new Date(),
      etag: "synthetic",
      contentType: null,
      size: null,
    },
  }
  await expect(
    storage(response).get("original", options),
  ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
  expect(await storage(null).get("original", options)).toBeNull()
})
