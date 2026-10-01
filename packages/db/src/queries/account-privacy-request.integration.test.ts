import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { requestAccountDeletion } from "./account-privacy"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
const describeWithDatabase = enabled ? describe : describe.skip

describeWithDatabase(
  "account deletion request retry on guarded Neon fixture",
  () => {
    test("preserves verified intake contact after processing begins", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const fixtureId = randomUUID()
      const userId = randomUUID()
      const firstEmail = `privacy-request-first-${fixtureId}@example.test`
      const laterEmail = `privacy-request-later-${fixtureId}@example.test`
      let userCreated = false
      try {
        await prisma.user.create({
          data: {
            id: userId,
            email: firstEmail,
            emailVerified: true,
            name: "Privacy Request QA Subject",
          },
        })
        userCreated = true
        const initial = await requestAccountDeletion(prisma, userId, firstEmail)
        await prisma.accountPrivacyRequest.update({
          where: { id: initial.id },
          data: { status: "PROCESSING" },
        })
        await prisma.user.update({
          where: { id: userId },
          data: { email: laterEmail },
        })
        const replay = await requestAccountDeletion(prisma, userId, laterEmail)
        expect(replay.id).toBe(initial.id)
        expect(replay.status).toBe("PROCESSING")
        const stored = await prisma.accountPrivacyRequest.findUniqueOrThrow({
          where: { id: initial.id },
          select: {
            contactEmail: true,
            verifiedSubjectUserId: true,
            verifiedAt: true,
          },
        })
        expect(stored.contactEmail).toBe(firstEmail)
        expect(stored.verifiedSubjectUserId).toBe(userId)
        expect(stored.verifiedAt).toBeInstanceOf(Date)
      } finally {
        if (userCreated) {
          await prisma.accountPrivacyRequest.deleteMany({
            where: { requestKey: `account-deletion:${userId}` },
          })
          await prisma.user.deleteMany({ where: { id: userId } })
        }
      }
    })
  },
)
