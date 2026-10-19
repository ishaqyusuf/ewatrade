import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@ewatrade/db"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const run = enabled ? test : test.skip
run(
  "owned business deletion cascades an inbox/output graph without referential-action conflicts",
  async () => {
    assertQaAccessAcceptanceDatabase()
    if (
      new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
      "/ewatrade_qa_v1"
    )
      throw Error("Explicit local QA target required")
    const id = `wa-cascade-${randomUUID()}`
    const userId = `${id}-user`
    const db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.EWATRADE_DATABASE_URL,
        max: 2,
      }),
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    })
    try {
      await db.$transaction(async (tx) => {
        const now = new Date()
        const expiresAt = new Date(now.getTime() + 60_000)
        await tx.user.create({
          data: { id: userId, email: `${id}@example.test`, ageBand: "ADULT" },
        })
        await tx.tenant.create({
          data: {
            id,
            slug: id,
            name: "Synthetic cascade",
            type: "MERCHANT",
            dataClassification: "QA",
            qaMarkedAt: now,
            qaSourceDomain: "assistant-whatsapp-cascade.test",
          },
        })
        await tx.store.create({
          data: { id, tenantId: id, slug: id, name: "Synthetic Store" },
        })
        await tx.membership.create({
          data: { id, userId, tenantId: id, role: "OWNER", status: "ACTIVE" },
        })
        await tx.assistantConversation.create({
          data: {
            id,
            tenantId: id,
            storeId: id,
            ownerUserId: userId,
            purpose: "GENERAL",
          },
        })
        await tx.assistantMessage.create({
          data: {
            id,
            conversationId: id,
            sequence: 1,
            role: "assistant",
            parts: [{ type: "text", text: "Synthetic saved reply" }],
          },
        })
        await tx.assistantRun.create({
          data: {
            id,
            conversationId: id,
            actorUserId: userId,
            requestId: id,
            provider: "ewatrade-rehearsal",
            model: "rehearsal-v1",
            promptVersion: "synthetic",
            status: "COMPLETED",
            assistantMessageId: id,
          },
        })
        await tx.assistantWhatsAppIdentity.create({
          data: { id, userId, phoneNumberId: "90000000000005", senderId: id },
        })
        await tx.assistantWhatsAppGrant.create({
          data: {
            id,
            identityId: id,
            tenantId: id,
            membershipId: id,
            storeId: id,
            consentedAt: now,
            lastUsedAt: now,
            expiresAt,
            idleExpiresAt: expiresAt,
          },
        })
        await tx.assistantWhatsAppBinding.create({
          data: {
            id,
            identityId: id,
            grantId: id,
            identityGeneration: 1,
            grantGeneration: 1,
            selectionGeneration: 1,
            conversationId: id,
            purpose: "GENERAL",
          },
        })
        await tx.assistantWhatsAppInbox.create({
          data: {
            id,
            phoneNumberId: "90000000000005",
            providerMessageId: id,
            contentDigest: "a".repeat(64),
            bindingId: id,
            sequence: 1,
            requestId: id,
            userMessageId: `${id}-message`,
            providerOccurredAt: now,
            expiresAt,
            runId: id,
            state: "COMPLETED",
          },
        })
        await tx.assistantWhatsAppOutbox.create({
          data: {
            id,
            inboxId: id,
            phoneNumberId: "90000000000005",
            runId: id,
            messageId: id,
            chunkIndex: 0,
            chunkCount: 1,
            rendererVersion: "whatsapp-reply-v1",
            authorityDigest: "b".repeat(64),
            content: "Synthetic reply",
            contentDigest: "c".repeat(64),
            expiresAt,
          },
        })
      })
      // This parent operation, not child-first fixture cleanup, is the regression assertion.
      await db.tenant.delete({ where: { id } })
      expect(await db.assistantWhatsAppInbox.count({ where: { id } })).toBe(0)
      expect(await db.assistantWhatsAppOutbox.count({ where: { id } })).toBe(0)
      expect(await db.assistantMessage.count({ where: { id } })).toBe(0)
      expect(await db.assistantRun.count({ where: { id } })).toBe(0)
    } finally {
      // Preserve test failure while safely cleaning only this exact synthetic fixture on red runs.
      await db.assistantWhatsAppOutbox.deleteMany({ where: { id } })
      await db.tenant.deleteMany({
        where: { id, qaSourceDomain: "assistant-whatsapp-cascade.test" },
      })
      await db.user.deleteMany({
        where: { id: userId, email: `${id}@example.test` },
      })
      await db.$disconnect()
    }
  },
  90_000,
)
