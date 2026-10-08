import { afterEach, expect, test } from "bun:test"
import {
  RETAIL_OPS_SUBSCRIPTION_PLANS,
  type RetailOpsPlanFeature,
} from "@ewatrade/db/subscription-plans"
import {
  formatReportHistory,
  getLaunchDefaultPlanName,
  getMissingFeatureLabels,
  getPaidLaunchPlanNames,
  getPlanLimitLabels,
  getPricingPlans,
} from "./pricing-plans"

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DASHBOARD_URL: process.env.NEXT_PUBLIC_DASHBOARD_URL,
}
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})

test("limits read as plain labels", () => {
  expect(
    getPlanLimitLabels({
      id: "free",
      limits: {
        businesses: 1,
        offlineDevices: 1,
        ordersPerMonth: 30,
        products: 2,
        reportsHistoryDays: 30,
        staff: 0,
      },
    }).map((limit) => limit.label),
  ).toEqual(["1 business", "2 catalog items", "Just you", "30 orders a month"])
  expect(
    getPlanLimitLabels({
      id: "growth",
      limits: {
        businesses: 3,
        offlineDevices: 5,
        ordersPerMonth: null,
        products: 150,
        reportsHistoryDays: 180,
        staff: 10,
      },
    }).map((limit) => limit.label),
  ).toEqual([
    "3 businesses",
    "No product cap during launch",
    "You + 10 staff",
    "Unlimited orders",
  ])
  expect(formatReportHistory(730)).toBe("2 years of reports")
  expect(formatReportHistory(365)).toBe("1 year of reports")
  expect(formatReportHistory(45)).toBe("45 days of reports")
})

test("Free lists the paid features it leaves out, with human labels", () => {
  const free: { features: RetailOpsPlanFeature[] } = { features: [] }
  const paid: { features: RetailOpsPlanFeature[] } = {
    features: ["suppliers", "finance", "invoices", "staff"],
  }
  expect(getMissingFeatureLabels(free, [free, paid])).toEqual([
    "Invoices",
    "Finance",
    "Staff accounts",
    "Suppliers",
  ])
  expect(getMissingFeatureLabels(paid, [free, paid])).toEqual([])
})

test("plan CTAs: Free and Starter sign up, Growth and Pro talk to us", () => {
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dashboard.ewatrade.com"
  const open = getPricingPlans(true)
  expect(open.map((plan) => [plan.id, plan.cta.label, plan.cta.href])).toEqual([
    ["free", "Create your store", "https://dashboard.ewatrade.com/signup"],
    ["starter", "Create your store", "https://dashboard.ewatrade.com/signup"],
    ["growth", "Talk to us", "/contact"],
    ["pro", "Talk to us", "/contact"],
  ])
  expect(
    getPricingPlans(false).every((plan) => plan.cta.href === "/contact"),
  ).toBe(true)
  expect(open.filter((plan) => plan.popular).map((plan) => plan.id)).toEqual([
    "growth",
  ])
})

test("pricing copy comes from the shared plan catalogue, without amounts", () => {
  const plans = getPricingPlans(true)
  expect(plans.map((plan) => plan.priceLabel)).toEqual(
    RETAIL_OPS_SUBSCRIPTION_PLANS.map((plan) => plan.priceLabel),
  )
  for (const plan of plans) expect(plan.priceLabel).not.toMatch(/[₦$£€]|\d/)
  expect(plans.find((plan) => plan.id === "free")?.notIncluded).toContain(
    "Invoices",
  )
  expect(plans.find((plan) => plan.id === "free")?.description).toBe(
    "For one owner. Products, services and drafts count toward your item limit.",
  )
  expect(getPaidLaunchPlanNames()).toBe("Starter, Growth and Pro")
  expect(getLaunchDefaultPlanName()).toBe("Starter")
})
