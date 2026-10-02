import { randomUUID } from "node:crypto"

import { expect, test } from "bun:test"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { readCommercialOrderLinesComplete } from "../commercial-order-completion"
import { lockCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import {
  batchUpdateServiceJobs,
  recordServiceHandoff,
  splitServiceJobLine,
  transitionServiceJobLine,
} from "../service-work"
import { createFinanceBook } from "./accounts"

describeWithServiceCommerceDatabase(
  "service Order completion on verified development database",
  () => {
    test("handoff completes only fully performed Service obligations under Order locks", async () => {
      const { prisma: db } = await import("../../client")
      const suffix = randomUUID()
      let userId: string | undefined
      let tenantId: string | undefined
      let catalogItemId: string | undefined
      let financeBookId: string | undefined
      const orderIds: string[] = []
      const jobIds: string[] = []

      const cleanup = async () => {
        if (!tenantId && !userId) return
        await db.$transaction(async (tx) => {
          if (tenantId && jobIds.length > 0) {
            await tx.serviceJob.updateMany({
              where: { id: { in: jobIds }, tenantId },
              data: { splitFromJobId: null, reworkOfJobId: null },
            })
            await tx.serviceJob.deleteMany({
              where: { id: { in: jobIds }, tenantId },
            })
          }
          if (tenantId && orderIds.length > 0) {
            await tx.commercialOrderPayment.deleteMany({
              where: { orderId: { in: orderIds }, tenantId },
            })
            await tx.commercialOrder.deleteMany({
              where: { id: { in: orderIds }, tenantId },
            })
          }
          if (tenantId && catalogItemId) {
            await tx.catalogItem.deleteMany({
              where: { id: catalogItemId, tenantId },
            })
          }
          if (tenantId && financeBookId) {
            await tx.financeAccount.deleteMany({
              where: { bookId: financeBookId, book: { tenantId } },
            })
            await tx.financeBook.deleteMany({
              where: { id: financeBookId, tenantId },
            })
          }
          if (tenantId) await tx.tenant.deleteMany({ where: { id: tenantId } })
          if (userId) await tx.user.deleteMany({ where: { id: userId } })
        })
      }

      try {
        const user = await db.user.create({
          data: {
            email: `service-order-completion-${suffix}@example.invalid`,
            name: "Service Order completion acceptance",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            dataClassification: "QA",
            enabledModes: ["MERCHANT"],
            name: "Service Order completion acceptance",
            slug: `service-order-completion-${suffix}`,
            type: "MERCHANT",
            users: {
              create: { role: "OWNER", status: "ACTIVE", userId: user.id },
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: {
            name: "Service Order completion acceptance",
            slug: `service-order-completion-${suffix}`,
            status: "ACTIVE",
            tenantId: tenant.id,
          },
        })
        const book = await createFinanceBook(db, {
          actorUserId: user.id,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          tenantId: tenant.id,
        })
        financeBookId = book.id

        const item = await db.catalogItem.create({
          data: {
            kind: "SERVICE",
            name: "Tracked acceptance service",
            slug: `tracked-service-${suffix}`,
            status: "DRAFT",
            tenantId: tenant.id,
            service: { create: {} },
          },
        })
        catalogItemId = item.id
        const variant = await db.sellableVariant.create({
          data: {
            catalogItemId: item.id,
            isDefault: true,
            key: "default",
            name: "Tracked acceptance service",
            status: "DRAFT",
          },
        })
        const offering = await db.sellableOffering.create({
          data: {
            catalogItemId: item.id,
            currencyCode: "NGN",
            fixedPriceMinor: 1_000,
            key: "tracked-service",
            kind: "SERVICE",
            name: "Tracked acceptance service",
            pricingPolicy: "FIXED",
            status: "DRAFT",
            tenantId: tenant.id,
            variantId: variant.id,
            serviceOffering: {
              create: {
                authorizationPolicy: "ON_ORDER_CONFIRMATION",
                workPolicy: "TRACKED",
              },
            },
          },
        })

        const createOrderJob = async (input: {
          amountPaidMinor: number
          authorizationStatus?: "AUTHORIZED" | "PENDING_RELEASE"
          clientKey: string
          jobLineStatus?: "CANCELLED" | "QUEUED" | "READY_FOR_HANDOFF"
          allocatedQuantity?: string
          orderQuantity?: string
          paymentStatus: "PAID" | "PENDING"
          quantity: string
        }) => {
          const quantity = Number(input.orderQuantity ?? input.quantity)
          const order = await db.commercialOrder.create({
            data: {
              amountPaidMinor: input.amountPaidMinor,
              clientOrderId: `${input.clientKey}:${suffix}`,
              createdByUserId: user.id,
              currencyCode: "NGN",
              orderNumber: `QA-${input.clientKey}-${suffix}`,
              payloadHash: `qa:${input.clientKey}:${suffix}`,
              paymentStatus: input.paymentStatus,
              status: "CONFIRMED",
              storeId: store.id,
              subtotalMinor: quantity * 1_000,
              tenantId: tenant.id,
              totalMinor: quantity * 1_000,
              lines: {
                create: {
                  kind: "SERVICE",
                  offeringId: offering.id,
                  quantity: input.orderQuantity ?? input.quantity,
                  totalMinor: quantity * 1_000,
                  unitPriceMinor: 1_000,
                },
              },
            },
            include: { lines: true },
          })
          orderIds.push(order.id)
          const orderLine = order.lines[0]
          if (!orderLine) throw new Error("Order fixture has no line")
          const job = await db.serviceJob.create({
            data: {
              clientJobId: `${input.clientKey}-job:${suffix}`,
              commercialOrderId: order.id,
              createdByUserId: user.id,
              storeId: store.id,
              tenantId: tenant.id,
            },
          })
          jobIds.push(job.id)
          const line = await db.serviceJobLine.create({
            data: {
              allocatedQuantity: input.allocatedQuantity ?? input.quantity,
              allocationSnapshot: { fixture: "service-order-completion" },
              authorizationPolicy: "ON_ORDER_CONFIRMATION",
              authorizationSource:
                input.authorizationStatus === "PENDING_RELEASE"
                  ? null
                  : "order_confirmation",
              authorizationStatus: input.authorizationStatus ?? "AUTHORIZED",
              authorizedAt:
                input.authorizationStatus === "PENDING_RELEASE"
                  ? null
                  : new Date(),
              commercialOrderLineId: orderLine.id,
              serviceJobId: job.id,
              status: input.jobLineStatus ?? "READY_FOR_HANDOFF",
            },
          })
          return { job, line, order, orderLine }
        }

        const first = await createOrderJob({
          amountPaidMinor: 2_000,
          allocatedQuantity: "1",
          clientKey: "shared-order-first",
          paymentStatus: "PAID",
          orderQuantity: "2",
          quantity: "2",
        })
        // The shared Order line is quantity two; the second one-unit job below
        // completes the exact root allocation without adding another Order.
        const secondJob = await db.serviceJob.create({
          data: {
            clientJobId: `shared-order-second-job:${suffix}`,
            commercialOrderId: first.order.id,
            createdByUserId: user.id,
            storeId: store.id,
            tenantId: tenant.id,
          },
        })
        jobIds.push(secondJob.id)
        const secondLine = await db.serviceJobLine.create({
          data: {
            allocatedQuantity: "1",
            allocationSnapshot: { fixture: "service-order-completion" },
            authorizationPolicy: "ON_ORDER_CONFIRMATION",
            authorizationSource: "order_confirmation",
            authorizationStatus: "AUTHORIZED",
            authorizedAt: new Date(),
            commercialOrderLineId: first.orderLine.id,
            serviceJobId: secondJob.id,
            status: "READY_FOR_HANDOFF",
          },
        })
        const cancelled = await createOrderJob({
          amountPaidMinor: 0,
          clientKey: "cancelled-only",
          jobLineStatus: "CANCELLED",
          paymentStatus: "PENDING",
          quantity: "1",
        })
        const unauthorized = await createOrderJob({
          amountPaidMinor: 0,
          authorizationStatus: "PENDING_RELEASE",
          clientKey: "unauthorized",
          paymentStatus: "PENDING",
          quantity: "1",
        })

        const workOrder = await createOrderJob({
          amountPaidMinor: 2_000,
          clientKey: "work-writers",
          jobLineStatus: "QUEUED",
          paymentStatus: "PAID",
          quantity: "2",
        })

        const firstResult = await recordServiceHandoff(db, {
          actorUserId: user.id,
          clientCommandId: `first-handoff:${suffix}`,
          expectedRevision: first.job.revision,
          jobId: first.job.id,
          tenantId: tenant.id,
        })
        expect(firstResult.handedOffAt).toBeInstanceOf(Date)
        const afterFirstHandoff = await db.commercialOrder.findUniqueOrThrow({
          select: { completedAt: true, status: true },
          where: { id: first.order.id },
        })
        expect(afterFirstHandoff).toEqual({
          completedAt: null,
          status: "FULFILLING",
        })

        const secondCommand = `second-handoff:${suffix}`
        const secondHandoffInput = {
          actorUserId: user.id,
          clientCommandId: secondCommand,
          expectedRevision: secondJob.revision,
          jobId: secondJob.id,
          tenantId: tenant.id,
        }
        const raced = await Promise.all([
          recordServiceHandoff(db, secondHandoffInput),
          recordServiceHandoff(db, secondHandoffInput),
        ])
        const [winnerResult, retryResult] = raced
        expect(winnerResult?.handedOffAt).toBeInstanceOf(Date)
        expect(retryResult?.handedOffAt).toEqual(winnerResult?.handedOffAt)

        const completedOrder = await db.commercialOrder.findUniqueOrThrow({
          select: { completedAt: true, status: true },
          where: { id: first.order.id },
        })
        expect(completedOrder.status).toBe("COMPLETED")
        expect(completedOrder.completedAt).not.toBeNull()
        const events = await db.serviceWorkEvent.count({
          where: {
            serviceJobId: secondJob.id,
            type: "REMOTE_HANDOFF",
            tenantId: tenant.id,
          },
        })
        expect(events).toBe(1)
        expect(
          await db.serviceWorkEvent.count({
            where: {
              serviceJobLineId: secondLine.id,
              tenantId: tenant.id,
              type: "STATUS_CHANGED",
              toStatus: "COMPLETED",
            },
          }),
        ).toBe(1)
        await recordServiceHandoff(db, secondHandoffInput)
        expect(
          await db.commercialOrder.findUniqueOrThrow({
            select: { completedAt: true },
            where: { id: first.order.id },
          }),
        ).toEqual({ completedAt: completedOrder.completedAt })
        expect(
          await db.serviceJob.findMany({
            select: { completedAt: true, id: true, handedOffAt: true },
            where: {
              id: { in: [first.job.id, secondJob.id] },
              tenantId: tenant.id,
            },
          }),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: first.job.id,
              completedAt: expect.any(Date),
            }),
            expect.objectContaining({
              id: secondJob.id,
              completedAt: expect.any(Date),
            }),
          ]),
        )
        expect(
          await db.serviceJobLine.findMany({
            select: { completedAt: true, serviceJobId: true, status: true },
            where: {
              serviceJobId: { in: [first.job.id, secondJob.id] },
            },
          }),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              completedAt: expect.any(Date),
              serviceJobId: first.job.id,
              status: "COMPLETED",
            }),
            expect.objectContaining({
              completedAt: expect.any(Date),
              serviceJobId: secondJob.id,
              status: "COMPLETED",
            }),
          ]),
        )
        await expect(
          db.$transaction(async (tx) => {
            await lockCommerceFinancialOrder(tx, {
              orderId: first.order.id,
              tenantId: tenant.id,
            })
            return readCommercialOrderLinesComplete(tx, {
              orderId: first.order.id,
              storeId: store.id,
              tenantId: tenant.id,
            })
          }),
        ).resolves.toBe(true)

        for (const rejected of [cancelled, unauthorized]) {
          const before = await db.$transaction(async (tx) => ({
            job: await tx.serviceJob.findUniqueOrThrow({
              select: {
                completedAt: true,
                handedOffAt: true,
                revision: true,
              },
              where: { id: rejected.job.id },
            }),
            line: await tx.serviceJobLine.findUniqueOrThrow({
              select: {
                authorizationStatus: true,
                revision: true,
                status: true,
              },
              where: { id: rejected.line.id },
            }),
            payments: await tx.commercialOrderPayment.count({
              where: { orderId: rejected.order.id, tenantId: tenant.id },
            }),
            order: await tx.commercialOrder.findUniqueOrThrow({
              select: {
                amountPaidMinor: true,
                paymentStatus: true,
                status: true,
              },
              where: { id: rejected.order.id },
            }),
            events: await tx.serviceWorkEvent.count({
              where: { serviceJobId: rejected.job.id, tenantId: tenant.id },
            }),
          }))
          await expect(
            recordServiceHandoff(db, {
              actorUserId: user.id,
              clientCommandId: `rejected-handoff:${rejected.job.id}`,
              expectedRevision: rejected.job.revision,
              jobId: rejected.job.id,
              payment: { amountMinor: 1_000, method: "cash" },
              tenantId: tenant.id,
            }),
          ).rejects.toMatchObject({ code: "INVALID_SERVICE_TRANSITION" })
          const after = await db.$transaction(async (tx) => ({
            job: await tx.serviceJob.findUniqueOrThrow({
              select: {
                completedAt: true,
                handedOffAt: true,
                revision: true,
              },
              where: { id: rejected.job.id },
            }),
            line: await tx.serviceJobLine.findUniqueOrThrow({
              select: {
                authorizationStatus: true,
                revision: true,
                status: true,
              },
              where: { id: rejected.line.id },
            }),
            payments: await tx.commercialOrderPayment.count({
              where: { orderId: rejected.order.id, tenantId: tenant.id },
            }),
            order: await tx.commercialOrder.findUniqueOrThrow({
              select: {
                amountPaidMinor: true,
                paymentStatus: true,
                status: true,
              },
              where: { id: rejected.order.id },
            }),
            events: await tx.serviceWorkEvent.count({
              where: { serviceJobId: rejected.job.id, tenantId: tenant.id },
            }),
          }))
          expect(after).toEqual(before)
        }

        const inProgress = await transitionServiceJobLine(db, {
          actorUserId: user.id,
          clientCommandId: `writer-transition:${suffix}`,
          expectedRevision: workOrder.line.revision,
          lineId: workOrder.line.id,
          schemaVersion: 1,
          source: "acceptance_test",
          tenantId: tenant.id,
          toStatus: "in_progress",
        })
        const split = await splitServiceJobLine(db, {
          actorUserId: user.id,
          clientCommandId: `writer-split:${suffix}`,
          expectedRevision: inProgress.lines[0]?.revision ?? -1,
          lineId: workOrder.line.id,
          quantity: "1",
          reason: "Acceptance split",
          tenantId: tenant.id,
        })
        jobIds.push(split.targetJob.id)
        const batch = await batchUpdateServiceJobs(db, {
          action: "mark_ready",
          actorUserId: user.id,
          jobs: [split.sourceJob, split.targetJob].map((job) => ({
            expectedRevision: job.revision,
            jobId: job.id,
          })),
          reason: "Acceptance batch ready",
          tenantId: tenant.id,
        })
        expect(batch).toHaveLength(2)
        expect(
          batch.flatMap((job) => job.lines).map((line) => line.status),
        ).toEqual(["READY_FOR_HANDOFF", "READY_FOR_HANDOFF"])
      } finally {
        await cleanup()
      }
    }, 360_000)
  },
)
