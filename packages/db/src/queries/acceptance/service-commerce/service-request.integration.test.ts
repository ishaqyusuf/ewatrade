import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import {
  acceptServiceQuote,
  createServiceRequestForm,
  getPublicServiceQuote,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce generic Service compatibility",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("completes the Commerce Quote Service request-to-order lifecycle", async () => {
      const runId = randomUUID()
      const requestForm = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Acceptance Service Form",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const requestInput = {
        clientRequestId: `service-request-${runId}`,
        customerEmail: `service-${runId}@example.invalid`,
        customerName: "Synthetic Service Customer",
        customerPhone: "+2348222222222",
        details: "Synthetic regression request.",
        formToken: requestForm.token,
        lines: [
          {
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
          },
        ],
      }
      const request = await submitPublicServiceRequest(fixture.db, requestInput)
      await expect(
        submitPublicServiceRequest(fixture.db, requestInput),
      ).resolves.toMatchObject({ id: request.id })

      const issued = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `service-quote-${runId}`,
        clientVersionId: `service-quote-version-${runId}`,
        lines: [
          {
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
            unitPriceMinor: 7_500,
          },
        ],
        requestId: request.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!issued.token) throw new Error("Service Quote token was not issued.")
      await expect(
        getPublicServiceQuote(fixture.db, { acceptanceToken: issued.token }),
      ).resolves.toMatchObject({
        accepted: false,
        sourceType: "service_request",
        storeName: "Acceptance Pharmacy",
        totalMinor: 7_500,
        version: 1,
      })

      const acceptanceInput = {
        acceptanceToken: issued.token,
        actorUserId: fixture.actorUserId,
        clientAcceptanceId: `service-acceptance-${runId}`,
      }
      const accepted = await acceptServiceQuote(fixture.db, acceptanceInput)
      await expect(
        acceptServiceQuote(fixture.db, acceptanceInput),
      ).resolves.toEqual(accepted)

      const [convertedRequest, order, publicAccepted] = await Promise.all([
        fixture.db.serviceRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
        fixture.db.commercialOrder.findUniqueOrThrow({
          include: { lines: true },
          where: { id: accepted.orderId },
        }),
        getPublicServiceQuote(fixture.db, { acceptanceToken: issued.token }),
      ])
      expect(convertedRequest.status).toBe("CONVERTED")
      expect(convertedRequest.convertedAt).toBeInstanceOf(Date)
      expect(order).toMatchObject({
        customerEmail: requestInput.customerEmail,
        customerName: requestInput.customerName,
        customerPhone: requestInput.customerPhone,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        totalMinor: 7_500,
      })
      expect(order.lines).toHaveLength(1)
      expect(order.lines[0]).toMatchObject({
        kind: "SERVICE",
        offeringId: fixture.serviceOfferingId,
        totalMinor: 7_500,
        unitPriceMinor: 7_500,
      })
      expect(publicAccepted).toMatchObject({
        accepted: true,
        totalMinor: 7_500,
      })
    }, 180_000)
  },
)
