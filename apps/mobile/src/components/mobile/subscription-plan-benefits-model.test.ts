import { describe, expect, test } from "bun:test"
import { RETAIL_OPS_PLANS, getPlan } from "@/lib/retail-ops-subscription"
import {
  formatPlanBillingDisclosure,
  getPlanBenefitGroups,
  getUpgradePlans,
} from "./subscription-plan-benefits-model"

describe("approved native plan benefits", () => {
  test.each([
    ["free", ["starter", "growth", "pro"]],
    ["starter", ["growth", "pro"]],
    ["growth", ["pro"]],
    ["pro", []],
    [null, []],
  ] as const)(
    "offers only plans above %s without inventing an unknown tier",
    (current, expected) => {
      expect(getUpgradePlans(current).map((plan) => plan.id)).toEqual([
        ...expected,
      ])
    },
  )
  test.each(RETAIL_OPS_PLANS)(
    "shows the complete factual package for $name",
    (plan) => {
      const rows = getPlanBenefitGroups(plan, null).flatMap(
        (group) => group.rows,
      )
      const values = Object.fromEntries(rows.map((row) => [row.key, row.value]))
      expect(values.businesses).toBe(String(plan.limits.businesses))
      expect(values.products).toBe(
        plan.limits.products === null
          ? "Unlimited"
          : plan.limits.products.toLocaleString(),
      )
      expect(values.ordersPerMonth).toBe(
        plan.limits.ordersPerMonth === null
          ? "Unlimited"
          : String(plan.limits.ordersPerMonth),
      )
      expect(values.storefrontItems).toBe(
        plan.id === "free" ? "10 items" : "Full catalog",
      )
      expect(values.staff).toBe(
        plan.limits.staff === 0 ? "Just you" : String(plan.limits.staff),
      )
      expect(values.reportsHistoryDays).toBe(
        `${plan.limits.reportsHistoryDays} days`,
      )
      expect(rows.find((row) => row.key === "offlineDevices")?.note).toBe(
        "Coming soon",
      )
      expect(
        rows.find((row) => row.key === "offlineDevices")?.value,
      ).toStartWith(String(plan.limits.offlineDevices))
      expect(values.support).toBe(plan.supportLabel.replace(/ support$/, ""))
      expect(rows.map((row) => row.label)).toEqual(
        expect.arrayContaining([
          "Sales, orders, stock and customer balances",
          "Sales for money received",
          "Monthly assistant questions & drafts",
        ]),
      )
      expect(rows.filter((row) => row.key === "assistant")).toEqual([
        { key: "assistant", label: "Monthly assistant questions & drafts" },
      ])
      if (plan.id !== "free")
        expect(rows.map((row) => row.label)).toEqual(
          expect.arrayContaining([
            "Invoices and finance",
            "Expenses and suppliers",
            "Staff accounts & roles",
            "Photos, videos and documents",
            "Advanced reports",
            "Order reminder emails",
          ]),
        )
      expect(rows.some((row) => row.key === "feature:customerMessages")).toBe(
        ["growth", "pro"].includes(plan.id),
      )
      expect(rows).toHaveLength(
        plan.id === "free" ? 11 : plan.id === "starter" ? 17 : 18,
      )
    },
  )
  test("marks only actual changes while retaining common benefits", () => {
    const rows = getPlanBenefitGroups(
      getPlan("growth"),
      getPlan("starter"),
    ).flatMap((group) => group.rows)
    expect(
      rows.find((row) => row.key === "feature:customerMessages")?.added,
    ).toBe(true)
    expect(rows.find((row) => row.key === "products")?.added).toBe(true)
    expect(rows.find((row) => row.key === "storefrontItems")?.added).toBe(false)
    expect(
      rows.find((row) => row.key === "feature:advancedReports")?.added,
    ).toBe(false)
  })
  test("shortens simple monthly terms without erasing phased or translated terms", () => {
    expect(formatPlanBillingDisclosure("₦5,000 every 1 month")).toBe(
      "₦5,000 per month",
    )
    for (const value of [
      null,
      "$1 every 1 month for 2 billing periods, then $5 every 1 month",
      "5 € par mois",
      "$60 every 1 year",
    ])
      expect(formatPlanBillingDisclosure(value)).toBe(value)
  })
})
