import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  getCommercialOrderReportSummary,
  listCommercialOrdersPage,
  lookupCommercialOrders,
} from "./commercial-orders"
import { listCommercialOrderPaymentsPage } from "./commercial-payments"
import { globalSearch } from "./global-search"
import { getOrderReceipts } from "./order-receipts"
import {
  resolveOrderScope,
  updateStoreOrderVisibility,
} from "./order-visibility"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
;(enabled ? describe : describe.skip)(
  "sales rep visibility on guarded Development",
  () => {
    test("new defaults, live filters, lookup separation, Store isolation and shared review", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma: db } = await import("../client")
      const id = randomUUID()
      const tenantId = `visibility-${id}`
      const userId = `rep-${id}`
      let created = false
      try {
        await db.tenant.create({
          data: {
            id: tenantId,
            slug: tenantId,
            name: "Order visibility QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "order-visibility.test",
            qaMarkedAt: new Date(),
          },
        })
        created = true
        const a = await db.store.create({
          data: { tenantId, slug: "a", name: "Store A" },
        })
        const b = await db.store.create({
          data: {
            tenantId,
            slug: "b",
            name: "Store B",
            salesRepOrderVisibility: "ALL_STORE_ORDERS",
          },
        })
        expect(a.salesRepOrderVisibility).toBe("OWN_SALES")
        expect(a.salesRepOrderVisibilityReviewedAt).toBeInstanceOf(Date)
        for (const [key, storeId, actor, paid, completed] of [
          ["own", a.id, userId, false, false],
          ["other-open", a.id, "other-rep", false, false],
          ["other-closed", a.id, "other-rep", true, true],
          ["other-store", b.id, "other-rep", false, false],
        ] as const) {
          await db.commercialOrder.create({
            data: {
              id: `${id}-${key}`,
              tenantId,
              storeId,
              createdByUserId: actor,
              clientOrderId: key,
              payloadHash: key,
              orderNumber: `VIS-${id}-${key}`,
              currencyCode: "NGN",
              subtotalMinor: 100,
              totalMinor: 100,
              customerName: "Visibility Customer",
              customerPhone: "+234800000001",
              paymentStatus: paid ? "PAID" : "PENDING",
              status: completed
                ? "COMPLETED"
                : key === "other-open"
                  ? "PENDING"
                  : "CONFIRMED",
              completedAt: completed ? new Date() : null,
              payments: {
                create: {
                  tenantId,
                  storeId,
                  clientPaymentId: key,
                  amountMinor: 50,
                  method: "CASH",
                  type: "PAYMENT",
                  recordedByUserId: actor,
                },
              },
            },
          })
        }
        const scope = (role: string, storeId = a.id) =>
          resolveOrderScope(db, {
            tenantId,
            userId,
            role,
            activeStoreId: storeId,
            allowedStoreIds: [a.id, b.id],
          })
        for (const role of ["CASHIER", "OPERATOR"]) {
          const own = await scope(role)
          const page = await listCommercialOrdersPage(db, own)
          expect(page.items.map((order) => order.id)).toEqual([`${id}-own`])
          expect(page.totalCount).toBe(1)
          expect(await getCommercialOrderReportSummary(db, own)).toEqual({
            orderCount: 1,
            orderValueMinor: 100,
          })
          const payments = await listCommercialOrderPaymentsPage(db, {
            ...own,
            defaultCurrencyCode: "NGN",
          })
          expect(payments.totalCount).toBe(1)
          expect(payments.currencyTotals).toEqual([
            { currencyCode: "NGN", totalAmountMinor: 50 },
          ])
          expect(
            (
              await globalSearch(db, {
                tenantId,
                orderScope: own,
                canSearchStaff: false,
                query: "Visibility",
              })
            ).filter((result) => result.type === "order"),
          ).toHaveLength(1)
          expect(
            (
              await globalSearch(db, {
                tenantId,
                orderScope: own,
                canSearchStaff: false,
                query: `VIS-${id}-other-closed`,
              })
            ).filter((result) => result.type === "order"),
          ).toHaveLength(1)
          const lookup = await lookupCommercialOrders(db, {
            ...own,
            phone: "+234800000001",
          })
          expect(lookup.map((order) => order.id).sort()).toEqual(
            [`${id}-other-open`, `${id}-own`].sort(),
          )
          expect(Array.isArray(lookup)).toBe(true)
          expect(
            (
              await lookupCommercialOrders(db, {
                ...own,
                orderNumber: `VIS-${id}-other-closed`,
              })
            )[0]?.id,
          ).toBe(`${id}-other-closed`)
          await expect(
            getOrderReceipts(db, {
              ...own,
              storeId: a.id,
              orderIds: [`${id}-own`, `${id}-other-open`],
            }),
          ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
          expect(
            (await listCommercialOrdersPage(db, await scope(role, b.id))).items,
          ).toHaveLength(1)
        }
        for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
          expect(
            (await listCommercialOrdersPage(db, await scope(role))).items,
          ).toHaveLength(4)
        }
        const changed = await updateStoreOrderVisibility(db, {
          tenantId,
          storeId: a.id,
          userId,
          visibility: "ALL_STORE_ORDERS",
        })
        expect(changed?.salesRepOrderVisibilityUpdatedByUserId).toBe(userId)
        expect(
          (await listCommercialOrdersPage(db, await scope("CASHIER")))
            .totalCount,
        ).toBe(3)
        await updateStoreOrderVisibility(db, {
          tenantId,
          storeId: a.id,
          userId,
          visibility: "OWN_SALES",
        })
        expect(
          (await listCommercialOrdersPage(db, await scope("CASHIER")))
            .totalCount,
        ).toBe(1)
        await db.store.update({
          where: { id: a.id },
          data: { salesRepOrderVisibilityReviewedAt: null },
        })
        const kept = await updateStoreOrderVisibility(db, {
          tenantId,
          storeId: a.id,
          userId,
        })
        expect(kept?.salesRepOrderVisibilityReviewedAt).toBeInstanceOf(Date)
        expect(kept?.salesRepOrderVisibility).toBe("OWN_SALES")
      } finally {
        if (created) {
          await db.commercialOrder.deleteMany({ where: { tenantId } })
          await db.tenant.delete({ where: { id: tenantId } })
          expect(await db.tenant.count({ where: { id: tenantId } })).toBe(0)
        }
      }
    })
  },
)
