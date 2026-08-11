import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
  StoreStatus,
} from "../../../../generated/prisma/enums"
import {
  assignCustomerChannelAttendant,
  publishCustomerEntryPoint,
} from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  claimWhatsAppInboundEvent,
  recordWhatsAppInboundEvent,
  resolveWhatsAppInboundConnection,
  resolveWhatsAppInboundStore,
  setWhatsAppConnectionLifecycle,
} from "../../whatsapp-connections"
import {
  type CommerceAcceptanceFixture,
  createCommerceAcceptanceFixture,
  disposeCommerceAcceptanceFixture,
} from "./commerce.fixture"
import { describeWithServiceCommerceDatabase } from "./database"

const branchSettings: ServiceCommerceProfileSettings = {
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
    whatsapp: true,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: true,
}

type Branch = { entryToken: string; storeId: string }

async function activateGenericStore(
  fixture: CommerceAcceptanceFixture,
  input: { name: string; slug: string },
): Promise<Branch> {
  const store = await fixture.db.store.create({
    data: {
      countryCode: "NG",
      name: input.name,
      slug: input.slug,
      status: StoreStatus.ACTIVE,
      supportEmail: "branch@example.invalid",
      supportPhone: "+2348111111111",
      tenantId: fixture.tenantId,
    },
  })
  const membership = await fixture.db.membership.findFirstOrThrow({
    where: { tenantId: fixture.tenantId, userId: fixture.actorUserId },
  })
  await assignCustomerChannelAttendant(fixture.db, {
    actorUserId: fixture.actorUserId,
    membershipId: membership.id,
    reason: "Run-owned central WhatsApp branch attendant",
    storeId: store.id,
    tenantId: fixture.tenantId,
  })
  await fixture.db.serviceCommercePolicyDecision.createMany({
    data: Object.values(ServiceCommercePolicyChannel).flatMap((channel) =>
      Object.values(ServiceCommercePolicySubject).map((subject) => ({
        approvalReference: `routing-policy-${store.id}`,
        channel,
        effectiveAt: fixture.fixtureStartedAt,
        evidenceReference: `routing-evidence-${store.id}`,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        jurisdictionCode: "NG",
        outcome: ServiceCommercePolicyOutcome.ALLOWED,
        reason: "Run-owned generic central routing approval",
        reviewedByUserId: fixture.actorUserId,
        storeId: store.id,
        subject,
        tenantId: fixture.tenantId,
        vertical: ServiceCommercePolicyVertical.SERVICE,
      })),
    ),
  })
  const profile = await updateServiceCommerceStoreProfile(fixture.db, {
    actorUserId: fixture.actorUserId,
    expectedRevision: 0,
    reason: "Configure generic central WhatsApp branch",
    settings: branchSettings,
    storeId: store.id,
    tenantId: fixture.tenantId,
  })
  await setServiceCommerceStoreProfileActivation(fixture.db, {
    active: true,
    actorUserId: fixture.actorUserId,
    expectedRevision: profile.revision,
    reason: "Activate generic central WhatsApp branch",
    storeId: store.id,
    tenantId: fixture.tenantId,
  })
  const entry = await publishCustomerEntryPoint(fixture.db, {
    actorUserId: fixture.actorUserId,
    storeId: store.id,
    tenantId: fixture.tenantId,
  })
  return { entryToken: entry.publicToken, storeId: store.id }
}

setDefaultTimeout(300_000)

