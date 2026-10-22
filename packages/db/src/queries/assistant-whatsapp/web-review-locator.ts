import { createHash } from "node:crypto"
import {
  WHATSAPP_WEB_REVIEW_VERSION,
  assistantReviewShortLocatorSchema,
} from "@ewatrade/assistant/channels/review-links"
import type { DbClient } from "../types"
import {
  assistantReviewShortOutboxId,
  assistantReviewTokenFromBody,
  createAssistantReviewShortLocator,
  readAssistantReviewLinkToken,
} from "./web-review-token"

type ShortReviewRow = {
  id: string
  inboxId: string
  renderKind: string
  rendererVersion: string
  chunkIndex: number
  chunkCount: number
  content: string | null
  contentDigest: string
  expiresAt: Date
}

/** Pure provenance check only; callers must still recheck browser identity and canonical authority. */
export function readAssistantReviewShortSource(
  locator: string,
  row: ShortReviewRow | null,
  secret?: string,
) {
  if (!assistantReviewShortLocatorSchema.safeParse(locator).success || !row)
    return undefined
  if (
    row.id !== assistantReviewShortOutboxId(locator) ||
    row.renderKind !== "web_review" ||
    row.rendererVersion !== WHATSAPP_WEB_REVIEW_VERSION ||
    row.chunkCount !== 1 ||
    row.chunkIndex !== 0 ||
    !row.content ||
    createHash("sha256").update(row.content).digest("hex") !== row.contentDigest
  )
    return undefined
  const token = assistantReviewTokenFromBody(row.content)
  const source = token ? readAssistantReviewLinkToken(token, secret) : undefined
  if (
    !source ||
    !token ||
    createAssistantReviewShortLocator(token, secret) !== locator ||
    source.inboxId !== row.inboxId ||
    source.expiresAt !== row.expiresAt.getTime()
  )
    return undefined
  return source
}

/** Authenticated review services only: a handle is navigation, never proof of permission. */
export async function readAssistantReviewLinkLocator(
  db: DbClient,
  locator: string,
) {
  if (!assistantReviewShortLocatorSchema.safeParse(locator).success)
    return readAssistantReviewLinkToken(locator)
  const row = await db.assistantWhatsAppOutbox.findUnique({
    where: { id: assistantReviewShortOutboxId(locator) },
    select: {
      id: true,
      inboxId: true,
      renderKind: true,
      rendererVersion: true,
      chunkIndex: true,
      chunkCount: true,
      content: true,
      contentDigest: true,
      expiresAt: true,
    },
  })
  return readAssistantReviewShortSource(locator, row)
}
