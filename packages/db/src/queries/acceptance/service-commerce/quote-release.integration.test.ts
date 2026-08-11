import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  MembershipStatus,
  PrescriptionStoreRoleType,
  ServiceCommerceStoreTeamCapability,
} from "../../../../generated/prisma/enums"
import {
  CommerceQuoteError,
  approveCommerceQuoteVersion,
  getCommerceQuoteApprovalDetail,
  rejectCommerceQuoteVersion,
} from "../../commerce-quotes"
import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import { submitServiceCommerceIntake } from "../../service-commerce-intake"
import {
  ServiceCommerceQuoteReleaseError,
  getServiceCommerceQuoteReleaseSettings,
  listPendingServiceCommerceQuoteApprovals,
  updateServiceCommerceQuoteReleaseSettings,
} from "../../service-commerce-quote-release"
import {
  createServiceRequestForm,
  getPublicServiceQuote,
  issueServiceQuote,
} from "../../service-public"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceMember,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const channelNeutralQuoteSettings: ServiceCommerceProfileSettings = {
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

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce quotation release on Neon",
  () => {
    let approverMembershipId: string
    let approverUserId: string
    let connectionId: string
    let entryToken: string
    let fixture: ServiceCommerceAcceptanceFixture
    let formToken: string

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const approver = await createServiceCommerceAcceptanceMember(fixture, {
        name: "Acceptance Quote Approver",
      })
      approverMembershipId = approver.membershipId
      approverUserId = approver.userId
      const runId = randomUUID()
      const connection = await fixture.db.whatsAppConnection.create({
        data: {
          businessDisplayName: "Quotation Release Acceptance",
          businessVerified: true,
          createdByUserId: fixture.actorUserId,
          credentialReference: `quote-release-private-${runId}`,
          displayNumber: "+2348000000002",
          numberVerified: true,
          outboundVerified: true,
          phoneNumberId: `quote-release-phone-${runId}`,
          status: "ACTIVE",
          templatesReady: true,
          tenantId: fixture.tenantId,
          wabaId: `quote-release-waba-${runId}`,
          webhookSubscribed: true,
        },
      })
      connectionId = connection.id
      await fixture.db.whatsAppStoreBinding.create({
        data: {
          activatedAt: new Date(),
          boundByUserId: fixture.actorUserId,
          connectionId,
          status: "ACTIVE",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      const profile = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Configure channel-neutral quotation release acceptance",
        settings: channelNeutralQuoteSettings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: profile.revision,
        reason: "Activate channel-neutral quotation release acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const entry = await publishCustomerEntryPoint(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      entryToken = entry.publicToken
      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Quotation Approval Acceptance",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      formToken = form.token
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    async function createRequest(
      runId: string,
      channel: "staff" | "web" | "whatsapp" = "web",
    ) {
      const customer = {
        name: `Quotation ${channel} customer`,
        phone: "+2348011111111",
      }
      const intent = {
        customer,
        details: "Synthetic channel-neutral quotation release request.",
        formToken,
        kind: "service" as const,
        lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
      }
      const result =
        channel === "web"
          ? await submitServiceCommerceIntake(fixture.db, {
              envelope: {
                channel,
                clientCommandId: `quote-release-web-${runId}`,
                consent: {
                  contactOptIn: true,
                  privacyNoticeVersion: "quote-release-acceptance-v1",
                },
                context: { kind: "entry_point", token: entryToken },
                intent,
              },
            })
          : channel === "staff"
            ? await submitServiceCommerceIntake(fixture.db, {
                actorUserId: fixture.actorUserId,
                envelope: {
                  channel,
                  clientCommandId: `quote-release-staff-${runId}`,
                  consent: {
                    contactOptIn: false,
                    privacyNoticeVersion: "quote-release-acceptance-v1",
                  },
                  context: { kind: "store", storeId: fixture.storeId },
                  intent,
                },
                tenantId: fixture.tenantId,
              })
            : await createWhatsAppRequest(runId, intent)
      if (result.status !== "accepted" || result.source.kind !== "service") {
        throw new Error(`Expected ${channel} Service Request intake.`)
      }
      return { channel: result.channel, id: result.source.id }
    }

    async function createWhatsAppRequest(
      runId: string,
      intent: {
        customer: { name: string; phone: string }
        details: string
        formToken: string
        kind: "service"
        lines: Array<{ offeringId: string; quantity: string }>
      },
    ) {
      const providerEventId = `quote-release-wamid-${runId}`
      const inbound = await fixture.db.whatsAppInboundEvent.create({
        data: {
          connectionId,
          externalCustomerId: intent.customer.phone,
          messageType: "text",
          normalizedPayload: { intakeKind: "service", text: intent.details },
          providerEventId,
          routeVertical: "SERVICE",
          status: "PROCESSING",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      return submitServiceCommerceIntake(fixture.db, {
        envelope: {
          channel: "whatsapp",
          clientCommandId: `whatsapp:${providerEventId}`,
          consent: {
            contactOptIn: true,
            privacyNoticeVersion: "whatsapp-customer-initiated-v1",
          },
          context: { inboundEventId: inbound.id, kind: "inbound_event" },
          intent,
          providerEventId,
        },
      })
    }

    async function createChannelRequests(runId: string) {
      const requests = []
      for (const channel of ["web", "staff", "whatsapp"] as const) {
        requests.push(await createRequest(`${runId}-${channel}`, channel))
      }
      return requests
    }

    async function issueChannelQuotes(
      runId: string,
      prefix: "approval" | "default",
      requests: Array<{ channel: "staff" | "web" | "whatsapp"; id: string }>,
    ) {
      const quotes = []
      for (const request of requests) {
        quotes.push(
          await issueServiceQuote(fixture.db, {
            actorUserId: fixture.actorUserId,
            clientQuoteId: `${prefix}-quote-${runId}-${request.channel}`,
            clientVersionId: `${prefix}-version-${runId}-${request.channel}`,
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
          }),
        )
      }
      return quotes
    }

    test("releases the default attendant path for web, staff and WhatsApp intake", async () => {
      const runId = randomUUID()
      const initial = await getServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(initial.policy).toMatchObject({
        mode: "attendant_can_release",
        persisted: false,
        revision: 0,
      })
      const requests = await createChannelRequests(runId)
      const released = await issueChannelQuotes(runId, "default", requests)
      expect(released).toEqual(
        expect.arrayContaining(
          requests.map((request) =>
            expect.objectContaining({
              releaseState: "released",
              token: expect.any(String),
            }),
          ),
        ),
      )
      for (const release of released) {
        if (!release.token)
          throw new Error("Default release did not issue a token.")
        await expect(
          getPublicServiceQuote(fixture.db, { acceptanceToken: release.token }),
        ).resolves.toMatchObject({ totalMinor: 7_500, version: 1 })
      }
      const sources = await fixture.db.serviceRequest.findMany({
        select: { channelOrigin: true, status: true },
        where: { id: { in: requests.map((request) => request.id) } },
      })
      expect(sources).toHaveLength(3)
      expect(sources.map((source) => source.channelOrigin).sort()).toEqual([
        "STAFF",
        "WEB",
        "WHATSAPP",
      ])
      expect(sources.every((source) => source.status === "QUOTED")).toBe(true)
    }, 180_000)

    test("keeps an exact version private until another selected account approves it", async () => {
      const runId = randomUUID()
      const initial = await getServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(initial.policy).toMatchObject({
        mode: "attendant_can_release",
        persisted: false,
        revision: 0,
      })
      await updateServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `approval-policy-${runId}`,
        expectedRevision: initial.policy.revision,
        mode: "approval_required",
        reason: "Require a second commercial review",
        selectedApproverMembershipIds: [approverMembershipId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })

      const requests = await createChannelRequests(runId)
      const prepared = await issueChannelQuotes(runId, "approval", requests)
      expect(prepared).toEqual(
        expect.arrayContaining(
          requests.map(() =>
            expect.objectContaining({
              releaseState: "pending_approval",
              token: null,
            }),
          ),
        ),
      )
      const [sourcesBefore, versionsBefore, pending] = await Promise.all([
        fixture.db.serviceRequest.findMany({
          where: { id: { in: requests.map((request) => request.id) } },
        }),
        fixture.db.commerceQuoteVersion.findMany({
          where: { id: { in: prepared.map((quote) => quote.versionId) } },
        }),
        listPendingServiceCommerceQuoteApprovals(fixture.db, {
          actorUserId: approverUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ])
      expect(sourcesBefore).toHaveLength(3)
      expect(
        sourcesBefore.every((source) => source.status === "SUBMITTED"),
      ).toBe(true)
      expect(versionsBefore).toHaveLength(3)
      expect(
        versionsBefore.every(
          (version) =>
            version.acceptanceTokenDigest === null &&
            version.status === "DRAFT",
        ),
      ).toBe(true)
      expect(pending).toHaveLength(3)
      const webRequestIndex = requests.findIndex(
        (request) => request.channel === "web",
      )
      const quote = prepared[webRequestIndex]
      if (!quote) throw new Error("Expected the web prepared Quote.")
      const approval = pending.find(
        (candidate) => candidate.quoteVersionId === quote.versionId,
      )
      if (!approval) throw new Error("Pending approval was not created.")
      expect(approval).toMatchObject({ canApprove: true, canReject: true })
      await expect(
        approveCommerceQuoteVersion(fixture.db, {
          actorUserId: fixture.actorUserId,
          approvalId: approval.id,
          clientDecisionId: `creator-decision-${runId}`,
          expectedPolicyRevision: approval.policyRevision,
          quoteId: approval.quoteId,
          quoteVersionId: approval.quoteVersionId,
          reason: "Creator must not approve their own Quote",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toBeInstanceOf(CommerceQuoteError)

      const decision = {
        actorUserId: approverUserId,
        approvalId: approval.id,
        clientDecisionId: `approver-decision-${runId}`,
        expectedPolicyRevision: approval.policyRevision,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        reason: "Exact total and options verified",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const [first, second] = await Promise.all([
        approveCommerceQuoteVersion(fixture.db, decision),
        approveCommerceQuoteVersion(fixture.db, decision),
      ])
      expect(first).toMatchObject({
        quoteId: quote.quoteId,
        releaseState: "released",
        versionId: quote.versionId,
      })
      expect(second).toMatchObject({
        quoteId: first.quoteId,
        releaseState: "released",
        versionId: first.versionId,
      })
      expect(first.token).not.toBe(second.token)
      await expect(
        getPublicServiceQuote(fixture.db, { acceptanceToken: first.token }),
      ).resolves.toMatchObject({ totalMinor: 7_500, version: 1 })
      await expect(
        getCommerceQuoteApprovalDetail(fixture.db, {
          actorUserId: approverUserId,
          approvalId: approval.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).resolves.toMatchObject({
        actions: { canApprove: false, canReject: false },
        status: "approved",
      })
      const released = [first]
      for (const preparedQuote of prepared) {
        if (preparedQuote.versionId === quote.versionId) continue
        const pendingApproval = pending.find(
          (candidate) => candidate.quoteVersionId === preparedQuote.versionId,
        )
        if (!pendingApproval) {
          throw new Error("Expected a pending approval for every origin.")
        }
        released.push(
          await approveCommerceQuoteVersion(fixture.db, {
            actorUserId: approverUserId,
            approvalId: pendingApproval.id,
            clientDecisionId: `approver-decision-${runId}-${preparedQuote.versionId}`,
            expectedPolicyRevision: pendingApproval.policyRevision,
            quoteId: pendingApproval.quoteId,
            quoteVersionId: pendingApproval.quoteVersionId,
            reason: "Exact total and options verified",
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          }),
        )
      }
      for (const release of released) {
        await expect(
          getPublicServiceQuote(fixture.db, { acceptanceToken: release.token }),
        ).resolves.toMatchObject({ totalMinor: 7_500, version: 1 })
      }
      const sourcesAfter = await fixture.db.serviceRequest.findMany({
        where: { id: { in: requests.map((request) => request.id) } },
      })
      expect(sourcesAfter).toHaveLength(3)
      expect(sourcesAfter.every((source) => source.status === "QUOTED")).toBe(
        true,
      )
    }, 180_000)

    test("preserves rejection history and requires a new immutable version", async () => {
      const runId = randomUUID()
      const settings = await getServiceCommerceQuoteReleaseSettings(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const request = await createRequest(runId)
      const baseInput = {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `rejected-quote-${runId}`,
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
      }
      const first = await issueServiceQuote(fixture.db, {
        ...baseInput,
        clientVersionId: `rejected-version-${runId}`,
      })
      const [approval] = await listPendingServiceCommerceQuoteApprovals(
        fixture.db,
        {
          actorUserId: approverUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      if (!approval || approval.quoteVersionId !== first.versionId) {
        throw new Error("Expected the rejected Quote approval.")
      }
      await rejectCommerceQuoteVersion(fixture.db, {
        actorUserId: approverUserId,
        approvalId: approval.id,
        clientDecisionId: `reject-${runId}`,
        expectedPolicyRevision: settings.policy.revision,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        reason: "Price needs correction",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await expect(
        issueServiceQuote(fixture.db, {
          ...baseInput,
          clientVersionId: `rejected-version-${runId}`,
        }),
      ).resolves.toMatchObject({
        releaseState: "rejected",
        token: null,
        versionId: first.versionId,
      })
      const revised = await issueServiceQuote(fixture.db, {
        ...baseInput,
        clientVersionId: `revised-version-${runId}`,
        lines: [
          {
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
            unitPriceMinor: 7_250,
          },
        ],
      })
      expect(revised).toMatchObject({
        releaseState: "pending_approval",
        token: null,
      })
      const history = await fixture.db.serviceCommerceQuoteApproval.findMany({
        orderBy: { requestedAt: "asc" },
        where: { quoteId: first.quoteId, tenantId: fixture.tenantId },
      })
      expect(history.map((item) => item.status)).toEqual([
        "REJECTED",
        "PENDING",
      ])
      expect(history.map((item) => item.quoteVersionId)).toEqual([
        first.versionId,
        revised.versionId,
      ])
    }, 180_000)

    test("fails closed when the selected approver loses membership after preparation", async () => {
      const runId = randomUUID()
      let settings = await getServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await updateServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `removed-approver-policy-${runId}`,
        expectedRevision: settings.policy.revision,
        mode: "approval_required",
        reason: "Verify membership again when the Quote is released.",
        selectedApproverMembershipIds: [approverMembershipId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      settings = await getServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const request = await createRequest(runId)
      const prepared = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `removed-approver-quote-${runId}`,
        clientVersionId: `removed-approver-version-${runId}`,
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
      if (!prepared.approvalId) throw new Error("Expected pending approval.")

      await fixture.db.membership.update({
        data: { status: MembershipStatus.REMOVED },
        where: { id: approverMembershipId },
      })

      await expect(
        approveCommerceQuoteVersion(fixture.db, {
          actorUserId: approverUserId,
          approvalId: prepared.approvalId,
          clientDecisionId: `removed-approver-decision-${runId}`,
          expectedPolicyRevision: settings.policy.revision,
          quoteId: prepared.quoteId,
          quoteVersionId: prepared.versionId,
          reason: "A removed membership cannot release a Quote.",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toBeInstanceOf(ServiceCommerceQuoteReleaseError)

      const [approval, version, source] = await Promise.all([
        fixture.db.serviceCommerceQuoteApproval.findUniqueOrThrow({
          where: { id: prepared.approvalId },
        }),
        fixture.db.commerceQuoteVersion.findUniqueOrThrow({
          where: { id: prepared.versionId },
        }),
        fixture.db.serviceRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
      ])
      expect(version).toMatchObject({
        acceptanceTokenDigest: null,
        status: "DRAFT",
      })
      expect(approval.status).toBe("PENDING")
      expect(source.status).toBe("SUBMITTED")
    }, 180_000)

    test("keeps pharmacist, attendant and commercial approval capabilities independent", async () => {
      const runId = randomUUID()
      const actorMembership = await fixture.db.membership.findFirstOrThrow({
        where: { tenantId: fixture.tenantId, userId: fixture.actorUserId },
      })
      const settings = await getServiceCommerceQuoteReleaseSettings(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const replacement = await createServiceCommerceAcceptanceMember(fixture, {
        name: "Independent Commercial Approver",
      })
      await updateServiceCommerceQuoteReleaseSettings(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `role-composition-policy-${runId}`,
        expectedRevision: settings.policy.revision,
        mode: "approval_required",
        reason: "Exercise independent Store capabilities.",
        selectedApproverMembershipIds: [
          actorMembership.id,
          replacement.membershipId,
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const [actorAssignments, actorClinicalRoles, approverClinicalRoles] =
        await Promise.all([
          fixture.db.serviceCommerceStoreTeamAssignment.findMany({
            select: { capability: true },
            where: {
              membershipId: actorMembership.id,
              status: "ACTIVE",
              storeId: fixture.storeId,
              tenantId: fixture.tenantId,
            },
          }),
          fixture.db.prescriptionStoreRole.findMany({
            select: { role: true },
            where: {
              status: "ACTIVE",
              storeId: fixture.storeId,
              tenantId: fixture.tenantId,
              userId: fixture.actorUserId,
            },
          }),
          fixture.db.prescriptionStoreRole.findMany({
            where: {
              status: "ACTIVE",
              storeId: fixture.storeId,
              tenantId: fixture.tenantId,
              userId: replacement.userId,
            },
          }),
        ])
      expect(actorAssignments.map((item) => item.capability)).toEqual(
        expect.arrayContaining([
          ServiceCommerceStoreTeamCapability.ATTENDANT,
          ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
        ]),
      )
      expect(actorClinicalRoles.map((item) => item.role)).toEqual(
        expect.arrayContaining([
          PrescriptionStoreRoleType.ATTENDANT,
          PrescriptionStoreRoleType.PHARMACIST,
        ]),
      )
      expect(approverClinicalRoles).toHaveLength(0)

      const request = await createRequest(runId)
      const prepared = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `role-composition-quote-${runId}`,
        clientVersionId: `role-composition-version-${runId}`,
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
      if (!prepared.approvalId) throw new Error("Expected pending approval.")
      const detail = await getCommerceQuoteApprovalDetail(fixture.db, {
        actorUserId: replacement.userId,
        approvalId: prepared.approvalId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(detail.actions).toMatchObject({
        canApprove: true,
        canReject: true,
      })
      expect(JSON.stringify(detail)).not.toMatch(
        /test-license|prescription|transcription|clinical/i,
      )
    }, 180_000)
  },
)
