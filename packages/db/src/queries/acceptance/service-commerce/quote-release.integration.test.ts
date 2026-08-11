import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import {
  CommerceQuoteError,
  approveCommerceQuoteVersion,
  getCommerceQuoteApprovalDetail,
  rejectCommerceQuoteVersion,
} from "../../commerce-quotes"
import {
  getServiceCommerceQuoteReleaseSettings,
  listPendingServiceCommerceQuoteApprovals,
  updateServiceCommerceQuoteReleaseSettings,
} from "../../service-commerce-quote-release"
import {
  createServiceRequestForm,
  getPublicServiceQuote,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceMember,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce quotation release on Neon",
  () => {
    let approverMembershipId: string
    let approverUserId: string
    let fixture: ServiceCommerceAcceptanceFixture
    let formToken: string

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const approver = await createServiceCommerceAcceptanceMember(fixture, {
        name: "Acceptance Quote Approver",
      })
      approverMembershipId = approver.membershipId
      approverUserId = approver.userId
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

    async function createRequest(runId: string) {
      return submitPublicServiceRequest(fixture.db, {
        clientRequestId: `quote-release-request-${runId}`,
        customerName: "Quotation Approval Customer",
        details: "Synthetic quotation approval acceptance request.",
        formToken,
        lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
      })
    }

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

      const request = await createRequest(runId)
      const prepared = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `approval-quote-${runId}`,
        clientVersionId: `approval-version-${runId}`,
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
      expect(prepared).toMatchObject({
        releaseState: "pending_approval",
        token: null,
      })
      const [sourceBefore, versionBefore, pending] = await Promise.all([
        fixture.db.serviceRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
        fixture.db.commerceQuoteVersion.findUniqueOrThrow({
          where: { id: prepared.versionId },
        }),
        listPendingServiceCommerceQuoteApprovals(fixture.db, {
          actorUserId: approverUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ])
      expect(sourceBefore.status).toBe("SUBMITTED")
      expect(versionBefore).toMatchObject({
        acceptanceTokenDigest: null,
        status: "DRAFT",
      })
      expect(pending).toHaveLength(1)
      const approval = pending[0]
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
        quoteId: prepared.quoteId,
        releaseState: "released",
        versionId: prepared.versionId,
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
      expect(
        await fixture.db.serviceRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
      ).toMatchObject({ status: "QUOTED" })
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
  },
)
