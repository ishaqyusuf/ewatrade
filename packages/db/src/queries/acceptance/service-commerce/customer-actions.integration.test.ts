import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  executeServiceCommerceCustomerAction,
  getPublicServiceCommerceCustomerAction,
  issueServiceCommerceCustomerActions,
} from "../../service-commerce-actions"
import {
  acceptServiceQuote,
  createServiceRequestForm,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: true,
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

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce customer actions on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const profile = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Prepare customer-action acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: profile.revision,
        reason: "Activate customer-action acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("issues digest-only actions, executes once, replays, and fails stale state closed", async () => {
      const runId = randomUUID()
      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Customer actions acceptance form",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const request = await submitPublicServiceRequest(fixture.db, {
        clientRequestId: `action-request-${runId}`,
        customerEmail: `action-${runId}@example.invalid`,
        customerName: "Action Customer",
        customerPhone: "+2348444444444",
        details: "Request a current quotation action.",
        formToken: form.token,
        lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
      })
      const quote = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `action-quote-${runId}`,
        clientVersionId: `action-version-${runId}`,
        lines: [
          {
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
            unitPriceMinor: 8_500,
          },
        ],
        requestId: request.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!quote.token) throw new Error("Expected a released Quote token.")

      const issued = await issueServiceCommerceCustomerActions(fixture.db, {
        actorUserId: fixture.actorUserId,
        channel: "web",
        clientBatchId: `action-batch-${runId}`,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        issueCapabilityToken: ({ clientCapabilityId }) =>
          `sca1.acceptance.${clientCapabilityId}`,
        source: { id: request.id, kind: "service" },
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const viewQuote = issued.actions.find(
        (action) => action.action === "view_quote",
      )
      if (!viewQuote) throw new Error("Expected a view Quote action.")
      const persisted =
        await fixture.db.serviceCommerceCustomerActionCapability.findFirstOrThrow(
          {
            where: {
              action: "VIEW_QUOTE",
              sourceId: request.id,
              tenantId: fixture.tenantId,
            },
          },
        )
      expect(persisted.tokenDigest).not.toContain("sca1.acceptance")
      await expect(
        getPublicServiceCommerceCustomerAction(fixture.db, {
          capabilityToken: viewQuote.capabilityToken,
        }),
      ).resolves.toMatchObject({ action: "view_quote", available: true })

      const command = {
        capabilityToken: viewQuote.capabilityToken,
        clientOperationId: `action-command-${runId}`,
        confirmed: false,
      }
      await expect(
        executeServiceCommerceCustomerAction(fixture.db, command),
      ).resolves.toMatchObject({ kind: "quote", replayed: false })
      await expect(
        executeServiceCommerceCustomerAction(fixture.db, command),
      ).resolves.toMatchObject({ kind: "quote", replayed: true })

      await acceptServiceQuote(fixture.db, {
        acceptanceToken: quote.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `action-acceptance-${runId}`,
      })
      await expect(
        getPublicServiceCommerceCustomerAction(fixture.db, {
          capabilityToken: viewQuote.capabilityToken,
        }),
      ).resolves.toMatchObject({
        available: false,
        recovery: "talk_to_staff",
      })
      expect(
        await fixture.db.serviceCommerceCustomerActionExecution.count({
          where: {
            capabilityId: persisted.id,
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(1)
    }, 180_000)
  },
)
