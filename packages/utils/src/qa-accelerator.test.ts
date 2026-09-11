import { describe, expect, test } from "bun:test"
import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  assertQaAcceleratorStartupSafety,
  assertQaFormCoverage,
  getQaAcceleratorAvailability,
  normalizeQaDomain,
} from "./qa-accelerator"
import { createQaFixtureContext, createQaFixtureIdentity } from "./qa-fixtures"

const enabledEnv = {
  APP_ENV: "preview",
  EMAIL_QA_DOMAIN_ROUTES: JSON.stringify({
    "ishack.qa.test": "tester@example.com",
  }),
  NODE_ENV: "development",
  QA_ACCELERATOR_ALLOWED_ORIGINS: "https://preview.ewatrade.test",
  QA_ACCELERATOR_ENABLED: "true",
  QA_ACCELERATOR_SECRET: "q".repeat(32),
}

describe("QA accelerator contract", () => {
  test("normalizes exact configured domains", () => {
    expect(normalizeQaDomain(" Ishack.QA.Test. ")).toBe("ishack.qa.test")
    expect(() => normalizeQaDomain("https://ishack.qa.test/path")).toThrow()
    expect(() => normalizeQaDomain("*.ishack.qa.test")).toThrow()
  })

  test("fails closed across environment and version skew", () => {
    expect(
      getQaAcceleratorAvailability({
        clientContractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
        env: enabledEnv,
        origin: "https://preview.ewatrade.test",
        platform: "web",
      }),
    ).toEqual({
      available: true,
      contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
      environment: "preview",
    })
    expect(
      getQaAcceleratorAvailability({
        clientContractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
        env: enabledEnv,
        origin: "https://untrusted-preview.example",
        platform: "web",
      }),
    ).toMatchObject({ available: false, category: "origin_not_allowed" })
    expect(
      getQaAcceleratorAvailability({
        env: { ...enabledEnv, NODE_ENV: "production" },
      }),
    ).toMatchObject({ available: true, environment: "preview" })
    expect(
      getQaAcceleratorAvailability({
        env: { ...enabledEnv, APP_ENV: "local" },
      }),
    ).toMatchObject({ available: true, environment: "development" })
    expect(
      getQaAcceleratorAvailability({
        clientContractVersion: 999,
        env: enabledEnv,
      }),
    ).toMatchObject({ available: false, category: "upgrade_required" })
    expect(
      getQaAcceleratorAvailability({
        env: { ...enabledEnv, QA_ACCELERATOR_ENABLED: "false" },
      }),
    ).toMatchObject({ available: false, category: "disabled" })
    expect(() =>
      assertQaAcceleratorStartupSafety({
        ...enabledEnv,
        APP_ENV: "production",
      }),
    ).toThrow("cannot be enabled")
  })

  test("generates deterministic exact-domain safe identities", () => {
    const context = createQaFixtureContext({
      currencyCode: "NGN",
      domain: "ishack.qa.test",
      invocationId: "run-42",
      now: new Date("2026-08-27T12:00:00Z"),
      seed: "seed-1",
      storeId: "store-1",
      tenantId: "tenant-1",
      timezone: "Africa/Lagos",
    })
    const first = createQaFixtureIdentity(context, {
      formId: "customer.create",
      sequence: 2,
    })
    const second = createQaFixtureIdentity(context, {
      formId: "customer.create",
      sequence: 2,
    })

    expect(first).toEqual(second)
    expect(first.email).toBe("qa+run-42-customer-create-2@ishack.qa.test")
    expect(first.phone).toMatch(/^\+120255501\d{2}$/)
    expect(first.addressLine1).toContain("QA ONLY")
  })

  test("rejects duplicate form coverage", () => {
    expect(
      assertQaFormCoverage(
        ["customer.create"],
        [
          {
            formId: "customer.create",
            kind: "recipe",
            surface: "dashboard",
          },
        ],
      ),
    ).toEqual({ declarations: 1, forms: 1 })
    expect(() =>
      assertQaFormCoverage(
        ["customer.create"],
        [
          {
            formId: "customer.create",
            kind: "recipe",
            surface: "dashboard",
          },
          {
            formId: "customer.create",
            kind: "excluded",
            surface: "dashboard",
          },
        ],
      ),
    ).toThrow("duplicate")
  })
})
