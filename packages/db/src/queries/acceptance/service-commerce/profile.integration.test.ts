import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  ServiceCommerceAccessError,
  getServiceCommerceWorkspaceAccess,
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    booking: false,
    delivery: true,
    intake: true,
    payment: true,
    pickup: true,
    progressive_catalog: true,
    quote: true,
    service_completion: true,
    staff: true,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce Store profile on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("keeps configuration and activation scoped, audited and concurrency safe", async () => {
      const initial = await getServiceCommerceWorkspaceAccess(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(initial.configuration.status).toBe("disabled")
      expect(initial.revision).toBe(0)
      expect(initial.access).toEqual({
        canManage: true,
        canOperate: true,
        exceptionalAccess: false,
      })

      const configurationInput = {
        actorUserId: fixture.actorUserId,
        expectedRevision: initial.revision,
        reason: "Prepare the first Service Commerce rollout",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const configurationOutcomes = await Promise.allSettled([
        updateServiceCommerceStoreProfile(fixture.db, configurationInput),
        updateServiceCommerceStoreProfile(fixture.db, configurationInput),
      ])
      expect(
        configurationOutcomes.filter(
          (outcome) => outcome.status === "fulfilled",
        ),
      ).toHaveLength(1)
      const configurationConflict = configurationOutcomes.find(
        (outcome) => outcome.status === "rejected",
      )
      expect(configurationConflict?.status).toBe("rejected")
      if (configurationConflict?.status === "rejected") {
        expect(configurationConflict.reason).toBeInstanceOf(
          ServiceCommerceAccessError,
        )
        expect(
          (configurationConflict.reason as ServiceCommerceAccessError).code,
        ).toBe("CONFLICT")
      }
      const configuredOutcome = configurationOutcomes.find(
        (outcome) => outcome.status === "fulfilled",
      )
      if (!configuredOutcome || configuredOutcome.status !== "fulfilled") {
        throw new Error("Initial Service Commerce configuration did not win.")
      }
      const configured = configuredOutcome.value
      expect(configured.configuration).toEqual({
        ...settings,
        status: "disabled",
      })
      expect(configured.activationBlockers).toEqual([])

      const activationInput = {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate the approved Store rollout",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const outcomes = await Promise.allSettled([
        setServiceCommerceStoreProfileActivation(fixture.db, activationInput),
        setServiceCommerceStoreProfileActivation(fixture.db, activationInput),
      ])
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1)
      const rejected = outcomes.find((outcome) => outcome.status === "rejected")
      expect(rejected?.status).toBe("rejected")
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(ServiceCommerceAccessError)
        expect((rejected.reason as ServiceCommerceAccessError).code).toBe(
          "CONFLICT",
        )
      }

      const active = await getServiceCommerceWorkspaceAccess(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(active.configuration.status).toBe("active")
      expect(active.canCreateAssistedRequest).toBe(true)
      expect(active.revision).toBe(configured.revision + 1)

      await fixture.db.serviceCommerceStoreProfile.updateMany({
        data: { policyRestrictedCapabilities: ["payment"] },
        where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
      })
      const restricted = await getServiceCommerceWorkspaceAccess(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(restricted.readiness.capabilities.payment.readiness).toBe(
        "restricted",
      )

      const audit = await fixture.db.serviceCommerceStoreAuditEvent.findMany({
        orderBy: { effectiveAt: "asc" },
        select: {
          actorUserId: true,
          currentSnapshot: true,
          previousSnapshot: true,
          reason: true,
          storeId: true,
          tenantId: true,
          type: true,
        },
        where: {
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      expect(audit).toHaveLength(2)
      expect(audit.map((event) => event.type)).toEqual([
        "PROFILE_CREATED",
        "ACTIVATED",
      ])
      expect(audit[0]).toMatchObject({
        actorUserId: fixture.actorUserId,
        previousSnapshot: null,
        reason: "Prepare the first Service Commerce rollout",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(audit[1]).toMatchObject({
        actorUserId: fixture.actorUserId,
        reason: "Activate the approved Store rollout",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })

      await expect(
        getServiceCommerceWorkspaceAccess(fixture.db, {
          actorUserId: fixture.actorUserId,
          storeId: "cross-store-attempt",
          tenantId: fixture.tenantId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        getServiceCommerceWorkspaceAccess(fixture.db, {
          actorUserId: fixture.actorUserId,
          storeId: fixture.storeId,
          tenantId: "cross-tenant-attempt",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    })
  },
)
