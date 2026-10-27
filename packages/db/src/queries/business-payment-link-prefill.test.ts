import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getBusinessPaymentLink } from "./business-payment-links"

const expiresAt = new Date("2026-10-29T12:00:00Z")

async function projection(snapshot: string | null, linked: string | null) {
  const reads: unknown[] = []
  // Read-only adapter for the real projection; no database or write command runs.
  const db = {
    manualPaymentLink: {
      findFirst: async (input: unknown) => {
        reads.push(input)
        return {
          tenantId: "qa-tenant",
          closedAt: null,
          expiresAt,
          amountMinor: 200_000,
          currencyCode: "NGN",
          bankName: "QA Bank",
          bankAccountNumber: "0012345678",
          bankAccountHolder: "QA Business",
          allowPartial: true,
          order: {
            customerName: snapshot,
            customer: linked ? { name: linked } : null,
            customerPhone: "private-phone",
            customerEmail: "private-email",
            notes: "private-note",
            orderNumber: "QA-1",
            status: "CONFIRMED",
            paymentStatus: "PARTIALLY_PAID",
            amountPaidMinor: 50_000,
            totalMinor: 200_000,
            _count: { payments: 1 },
            store: { name: "QA Business" },
            lines: [],
          },
        }
      },
    },
    tenant: {
      findUniqueOrThrow: async () => {
        throw new Error("No attachment entitlement in this read-only adapter")
      },
    },
  } as unknown as PrismaClient
  return {
    page: await getBusinessPaymentLink(db, {
      linkId: "qa-link",
      expiresAt,
      now: new Date("2026-10-27T12:00:00Z"),
    }),
    reads,
  }
}

test("public payer prefill prefers the saved order name without exposing private customer fields", async () => {
  const { page, reads } = await projection("  Aisha Yusuf  ", "Current name")
  expect(page.customerName).toBe("Aisha Yusuf")
  expect(page.balanceMinor).toBe(150_000)
  expect(page).not.toHaveProperty("customerPhone")
  expect(page).not.toHaveProperty("customerEmail")
  expect(page).not.toHaveProperty("notes")
  expect(reads[0]).toMatchObject({
    where: { tenant: { isActive: true } },
    include: { order: { include: { customer: { select: { name: true } } } } },
  })
})

test("linked customer name is a bounded fallback; unknown customers receive no invented name", async () => {
  expect((await projection(" ", "  Aisha Yusuf ")).page.customerName).toBe(
    "Aisha Yusuf",
  )
  expect((await projection(null, null)).page.customerName).toBeNull()
  expect(
    (await projection("A".repeat(200), "Other")).page.customerName,
  ).toHaveLength(160)
})
