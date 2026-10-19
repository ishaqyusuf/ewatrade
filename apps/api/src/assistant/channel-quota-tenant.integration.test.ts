import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
import { WHATSAPP_TRANSPORT_LIMITS } from "@ewatrade/assistant/channels/policy"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  nextAssistantWhatsAppInbox,
  resolveAssistantWhatsAppConversation,
} from "@ewatrade/db/assistant-whatsapp"
import { processPlatformWhatsAppEvent } from "../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../communications/whatsapp-runtime"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-quota-tenant")
beforeAll(() => fixture.setup(), 90_000)
afterAll(async () => {
  if (enabled && fixture.db) {
    try {
      const { db, tenantId } = fixture
      const tenant = await db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      })
      expect(tenant).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      const effects = await Promise.all([
        db.customer.count({ where: { tenantId } }),
        db.catalogItem.count({ where: { tenantId } }),
        db.financeBook.count({ where: { tenantId } }),
        db.commercialOrder.count({ where: { tenantId } }),
        db.assistantActionProposal.count({ where: { tenantId } }),
        db.assistantAttachment.count({ where: { tenantId } }),
      ])
      expect(effects).toEqual([0, 0, 0, 0, 0, 0])
      expect(
        await db.assistantRun.count({
          where: { conversationId: fixture.conversationId },
        }),
      ).toBe(0)
    } catch (error) {
      await fixture.db.$disconnect()
      throw new Error(
        `Quota/Tenant cleanup unverified; retained fixture ${fixture.tenantId}`,
        { cause: error },
      )
    }
  }
  await fixture.cleanup()
}, 90_000)

