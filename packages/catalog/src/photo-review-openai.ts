import { Buffer } from "node:buffer"
import type { CatalogPhotoReviewProvider } from "./photo-review"

// Pin the snapshot so the stored policy names the model that actually ran.
const model = "omni-moderation-2024-09-26"
const imageCategories = [
  "sexual",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
] as const
const unavailable = () => new Error("Catalog image review is unavailable.")

function apiKey() {
  if ("window" in globalThis) throw unavailable()
  return (
    process.env.CATALOG_PHOTO_REVIEW_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim()
  )
}

export function isCatalogPhotoReviewConfigured() {
  return (
    process.env.CATALOG_PHOTO_REVIEW_ENABLED === "true" && Boolean(apiKey())
  )
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw unavailable()
  return value as Record<string, unknown>
}

async function readResult(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw unavailable()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 64 * 1024) throw unavailable()
      chunks.push(chunk.value)
    }
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")))
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Server-only image moderation. Unsupported text-only categories do not grant
 * marketplace/legal approval. Invalid/partial responses leave the asset pending. */
export function createOpenAiCatalogPhotoReviewProvider(): CatalogPhotoReviewProvider {
  const key = apiKey()
  if (!isCatalogPhotoReviewConfigured() || !key) throw unavailable()
  return {
    id: "openai_moderation",
    policyVersion: `catalog-image-v1.${model}`,
    async inspect({ bytes, contentType, signal }) {
      try {
        if (
          contentType !== "image/webp" ||
          !bytes.length ||
          bytes.length > 10 * 1024 * 1024
        )
          throw unavailable()
        signal.throwIfAborted()
        const response = await fetch("https://api.openai.com/v1/moderations", {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/webp;base64,${Buffer.from(bytes).toString("base64")}`,
                },
              },
            ],
          }),
        })
        const result = await readResult(response, signal)
        if (
          result.model !== model ||
          !Array.isArray(result.results) ||
          result.results.length !== 1
        )
          throw unavailable()
        const decision = object(result.results[0])
        if (typeof decision.flagged !== "boolean") throw unavailable()
        const categories = object(decision.categories)
        const scores = object(decision.category_scores)
        const applied = object(decision.category_applied_input_types)
        for (const category of imageCategories) {
          const score = scores[category]
          const types = applied[category]
          if (
            typeof categories[category] !== "boolean" ||
            typeof score !== "number" ||
            !Number.isFinite(score) ||
            score < 0 ||
            score > 1 ||
            !Array.isArray(types) ||
            !types.includes("image")
          )
            throw unavailable()
        }
        if (
          Object.values(categories).some((value) => typeof value !== "boolean")
        )
          throw unavailable()
        return decision.flagged ||
          Object.values(categories).some((value) => value === true)
          ? "REJECTED"
          : "APPROVED"
      } catch {
        // Never propagate a credential, image, response body or provider exception.
        throw unavailable()
      }
    },
  }
}
