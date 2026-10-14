import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test"
import { randomUUID } from "node:crypto"
import { resolveEffectiveMessageTemplate } from "@ewatrade/customer-messages"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { expireAccountPrivacyRecordSource } from "../account-privacy-record-sources"
import { previewCustomerMessageInTransaction } from "./preview"
import { customerMessageTemplatePrivacyInventory } from "./privacy"
import { CustomerMessageError } from "./scope"
import {
  readMessageTemplates,
  writeCustomerMessageTemplateInTransaction,
} from "./templates"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(60_000)
const databaseTests = enabled ? describe : describe.skip
const expectedHost = "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech"
const expectedPath = "/ewatrade_qa_v1"
class Rollback extends Error {}
let db: PrismaClient

beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  if (
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local"
  )
    throw Error(
      "Customer message integration checks require the verified local Development profile.",
    )
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (target.hostname !== expectedHost || target.pathname !== expectedPath)
    throw Error(
      "Customer message checks require the authorized ewatrade_qa_v1 target.",
    )
  const { PrismaClient } = await import("../../../generated/prisma/client")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 20_000,
      query_timeout: 25_000,
    }),
  })
  await db.$queryRaw`SELECT 1`
}, 30_000)

afterAll(async () => {
  if (db) await db.$disconnect()
})

function fixtureIds() {
  return {
    tenantId: randomUUID(),
    storeId: randomUUID(),
    ownerUserId: randomUUID(),
    ownerMembershipId: randomUUID(),
    cashierUserId: randomUUID(),
    cashierMembershipId: randomUUID(),
    assignmentId: randomUUID(),
    ownerOrderId: randomUUID(),
    cashierOrderId: randomUUID(),
    ownerPaymentId: randomUUID(),
    ownerRefundId: randomUUID(),
    cashierPaymentId: randomUUID(),
  }
}
type Ids = ReturnType<typeof fixtureIds>

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw Error("Expected template row was not returned.")
  return value
}

async function seed(tx: Prisma.TransactionClient, ids: Ids) {
  const now = new Date()
  await tx.tenant.create({
    data: {
      id: ids.tenantId,
      slug: `customer-messages-${ids.tenantId}`,
      name: "Customer Messages QA",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      qaSourceDomain: "customer-messages.integration.test",
      qaMarkedAt: now,
      countryCode: "NG",
    },
  })
  await tx.user.createMany({
    data: [
      {
        id: ids.ownerUserId,
        email: `cm-owner-${ids.ownerUserId}@example.test`,
        name: "Synthetic Owner",
      },
      {
        id: ids.cashierUserId,
        email: `cm-cashier-${ids.cashierUserId}@example.test`,
        name: "Synthetic Cashier",
      },
    ],
  })
  await tx.membership.createMany({
    data: [
      {
        id: ids.ownerMembershipId,
        tenantId: ids.tenantId,
        userId: ids.ownerUserId,
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        id: ids.cashierMembershipId,
        tenantId: ids.tenantId,
        userId: ids.cashierUserId,
        role: "CASHIER",
        status: "ACTIVE",
        staffAccessMode: "SCOPED",
      },
    ],
  })
  await tx.store.create({
    data: {
      id: ids.storeId,
      tenantId: ids.tenantId,
      slug: `customer-messages-${ids.storeId}`,
      name: "Synthetic QA Store",
      status: "ACTIVE",
      countryCode: "NG",
      salesRepOrderVisibility: "OWN_SALES",
    },
  })
  await tx.staffStoreAssignment.create({
    data: {
      id: ids.assignmentId,
      tenantId: ids.tenantId,
      membershipId: ids.cashierMembershipId,
      storeId: ids.storeId,
      role: "CASHIER",
      status: "ACTIVE",
      updatedByUserId: ids.ownerUserId,
    },
  })
  await tx.commercialOrder.createMany({
    data: [
      {
        id: ids.ownerOrderId,
        orderNumber: "CM-OWNER",
        createdByUserId: ids.ownerUserId,
      },
      {
        id: ids.cashierOrderId,
        orderNumber: "CM-CASHIER",
        createdByUserId: ids.cashierUserId,
      },
    ].map((order) => ({
      ...order,
      tenantId: ids.tenantId,
      storeId: ids.storeId,
      clientOrderId: randomUUID(),
      payloadHash: randomUUID().replaceAll("-", ""),
      currencyCode: "NGN",
      subtotalMinor: 50_000,
      totalMinor: 50_000,
      amountPaidMinor: 12_500,
      paymentStatus: "PARTIALLY_PAID" as const,
      status: "CONFIRMED" as const,
      customerName: "Synthetic Customer",
      customerPhone: "+2348012345678",
      createdAt: now,
    })),
  })
  await tx.commercialOrderPayment.createMany({
    data: [
      {
        id: ids.ownerPaymentId,
        orderId: ids.ownerOrderId,
        type: "PAYMENT" as const,
        amountMinor: 12_500,
      },
      {
        id: ids.ownerRefundId,
        orderId: ids.ownerOrderId,
        type: "REFUND" as const,
        amountMinor: 2_500,
      },
      {
        id: ids.cashierPaymentId,
        orderId: ids.cashierOrderId,
        type: "PAYMENT" as const,
        amountMinor: 12_500,
      },
    ].map((payment) => ({
      ...payment,
      tenantId: ids.tenantId,
      storeId: ids.storeId,
      clientPaymentId: payment.id,
      method: "CASH" as const,
      recordedByUserId: ids.ownerUserId,
      recordedAt: now,
    })),
  })
}

