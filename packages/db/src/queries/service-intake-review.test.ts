import { describe, expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { readServiceIntakeReceiptInTransaction } from "./service-intake-receipt"
import {
  prepareReviewedServiceIntakeInTransaction,
  reviewServiceIntakeInTransaction,
} from "./service-intake-review"
import {
  createAndConfirmServiceIntake,
  createAndConfirmServiceIntakeInTransaction,
  prepareServiceIntakeInTransaction,
} from "./service-work"

const base = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "owner",
  schemaVersion: 1,
  clientIntakeId: "owned-intake-command",
  lines: [
    { offeringId: "tracked", quantity: "2" },
    { offeringId: "charge", quantity: "1" },
  ],
  dueCommitmentAt: new Date("2026-10-15T10:00:00.123Z"),
}
function fixture() {
  const state = {
    role: "OWNER",
    active: true,
    scoped: false,
    assignment: true,
    assignee: true,
    fixedPrice: 1000,
    available: true,
    quote: false,
    quantityScale: 0,
    book: false,
    reminders: false,
    express: true,
    workPolicy: "TRACKED",
    customer: {
      id: "customer",
      name: "Amina",
      phone: "+2348000000000",
      email: null,
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
    createCount: 0,
    nestedCount: 0,
  }
  const offering = (id: string) => ({
    id,
    name: id === "tracked" ? "Wash" : "Consultation",
    fixedPriceMinor: state.fixedPrice,
    pricingPolicy: state.quote ? "QUOTE_REQUIRED" : "FIXED",
    catalogItem: { id: `${id}-item`, name: "Service" },
    variant: { id: `${id}-variant`, name: "Standard" },
    serviceOffering: {
      quantityScale: state.quantityScale,
      workPolicy: id === "tracked" ? state.workPolicy : "CHARGE_ONLY",
      authorizationPolicy: "AFTER_REQUIRED_PAYMENT",
    },
    storeAvailability: [{ isAvailable: state.available }],
  })
  const tx = {
    $transaction: () => {
      state.nestedCount++
      throw Error("Nested transaction")
    },
    $queryRaw: async () =>
      state.active
        ? [
            {
              id: "membership",
              role: state.role,
              staffAccessMode: state.scoped ? "SCOPED" : "LEGACY",
            },
          ]
        : [],
    store: { findFirst: async () => ({ id: "store", currencyCode: "NGN" }) },
    staffStoreAssignment: {
      findFirst: async () =>
        state.assignment ? { id: "assignment", revision: 1 } : null,
    },
    customer: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === state.customer.id ? state.customer : null,
    },
    membership: {
      findFirst: async () =>
        state.assignee
          ? {
              id: "member",
              role: "OPERATOR",
              staffAccessRevision: 1,
              user: { id: "staff", name: "Bola" },
            }
          : null,
    },
    sellableOffering: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        [...new Set(where.id.in)].map(offering),
    },
    serviceStoreSettings: {
      findUnique: async () => ({
        expressEnabled: state.express,
        expressSurchargeType: "FIXED",
        expressSurchargeValue: 500,
        expressTurnaroundMinutes: 60,
        autoNotifyReminder: state.reminders,
        defaultNotificationChannel: "SMS",
      }),
    },
    financeBook: {
      findUnique: async () =>
        state.book ? { id: "book", currencyCode: "NGN" } : null,
    },
    financeAccount: { findMany: async () => [] },
    serviceIntake: {
      findUnique: async () => ({
        id: "original-intake",
        payloadHash: "unused",
      }),
      findFirst: async () => ({
        id: "original-intake",
        status: "CONFIRMED",
        commercialOrderId: "original-order",
      }),
      create: async () => {
        state.createCount++
        throw Error("Unexpected write")
      },
    },
    serviceJob: { findMany: async () => [] },
    serviceNotificationIntent: { findMany: async () => [] },
  }
  return { state, tx: tx as unknown as Prisma.TransactionClient }
}
describe("canonical Service intake review", () => {
  test("uses canonical exact totals, express surcharge, work policies and saved customer", async () => {
    const { tx } = fixture()
    const result = await reviewServiceIntakeInTransaction(tx, {
      ...base,
      customerId: "customer",
      requestedAssigneeId: "staff",
      serviceLevel: "express",
      initialPaymentMinor: 1000,
      initialPaymentMethod: "cash",
    })
    expect(result.review.totalMinor).toBe(3500)
    expect(result.review.balanceMinor).toBe(2500)
    expect(result.review.trackedLineCount).toBe(1)
    expect(result.review.lines[0]?.authorizationPolicy).toBe(
      "AFTER_REQUIRED_PAYMENT",
    )
    expect(result.command.customerName).toBe("Amina")
    expect(result.command.customerId).toBe("customer")
    expect(result.review.assignee?.name).toBe("Bola")
  })
  test("freshness binds price, policy, customer snapshot and Store settings without writes", async () => {
    const { tx, state } = fixture()
    const input = { ...base, customerId: "customer" }
    const original = await reviewServiceIntakeInTransaction(tx, input)
    expect((await reviewServiceIntakeInTransaction(tx, input)).revision).toBe(
      original.revision,
    )
    state.fixedPrice++
    expect(
      (await reviewServiceIntakeInTransaction(tx, input)).revision,
    ).not.toBe(original.revision)
    state.customer.name = "Changed"
    const next = await reviewServiceIntakeInTransaction(tx, input)
    state.workPolicy = "CHARGE_ONLY"
    await expect(reviewServiceIntakeInTransaction(tx, input)).rejects.toThrow(
      "require a tracked",
    )
    expect(next.revision).not.toBe(original.revision)
    expect(state.createCount).toBe(0)
    expect(state.nestedCount).toBe(0)
  })
  test("canonical quantity precision, stale fixed price and payment limits fail closed", async () => {
    const { tx } = fixture()
    await expect(
      prepareServiceIntakeInTransaction(tx, {
        ...base,
        lines: [{ offeringId: "tracked", quantity: "0.5" }],
      }),
    ).rejects.toThrow()
    await expect(
      prepareServiceIntakeInTransaction(tx, {
        ...base,
        lines: [
          {
            offeringId: "tracked",
            quantity: "2",
            expectedFixedPriceMinor: 900,
          },
        ],
      }),
    ).rejects.toThrow("price changed")
    await expect(
      reviewServiceIntakeInTransaction(tx, {
        ...base,
        initialPaymentMinor: 4000,
        initialPaymentMethod: "cash",
      }),
    ).rejects.toThrow("cannot exceed")
    await expect(
      reviewServiceIntakeInTransaction(tx, {
        ...base,
        initialPaymentMinor: 100,
      }),
    ).rejects.toThrow("Choose a method")
  })
  test("revoked authority, reps and missing scoped Manager grant fail before work", async () => {
    const { tx, state } = fixture()
    state.active = false
    await expect(reviewServiceIntakeInTransaction(tx, base)).rejects.toThrow(
      "access is required",
    )
    state.active = true
    state.role = "CASHIER"
    await expect(reviewServiceIntakeInTransaction(tx, base)).rejects.toThrow(
      "access is required",
    )
    state.role = "MANAGER"
    state.scoped = true
    state.assignment = false
    await expect(reviewServiceIntakeInTransaction(tx, base)).rejects.toThrow(
      "Manager access at this Store",
    )
    expect(state.createCount).toBe(0)
  })
  test("unavailable services, wrong customers, overrides, assignee and quote requirements refuse", async () => {
    const { tx, state } = fixture()
    await expect(
      reviewServiceIntakeInTransaction(tx, { ...base, customerId: "foreign" }),
    ).rejects.toThrow("selected customer is unavailable")
    await expect(
      reviewServiceIntakeInTransaction(tx, {
        ...base,
        customerId: "customer",
        customerName: "Override",
      }),
    ).rejects.toThrow("without overrides")
    state.available = false
    await expect(reviewServiceIntakeInTransaction(tx, base)).rejects.toThrow(
      "unavailable Offering",
    )
    state.available = true
    state.assignee = false
    await expect(
      reviewServiceIntakeInTransaction(tx, {
        ...base,
        requestedAssigneeId: "foreign",
      }),
    ).rejects.toThrow("Assignee")
    state.assignee = true
    state.quote = true
    await expect(reviewServiceIntakeInTransaction(tx, base)).rejects.toThrow()
  })
  test("canonical express availability, Finance payment and customer reminder gates are retained", async () => {
    const { tx, state } = fixture()
    state.express = false
    await expect(
      reviewServiceIntakeInTransaction(tx, {
        ...base,
        serviceLevel: "express",
      }),
    ).rejects.toThrow("Express service is not enabled")
    state.book = true
    await expect(
      reviewServiceIntakeInTransaction(tx, {
        ...base,
        initialPaymentMinor: 1000,
        initialPaymentMethod: "cash",
      }),
    ).rejects.toThrow("receiving account")
    state.reminders = true
    await expect(
      reviewServiceIntakeInTransaction(tx, { ...base, customerId: "customer" }),
    ).rejects.toThrow("automatic customer reminder")
    expect(state.createCount).toBe(0)
  })
  test("transaction-local execution checks freshness again before any canonical write", async () => {
    const { tx, state } = fixture()
    const prepared = await prepareReviewedServiceIntakeInTransaction(tx, base)
    state.fixedPrice++
    await expect(prepared.execute("owned-idempotency-key")).rejects.toThrow(
      "changed",
    )
    expect(state.createCount).toBe(0)
    expect(state.nestedCount).toBe(0)
  })
  test("Intake command replay returns original records without nesting or writes", async () => {
    const { tx, state } = fixture()
    // The real command's persisted hash is computed from the exact native input.
    const { createHash } = await import("node:crypto")
    const stable = (value: unknown): string => {
      if (value instanceof Date) return JSON.stringify(value.toISOString())
      if (value === null || typeof value !== "object")
        return JSON.stringify(value) ?? "null"
      if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
      const row = value as Record<string, unknown>
      return `{${Object.keys(row)
        .sort()
        .filter((key) => row[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stable(row[key])}`)
        .join(",")}}`
    }
    const digest = createHash("sha256").update(stable(base)).digest("hex")
    tx.serviceIntake.findUnique = (async () => ({
      id: "original-intake",
      tenantId: "tenant",
      status: "CONFIRMED",
      commercialOrderId: "original-order",
      lines: [],
      payloadHash: digest,
    })) as typeof tx.serviceIntake.findUnique
    const result = await createAndConfirmServiceIntakeInTransaction(tx, base)
    expect(result.orderId).toBe("original-order")
    expect(result.intakeId).toBe("original-intake")
    expect(await createAndConfirmServiceIntakeInTransaction(tx, base)).toEqual(
      result,
    )
    expect(state.createCount).toBe(0)
    expect(state.nestedCount).toBe(0)
    await expect(
      createAndConfirmServiceIntakeInTransaction(tx, {
        ...base,
        instructions: "changed",
      }),
    ).rejects.toThrow("different input")
  })
  test("root create-and-confirm opens one bounded transaction, no nested root commands", async () => {
    const { tx } = fixture()
    const options: unknown[] = []
    const root = {
      $transaction: async (
        run: (db: Prisma.TransactionClient) => Promise<unknown>,
        config: unknown,
      ) => {
        options.push(config)
        return run(tx)
      },
    } as unknown as PrismaClient
    await expect(createAndConfirmServiceIntake(root, base)).rejects.toThrow(
      "different input",
    )
    expect(options).toEqual([{ maxWait: 10000, timeout: 30000 }])
  })
  test("owning receipt rejects foreign Store or missing original records", async () => {
    const { tx } = fixture()
    await expect(
      readServiceIntakeReceiptInTransaction(tx, {
        tenantId: "tenant",
        storeId: "store",
        actorUserId: "owner",
        intakeId: "missing",
      }),
    ).rejects.toThrow("unavailable in this Store")
  })
})

test("canonical create-and-confirm rolls back the draft when line persistence fails", async () => {
  const { tx, state } = fixture()
  let pending = false
  let saved = false
  tx.serviceIntake.findUnique = (async () =>
    null) as typeof tx.serviceIntake.findUnique
  tx.serviceIntake.create = (async () => {
    pending = true
    return { id: "pending-intake" }
  }) as typeof tx.serviceIntake.create
  Object.assign(tx, {
    serviceIntakeLine: {
      createMany: async () => {
        throw Error("Injected line save failure")
      },
    },
  })
  const root = {
    $transaction: async (
      run: (db: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      pending = false
      try {
        const result = await run(tx)
        saved = pending
        return result
      } catch (error) {
        pending = false
        throw error
      }
    },
  } as unknown as PrismaClient
  await expect(createAndConfirmServiceIntake(root, base)).rejects.toThrow(
    "Injected line save failure",
  )
  expect(saved).toBe(false)
  expect(pending).toBe(false)
  expect(state.nestedCount).toBe(0)
})
