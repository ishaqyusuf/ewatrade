import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { requestAccountDeletion } from "./account-privacy"
import {
  accountPrivacyCommercialRetentionIsConfirmed,
  confirmAccountPrivacyRetainedCommercialRecords,
} from "./account-privacy-commercial-retention"
import { minimizeAccountPrivacyCustomers } from "./account-privacy-customer-minimization"
import { accountPrivacyRecordDecisionDigest } from "./account-privacy-record-policy"
import {
  expireAccountPrivacyRetainedRecord,
  inspectAccountPrivacyRetainedRecord,
  inspectAccountPrivacyRetentionRecord,
  retainAccountPrivacyRecord,
  reviewAccountPrivacyRetainedRecord,
} from "./account-privacy-record-retention"
import { assessAccountPrivacyRetainedRecordScope } from "./account-privacy-record-scope"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(360_000)
const databaseTests = enabled ? describe : describe.skip
const envKeys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_RECORD_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_RECORD_POLICY_SHA256",
]
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Fixture row missing")
  return value
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
databaseTests(
  "approved record lifecycle on disposable Development records",
  () => {
    test("preserves money and another actor, clears optional customer fields, binds reviewed source and holds, keeps original expiry and survives request-ledger removal", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const ids = {
        subject: randomUUID(),
        operator: randomUUID(),
        other: randomUUID(),
        tenant: randomUUID(),
        store: randomUUID(),
        order: randomUUID(),
        otherOrder: randomUUID(),
        customer: randomUUID(),
        otherCustomer: randomUUID(),
        conversation: randomUUID(),
        message: randomUUID(),
        otherMessage: randomUUID(),
        event: randomUUID(),
      }
      const { subject, operator, other, tenant, store } = ids
      const email = `privacy-record-${subject}@example.test`
      const previous = Object.fromEntries(
        envKeys.map((key) => [key, process.env[key]]),
      )
      let requestId: string | undefined
      const now = new Date()
      const madeAt = new Date("2026-01-01T00:00:00Z")
      const closedAt = new Date("2026-02-01T00:00:00Z")
      try {
        await prisma.user.createMany({
          data: [
            {
              id: subject,
              email,
              name: "Synthetic record subject",
              emailVerified: true,
            },
            {
              id: operator,
              email: `privacy-record-operator-${operator}@example.test`,
              name: "Synthetic operator",
              emailVerified: true,
              isPlatformAdmin: true,
            },
            {
              id: other,
              email: `privacy-record-other-${other}@example.test`,
              name: "Other synthetic subject",
              emailVerified: true,
            },
          ],
        })
        await prisma.tenant.create({
          data: {
            id: tenant,
            slug: `privacy-record-${tenant}`,
            name: "Disposable record fixture",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaMarkedAt: now,
            qaSourceDomain: "account-privacy-record-retention.test",
            countryCode: "NG",
          },
        })
        await prisma.store.create({
          data: {
            id: store,
            tenantId: tenant,
            slug: `privacy-record-${store}`,
            name: "Disposable record store",
            status: "ACTIVE",
          },
        })
        await prisma.customer.createMany({
          data: [
            {
              id: ids.customer,
              tenantId: tenant,
              name: "Synthetic optional profile",
              email,
              normalizedEmail: email,
              phone: "synthetic phone",
              normalizedPhone: "synthetic phone",
            },
            {
              id: ids.otherCustomer,
              tenantId: tenant,
              name: "Other customer",
              email: "other-record@example.test",
              normalizedEmail: "other-record@example.test",
            },
          ],
        })
        await prisma.commercialOrder.createMany({
          data: [
            { id: ids.order, actor: subject },
            { id: ids.otherOrder, actor: other },
          ].map(({ id, actor }) => ({
            id,
            tenantId: tenant,
            storeId: store,
            clientOrderId: randomUUID(),
            payloadHash: hash(id),
            orderNumber: id,
            currencyCode: "NGN",
            subtotalMinor: 12500,
            totalMinor: 12500,
            amountPaidMinor: 12500,
            paymentStatus: "PAID" as const,
            createdByUserId: actor,
            createdAt: madeAt,
          })),
        })
        await prisma.conversation.create({
          data: {
            id: ids.conversation,
            tenantId: tenant,
            channel: "IN_APP",
            status: "RESOLVED",
            createdAt: madeAt,
          },
        })
        await prisma.message.createMany({
          data: [
            {
              id: ids.message,
              sender: subject,
              body: "Synthetic subject text",
            },
            { id: ids.otherMessage, sender: other, body: "Other text stays" },
          ].map(({ id, sender, body }) => ({
            id,
            conversationId: ids.conversation,
            senderUserId: sender,
            direction: "INTERNAL" as const,
            body,
            createdAt: madeAt,
          })),
        })
        await prisma.automationEvent.create({
          data: {
            id: ids.event,
            tenantId: tenant,
            actorUserId: subject,
            type: "synthetic",
            status: "COMPLETED",
            processedAt: closedAt,
            payload: { synthetic: "subject" },
            createdAt: madeAt,
          },
        })
        const request = await requestAccountDeletion(prisma, subject, email)
        requestId = request.id
        await prisma.accountPrivacyRequest.update({
          where: { id: requestId },
          data: { status: "PROCESSING" },
        })
        await prisma.accountPrivacyAccessRevocation.create({
          data: {
            requestId,
            userId: subject,
            status: "REVOKED",
            completedAt: now,
          },
        })
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "qa-record-v1"
        const policy = JSON.stringify({
          version: "qa-record-v1",
          approvalReference: "synthetic-test-only-not-real-controller-proof",
          approvedAt: "2026-01-01T00:00:00Z",
          reviewAt: "2035-01-01T00:00:00Z",
          mode: "MINIMIZE_AND_RETAIN_APPROVED_RECORDS",
        })
        process.env.ACCOUNT_PRIVACY_RECORD_POLICY_JSON = policy
        process.env.ACCOUNT_PRIVACY_APPROVED_RECORD_POLICY_SHA256 = hash(policy)
        const base = {
          requestId,
          operatorUserId: operator,
          controllerEvidenceDigest: hash("synthetic controller receipt"),
          controllerInstructionsReviewed: true as const,
          minimumNecessaryRetentionReviewed: true as const,
          shorterPoliciesReviewed: true as const,
          holdsReviewed: true as const,
          hold: null,
          confirmedAt: new Date(),
        }
        const directory = await prisma.customer.findUniqueOrThrow({
          where: { id: ids.customer },
        })
        await prisma.commercialOrder.update({
          where: { id: ids.order },
          data: {
            customerId: directory.id,
            customerName: "Synthetic duplicated customer contact",
          },
        })
        await expect(
          minimizeAccountPrivacyCustomers(prisma, {
            requestId,
            operatorUserId: operator,
            customers: [
              {
                customerId: directory.id,
                expectedUpdatedAt: directory.updatedAt,
                controllerEvidenceDigest: hash("synthetic directory review"),
                subjectOwnershipReviewed: true,
                controllerInstructionsReviewed: true,
                optionalProfileFieldsReviewed: true,
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "CONTROLLER_EVIDENCE_REQUIRED" })
        expect(
          (
            await prisma.customer.findUniqueOrThrow({
              where: { id: directory.id },
            })
          ).email,
        ).toBe(email)
        await prisma.commercialOrder.update({
          where: { id: ids.order },
          data: { customerName: null },
        })
        const inspected = required(
          (
            await inspectAccountPrivacyRetentionRecord(prisma, {
              requestId,
              operatorUserId: operator,
              recordFamily: "commercialOrder",
              recordId: ids.order,
            })
          )[0],
        )
        expect(Object.keys(inspected)).not.toContain("subjectId")
        expect(inspected.sourceCreatedAt).toEqual(madeAt)
        expect(inspected.sourceEvidenceDigest).toMatch(/^[a-f0-9]{64}$/)
        const orderInput = {
          ...base,
          recordFamily: "commercialOrder" as const,
          recordId: ids.order,
          expectedSourceDigest: inspected.sourceEvidenceDigest,
          assessmentYear: 2026,
        }
        await expect(
          retainAccountPrivacyRecord(prisma, {
            ...orderInput,
            operatorUserId: other,
          }),
        ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
        await expect(
          retainAccountPrivacyRecord(prisma, {
            ...orderInput,
            recordId: ids.otherOrder,
          }),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        await expect(
          retainAccountPrivacyRecord(prisma, {
            ...orderInput,
            expectedSourceDigest: hash("stale"),
          }),
        ).rejects.toMatchObject({ code: "SOURCE_CHANGED" })
        expect(
          await retainAccountPrivacyRecord(prisma, orderInput),
        ).toMatchObject({ retained: 1, replayed: 0 })
        expect(
          await retainAccountPrivacyRecord(prisma, orderInput),
        ).toMatchObject({ retained: 0, replayed: 1 })
        await expect(
          retainAccountPrivacyRecord(prisma, {
            ...orderInput,
            assessmentYear: 2025,
          }),
        ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
        let plan = await prisma.accountPrivacyRecordRetention.findFirstOrThrow({
          where: { requestId, recordFamily: "commercialOrder" },
        })
        expect(plan.expiresAt.toISOString()).toBe("2033-01-01T00:00:00.000Z")
        expect(plan.decisionDigest).toBe(
          accountPrivacyRecordDecisionDigest(plan),
        )
        expect(
          await expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: plan.id,
          }),
        ).toEqual({ expired: false, held: false, replay: false })
        const customer = await prisma.customer.findUniqueOrThrow({
          where: { id: ids.customer },
        })
        const customerInput = {
          requestId,
          operatorUserId: operator,
          customers: [
            {
              customerId: customer.id,
              expectedUpdatedAt: customer.updatedAt,
              controllerEvidenceDigest: hash(
                "synthetic customer ownership receipt",
              ),
              subjectOwnershipReviewed: true as const,
              controllerInstructionsReviewed: true as const,
              optionalProfileFieldsReviewed: true as const,
            },
          ],
        }
        await expect(
          confirmAccountPrivacyRetainedCommercialRecords(prisma, {
            requestId,
            operatorUserId: operator,
          }),
        ).rejects.toMatchObject({ code: "CONTROLLER_EVIDENCE_REQUIRED" })
        expect(
          await minimizeAccountPrivacyCustomers(prisma, customerInput),
        ).toMatchObject({
          profilesMinimized: 1,
          financialRecordsDeleted: 0,
          replay: false,
        })
        expect(
          await minimizeAccountPrivacyCustomers(prisma, customerInput),
        ).toMatchObject({ replay: true })
        expect(
          await prisma.customer.findUnique({
            where: { id: customer.id },
            select: {
              name: true,
              email: true,
              normalizedEmail: true,
              phone: true,
              normalizedPhone: true,
            },
          }),
        ).toEqual({
          name: "Deleted customer",
          email: null,
          normalizedEmail: null,
          phone: null,
          normalizedPhone: null,
        })
        await expect(
          minimizeAccountPrivacyCustomers(prisma, {
            ...customerInput,
            customers: [
              {
                ...required(customerInput.customers[0]),
                customerId: ids.otherCustomer,
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        expect(
          await confirmAccountPrivacyRetainedCommercialRecords(prisma, {
            requestId,
            operatorUserId: operator,
          }),
        ).toMatchObject({ recordsRetained: 1, replay: false })
        const commercial =
          await prisma.accountPrivacyDomainOutcome.findUniqueOrThrow({
            where: {
              requestId_domain: { requestId, domain: "COMMERCIAL_RECORDS" },
            },
          })
        expect(
          await accountPrivacyCommercialRetentionIsConfirmed(prisma, {
            requestId,
            subjectId: subject,
            contactEmail: email,
            outcome: commercial,
            now: new Date(),
          }),
        ).toBe(true)
        await prisma.commercialOrder.update({
          where: { id: ids.order },
          data: { notes: "Synthetic later transaction note" },
        })
        expect(
          await accountPrivacyCommercialRetentionIsConfirmed(prisma, {
            requestId,
            subjectId: subject,
            contactEmail: email,
            outcome: commercial,
            now: new Date(),
          }),
        ).toBe(false)
        const current = required(
          (
            await inspectAccountPrivacyRetainedRecord(prisma, {
              retentionId: plan.id,
              operatorUserId: operator,
            })
          )[0],
        )
        await reviewAccountPrivacyRetainedRecord(prisma, {
          retentionId: plan.id,
          operatorUserId: operator,
          controllerEvidenceDigest: hash("synthetic new necessity review"),
          controllerInstructionsReviewed: true,
          sourceReviewed: true,
          expectedSourceDigest: current.sourceEvidenceDigest,
          hold: null,
        })
        plan = await prisma.accountPrivacyRecordRetention.findUniqueOrThrow({
          where: { id: plan.id },
        })
        expect(plan.expiresAt.toISOString()).toBe("2033-01-01T00:00:00.000Z")
        expect(
          (
            await assessAccountPrivacyRetainedRecordScope(prisma, {
              requestId,
              subjectId: subject,
              families: ["commercialOrder"],
            })
          ).valid,
        ).toBe(true)
        // Existing domain evidence must be deliberately refreshed, never silently treated as the old reviewed state.
        expect(
          await accountPrivacyCommercialRetentionIsConfirmed(prisma, {
            requestId,
            subjectId: subject,
            contactEmail: email,
            outcome: commercial,
            now: new Date(),
          }),
        ).toBe(false)
        expect(
          await confirmAccountPrivacyRetainedCommercialRecords(prisma, {
            requestId,
            operatorUserId: operator,
          }),
        ).toMatchObject({ replay: false, recordsRetained: 1 })
        const renewed =
          await prisma.accountPrivacyDomainOutcome.findUniqueOrThrow({
            where: {
              requestId_domain: { requestId, domain: "COMMERCIAL_RECORDS" },
            },
          })
        expect(
          await accountPrivacyCommercialRetentionIsConfirmed(prisma, {
            requestId,
            subjectId: subject,
            contactEmail: email,
            outcome: renewed,
            now: new Date(),
          }),
        ).toBe(true)
        for (const [family, id] of [
          ["legacyMessage", ids.message],
          ["automationEvent", ids.event],
        ] as const) {
          const snapshot = required(
            (
              await inspectAccountPrivacyRetentionRecord(prisma, {
                requestId,
                operatorUserId: operator,
                recordFamily: family,
                recordId: id,
              })
            )[0],
          )
          expect(
            await retainAccountPrivacyRecord(prisma, {
              ...base,
              recordFamily: family,
              recordId: id,
              expectedSourceDigest: snapshot.sourceEvidenceDigest,
              closedAt,
            }),
          ).toMatchObject({ retained: 1 })
        }
        const messagePlan =
          await prisma.accountPrivacyRecordRetention.findFirstOrThrow({
            where: { requestId, recordFamily: "legacyMessage" },
          })
        expect(messagePlan.expiresAt.toISOString()).toBe(
          "2028-02-01T00:00:00.000Z",
        )
        await prisma.message.update({
          where: { id: ids.message },
          data: { body: "Later synthetic content" },
        })
        await expect(
          expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: messagePlan.id,
            now: new Date("2028-02-02Z"),
          }),
        ).rejects.toMatchObject({ code: "SOURCE_CHANGED" })
        const messageSnapshot = required(
          (
            await inspectAccountPrivacyRetainedRecord(prisma, {
              retentionId: messagePlan.id,
              operatorUserId: operator,
            })
          )[0],
        )
        await reviewAccountPrivacyRetainedRecord(prisma, {
          retentionId: messagePlan.id,
          operatorUserId: operator,
          controllerEvidenceDigest: hash("synthetic shared final review"),
          controllerInstructionsReviewed: true,
          sourceReviewed: true,
          expectedSourceDigest: messageSnapshot.sourceEvidenceDigest,
          hold: null,
          now: new Date("2028-02-02Z"),
        })
        expect(
          await expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: messagePlan.id,
            now: new Date("2028-02-02Z"),
          }),
        ).toMatchObject({ expired: true })
        expect(
          await expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: messagePlan.id,
            now: new Date("2028-02-02Z"),
          }),
        ).toMatchObject({ replay: true })
        expect(
          await prisma.message.findUnique({
            where: { id: ids.message },
            select: { senderUserId: true, body: true },
          }),
        ).toEqual({ senderUserId: null, body: "[Removed at account deletion]" })
        expect(
          await prisma.message.findUnique({
            where: { id: ids.otherMessage },
            select: { senderUserId: true, body: true },
          }),
        ).toEqual({ senderUserId: other, body: "Other text stays" })
        const eventPlan =
          await prisma.accountPrivacyRecordRetention.findFirstOrThrow({
            where: { requestId, recordFamily: "automationEvent" },
          })
        expect(
          await expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: eventPlan.id,
            now: new Date("2028-02-02Z"),
          }),
        ).toMatchObject({ expired: true })
        expect(
          await prisma.automationEvent.findUnique({
            where: { id: ids.event },
            select: { actorUserId: true, payload: true },
          }),
        ).toEqual({ actorUserId: null, payload: null })
        const due = new Date("2033-01-02T00:00:00Z")
        const orderSnapshot = required(
          (
            await inspectAccountPrivacyRetainedRecord(prisma, {
              retentionId: plan.id,
              operatorUserId: operator,
            })
          )[0],
        )
        await reviewAccountPrivacyRetainedRecord(prisma, {
          retentionId: plan.id,
          operatorUserId: operator,
          controllerEvidenceDigest: hash("synthetic hold receipt"),
          controllerInstructionsReviewed: true,
          sourceReviewed: true,
          expectedSourceDigest: orderSnapshot.sourceEvidenceDigest,
          hold: { reason: "LEGAL_HOLD", reviewAt: new Date("2033-02-01Z") },
          now: due,
        })
        expect(
          await expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: plan.id,
            now: due,
          }),
        ).toMatchObject({ held: true, expired: false })
        await expect(
          expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: plan.id,
            now: new Date("2033-02-02Z"),
          }),
        ).rejects.toMatchObject({ code: "HOLD_REVIEW_REQUIRED" })
        await reviewAccountPrivacyRetainedRecord(prisma, {
          retentionId: plan.id,
          operatorUserId: operator,
          controllerEvidenceDigest: hash("synthetic resolved hold receipt"),
          controllerInstructionsReviewed: true,
          sourceReviewed: true,
          expectedSourceDigest: orderSnapshot.sourceEvidenceDigest,
          hold: null,
          now: new Date("2033-02-02Z"),
        })
        await prisma.accountPrivacyDomainOutcome.deleteMany({
          where: { requestId },
        })
        await prisma.accountPrivacyAccessRevocation.deleteMany({
          where: { requestId },
        })
        await prisma.accountPrivacyRequest.delete({ where: { id: requestId } })
        expect(
          await prisma.accountPrivacyRecordRetention.count({
            where: { id: plan.id },
          }),
        ).toBe(1)
        expect(
          await expireAccountPrivacyRetainedRecord(prisma, {
            retentionId: plan.id,
            now: new Date("2033-02-02Z"),
          }),
        ).toMatchObject({ expired: true })
        expect(
          await prisma.commercialOrder.findUnique({
            where: { id: ids.order },
            select: {
              createdByUserId: true,
              totalMinor: true,
              amountPaidMinor: true,
            },
          }),
        ).toEqual({
          createdByUserId: "account-privacy-expired",
          totalMinor: 12500,
          amountPaidMinor: 12500,
        })
        expect(
          await prisma.commercialOrder.findUnique({
            where: { id: ids.otherOrder },
            select: { createdByUserId: true, totalMinor: true },
          }),
        ).toEqual({ createdByUserId: other, totalMinor: 12500 })
        expect(
          await prisma.customer.findUnique({
            where: { id: ids.otherCustomer },
            select: { name: true, email: true },
          }),
        ).toEqual({
          name: "Other customer",
          email: "other-record@example.test",
        })
      } finally {
        await prisma.accountPrivacyRecordRetention.deleteMany({
          where: { subjectUserId: subject },
        })
        if (requestId) {
          await prisma.accountPrivacyDomainOutcome.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyAccessRevocation.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyRequest.deleteMany({
            where: { id: requestId },
          })
        }
        await prisma.tenant.deleteMany({ where: { id: tenant } })
        await prisma.user.deleteMany({
          where: { id: { in: [subject, operator, other] } },
        })
        expect(await prisma.tenant.count({ where: { id: tenant } })).toBe(0)
        expect(
          await prisma.user.count({
            where: { id: { in: [subject, operator, other] } },
          }),
        ).toBe(0)
        for (const key of envKeys) {
          if (previous[key] === undefined)
            Reflect.deleteProperty(process.env, key)
          else process.env[key] = previous[key]
        }
        await prisma.$disconnect()
      }
    })
  },
)