async function rolledBack(
  ids: Ids,
  templateIds: string[],
  run: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  try {
    await db.$transaction(
      async (tx) => {
        await seed(tx, ids)
        await run(tx)
        throw new Rollback()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
    throw Error("Fixture transaction unexpectedly committed.")
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  } finally {
    expect(
      await db.customerMessageTemplate.count({
        where: { tenantId: ids.tenantId },
      }),
    ).toBe(0)
    for (const id of templateIds)
      expect(
        await db.customerMessageTemplate.findUnique({ where: { id } }),
      ).toBeNull()
    expect(
      await db.commercialOrder.count({
        where: { id: { in: [ids.ownerOrderId, ids.cashierOrderId] } },
      }),
    ).toBe(0)
    expect(
      await db.commercialOrderPayment.count({
        where: {
          id: {
            in: [ids.ownerPaymentId, ids.ownerRefundId, ids.cashierPaymentId],
          },
        },
      }),
    ).toBe(0)
    expect(
      await db.staffStoreAssignment.count({ where: { id: ids.assignmentId } }),
    ).toBe(0)
    expect(
      await db.membership.count({
        where: { id: { in: [ids.ownerMembershipId, ids.cashierMembershipId] } },
      }),
    ).toBe(0)
    expect(await db.store.count({ where: { id: ids.storeId } })).toBe(0)
    expect(
      await db.user.count({
        where: { id: { in: [ids.ownerUserId, ids.cashierUserId] } },
      }),
    ).toBe(0)
    expect(await db.tenant.count({ where: { id: ids.tenantId } })).toBe(0)
  }
}

function owner(ids: Ids) {
  return {
    tenantId: ids.tenantId,
    storeId: ids.storeId,
    actorUserId: ids.ownerUserId,
  }
}

// Synthetic Order/payment rows are persisted read-scope controls, not canonical financial posting evidence.
databaseTests("Customer message guarded rollback integration", () => {
  test("saves business wording, honors a disabled Store override, and binds reset/recreate to fresh row identity", async () => {
    const ids = fixtureIds()
    const templateIds: string[] = []
    await rolledBack(ids, templateIds, async (tx) => {
      const base = owner(ids)
      const businessWrite = {
        ...base,
        eventKey: "order.recorded" as const,
        scope: "business" as const,
        expectedRevision: 0,
      }
      const business = await writeCustomerMessageTemplateInTransaction(
        tx,
        businessWrite,
        {
          body: "Hi {customer_first_name}, order {order_number} is recorded.",
          enabled: true,
          source: "MANUAL",
        },
      )
      templateIds.push(required(business.template?.id))
      expect(business.template).toMatchObject({
        scopeKey: "business",
        revision: 1,
        enabled: true,
      })

      const storeWrite = {
        ...base,
        eventKey: "order.recorded" as const,
        scope: "store" as const,
        expectedRevision: 0,
      }
      const disabled = await writeCustomerMessageTemplateInTransaction(
        tx,
        storeWrite,
        { enabled: false },
      )
      const disabledId = required(disabled.template?.id)
      templateIds.push(disabledId)
      expect(disabled.template).toMatchObject({
        scopeKey: `store:${ids.storeId}`,
        revision: 1,
        enabled: false,
      })
      const rows = await readMessageTemplates(tx, base)
      expect(
        resolveEffectiveMessageTemplate(rows, ids.storeId, "order.recorded"),
      ).toMatchObject({
        state: "disabled",
        scope: "store",
        template: {
          enabled: false,
          body: "Hi {customer_first_name}, order {order_number} is recorded.",
        },
      })
      const enabledAgain = await writeCustomerMessageTemplateInTransaction(
        tx,
        { ...storeWrite, expectedRevision: 1, expectedTemplateId: disabledId },
        { enabled: true },
      )
      expect(enabledAgain.template).toMatchObject({
        id: disabledId,
        revision: 2,
        enabled: true,
      })
      const disabledAgain = await writeCustomerMessageTemplateInTransaction(
        tx,
        { ...storeWrite, expectedRevision: 2, expectedTemplateId: disabledId },
        { enabled: false },
      )
      expect(disabledAgain.template).toMatchObject({
        id: disabledId,
        revision: 3,
        enabled: false,
      })
      await expect(
        writeCustomerMessageTemplateInTransaction(
          tx,
          {
            ...storeWrite,
            expectedRevision: 2,
            expectedTemplateId: disabledId,
          },
          { enabled: true },
        ),
      ).rejects.toBeInstanceOf(CustomerMessageError)

      await writeCustomerMessageTemplateInTransaction(
        tx,
        {
          ...storeWrite,
          expectedRevision: 3,
          expectedTemplateId: disabledId,
        },
        null,
      )
      expect(
        resolveEffectiveMessageTemplate(
          await readMessageTemplates(tx, base),
          ids.storeId,
          "order.recorded",
        ),
      ).toMatchObject({ state: "composed", scope: "business" })

      const recreated = await writeCustomerMessageTemplateInTransaction(
        tx,
        storeWrite,
        {
          body: "Another note for {order_number}.",
          enabled: true,
          source: "MANUAL",
        },
      )
      templateIds.push(required(recreated.template?.id))
      expect(recreated.template).toMatchObject({
        scopeKey: `store:${ids.storeId}`,
        revision: 1,
        enabled: true,
      })
      expect(recreated.template?.id).not.toBe(disabled.template?.id)
      await expect(
        writeCustomerMessageTemplateInTransaction(
          tx,
          {
            ...storeWrite,
            expectedRevision: 1,
            expectedTemplateId: disabled.template?.id,
          },
          { enabled: false },
        ),
      ).rejects.toBeInstanceOf(CustomerMessageError)
      expect(
        await tx.customerMessageTemplate.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(2)
    })
  })

  test("binds previews to exact payment/order/type and creator scope, then inventories and expires only editor attribution", async () => {
    const ids = fixtureIds()
    const templateIds: string[] = []
    await rolledBack(ids, templateIds, async (tx) => {
      const base = owner(ids)
      const orderInput = { ...base, orderId: ids.ownerOrderId }
      const exact = await previewCustomerMessageInTransaction(tx, {
        ...orderInput,
        eventKey: "payment.recorded",
        sourceId: ids.ownerPaymentId,
      })
      expect(exact.sourceId).toBe(ids.ownerPaymentId)
      expect(exact.variables.amount_paid).toContain("125")

      await expect(
        previewCustomerMessageInTransaction(tx, {
          ...orderInput,
          eventKey: "payment.recorded",
          sourceId: ids.cashierPaymentId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        previewCustomerMessageInTransaction(tx, {
          ...orderInput,
          eventKey: "payment.recorded",
          sourceId: ids.ownerRefundId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        previewCustomerMessageInTransaction(tx, {
          ...orderInput,
          eventKey: "payment.refund_recorded",
          sourceId: ids.ownerPaymentId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })

      const cashierInput = { ...base, actorUserId: ids.cashierUserId }
      await expect(
        previewCustomerMessageInTransaction(tx, {
          ...cashierInput,
          orderId: ids.ownerOrderId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(
        (
          await previewCustomerMessageInTransaction(tx, {
            ...cashierInput,
            orderId: ids.cashierOrderId,
          })
        ).orderId,
      ).toBe(ids.cashierOrderId)

      const saved = await writeCustomerMessageTemplateInTransaction(
        tx,
        {
          ...base,
          eventKey: "order.recorded",
          scope: "business",
          expectedRevision: 0,
        },
        {
          body: "Customer wording for {order_number}.",
          enabled: true,
          source: "MANUAL",
        },
      )
      const templateId = required(saved.template?.id)
      templateIds.push(templateId)
      expect(
        await customerMessageTemplatePrivacyInventory(tx, ids.ownerUserId),
      ).toEqual({ customerMessageTemplates: 1 })
      expect(
        await expireAccountPrivacyRecordSource(tx, {
          recordFamily: "customerMessageTemplate",
          recordId: templateId,
          actorField: "updatedByUserId",
          subjectUserId: ids.ownerUserId,
          tenantId: ids.tenantId,
        }),
      ).toBe(1)
      expect(
        await customerMessageTemplatePrivacyInventory(tx, ids.ownerUserId),
      ).toEqual({ customerMessageTemplates: 0 })
      expect(
        await tx.customerMessageTemplate.findUnique({
          where: { id: templateId },
        }),
      ).toMatchObject({
        body: "Customer wording for {order_number}.",
        updatedByUserId: null,
      })
    })
  })
})
