import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import {
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
  StoreStatus,
} from "../../../../generated/prisma/enums"
import {
  type ServiceCommercePolicyError,
  evaluateServiceCommercePolicy,
} from "../../service-commerce-policy"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce policy authority on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("fails closed by Store and jurisdiction, and keeps pharmacy WhatsApp and catalog decisions independent", async () => {
      const runId = randomUUID()
      const policyStore = await fixture.db.store.create({
        data: {
          countryCode: "NG",
          name: "Policy Authority Acceptance Store",
          slug: `policy-authority-${runId}`,
          status: StoreStatus.ACTIVE,
          tenantId: fixture.tenantId,
        },
      })
      const scope = {
        actorUserId: fixture.actorUserId,
        channel: "whatsapp" as const,
        purpose: "ticket_11_neon_policy_acceptance",
        storeId: policyStore.id,
        subject: "intake" as const,
        tenantId: fixture.tenantId,
        vertical: "pharmacy" as const,
      }

      try {
        // The fixture Store has broad explicit approvals, but those facts must
        // never bleed into another Store in the same Tenant.
        await expect(
          evaluateServiceCommercePolicy(fixture.db, scope),
        ).resolves.toMatchObject({
          outcome: "prohibited",
          reason: "prohibited_combination",
        })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, {
            ...scope,
            tenantId: `wrong-tenant-${runId}`,
          }),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
        } satisfies Partial<ServiceCommercePolicyError>)

        const allowedUntil = new Date(Date.now() + 60_000)
        const whatsappApproval =
          await fixture.db.serviceCommercePolicyDecision.create({
            data: {
              approvalReference: `written-meta-approval-${runId}`,
              channel: ServiceCommercePolicyChannel.WHATSAPP,
              effectiveAt: new Date(Date.now() - 60_000),
              evidenceReference: `private-policy-evidence-${runId}`,
              expiresAt: allowedUntil,
              jurisdictionCode: "NG",
              outcome: ServiceCommercePolicyOutcome.ALLOWED,
              reason: "Explicit written approval for QA verification only",
              reviewedByUserId: fixture.actorUserId,
              storeId: policyStore.id,
              subject: ServiceCommercePolicySubject.INTAKE,
              tenantId: fixture.tenantId,
              vertical: ServiceCommercePolicyVertical.PHARMACY,
            },
          })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, scope),
        ).resolves.toMatchObject({
          outcome: "allowed",
          reason: "policy_allowed",
        })

        await fixture.db.serviceCommercePolicyDecision.update({
          data: { expiresAt: new Date(Date.now() - 1) },
          where: { id: whatsappApproval.id },
        })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, scope),
        ).resolves.toMatchObject({
          outcome: "expired_approval",
          reason: "approval_expired",
        })

        await fixture.db.serviceCommercePolicyDecision.update({
          data: {
            expiresAt: allowedUntil,
            revokedAt: new Date(),
          },
          where: { id: whatsappApproval.id },
        })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, scope),
        ).resolves.toMatchObject({
          outcome: "restricted",
          reason: "approval_revoked",
        })

        await fixture.db.store.update({
          data: { countryCode: "GH" },
          where: { id: policyStore.id },
        })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, scope),
        ).resolves.toMatchObject({
          outcome: "pending_evidence",
          reason: "pending_evidence",
        })
        await fixture.db.store.update({
          data: { countryCode: null },
          where: { id: policyStore.id },
        })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, scope),
        ).resolves.toMatchObject({
          outcome: "pending_evidence",
          reason: "jurisdiction_missing",
        })

        await fixture.db.store.update({
          data: { countryCode: "NG" },
          where: { id: policyStore.id },
        })
        await fixture.db.serviceCommercePolicyDecision.createMany({
          data: [
            {
              approvalReference: `catalog-publication-approval-${runId}`,
              channel: ServiceCommercePolicyChannel.WEB,
              effectiveAt: new Date(Date.now() - 60_000),
              evidenceReference: `catalog-publication-evidence-${runId}`,
              expiresAt: allowedUntil,
              jurisdictionCode: "NG",
              outcome: ServiceCommercePolicyOutcome.ALLOWED,
              reason: "Publication approved independently",
              reviewedByUserId: fixture.actorUserId,
              storeId: policyStore.id,
              subject: ServiceCommercePolicySubject.CATALOG_PUBLICATION,
              tenantId: fixture.tenantId,
              vertical: ServiceCommercePolicyVertical.SERVICE,
            },
            {
              channel: ServiceCommercePolicyChannel.WEB,
              effectiveAt: new Date(Date.now() - 60_000),
              evidenceReference: `catalog-draft-evidence-${runId}`,
              expiresAt: allowedUntil,
              jurisdictionCode: "NG",
              outcome: ServiceCommercePolicyOutcome.RESTRICTED,
              reason: "Draft capture remains under review",
              reviewedByUserId: fixture.actorUserId,
              storeId: policyStore.id,
              subject: ServiceCommercePolicySubject.PROGRESSIVE_DRAFT_CAPTURE,
              tenantId: fixture.tenantId,
              vertical: ServiceCommercePolicyVertical.SERVICE,
            },
          ],
        })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, {
            ...scope,
            channel: "web",
            subject: "catalog_publication",
            vertical: "service",
          }),
        ).resolves.toMatchObject({ outcome: "allowed" })
        await expect(
          evaluateServiceCommercePolicy(fixture.db, {
            ...scope,
            channel: "web",
            subject: "progressive_draft_capture",
            vertical: "service",
          }),
        ).resolves.toMatchObject({
          outcome: "restricted",
          reason: "policy_restricted",
        })
      } finally {
        // This Store is run-owned test data. Remove its restrictive audit
        // dependants and policy decisions atomically before the fixture-wide
        // tenant cleanup runs.
        await fixture.db.$transaction(async (tx) => {
          await tx.serviceCommercePolicyAuditEvent.deleteMany({
            where: { storeId: policyStore.id, tenantId: fixture.tenantId },
          })
          await tx.serviceCommercePolicyDecision.deleteMany({
            where: { storeId: policyStore.id, tenantId: fixture.tenantId },
          })
          await tx.store.delete({ where: { id: policyStore.id } })
        })
      }
    })
  },
)