describeWithServiceCommerceDatabase(
  "Generic Commerce WhatsApp routing matrix on Neon",
  () => {
    let primary: CommerceAcceptanceFixture
    let hostile: CommerceAcceptanceFixture

    beforeAll(async () => {
      primary = await createCommerceAcceptanceFixture()
      hostile = await createCommerceAcceptanceFixture()
      for (const fixture of [primary, hostile]) {
        const profile =
          await fixture.db.serviceCommerceStoreProfile.findFirstOrThrow({
            where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
          })
        await setServiceCommerceStoreProfileActivation(fixture.db, {
          active: true,
          actorUserId: fixture.actorUserId,
          expectedRevision: profile.revision,
          reason: "Activate generic Commerce WhatsApp routing fixture",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        })
      }
    })

    afterAll(async () => {
      let cleanupError: unknown
      try {
        if (hostile) await disposeCommerceAcceptanceFixture(hostile)
      } catch (error) {
        cleanupError = error
      }
      try {
        if (primary) await disposeCommerceAcceptanceFixture(primary)
      } catch (error) {
        cleanupError ??= error
      }
      if (cleanupError) throw cleanupError
    })

    test("isolates independent and central same-customer routes, rejects hostile bindings, and fails closed after revocation", async () => {
      const runId = randomUUID()
      const customer = "+2348020000000"

      const primaryRoute = await resolveWhatsAppInboundConnection(primary.db, {
        phoneNumberId: (
          await primary.db.whatsAppConnection.findUniqueOrThrow({
            where: { id: primary.connectionId },
          })
        ).phoneNumberId,
      })
      const hostileRoute = await resolveWhatsAppInboundConnection(hostile.db, {
        phoneNumberId: (
          await hostile.db.whatsAppConnection.findUniqueOrThrow({
            where: { id: hostile.connectionId },
          })
        ).phoneNumberId,
      })
      expect(primaryRoute.tenantId).not.toBe(hostileRoute.tenantId)

      const primaryInbound = await recordWhatsAppInboundEvent(primary.db, {
        connectionId: primary.connectionId,
        externalCustomerId: customer,
        messageType: "text",
        normalizedPayload: { intakeKind: "commerce_inquiry" },
        providerEventId: `routing-independent-primary-${runId}`,
        routeVertical: "service",
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      const hostileInbound = await recordWhatsAppInboundEvent(hostile.db, {
        connectionId: hostile.connectionId,
        externalCustomerId: customer,
        messageType: "text",
        normalizedPayload: { intakeKind: "commerce_inquiry" },
        providerEventId: `routing-independent-hostile-${runId}`,
        routeVertical: "service",
        storeId: hostile.storeId,
        tenantId: hostile.tenantId,
      })
      expect(primaryInbound.tenantId).toBe(primary.tenantId)
      expect(hostileInbound.tenantId).toBe(hostile.tenantId)
      expect(primaryInbound.id).not.toBe(hostileInbound.id)

      const primaryReplay = await recordWhatsAppInboundEvent(primary.db, {
        connectionId: primary.connectionId,
        externalCustomerId: customer,
        messageType: "text",
        normalizedPayload: { intakeKind: "commerce_inquiry" },
        providerEventId: `routing-independent-primary-${runId}`,
        routeVertical: "service",
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      expect(primaryReplay.id).toBe(primaryInbound.id)
      expect(
        await primary.db.whatsAppInboundEvent.count({
          where: {
            providerEventId: `routing-independent-primary-${runId}`,
          },
        }),
      ).toBe(1)
      const duplicateClaims = await Promise.all([
        claimWhatsAppInboundEvent(primary.db, {
          inboundEventId: primaryInbound.id,
        }),
        claimWhatsAppInboundEvent(primary.db, {
          inboundEventId: primaryInbound.id,
        }),
      ])
      expect(duplicateClaims.filter(Boolean)).toHaveLength(1)

      const primaryEntry = await publishCustomerEntryPoint(primary.db, {
        actorUserId: primary.actorUserId,
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      const branch = await activateGenericStore(primary, {
        name: "Generic Commerce Central Branch",
        slug: `generic-central-${runId}`,
      })
      await primary.db.whatsAppStoreBinding.create({
        data: {
          activatedAt: new Date(),
          boundByUserId: primary.actorUserId,
          connectionId: primary.connectionId,
          status: "ACTIVE",
          storeId: branch.storeId,
          tenantId: primary.tenantId,
        },
      })
      const central = await resolveWhatsAppInboundConnection(primary.db, {
        phoneNumberId: primaryRoute.phoneNumberId,
      })
      expect(central.requiresStoreSelection).toBe(true)
      await expect(
        resolveWhatsAppInboundStore(primary.db, {
          connectionId: primary.connectionId,
          tenantId: primary.tenantId,
        }),
      ).rejects.toMatchObject({ code: "AMBIGUOUS_ROUTING" })

      const mainBinding = await resolveWhatsAppInboundStore(primary.db, {
        channelToken: primaryEntry.publicToken,
        connectionId: primary.connectionId,
        tenantId: primary.tenantId,
      })
      const branchBinding = await resolveWhatsAppInboundStore(primary.db, {
        channelToken: branch.entryToken,
        connectionId: primary.connectionId,
        tenantId: primary.tenantId,
      })
      expect(mainBinding.storeId).toBe(primary.storeId)
      expect(branchBinding.storeId).toBe(branch.storeId)

      const centralStoreIds: string[] = []
      for (const [index, binding] of [mainBinding, branchBinding].entries()) {
        const event = await recordWhatsAppInboundEvent(primary.db, {
          connectionId: primary.connectionId,
          externalCustomerId: customer,
          messageType: "text",
          normalizedPayload: { intakeKind: "commerce_inquiry" },
          providerEventId: `routing-central-${index}-${runId}`,
          routeVertical: binding.routeVertical,
          storeId: binding.storeId,
          tenantId: binding.tenantId,
        })
        centralStoreIds.push(event.storeId)
      }
      expect(new Set(centralStoreIds)).toEqual(
        new Set([primary.storeId, branch.storeId]),
      )

      await primary.db.whatsAppStoreBinding.create({
        data: {
          activatedAt: new Date(),
          boundByUserId: primary.actorUserId,
          connectionId: primary.connectionId,
          status: "ACTIVE",
          storeId: hostile.storeId,
          tenantId: hostile.tenantId,
        },
      })
      const inboundBeforeHostileRoute =
        await primary.db.whatsAppInboundEvent.count({
          where: { connectionId: primary.connectionId },
        })
      await expect(
        resolveWhatsAppInboundConnection(primary.db, {
          phoneNumberId: primaryRoute.phoneNumberId,
        }),
      ).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND" })
      expect(
        await primary.db.whatsAppInboundEvent.count({
          where: { connectionId: primary.connectionId },
        }),
      ).toBe(inboundBeforeHostileRoute)

      await setWhatsAppConnectionLifecycle(hostile.db, {
        actorUserId: hostile.actorUserId,
        connectionId: hostile.connectionId,
        status: "revoked",
        tenantId: hostile.tenantId,
      })
      await expect(
        resolveWhatsAppInboundConnection(hostile.db, {
          phoneNumberId: hostileRoute.phoneNumberId,
        }),
      ).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND" })
      expect(
        await hostile.db.whatsAppStoreBinding.findFirst({
          where: {
            connectionId: hostile.connectionId,
            status: "SUSPENDED",
            storeId: hostile.storeId,
            tenantId: hostile.tenantId,
          },
        }),
      ).not.toBeNull()
    })
  },
)
