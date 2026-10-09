import { describe, expect, test } from "bun:test"
import {
  readSetupPrerequisites,
  setupPrerequisiteNeeds,
} from "./setup-prerequisites"

const product = (state: string) => ({
  kind: "PRODUCT" as const,
  state,
  payload: { kind: "product", name: "Eggs", unitName: "Crate" },
  errorCode: null,
})
const customer = (
  state: string,
  opening: boolean,
  errorCode: string | null = null,
) => ({
  kind: "CUSTOMER" as const,
  state,
  payload: {
    kind: "customer",
    name: "Mama Ade",
    ...(opening
      ? { opening: { direction: "owes_business", amountMinor: 1_500_000 } }
      : {}),
  },
  errorCode,
})

const money = (state: string, errorCode: string | null = null) => ({
  kind: "MONEY_ACCOUNT",
  state,
  payload: { kind: "money_account", name: "GTBank", purpose: "BANK" },
  errorCode,
})

describe("setup prerequisite needs", () => {
  test("product drafts need no repeated legal acceptance or Finance setup", async () => {
    const db = {
      legalAcceptance: {
        findUnique: async () => {
          throw new Error("Registration owns acceptance")
        },
      },
      financeBook: {
        findUnique: async () => {
          throw new Error("Products do not need Finance")
        },
      },
    }
    for (const state of ["CONFIRMED", "FAILED", "COMMITTED", "SKIPPED"]) {
      expect(
        await readSetupPrerequisites(
          db as never,
          {
            userId: "merchant-1",
            tenantId: "tenant-1",
            currencyCode: "NGN",
          },
          [product(state)],
        ),
      ).toEqual({ termsRequired: false, financeBookMissing: false })
    }
  })

  test("Finance availability still uses the business and operating currency", async () => {
    let book: { id: string } | null = null
    const reads: unknown[] = []
    const db = {
      financeBook: {
        findUnique: async (query: unknown) => {
          reads.push(query)
          return book
        },
      },
    }
    const input = {
      userId: "merchant-1",
      tenantId: "tenant-1",
      currencyCode: "NGN",
    }
    const entities = [customer("CONFIRMED", true)]
    expect(await readSetupPrerequisites(db as never, input, entities)).toEqual({
      termsRequired: false,
      financeBookMissing: true,
    })
    book = { id: "book-1" }
    expect(await readSetupPrerequisites(db as never, input, entities)).toEqual({
      termsRequired: false,
      financeBookMissing: false,
    })
    expect(reads).toEqual(
      Array(2).fill({
        where: {
          tenantId_currencyCode: { tenantId: "tenant-1", currencyCode: "NGN" },
        },
        select: { id: true },
      }),
    )
  })

  test("Finance only matters for customers with an opening balance", () => {
    expect(setupPrerequisiteNeeds([customer("CONFIRMED", true)]).balances).toBe(
      true,
    )
    expect(
      setupPrerequisiteNeeds([customer("CONFIRMED", false)]).balances,
    ).toBe(false)
    expect(setupPrerequisiteNeeds([customer("SKIPPED", true)]).balances).toBe(
      false,
    )
    expect(
      setupPrerequisiteNeeds([
        customer("COMMITTED", true, "OPENING_BALANCE_NEEDS_FINANCE"),
      ]).balances,
    ).toBe(true)
    expect(
      setupPrerequisiteNeeds([customer("COMMITTED", true, null)]).balances,
    ).toBe(false)
  })

  test("cash and bank accounts need Finance whether or not they have a balance", () => {
    expect(setupPrerequisiteNeeds([money("CONFIRMED")])).toEqual({
      balances: true,
    })
    expect(
      setupPrerequisiteNeeds([money("FAILED", "MONEY_ACCOUNT_NEEDS_FINANCE")])
        .balances,
    ).toBe(true)
    expect(setupPrerequisiteNeeds([money("FAILED", "CONFLICT")]).balances).toBe(
      false,
    )
    expect(setupPrerequisiteNeeds([money("SKIPPED")]).balances).toBe(false)
    expect(
      setupPrerequisiteNeeds([money("COMMITTED", "OPENING_BALANCE_FAILED")])
        .balances,
    ).toBe(true)
  })
})
