import { expect } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import type { PrismaClient } from "@ewatrade/db"
import {
  accountPrivacyNoticeContentDigest,
  type advanceAccountPrivacyWorkflow,
} from "@ewatrade/db/queries"
import { renderAccountPrivacyOutcomeTemplate } from "@ewatrade/email"
import { OpenAPIHono } from "@hono/zod-openapi"
import { sendAccountPrivacyOutcomeNotice } from "../apps/api/src/account-privacy/notice-sender"
import { createOfficePrivacyRoutes } from "../apps/api/src/account-privacy/office-routes"
import { registerAccountPrivacyResendWebhook } from "../apps/api/src/account-privacy/resend-webhook"

/** Fresh in-memory office DB only; the caller must independently guard EwaTrade Development. */
export async function createOfficePrivacyQa(
  db: PrismaClient,
  operatorUserId: string,
  requestId: string,
) {
  const root = process.env.OVERSIGHT_QA_REPOSITORY
  if (
    !root?.startsWith("/") ||
    process.env.RUN_DATABASE_INTEGRATION_TESTS !== "1" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1"
  )
    throw Error("Explicit guarded QA repository required")
  const memory = await PGlite.create()
  const server = new PGLiteSocketServer({
    db: memory,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 1,
  })
  const keys = [
    "ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED",
    "ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED",
    "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
    "ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST",
    "ACCOUNT_PRIVACY_OUTCOME_NOTICE_JSON",
    "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
    "ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET",
    "ACCOUNT_PRIVACY_RETENTION_POLICY_JSON",
    "ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
    "DATABASE_URL",
    "EWATRADE_PRIVACY_ENABLED",
    "EWATRADE_PRIVACY_URL",
    "EWATRADE_PRIVACY_KEY",
    "OVERSIGHT_PRIVACY_ENABLED",
    "OVERSIGHT_PRIVACY_KEY",
    "OVERSIGHT_PRIVACY_OPERATORS_JSON",
  ]
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  const originalFetch = globalThis.fetch
  let pool: { end: () => Promise<void> } | undefined
  try {
    for (const name of ["0001_initial.sql", "0002_employees.sql"])
      await memory.exec(
        await readFile(`${root}/packages/db/migrations/${name}`, "utf8"),
      )
    await server.start()
    process.env.DATABASE_URL = `postgresql://postgres:qa@${server.getServerConn()}/postgres`
    const officeId = randomUUID()
    const support = randomUUID()
    const viewer = randomUUID()
    const suspended = randomUUID()
    const unassigned = randomUUID()
    for (const [id, role] of [
      [officeId, "owner"],
      [support, "support"],
      [viewer, "viewer"],
      [suspended, "privacy"],
      [unassigned, ""],
    ]) {
      await memory.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [id, "Synthetic office employee", `${id}@example.test`],
      )
      if (role)
        await memory.query(
          'INSERT INTO employee("userId",role,projects,status) VALUES($1,$2,$3,$4)',
          [
            id,
            role,
            JSON.stringify(["ewatrade"]),
            id === suspended ? "suspended" : "active",
          ],
        )
    }
    // Load the actual Oversight repository modules and actual PostgreSQL queries.
    const queries = await import(`${root}/packages/db/src/queries/index.ts`)
    const ops = await import(`${root}/packages/operations/src/privacy.ts`)
    const officeDb = await import(`${root}/packages/db/src/client.ts`)
    pool = officeDb.getPool()
    expect(await queries.getEmployee(unassigned)).toBeNull()
    const input = {
      userId: support,
      role: "privacy",
      projects: ["ewatrade"],
      status: "active",
      expectedRevision: 1,
      reason: "Disposable office QA access change",
    }
    await expect(queries.setEmployee(viewer, input)).rejects.toThrow(
      "active owner",
    )
    await expect(
      queries.setEmployee(officeId, { ...input, expectedRevision: 9 }),
    ).rejects.toThrow("Refresh")
    await expect(
      queries.setEmployee(officeId, {
        ...input,
        userId: officeId,
        role: "viewer",
      }),
    ).rejects.toThrow("active owner")
    await memory.query(
      'INSERT INTO session(id,"expiresAt",token,"userId") VALUES($1,now()+interval \'1 day\',$2,$3)',
      [randomUUID(), randomUUID(), support],
    )
    await queries.setEmployee(officeId, input)
    expect((await queries.getEmployee(support)).revision).toBe(2)
    expect(
      (
        await memory.query(
          'SELECT count(*)::int AS count FROM session WHERE "userId"=$1',
          [support],
        )
      ).rows[0].count,
    ).toBe(0)
    expect(
      (
        await memory.query(
          "SELECT count(*)::int AS count FROM audit WHERE action='employee.access'",
        )
      ).rows[0].count,
    ).toBe(1)
    await queries.setEmployee(officeId, {
      ...input,
      role: "support",
      expectedRevision: 2,
    })
    const key = "synthetic-office-bridge-key-for-disposable-fixture"
    process.env.EWATRADE_PRIVACY_ENABLED = "true"
    process.env.EWATRADE_PRIVACY_URL = "https://office-privacy.example.test/"
    process.env.EWATRADE_PRIVACY_KEY = key
    process.env.OVERSIGHT_PRIVACY_ENABLED = "true"
    process.env.OVERSIGHT_PRIVACY_KEY = key
    process.env.OVERSIGHT_PRIVACY_OPERATORS_JSON = JSON.stringify({
      [officeId]: {
        userId: operatorUserId,
        scope: "process",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      [support]: {
        userId: operatorUserId,
        scope: "read",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    })
    let providers: Parameters<typeof advanceAccountPrivacyWorkflow>[2] = {
      revokeApple: async () => {
        throw Error("No provider in office fixture")
      },
      revokeAppleAccess: async () => {
        throw Error("No provider in office fixture")
      },
      revokeGoogle: async () => {
        throw Error("No provider in office fixture")
      },
    }
    let dropNextResult = false
    let capturedResult: unknown
    let emitted = 0
    const providerMessageId = randomUUID()
    let recipient = ""
    const sendNotice: typeof sendAccountPrivacyOutcomeNotice = async (
      database,
      input,
    ) =>
      sendAccountPrivacyOutcomeNotice(database, input, {
        transport: {
          send: async (message) => {
            if (
              !message.to.startsWith("privacy-workflow-") ||
              !message.to.endsWith("@example.test")
            )
              throw Error("Disposable recipient required")
            recipient = message.to
            emitted++
            return { provider: "resend" as const, providerMessageId }
          },
        },
      })
    globalThis.fetch = async (url, init) => {
      if (String(url) !== "https://office-privacy.example.test/")
        throw Error("Unexpected network call in office bridge fixture")
      const response = await createOfficePrivacyRoutes(() => db, providers, {
        sendNotice,
      }).request(String(url), init)
      if (dropNextResult) {
        dropNextResult = false
        capturedResult = await response.clone().json()
        throw new Error(
          "Injected dropped response after genuine stage execution",
        )
      }
      return response
    }
    await expect(ops.privacyQueue(viewer, {})).rejects.toThrow("unavailable")
    await expect(ops.privacyQueue(suspended, {})).rejects.toThrow("unavailable")
    await expect(ops.privacyQueue(unassigned, {})).rejects.toThrow(
      "unavailable",
    )
    await expect(ops.privacyWorkflow(support, { requestId })).rejects.toThrow(
      "unavailable",
    )
    const q = await ops.privacyQueue(support, {})
    expect(q.items.some((r: { id: string }) => r.id === requestId)).toBe(true)
    expect(
      q.items.every(
        (r: Record<string, unknown>) =>
          !("contactEmail" in r) && !("userId" in r),
      ),
    ).toBe(true)
    expect((await ops.privacyWorkflow(officeId, { requestId })).nextStep).toBe(
      "BEGIN_REVIEW",
    )
    return {
      async advance(
        input: Parameters<typeof advanceAccountPrivacyWorkflow>[1],
        adapter: Parameters<typeof advanceAccountPrivacyWorkflow>[2],
      ) {
        providers = adapter
        const command = {
          requestId: input.requestId,
          expectedStep: input.expectedStep,
          commandId: randomUUID(),
          reason: "Synthetic verified deletion acceptance stage",
        }
        if (input.expectedStep === "BEGIN_REVIEW") {
          dropNextResult = true
          await expect(ops.privacyAdvance(officeId, command)).rejects.toThrow(
            "Injected dropped response",
          )
          expect(
            (
              await memory.query("SELECT status FROM audit WHERE id=$1", [
                command.commandId,
              ])
            ).rows[0].status,
          ).toBe("unconfirmed")
          await expect(
            ops.privacyAdvance(officeId, {
              ...command,
              commandId: randomUUID(),
            }),
          ).rejects.toThrow("unresolved")
          await ops.reconcilePrivacy(officeId, {
            commandId: command.commandId,
            requestId: command.requestId,
            reason: "Reviewed genuine stage progress after a dropped result",
          })
          expect(
            (
              await memory.query("SELECT status FROM audit WHERE id=$1", [
                command.commandId,
              ])
            ).rows[0].status,
          ).toBe("reconciled")
          return capturedResult
        }
        const result = await ops.privacyAdvance(officeId, command)
        await expect(ops.privacyAdvance(officeId, command)).rejects.toThrow(
          "already recorded",
        )
        expect(
          (
            await memory.query("SELECT status FROM audit WHERE id=$1", [
              command.commandId,
            ])
          ).rows[0].status,
        ).toBe("completed")
        return result
      },
      async externalReview(input: {
        confirmationsReviewed: true
        receipts: {
          provider: string
          evidenceDigest: string
          confirmedAt: Date
        }[]
      }) {
        await expect(ops.privacyReview(support, { requestId })).rejects.toThrow(
          "unavailable",
        )
        const review = await ops.privacyReview(officeId, { requestId })
        const command = {
          requestId,
          commandId: randomUUID(),
          reason: "Reviewed synthetic subject-bound provider receipts",
          expectedStep: "REVIEW_EXTERNAL_PROCESSORS",
          policyDigest: review.externalPolicy.digest,
          confirmationsReviewed: true,
          receipts: input.receipts.map((r) => ({
            ...r,
            confirmedAt: r.confirmedAt.toISOString(),
          })),
        }
        dropNextResult = true
        await expect(
          ops.privacyExternalReview(officeId, command),
        ).rejects.toThrow("Injected dropped response")
        await expect(
          ops.privacyAdvance(officeId, {
            requestId,
            commandId: randomUUID(),
            reason: "Must remain blocked until evidence reconciliation",
            expectedStep: "MINIMIZE_PROFILE",
          }),
        ).rejects.toThrow("unresolved")
        await ops.reconcilePrivacy(officeId, {
          requestId,
          commandId: command.commandId,
          reason: "Verified stored provider review after lost response",
        })
        const audit = (
          await memory.query("SELECT payload,status FROM audit WHERE id=$1", [
            command.commandId,
          ])
        ).rows[0]
        expect(audit.status).toBe("reconciled")
        expect(audit.payload).not.toHaveProperty("receipts")
        expect(
          (await ops.privacyWorkflow(officeId, { requestId })).nextStep,
        ).toBe("MINIMIZE_PROFILE")
      },
      async deliverAndComplete() {
        const noticeContent = {
          subject: "Synthetic deletion fixture outcome",
          text: "This is a synthetic adapter test. It is not actual provider deletion or a message to a real mailbox.",
        }
        process.env.EMAIL_FROM = "privacy@example.test"
        process.env.EMAIL_REPLY_TO = "support@example.test"
        process.env.RESEND_API_KEY = "re_synthetic_never_contacts_provider"
        process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY =
          "synthetic-recipient-key-of-at-least-32-bytes"
        const secret = Buffer.from("synthetic-svix-secret-never-production")
        process.env.ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET = `whsec_${secret.toString("base64")}`
        process.env.ACCOUNT_PRIVACY_OUTCOME_NOTICE_JSON =
          JSON.stringify(noticeContent)
        process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST =
          accountPrivacyNoticeContentDigest({
            from: process.env.EMAIL_FROM,
            replyTo: process.env.EMAIL_REPLY_TO,
            subject: noticeContent.subject,
            ...renderAccountPrivacyOutcomeTemplate(noticeContent),
          })
        const retention = JSON.stringify({
          version: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
          approvalReference: "synthetic-fixture-only",
        })
        process.env.ACCOUNT_PRIVACY_RETENTION_POLICY_JSON = retention
        process.env.ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256 =
          createHash("sha256").update(retention).digest("hex")
        const review = await ops.privacyReview(officeId, { requestId })
        expect(review.noticeStatus).toBeNull()
        const command = {
          requestId,
          commandId: randomUUID(),
          expectedStep: "DELIVER_OUTCOME",
          reason: "Reviewed exact synthetic fixture notice",
          contentDigest: review.notice.contentDigest,
          contentReviewed: true,
        }
        dropNextResult = true
        await expect(ops.privacySendNotice(officeId, command)).rejects.toThrow(
          "Injected dropped response",
        )
        expect(emitted).toBe(1)
        expect(
          (await ops.privacyReview(officeId, { requestId })).noticeStatus,
        ).toBe("SENT")
        await expect(
          ops.reconcilePrivacy(officeId, {
            requestId,
            commandId: command.commandId,
            reason: "Acceptance alone cannot prove actual delivery",
          }),
        ).rejects.toThrow("not proven")
        await expect(
          ops.privacySendNotice(officeId, {
            ...command,
            commandId: randomUUID(),
          }),
        ).rejects.toThrow("unresolved")
        expect(emitted).toBe(1)
        const receiver = new OpenAPIHono()
        registerAccountPrivacyResendWebhook(receiver)
        const webhook = async (to: string, valid: boolean) => {
          const eventId = `synthetic-${randomUUID()}`
          const timestamp = String(Math.floor(Date.now() / 1000))
          const payload = JSON.stringify({
            type: "email.delivered",
            created_at: new Date().toISOString(),
            data: {
              email_id: providerMessageId,
              created_at: new Date().toISOString(),
              from: "privacy@example.test",
              to: [to],
              subject: noticeContent.subject,
            },
          })
          const signature = createHmac("sha256", secret)
            .update(`${eventId}.${timestamp}.${payload}`)
            .digest("base64")
          return receiver.request(
            "https://fixture.example.test/api/account-privacy/webhooks/resend",
            {
              method: "POST",
              body: payload,
              headers: {
                "Content-Type": "application/json",
                "svix-id": eventId,
                "svix-timestamp": timestamp,
                "svix-signature": `v1,${valid ? signature : "invalid"}`,
              },
            },
          )
        }
        expect((await webhook(recipient, false)).status).toBe(401)
        expect((await webhook("unrelated@example.test", true)).status).toBe(409)
        expect(
          (await ops.privacyReview(officeId, { requestId })).noticeStatus,
        ).toBe("SENT")
        const delivered = await webhook(recipient, true)
        expect(await delivered.json()).toMatchObject({ received: true })
        expect(delivered.status).toBe(200)
        expect(
          (await ops.privacyReview(officeId, { requestId })).noticeStatus,
        ).toBe("DELIVERED")
        await ops.reconcilePrivacy(officeId, {
          requestId,
          commandId: command.commandId,
          reason: "Verified signed delivery and stored notice outcome",
        })
        const complete = await ops.privacyAdvance(officeId, {
          requestId,
          commandId: randomUUID(),
          expectedStep: "COMPLETE",
          reason: "Verified complete synthetic deletion domain ledger",
        })
        expect(complete.workflow.status).toBe("COMPLETED")
        expect(emitted).toBe(1)
        expect(
          await db.accountPrivacyRequest.findUnique({
            where: { id: requestId },
            select: {
              completedAt: true,
              retention: {
                select: {
                  completedAt: true,
                  contactExpiresAt: true,
                  reviewDueAt: true,
                  evidenceExpiresAt: true,
                },
              },
            },
          }),
        ).toMatchObject({
          completedAt: expect.any(Date),
          retention: {
            completedAt: expect.any(Date),
            contactExpiresAt: expect.any(Date),
            reviewDueAt: expect.any(Date),
            evidenceExpiresAt: expect.any(Date),
          },
        })
      },
      async close() {
        globalThis.fetch = originalFetch
        await pool?.end()
        await server.stop()
        await memory.close()
        for (const k of keys) {
          if (previous[k] === undefined) delete process.env[k]
          else process.env[k] = previous[k]
        }
      },
    }
  } catch (e) {
    globalThis.fetch = originalFetch
    await pool?.end()
    await server.stop().catch(() => undefined)
    await memory.close()
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k]
      else process.env[k] = previous[k]
    }
    throw e
  }
}