suite("bounded quota notice and fresh Tenant pilot gate", () => {
  test("signed denied ingress stages one fixed daily notice, preserves usage and idle time, and Tenant removal fences fresh authority while Disconnect survives", async () => {
    const { db, userId, tenantId, principal } = fixture
    const now = new Date()
    const day = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000)
    await db.assistantWhatsAppUsageBucket.create({
      data: {
        userId,
        tenantId,
        windowKind: "DAY",
        windowStartedAt: day,
        windowEndsAt: new Date(day.getTime() + 86_400_000),
        expiresAt: new Date(day.getTime() + 2 * 86_400_000),
        ingress: WHATSAPP_TRANSPORT_LIMITS.DAY.user.ingress,
      },
    })
    const grantBefore = await db.assistantWhatsAppGrant.findUniqueOrThrow({
      where: { id: principal.grantId },
    })
    const turns: string[] = []
    const deliveries: string[] = []
    const receipts: unknown[] = []
    async function signedMessage(providerMessageId: string, text: string) {
      const body = JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: principal.phoneNumberId },
                  messages: [
                    {
                      id: providerMessageId,
                      from: principal.senderId,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: text },
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
      const response = await handleWhatsAppWebhookRequest(
        new Request("https://api.example.test/api/webhooks/whatsapp", {
          method: "POST",
          body,
          headers: {
            "x-hub-signature-256": `sha256=${createHmac(
              "sha256",
              process.env.META_APP_SECRET ?? "",
            )
              .update(body)
              .digest("hex")}`,
          },
        }),
        fixture.marker,
        {
          processPlatformEvent: (event) =>
            processPlatformWhatsAppEvent(event, {
              env: process.env,
              accept: async (input, users) => {
                const receipt = await acceptAssistantWhatsAppIngress(
                  db,
                  input,
                  users,
                )
                receipts.push(receipt)
                return receipt
              },
              enqueue: async (id) => {
                turns.push(id)
              },
              enqueueDelivery: async (id) => {
                deliveries.push(id)
              },
              receipt: (event) => acceptAssistantWhatsAppStatus(db, event),
              claim: (input) => claimAssistantWhatsAppLink(db, input),
              disconnect: (input) => disconnectAssistantWhatsApp(db, input),
            }),
        },
      )
      expect(response.status).toBe(200)
    }
    const providerId = `${fixture.marker}-denied`
    const deniedText = "Private denied customer statement for the quota check"
    await signedMessage(providerId, deniedText)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({ kind: "quota_notice_accepted" })
    expect(turns).toEqual([])
    expect(deliveries).toHaveLength(1)
    const inbox = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: {
        phoneNumberId_providerMessageId: {
          phoneNumberId: principal.phoneNumberId,
          providerMessageId: providerId,
        },
      },
    })
    expect(inbox).toMatchObject({
      kind: "TURN",
      state: "COMPLETED",
      errorCode: "INGRESS_RATE_LIMITED",
      runId: null,
      content: { type: "channel_notice", code: "TRANSPORT_RATE_LIMITED" },
    })
    expect(inbox.contentDigest).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            type: "channel_notice",
            code: "TRANSPORT_RATE_LIMITED",
          }),
        )
        .digest("hex"),
    )
    expect(JSON.stringify(inbox.content)).not.toContain(deniedText)
    const outboxId = deliveries[0]
    if (!outboxId) throw Error("Expected exactly one ID-only quota reply")
    const outbox = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
      where: { id: outboxId },
    })
    expect(outbox).toMatchObject({
      inboxId: inbox.id,
      state: "PENDING",
      renderKind: "notice",
    })
    expect(outbox.content).toContain("message limit")
    expect(outbox.content).not.toContain(deniedText)
    expect(outbox.content).toContain(
      `/assistant/c/${encodeURIComponent(fixture.conversationId)}`,
    )
    expect(
      outbox.expiresAt.getTime() - inbox.receivedAt.getTime(),
    ).toBeLessThanOrEqual(5 * 60_000)
    await signedMessage(providerId, deniedText)
    await signedMessage(`${fixture.marker}-another-denied`, deniedText)
    expect(receipts.slice(1)).toEqual([
      { kind: "ignored", reason: "collision" },
      { kind: "ignored", reason: "rate_limited" },
    ])
    expect(deliveries).toEqual([outbox.id])
    expect(
      await db.assistantWhatsAppInbox.count({
        where: { bindingId: principal.bindingId },
      }),
    ).toBe(1)
    expect(
      await db.assistantWhatsAppOutbox.count({ where: { inboxId: inbox.id } }),
    ).toBe(1)
    expect(
      await db.assistantRun.count({
        where: { conversationId: fixture.conversationId },
      }),
    ).toBe(0)
    expect(
      await db.assistantMessage.count({
        where: { conversationId: fixture.conversationId },
      }),
    ).toBe(0)
    expect(await nextAssistantWhatsAppInbox(db, principal.bindingId)).toBeNull()
    const grantAfter = await db.assistantWhatsAppGrant.findUniqueOrThrow({
      where: { id: principal.grantId },
    })
    expect(grantAfter.idleExpiresAt).toEqual(grantBefore.idleExpiresAt)
    expect(grantAfter.lastUsedAt).toEqual(grantBefore.lastUsedAt)
    let buckets = await db.assistantWhatsAppUsageBucket.findMany({
      where: { tenantId, userId },
    })
    expect(buckets.reduce((total, row) => total + row.ingress, 0)).toBe(
      WHATSAPP_TRANSPORT_LIMITS.DAY.user.ingress,
    )
    expect(
      buckets.reduce((total, row) => total + row.deliveryAttempts, 0),
    ).toBe(0)
    const delivered = await fixture.fakeAcceptedDelivery(outbox.id)
    expect(delivered.body).toContain("message limit")
    buckets = await db.assistantWhatsAppUsageBucket.findMany({
      where: { tenantId, userId },
    })
    expect(
      buckets.find((row) => row.windowKind === "DAY")?.deliveryAttempts,
    ).toBe(1)
    expect(buckets.reduce((total, row) => total + row.ingress, 0)).toBe(
      WHATSAPP_TRANSPORT_LIMITS.DAY.user.ingress,
    )
    const enrolled = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
    process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = ""
    try {
      await expect(
        resolveAssistantWhatsAppConversation(db, principal),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      await signedMessage(
        `${fixture.marker}-tenant-off`,
        "Private Tenant-off input",
      )
      expect(receipts.at(-1)).toEqual({
        kind: "ignored",
        reason: "unavailable",
      })
      expect(deliveries).toHaveLength(1)
      await signedMessage(`${fixture.marker}-disconnect`, "Disconnect")
      const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
        where: {
          phoneNumberId_senderId: {
            phoneNumberId: principal.phoneNumberId,
            senderId: principal.senderId,
          },
        },
      })
      expect(identity.revokedAt).not.toBeNull()
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: principal.grantId },
          })
        ).revokedAt,
      ).not.toBeNull()
    } finally {
      if (enrolled === undefined)
        Reflect.deleteProperty(
          process.env,
          "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS",
        )
      else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = enrolled
    }
  }, 240_000)
})
