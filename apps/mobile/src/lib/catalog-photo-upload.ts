import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { uploadCatalogPhotoDraft } from "@ewatrade/catalog/photo-client"
import type { CatalogPhotoContentType } from "@ewatrade/catalog/photo-contracts"
import * as Crypto from "expo-crypto"
import { File } from "expo-file-system"
import { fetch } from "expo/fetch"
import { getBaseUrl } from "./base-url"
import { getSession } from "./session-store"

export async function uploadMobileCatalogPhoto(input: {
  image: { uri: string; mimeType: string }
  clientOperationId: string
  storeId: string
  assertCurrent(): void
  createIntent(
    input: RouterInputs["catalog"]["photos"]["createIntent"],
  ): Promise<{ assetId: string; state: string }>
}) {
  const session = getSession()
  if (!session?.token || !session.profile.businessSlug)
    throw new Error("Sign in again before uploading a photo.")
  const headers = {
    "x-app-authorization": `Bearer ${session.token}`,
    "x-tenant-slug": session.profile.businessSlug,
    "x-store-id": input.storeId,
    "x-trpc-source": "mobile",
  }
  const assertCurrent = () => {
    input.assertCurrent()
    const current = getSession()
    if (
      current?.token !== session.token ||
      current.profile.businessId !== session.profile.businessId ||
      current.profile.id !== session.profile.id
    )
      throw new Error(
        "Account or business changed. Reopen this item before uploading.",
      )
  }
  return uploadCatalogPhotoDraft({
    ...input,
    contentType: input.image.mimeType,
    assertCurrent,
    readBytes: () => new File(input.image.uri).bytes(),
    digest: async (bytes) => {
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      const digest = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        buffer,
      )
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")
    },
    upload: async (assetId, bytes, contentType: CatalogPhotoContentType) => {
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      const response = await fetch(
        `${getBaseUrl()}/api/catalog/photos/${encodeURIComponent(assetId)}/upload?storeId=${encodeURIComponent(input.storeId)}`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": contentType },
          body: buffer,
          signal: AbortSignal.timeout(90_000),
        },
      )
      const result: unknown = await response.json()
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Photo upload failed. Your draft is unchanged."
        throw new Error(message)
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("assetId" in result) ||
        typeof result.assetId !== "string" ||
        !("state" in result) ||
        typeof result.state !== "string"
      )
        throw new Error(
          "Photo upload could not be confirmed. Retry the same photo.",
        )
      return { assetId: result.assetId, state: result.state }
    },
  })
}
