import type { PrismaClient } from "@ewatrade/db"
import {
  advanceAccountPrivacyWorkflow,
  getAccountPrivacyWorkflow,
  isAccountPrivacyAccessBlocked,
  listAccountPrivacyRequests,
} from "@ewatrade/db/queries"
import { Hono } from "hono"
import { z } from "zod"
import {
  revokeAppleAccessToken,
  revokeAppleAuthorization,
} from "../auth/apple-credentials"
import { revokeGoogleAuthorization } from "../auth/google-credentials"
import {
  officePrivacyCommandSchema,
  officePrivacyDetailSchema,
  officePrivacyExternalReviewSchema,
  officePrivacyNoticeSchema,
} from "../schemas/office-privacy"
import type { sendAccountPrivacyOutcomeNotice } from "./notice-sender"
import { authenticateOfficePrivacy } from "./office-auth"
import {
  dispatchOfficePrivacyNotice,
  getOfficePrivacyReview,
  reviewOfficePrivacyProviders,
} from "./office-fulfillment"
import { removeAccountPrivacyPrivateAttachment } from "./private-assistant-media"
const queueSchema = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    status: z
      .enum([
        "RECEIVED",
        "UNDER_REVIEW",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ])
      .optional(),
  })
  .strict()
export function createOfficePrivacyRoutes(
  getDb: () => PrismaClient,
  providers: Parameters<typeof advanceAccountPrivacyWorkflow>[2] = {
    removePrivateAttachment: removeAccountPrivacyPrivateAttachment,
    revokeApple: revokeAppleAuthorization,
    revokeAppleAccess: revokeAppleAccessToken,
    revokeGoogle: revokeGoogleAuthorization,
  },
  dependencies: { sendNotice?: typeof sendAccountPrivacyOutcomeNotice } = {},
) {
  const app = new Hono()
  app.post("/", async (c) => {
    c.header("Cache-Control", "no-store")
    // Stream-bound input: a claimed Content-Length alone is not a size limit.
    const reader = c.req.raw.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (!reader) return c.json({ error: "Invalid request" }, 400)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16000) {
        await reader.cancel()
        return c.json({ error: "Invalid request" }, 413)
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks).toString("utf8")
    const auth = authenticateOfficePrivacy(
      body,
      c.req.header("X-Oversight-Signature"),
    )
    if (!auth) return c.json({ error: "Unauthorized" }, 401)
    const db = getDb()
    const user = await db.user.findUnique({
      where: { id: auth.operatorUserId },
      select: { id: true, emailVerified: true, isPlatformAdmin: true },
    })
    if (
      !user?.emailVerified ||
      (auth.envelope.operation !== "queue" && !user.isPlatformAdmin) ||
      (await isAccountPrivacyAccessBlocked(db, auth.operatorUserId))
    )
      return c.json({ error: "Operator unavailable" }, 403)
    try {
      const input = auth.envelope.input
      if (auth.envelope.operation === "queue") {
        const rows = await listAccountPrivacyRequests(
          db,
          queueSchema.parse(input),
        )
        return c.json({
          items: rows.slice(0, 50).map((r) => ({
            id: r.id,
            status: r.status,
            requestedAt: r.requestedAt,
            verifiedAt: r.verifiedAt,
          })),
          nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
        })
      }
      if (auth.envelope.operation === "workflow")
        return c.json(
          await getAccountPrivacyWorkflow(db, {
            ...officePrivacyDetailSchema.parse(input),
            operatorUserId: auth.operatorUserId,
          }),
        )
      if (auth.envelope.operation === "review")
        return c.json(
          await getOfficePrivacyReview(db, {
            ...officePrivacyDetailSchema.parse(input),
            operatorUserId: auth.operatorUserId,
          }),
        )
      if (auth.envelope.operation === "externalReview")
        return c.json(
          await reviewOfficePrivacyProviders(db, {
            ...officePrivacyExternalReviewSchema.parse(input),
            operatorUserId: auth.operatorUserId,
          }),
        )
      if (auth.envelope.operation === "sendNotice")
        return c.json(
          await dispatchOfficePrivacyNotice(
            db,
            {
              ...officePrivacyNoticeSchema.parse(input),
              operatorUserId: auth.operatorUserId,
            },
            dependencies.sendNotice,
          ),
        )
      const parsed = officePrivacyCommandSchema.parse(input)
      const result = await advanceAccountPrivacyWorkflow(
        db,
        {
          requestId: parsed.requestId,
          expectedStep: parsed.expectedStep,
          operatorUserId: auth.operatorUserId,
        },
        providers,
      )
      return c.json(result)
    } catch (error) {
      if (error instanceof z.ZodError)
        return c.json({ error: "Invalid request" }, 400)
      // Domain detail, identifiers, provider errors and private records stay server-side.
      return c.json({ error: "Review required or request changed" }, 409)
    }
  })
  return app
}
