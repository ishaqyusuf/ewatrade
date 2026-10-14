import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { prepareCustomerMessageOpen, previewCustomerMessage } from "./preview"
import { CustomerMessageError, customerMessageScope } from "./scope"
import {
  resetCustomerMessageTemplate,
  saveCustomerMessageTemplate,
  setCustomerMessageTemplateEnabled,
} from "./templates"

type Template = {
  id: string
  tenantId: string
  storeId: string | null
  scopeKey: string
  eventKey: string
  body: string
  enabled: boolean
  revision: number
  source: string
  updatedByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

const input = {
  tenantId: "tenant-a",
  storeId: "store-a",
  actorUserId: "actor-a",
}
const now = new Date("2026-10-14T10:00:00Z")
const template = (values: Partial<Template> = {}): Template => ({
  id: "template-1",
  tenantId: input.tenantId,
  storeId: "store-a",
  scopeKey: "store:store-a",
  eventKey: "order.recorded",
  body: "Hi {customer_first_name}, your order {order_number} is ready.",
  enabled: true,
  revision: 1,
  source: "MANUAL",
  updatedByUserId: input.actorUserId,
  createdAt: now,
  updatedAt: now,
  ...values,
})

function fixture(
  options: {
    role?: string
    assignments?: { role: string }[]
    staffAccessMode?: string
    visibility?: string
    templates?: Template[]
    order?: Record<string, unknown>
    payments?: Record<string, unknown>[]
    storeCountry?: string | null
    tenantCountry?: string | null
    timezone?: string
  } = {},
) {
  const rows = (options.templates ?? []).map((row) => ({ ...row }))
  const writes: string[] = []
  let nextId = 1
  const order = {
    id: "order-a",
    orderNumber: "ORD-001",
    status: "CONFIRMED",
    paymentStatus: "UNPAID",
    customerName: "Ada Lovelace",
    customerPhone: "+2348012345678",
    currencyCode: "NGN",
    totalMinor: 100_000,
    amountPaidMinor: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    lines: [{ quantity: 1, snapshot: { catalogItemName: "Rice" } }],
    payments: options.payments ?? [],
    acceptedCommerceQuoteVersion: null,
    prescriptionPickupFulfillment: null,
    prescriptionDeliveryAddress: null,
    _count: {
      payments: (options.payments ?? []).length,
      lines: 1,
      prescriptionPaymentIntents: 0,
    },
    ...options.order,
  }
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () => ({
        id: "membership-a",
        role: options.role ?? "OWNER",
        staffAccessMode: options.staffAccessMode ?? "LEGACY",
        staffStoreAssignments: options.assignments ?? [],
        tenant: { isActive: true },
      }),
    },
    store: {
      findFirst: async () => ({
        id: input.storeId,
        name: "Wuse",
        countryCode:
          options.storeCountry === undefined ? "NG" : options.storeCountry,
        supportPhone: null,
        salesRepOrderVisibility: options.visibility ?? "ALL_STORE_ORDERS",
        tenant: {
          name: "EwaTrade",
          countryCode:
            options.tenantCountry === undefined ? "NG" : options.tenantCountry,
          timezone: options.timezone ?? "Africa/Lagos",
          dataClassification: "QA",
        },
      }),
    },
    commercialOrder: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        if (
          args.where.id !== order.id ||
          (args.where.createdByUserId &&
            args.where.createdByUserId !== "actor-a")
        )
          return null
        return order
      },
    },
    commercialOrderPayment: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const payment = (options.payments ?? []).find(
          (row) =>
            row.id === args.where.id &&
            row.orderId === args.where.orderId &&
            row.tenantId === args.where.tenantId &&
            row.storeId === args.where.storeId &&
            row.type === args.where.type,
        )
        return payment ?? null
      },
    },
    customerMessageTemplate: {
      findMany: async () => rows.map((row) => ({ ...row })),
      findUnique: async (args: {
        where: {
          tenantId_scopeKey_eventKey: {
            tenantId: string
            scopeKey: string
            eventKey: string
          }
        }
      }) => {
        const key = args.where.tenantId_scopeKey_eventKey
        const row = rows.find(
          (candidate) =>
            candidate.tenantId === key.tenantId &&
            candidate.scopeKey === key.scopeKey &&
            candidate.eventKey === key.eventKey,
        )
        return row ? { ...row } : null
      },
      findUniqueOrThrow: async (args: {
        where: {
          tenantId_scopeKey_eventKey: {
            tenantId: string
            scopeKey: string
            eventKey: string
          }
        }
      }) => {
        const key = args.where.tenantId_scopeKey_eventKey
        const row = rows.find(
          (candidate) =>
            candidate.tenantId === key.tenantId &&
            candidate.scopeKey === key.scopeKey &&
            candidate.eventKey === key.eventKey,
        )
        if (!row) throw new Error("Missing template")
        return { ...row }
      },
      create: async (args: {
        data: Omit<Template, "id" | "createdAt" | "updatedAt" | "revision"> &
          Partial<Pick<Template, "id" | "createdAt" | "updatedAt" | "revision">>
      }) => {
        const data = args.data
        if (
          rows.some(
            (row) =>
              row.tenantId === data.tenantId &&
              row.scopeKey === data.scopeKey &&
              row.eventKey === data.eventKey,
          )
        )
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" })
        const created = {
          ...data,
          id: `template-${++nextId}`,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        } as Template
        rows.push(created)
        writes.push("create")
        return { ...created }
      },
      updateMany: async (args: {
        where: { id: string; revision: number }
        data: Omit<Partial<Template>, "revision"> & {
          revision?: number | { increment: number }
        }
      }) => {
        const row = rows.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.revision === args.where.revision,
        )
        if (!row) return { count: 0 }
        const data = args.data
        Object.assign(row, data, {
          revision:
            typeof data.revision === "object"
              ? row.revision + data.revision.increment
              : data.revision,
          updatedAt: now,
        })
        writes.push("update")
        return { count: 1 }
      },
      deleteMany: async (args: { where: { id: string; revision: number } }) => {
        const index = rows.findIndex(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.revision === args.where.revision,
        )
        if (index < 0) return { count: 0 }
        rows.splice(index, 1)
        writes.push("delete")
        return { count: 1 }
      },
    },
  }
  const db = {
    ...tx,
    $transaction: async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => work(tx as unknown as Prisma.TransactionClient),
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    db: db as unknown as PrismaClient,
    rows,
    writes,
  }
}

