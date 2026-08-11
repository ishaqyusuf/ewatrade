import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  getPublicPrescriptionRequestStatus,
  submitPublicPrescriptionRequest,
} from "../../prescription-requests"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  getServiceCommerceCustomerRequestProjection,
  loadServiceCommerceSourceSnapshot,
} from "../../service-commerce-sources"
import {
  createServiceRequestForm,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  type AppointmentAcceptanceFixture,
  createAppointmentAcceptanceFixture,
  disposeAppointmentAcceptanceFixture,
} from "./appointment.fixture"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const appointmentSettings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: true,
    delivery: false,
    intake: true,
    payment: true,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: true,
    staff: true,
    web: true,
    whatsapp: true,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: true,
}

setDefaultTimeout(300_000)

describeWithServiceCommerceDatabase(
  "Service Commerce cross-vertical customer isolation on Neon",
  () => {
    let appointment: AppointmentAcceptanceFixture
    let pharmacy: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      appointment = await createAppointmentAcceptanceFixture()
      pharmacy = await createServiceCommerceAcceptanceFixture()
      const profile = await updateServiceCommerceStoreProfile(appointment.db, {
        actorUserId: appointment.actorUserId,
        expectedRevision: 0,
        reason: "Cross-vertical isolation acceptance",
        settings: appointmentSettings,
        storeId: appointment.storeId,
        tenantId: appointment.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(appointment.db, {
        active: true,
        actorUserId: appointment.actorUserId,
        expectedRevision: profile.revision,
        reason: "Activate cross-vertical isolation acceptance",
        storeId: appointment.storeId,
        tenantId: appointment.tenantId,
      })
    })

    afterAll(async () => {
      let cleanupError: unknown
      try {
        if (appointment) await disposeAppointmentAcceptanceFixture(appointment)
      } catch (error) {
        cleanupError = error
      }
      try {
        if (pharmacy) await disposeServiceCommerceAcceptanceFixture(pharmacy)
      } catch (error) {
        cleanupError ??= error
      }
      if (cleanupError) throw cleanupError
    })

    test("keeps one customer identity scoped to each vertical Tenant and exposes only safe projections", async () => {
      const runId = randomUUID()
      const sharedPhone = "+2348555555555"
      const form = await createServiceRequestForm(appointment.db, {
        actorUserId: appointment.actorUserId,
        label: "Cross-vertical appointment request",
        offeringIds: [appointment.serviceOfferingId],
        storeId: appointment.storeId,
        tenantId: appointment.tenantId,
      })
      const service = await submitPublicServiceRequest(appointment.db, {
        clientRequestId: `cross-vertical-service-${runId}`,
        consent: {
          contactOptIn: true,
          privacyNoticeVersion: "cross-vertical-v1",
        },
        customerName: "Same Customer",
        customerPhone: sharedPhone,
        details: "Book a consultation.",
        formToken: form.token,
        lines: [{ offeringId: appointment.serviceOfferingId, quantity: "1" }],
      })
      const prescription = await submitPublicPrescriptionRequest(pharmacy.db, {
        clientRequestId: `cross-vertical-prescription-${runId}`,
        consentAcceptedAt: new Date(),
        consentVersion: "cross-vertical-v1",
        contactOptIn: true,
        customerName: "Same Customer",
        customerPhone: sharedPhone,
        fulfilmentPreference: "pickup",
        manualIntakeText: "Private customer-entered medicine request.",
        media: [],
        publicToken: pharmacy.publicToken,
      })
      if (!prescription.statusToken)
        throw new Error("Cross-vertical status token missing.")

      const [serviceRow, prescriptionRow] = await Promise.all([
        appointment.db.serviceRequest.findUniqueOrThrow({
          where: { id: service.id },
        }),
        pharmacy.db.prescriptionRequest.findUniqueOrThrow({
          where: { id: prescription.requestId },
        }),
      ])
      expect(serviceRow).toMatchObject({
        customerPhone: sharedPhone,
        tenantId: appointment.tenantId,
      })
      expect(prescriptionRow).toMatchObject({
        customerPhone: sharedPhone,
        tenantId: pharmacy.tenantId,
      })
      expect(serviceRow.tenantId).not.toBe(prescriptionRow.tenantId)

      const [serviceProjection, prescriptionProjection] = await Promise.all([
        getServiceCommerceCustomerRequestProjection(appointment.db, {
          actorUserId: appointment.actorUserId,
          source: { id: service.id, kind: "service" },
          storeId: appointment.storeId,
          tenantId: appointment.tenantId,
        }),
        getPublicPrescriptionRequestStatus(pharmacy.db, {
          statusToken: prescription.statusToken,
        }),
      ])
      expect(serviceProjection).toMatchObject({
        source: { id: service.id, kind: "service" },
        state: "received",
        store: { id: appointment.storeId },
      })
      expect(prescriptionProjection).toMatchObject({
        status: "received",
        storeName: "Acceptance Pharmacy",
      })
      expect(JSON.stringify(serviceProjection)).not.toContain(sharedPhone)
      expect(JSON.stringify(prescriptionProjection)).not.toContain(sharedPhone)
      expect(JSON.stringify(prescriptionProjection)).not.toContain(
        "Private customer-entered medicine request.",
      )

      const [serviceFromPharmacyScope, prescriptionFromAppointmentScope] =
        await Promise.all([
          loadServiceCommerceSourceSnapshot(appointment.db, {
            source: { id: service.id, kind: "service" },
            storeId: pharmacy.storeId,
            tenantId: pharmacy.tenantId,
          }),
          loadServiceCommerceSourceSnapshot(pharmacy.db, {
            source: { id: prescription.requestId, kind: "prescription" },
            storeId: appointment.storeId,
            tenantId: appointment.tenantId,
          }),
        ])
      expect(serviceFromPharmacyScope).toBeNull()
      expect(prescriptionFromAppointmentScope).toBeNull()
    }, 300_000)
  },
)
