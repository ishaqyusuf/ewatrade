import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  bootstrapMobileStoreConversation,
  bootstrapWebStoreConversation,
  claimMobileStoreConversationTransfer,
  createWebStoreConversationTransfer,
  getGuestStoreConversationTimeline,
  getMobileStoreConversationTimeline,
  listMobileStoreConversations,
  redeemMobileStoreConversationTransfer,
  sendMobileStoreConversationText,
} from "../../store-conversations"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(240_000)

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

async function publishConversationEntry(
  fixture: ServiceCommerceAcceptanceFixture,
) {
  const configured = await updateServiceCommerceStoreProfile(fixture.db, {
    actorUserId: fixture.actorUserId,
    expectedRevision: 0,
    reason: "Configure mobile Store Conversation acceptance",
    settings,
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  await setServiceCommerceStoreProfileActivation(fixture.db, {
    active: true,
    actorUserId: fixture.actorUserId,
    expectedRevision: configured.revision,
    reason: "Activate mobile Store Conversation acceptance",
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  return (
    await publishCustomerEntryPoint(fixture.db, {
      actorUserId: fixture.actorUserId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })
  ).publicToken
}

describeWithServiceCommerceDatabase(
  "Store Conversation mobile identity and transfer",
  () => {
    let primary: ServiceCommerceAcceptanceFixture
    let foreign: ServiceCommerceAcceptanceFixture
    let primaryEntryToken: string
    let foreignEntryToken: string

    beforeAll(async () => {
      primary = await createServiceCommerceAcceptanceFixture()
      foreign = await createServiceCommerceAcceptanceFixture()
      primaryEntryToken = await publishConversationEntry(primary)
      foreignEntryToken = await publishConversationEntry(foreign)
    })

    afterAll(async () => {
      const errors: unknown[] = []
      for (const fixture of [foreign, primary]) {
        if (!fixture) continue
        try {
          await disposeServiceCommerceAcceptanceFixture(fixture)
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length > 0) throw new AggregateError(errors)
    })

    test("proves native text continuity and single-device transfer consumption", async () => {
      const installationToken = `mobile-installation-${randomUUID()}`
      const mobile = await bootstrapMobileStoreConversation(primary.db, {
        installationToken,
        publicToken: primaryEntryToken,
      })
      if (!mobile.credentialToken) throw new Error("Mobile credential missing")
      const sendInput = {
        clientOperationId: `mobile-send-${randomUUID()}`,
        conversationId: mobile.conversation.id,
        credentialToken: mobile.credentialToken,
        installationToken,
        publicToken: primaryEntryToken,
        text: "I need help choosing a travel bag",
      }
      const sent = await sendMobileStoreConversationText(primary.db, sendInput)
      const sentReplay = await sendMobileStoreConversationText(
        primary.db,
        sendInput,
      )
      expect(sent.message).toMatchObject({ channel: "mobile", sequence: 1 })
      expect(sent.credentialExpiresAt).toBeInstanceOf(Date)
      expect(sentReplay).toMatchObject({
        credentialExpiresAt: expect.any(Date),
        message: { id: sent.message.id },
        replayed: true,
      })
      const mobileTimeline = await getMobileStoreConversationTimeline(
        primary.db,
        {
          conversationId: mobile.conversation.id,
          credentialToken: mobile.credentialToken,
          installationToken,
          publicToken: primaryEntryToken,
        },
      )
      expect(mobileTimeline.messages).toHaveLength(1)
      const mobileList = await listMobileStoreConversations(primary.db, {
        credentialToken: mobile.credentialToken,
        installationToken,
      })
      expect(mobileList.items).toEqual([
        expect.objectContaining({
          conversationId: mobile.conversation.id,
          lastMessage: {
            author: "customer",
            text: "I need help choosing a travel bag",
          },
        }),
      ])

      const web = await bootstrapWebStoreConversation(primary.db, {
        publicToken: primaryEntryToken,
      })
      if (!web.credentialToken) throw new Error("Web credential missing")
      const transferToken = `transfer-${randomUUID()}`
      const transfer = await createWebStoreConversationTransfer(primary.db, {
        clientOperationId: `transfer-create-${randomUUID()}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        publicToken: primaryEntryToken,
        transferToken,
      })
      expect(transfer.expiresAt.getTime()).toBeGreaterThan(Date.now())
      expect(transfer.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 600_000,
      )
      const transferredInstallation = `transferred-install-${randomUUID()}`
      await claimMobileStoreConversationTransfer(primary.db, {
        installationToken: transferredInstallation,
        publicToken: primaryEntryToken,
        transferToken,
      })
      await expect(
        claimMobileStoreConversationTransfer(primary.db, {
          installationToken: `wrong-device-${randomUUID()}`,
          publicToken: primaryEntryToken,
          transferToken,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const redemptionAttempts = await Promise.allSettled([
        redeemMobileStoreConversationTransfer(primary.db, {
          installationToken: transferredInstallation,
          publicToken: primaryEntryToken,
          targetCredentialToken: `target-mobile-${transferToken}`,
          transferToken,
        }),
        redeemMobileStoreConversationTransfer(primary.db, {
          installationToken: transferredInstallation,
          publicToken: primaryEntryToken,
          targetCredentialToken: `target-mobile-${transferToken}`,
          transferToken,
        }),
      ])
      expect(
        redemptionAttempts.filter((attempt) => attempt.status === "fulfilled"),
      ).toHaveLength(2)
      expect(
        redemptionAttempts.filter((attempt) => attempt.status === "rejected"),
      ).toHaveLength(0)
      expect(
        redemptionAttempts
          .flatMap((attempt) =>
            attempt.status === "fulfilled" ? [attempt.value.replayed] : [],
          )
          .sort(),
      ).toEqual([false, true])
      const redemption = redemptionAttempts.find(
        (attempt) => attempt.status === "fulfilled",
      )
      if (!redemption || redemption.status !== "fulfilled") {
        throw new Error("Transfer redemption did not succeed")
      }
      expect(redemption.value).toMatchObject({
        conversation: { id: web.conversation.id },
        state: "redeemed",
      })
      expect(
        await primary.db.storeConversationGuestAccess.count({
          where: {
            conversationId: web.conversation.id,
            origin: "TRANSFER",
            status: "ACTIVE",
          },
        }),
      ).toBe(1)
      await expect(
        claimMobileStoreConversationTransfer(primary.db, {
          installationToken: transferredInstallation,
          publicToken: primaryEntryToken,
          transferToken,
        }),
      ).resolves.toMatchObject({ state: "claimed" })
      await expect(
        redeemMobileStoreConversationTransfer(primary.db, {
          installationToken: transferredInstallation,
          publicToken: primaryEntryToken,
          targetCredentialToken: `target-mobile-${transferToken}`,
          transferToken,
        }),
      ).resolves.toMatchObject({ replayed: true })
      await expect(
        getGuestStoreConversationTimeline(primary.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken: primaryEntryToken,
        }),
      ).resolves.toMatchObject({ conversation: { id: web.conversation.id } })

      const guardedCases = ["expired", "revoked", "wrong_store"] as const
      for (const guardedCase of guardedCases) {
        const guardedWeb = await bootstrapWebStoreConversation(primary.db, {
          publicToken: primaryEntryToken,
        })
        if (!guardedWeb.credentialToken)
          throw new Error("Web credential missing")
        const guardedToken = `${guardedCase}-${randomUUID()}`
        await createWebStoreConversationTransfer(primary.db, {
          clientOperationId: `${guardedCase}-create-${randomUUID()}`,
          conversationId: guardedWeb.conversation.id,
          credentialToken: guardedWeb.credentialToken,
          publicToken: primaryEntryToken,
          transferToken: guardedToken,
        })
        if (guardedCase === "expired") {
          await primary.db.storeConversationTransfer.update({
            data: { expiresAt: new Date(Date.now() - 1_000) },
            where: {
              tokenDigest: createHash("sha256")
                .update(guardedToken)
                .digest("hex"),
            },
          })
        }
        if (guardedCase === "revoked") {
          await primary.db.storeConversationGuestCredential.update({
            data: { revokedAt: new Date(), status: "REVOKED" },
            where: {
              tokenDigest: createHash("sha256")
                .update(guardedWeb.credentialToken)
                .digest("hex"),
            },
          })
        }
        const grantsBefore =
          await primary.db.storeConversationGuestAccess.count({
            where: {
              conversationId: guardedWeb.conversation.id,
              origin: "TRANSFER",
            },
          })
        await expect(
          claimMobileStoreConversationTransfer(primary.db, {
            installationToken: `guarded-install-${randomUUID()}`,
            publicToken:
              guardedCase === "wrong_store"
                ? foreignEntryToken
                : primaryEntryToken,
            transferToken: guardedToken,
          }),
        ).rejects.toBeInstanceOf(Error)
        expect(
          await primary.db.storeConversationGuestAccess.count({
            where: {
              conversationId: guardedWeb.conversation.id,
              origin: "TRANSFER",
            },
          }),
        ).toBe(grantsBefore)
      }
    }, 240_000)
  },
)