test("fresh scope requires active membership and current scoped Store assignment", async () => {
  const f = fixture({
    role: "CASHIER",
    staffAccessMode: "SCOPED",
    assignments: [],
  })
  await expect(customerMessageScope(f.tx, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  const allowed = fixture({
    role: "CASHIER",
    staffAccessMode: "SCOPED",
    assignments: [{ role: "CASHIER" }],
    visibility: "OWN_ORDERS",
  })
  await expect(customerMessageScope(allowed.tx, input)).resolves.toMatchObject({
    ownOrders: true,
    canManageTemplates: false,
  })
  await expect(
    customerMessageScope(allowed.tx, input, true),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("Store disabled override remains disabled when a business default is enabled", async () => {
  const f = fixture({
    templates: [
      template({
        id: "business-template",
        storeId: null,
        scopeKey: "business",
        body: "Business wording",
      }),
      template({
        id: "store-template",
        scopeKey: "store:store-a",
        enabled: false,
        body: "",
      }),
    ],
  })
  const preview = await previewCustomerMessage(f.db, {
    ...input,
    orderId: "order-a",
    eventKey: "order.recorded",
  })
  expect(preview.state).toBe("disabled")
  expect(preview.template?.id).toBe("store-template")
  expect(preview.message).toBeNull()
})

test("payment and refund previews refuse source IDs from another order or wrong event type", async () => {
  const f = fixture({
    payments: [
      {
        id: "payment-a",
        tenantId: input.tenantId,
        storeId: input.storeId,
        orderId: "order-a",
        type: "PAYMENT",
        method: "CASH",
        amountMinor: 2500,
        recordedAt: now,
      },
      {
        id: "refund-a",
        tenantId: input.tenantId,
        storeId: input.storeId,
        orderId: "order-a",
        type: "REFUND",
        method: "CASH",
        amountMinor: 500,
        recordedAt: now,
      },
      {
        id: "foreign-payment",
        tenantId: input.tenantId,
        storeId: input.storeId,
        orderId: "order-b",
        type: "PAYMENT",
        method: "CASH",
        amountMinor: 9999,
        recordedAt: now,
      },
    ],
  })
  await expect(
    previewCustomerMessage(f.db, {
      ...input,
      orderId: "order-a",
      eventKey: "payment.recorded",
      sourceId: "foreign-payment",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    previewCustomerMessage(f.db, {
      ...input,
      orderId: "order-a",
      eventKey: "payment.recorded",
      sourceId: "refund-a",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    previewCustomerMessage(f.db, {
      ...input,
      orderId: "order-a",
      eventKey: "payment.refund_recorded",
      sourceId: "payment-a",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})

test("preview distinguishes missing and invalid snapshot phone numbers", async () => {
  const missing = fixture({ order: { customerPhone: null } })
  expect(
    (await previewCustomerMessage(missing.db, { ...input, orderId: "order-a" }))
      .state,
  ).toBe("no_phone")
  const invalid = fixture({ order: { customerPhone: "0800 ext 12" } })
  expect(
    (await previewCustomerMessage(invalid.db, { ...input, orderId: "order-a" }))
      .state,
  ).toBe("invalid_phone")
})

test("clinical-linked Orders refuse generic message content even when wording and phone are ready", async () => {
  for (const clinical of [
    {
      acceptedCommerceQuoteVersion: {
        quote: { sourceType: "PRESCRIPTION_REQUEST" },
      },
    },
    { prescriptionPickupFulfillment: { id: "clinical-pickup" } },
    { prescriptionDeliveryAddress: { id: "clinical-address" } },
    { _count: { payments: 0, lines: 1, prescriptionPaymentIntents: 1 } },
  ]) {
    const f = fixture({ templates: [template()], order: clinical })
    await expect(
      previewCustomerMessage(f.db, {
        ...input,
        orderId: "order-a",
        eventKey: "order.recorded",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.writes).toEqual([])
  }
})

test("countryless foreign businesses cannot silently address local numbers as Nigerian", async () => {
  const countryless = { storeCountry: null, tenantCountry: null }
  const nigerian = fixture({
    ...countryless,
    order: { customerPhone: "08012345678" },
  })
  expect(
    (
      await previewCustomerMessage(nigerian.db, {
        ...input,
        orderId: "order-a",
      })
    ).recipient.phoneE164,
  ).toBe("+2348012345678")
  const foreign = fixture({
    ...countryless,
    timezone: "Europe/London",
    order: { customerPhone: "08012345678", currencyCode: "GBP" },
  })
  expect(
    (await previewCustomerMessage(foreign.db, { ...input, orderId: "order-a" }))
      .state,
  ).toBe("invalid_phone")
  const international = fixture({
    ...countryless,
    timezone: "Europe/London",
    order: { customerPhone: "+2348012345678", currencyCode: "GBP" },
  })
  expect(
    (
      await previewCustomerMessage(international.db, {
        ...input,
        orderId: "order-a",
      })
    ).recipient.phoneE164,
  ).toBe("+2348012345678")
})

test("stale open preparation asks for review and performs no writes", async () => {
  const f = fixture({ templates: [template()] })
  const result = await prepareCustomerMessageOpen(f.db, {
    ...input,
    orderId: "order-a",
    previewVersion: "stale",
    body: "Updated wording",
  })
  expect(result.state).toBe("needs_review")
  expect(result.waUrl).toBeNull()
  expect(f.writes).toEqual([])
})

test("template writes bind both revision and row identity, including after reset and recreate", async () => {
  const f = fixture({ templates: [template()] })
  const write = {
    ...input,
    eventKey: "order.recorded" as const,
    scope: "store" as const,
    expectedRevision: 1,
    expectedTemplateId: "template-1",
  }
  const saved = await saveCustomerMessageTemplate(f.db, {
    ...write,
    body: "Updated {order_number}",
    enabled: true,
    source: "MANUAL",
  })
  expect(saved).toMatchObject({ template: { id: "template-1", revision: 2 } })
  await expect(
    setCustomerMessageTemplateEnabled(f.db, {
      ...write,
      expectedRevision: 1,
      enabled: false,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await resetCustomerMessageTemplate(f.db, { ...write, expectedRevision: 2 })
  const recreated = await saveCustomerMessageTemplate(f.db, {
    ...write,
    expectedRevision: 0,
    expectedTemplateId: undefined,
    body: "New {order_number}",
    enabled: true,
    source: "MANUAL",
  })
  expect(recreated).toMatchObject({ template: { revision: 1 } })
  await expect(
    saveCustomerMessageTemplate(f.db, {
      ...write,
      expectedRevision: 1,
      body: "Stale {order_number}",
      enabled: true,
      source: "MANUAL",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("concurrent first saves produce one template and a conflict for the loser", async () => {
  const f = fixture()
  const write = {
    ...input,
    eventKey: "order.recorded" as const,
    scope: "business" as const,
    expectedRevision: 0,
  }
  const results = await Promise.allSettled([
    saveCustomerMessageTemplate(f.db, {
      ...write,
      body: "First {order_number}",
      enabled: true,
      source: "MANUAL",
    }),
    saveCustomerMessageTemplate(f.db, {
      ...write,
      body: "Second {order_number}",
      enabled: true,
      source: "MANUAL",
    }),
  ])
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1)
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  )
  const rejected = results.find((result) => result.status === "rejected")
  expect(rejected).toMatchObject({ reason: { code: "CONFLICT" } })
  expect(f.rows).toHaveLength(1)
})

test("missing payment facts and fully credited Orders do not offer misleading confirmations", async () => {
  const missing = fixture()
  const payment = await previewCustomerMessage(missing.db, {
    ...input,
    orderId: "order-a",
    eventKey: "payment.recorded",
  })
  expect(payment).toMatchObject({
    state: "ineligible",
    canComposeOneOff: false,
    sourceChoices: [],
    message: null,
    waUrl: null,
  })
  const credited = fixture({
    order: { totalMinor: 0, creditMinor: 100_000, amountPaidMinor: 0 },
    templates: [template()],
  })
  const confirmation = await previewCustomerMessage(credited.db, {
    ...input,
    orderId: "order-a",
    eventKey: "order.recorded",
  })
  expect(confirmation).toMatchObject({
    state: "ineligible",
    canComposeOneOff: false,
    message: null,
    waUrl: null,
  })
  expect(confirmation.reason).toContain("fully credited")
})
