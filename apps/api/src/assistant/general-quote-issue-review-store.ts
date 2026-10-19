import { types } from "node:util"
import { CommerceQuoteCompleteReviewUnavailableError } from "@ewatrade/db/commerce-quote-issue-review"
import { assertCommerceQuoteReviewBudget } from "@ewatrade/db/commerce-quote-review-budget"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import {
  type GeneralQuoteIssueDraftScope,
  readGeneralQuoteIssueDraftInTransaction,
} from "./general-quote-issue-draft-store"
import {
  type QuoteReviewManifest,
  type QuoteReviewPage,
  createGeneralQuoteIssueReviewPacket,
} from "./general-quote-issue-review-pages"

/** Parsed semantic request budget; actual HTTP/body admission remains mandatory. */
export const QUOTE_REVIEW_STORE_REQUEST_MAX_BYTES = 4096
const identity = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value.trim() === value)
const revision = z.number().int().min(1).max(2_147_483_647)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const requestSchema = z
  .object({ conversationId: identity, draftRef: identity, revision })
  .strict()
const pageRequestSchema = requestSchema
  .extend({ packetId: hash, pageId: hash })
  .strict()
const scopeSchema = z
  .object({
    actorUserId: identity.max(128),
    tenantId: identity.max(128),
    storeId: identity.max(128),
  })
  .strict()

export type GeneralQuoteIssueReviewStoreUnavailable = {
  kind: "unavailable"
  reason:
    | "invalid_request"
    | "unavailable"
    | "stale_review"
    | "review_too_large"
    | "envelope_too_large"
}
function unavailable(
  reason: GeneralQuoteIssueReviewStoreUnavailable["reason"],
): GeneralQuoteIssueReviewStoreUnavailable {
  return { kind: "unavailable", reason }
}

// Requests contain only scalar fields. Inspect descriptors and copy their values
// before Zod: its known-property reads must never execute a hidden getter. The
// iterative byte counter runs first and refuses proxies/cycles/custom JSON without
// executing them. Unknown nested values are invalid, not deserialized callbacks.
function smallRecord(raw: unknown) {
  assertCommerceQuoteReviewBudget(
    { json: raw },
    QUOTE_REVIEW_STORE_REQUEST_MAX_BYTES,
  )
  if (
    typeof raw !== "object" ||
    raw === null ||
    types.isProxy(raw) ||
    Array.isArray(raw)
  )
    throw Error("Invalid review request")
  const prototype = Object.getPrototypeOf(raw)
  if (prototype !== null && prototype !== Object.prototype)
    throw Error("Invalid review request")
  const entries: [string, string | number][] = []
  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (
      typeof key !== "string" ||
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      !["string", "number"].includes(typeof descriptor.value)
    )
      throw Error("Invalid review request")
    entries.push([key, descriptor.value])
  }
  return Object.fromEntries(entries)
}

function readFailure(error: unknown): GeneralQuoteIssueReviewStoreUnavailable {
  if (error instanceof CommerceQuoteCompleteReviewUnavailableError)
    return unavailable(
      error.reason === "complete_review_too_large"
        ? "review_too_large"
        : "unavailable",
    )
  // Authority, ownership, signing/integrity, terminal state and expiry failures
  // deliberately share a safe response. No row, private fact or error text leaks.
  return unavailable("unavailable")
}

async function currentPacket(
  tx: Prisma.TransactionClient,
  scope: GeneralQuoteIssueDraftScope,
  request: z.infer<typeof requestSchema>,
  signingKey: string,
) {
  const saved = await readGeneralQuoteIssueDraftInTransaction(
    tx,
    {
      ...scope,
      conversationId: request.conversationId,
      draftRef: request.draftRef,
    },
    signingKey,
  )
  if (request.revision !== saved.row.revision)
    return unavailable("stale_review")
  const packet = createGeneralQuoteIssueReviewPacket(saved.review, {
    actorUserId: saved.row.actorUserId,
    tenantId: saved.row.tenantId,
    storeId: saved.row.storeId,
    conversationId: saved.row.conversationId,
    proposalId: saved.row.id,
    proposalRevision: saved.row.revision,
    payloadHash: saved.row.payloadHash,
  })
  // Complete serialization/hashing may outlast the draft-store's final expiry
  // check. Do not expose even a successfully built packet after that boundary.
  if (saved.row.expiresAt.getTime() <= Date.now())
    return unavailable("unavailable")
  return packet
}

/**
 * Unexposed SERVER composition only. Caller owns fresh authentication, capability,
 * client/rollout gates and one authorized Serializable transaction. The actual
 * draft store checks persisted owner/conversation/signature/expiry/current target
 * and authority. This function grants nothing and cannot confirm or issue a Quote.
 * Never expose currentPacket's full return or the draft-store server-only result.
 */
export async function readGeneralQuoteIssueReviewManifestInTransaction(
  tx: Prisma.TransactionClient,
  serverScope: GeneralQuoteIssueDraftScope,
  raw: unknown,
  signingKey: string,
): Promise<QuoteReviewManifest | GeneralQuoteIssueReviewStoreUnavailable> {
  let scope: GeneralQuoteIssueDraftScope
  let request: z.infer<typeof requestSchema>
  try {
    scope = scopeSchema.parse(smallRecord(serverScope))
    request = requestSchema.parse(smallRecord(raw))
  } catch {
    return unavailable("invalid_request")
  }
  try {
    const packet = await currentPacket(tx, scope, request, signingKey)
    if (packet.kind === "available") return packet.manifest
    return unavailable(
      packet.reason === "unsupported_review" ||
        packet.reason === "incomplete_or_invalid_pages"
        ? "unavailable"
        : packet.reason,
    )
  } catch (error) {
    return readFailure(error)
  }
}

/** Freshly recompute EVERY page; caller sends no manifest, scope or approval. */
export async function readGeneralQuoteIssueReviewPageInTransaction(
  tx: Prisma.TransactionClient,
  serverScope: GeneralQuoteIssueDraftScope,
  raw: unknown,
  signingKey: string,
): Promise<QuoteReviewPage | GeneralQuoteIssueReviewStoreUnavailable> {
  let scope: GeneralQuoteIssueDraftScope
  let request: z.infer<typeof pageRequestSchema>
  try {
    scope = scopeSchema.parse(smallRecord(serverScope))
    request = pageRequestSchema.parse(smallRecord(raw))
  } catch {
    return unavailable("invalid_request")
  }
  try {
    const packet = await currentPacket(tx, scope, request, signingKey)
    if (packet.kind !== "available")
      return unavailable(
        packet.reason === "unsupported_review" ||
          packet.reason === "incomplete_or_invalid_pages"
          ? "unavailable"
          : packet.reason,
      )
    if (packet.manifest.packetId !== request.packetId)
      return unavailable("stale_review")
    return (
      packet.pages.find((page) => page.pageId === request.pageId) ??
      unavailable("unavailable")
    )
  } catch (error) {
    return readFailure(error)
  }
}
