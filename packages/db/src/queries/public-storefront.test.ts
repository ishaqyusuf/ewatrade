import { describe, expect, test } from "bun:test"
import {
  getPublicStorefront,
  getPublicStorefrontForHost,
} from "./public-storefront"
import type { DbClient } from "./types"

// Exercise the repository's actual classification predicate and DTO, without a database connection.
function fixture(classification: "QA" | "LIVE") {
  const observed: unknown[] = []
  const db = {
    tenant: {
      findFirst: async ({
        where,
      }: { where: { dataClassification: string | { in: string[] } } }) => {
        observed.push(where)
        const allowed =
          typeof where.dataClassification === "string"
            ? [where.dataClassification]
            : where.dataClassification.in
        return allowed.includes(classification)
          ? {
              id: "tenant",
              name: "Test shop",
              slug: "test-shop-qa",
              dataClassification: classification,
              metadata: { retailOpsPlanId: "starter" },
              subscription: null,
              stores: [
                {
                  id: "store",
                  description: "Test description",
                  currencyCode: "NGN",
                  countryCode: "NG",
                  supportPhone: "08031234567",
                },
              ],
            }
          : null
      },
    },
    catalogItem: { findMany: async () => [] },
    customerEntryPoint: { findFirst: async () => null },
  } as unknown as DbClient
  return { db, observed }
}

async function localEnvironment(run: () => Promise<void>) {
  const local = {
    NODE_ENV: "development",
    APP_ENV: "local",
    DEV_PROFILE: "local",
    EWATRADE_ENV_MODE: "local",
    NEXT_PUBLIC_PLATFORM_DOMAIN: "localhost",
  }
  const old = Object.fromEntries(
    Object.keys(local).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, local)
  try {
    await run()
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("public storefront local QA boundary", () => {
  test("public slug reader still refuses QA even under local dev", async () =>
    localEnvironment(async () => {
      const { db } = fixture("QA")
      expect(await getPublicStorefront(db, "test-shop-qa")).toBeNull()
    }))
  test("canonical local host renders the safe empty QA storefront and disables customer chat", async () =>
    localEnvironment(async () => {
      const { db } = fixture("QA")
      expect(
        await getPublicStorefrontForHost(
          db,
          "test-shop-qa.ewatrade-storefront.localhost",
        ),
      ).toMatchObject({
        name: "Test shop",
        description: "Test description",
        isQaPreview: true,
        items: [],
        chatToken: null,
        customerMessages: false,
        whatsAppPhone: null,
      })
    }))
  test("a production profile cannot admit QA through a spoofed local host", async () =>
    localEnvironment(async () => {
      process.env.NODE_ENV = "production"
      const { db } = fixture("QA")
      expect(
        await getPublicStorefrontForHost(
          db,
          "test-shop-qa.ewatrade-storefront.localhost",
        ),
      ).toBeNull()
    }))
  test("a sibling localhost hostname never queries a tenant", async () =>
    localEnvironment(async () => {
      const { db, observed } = fixture("QA")
      expect(
        await getPublicStorefrontForHost(db, "test-shop-qa.localhost"),
      ).toBeNull()
      expect(observed).toEqual([])
    }))
})

test("new storefront hostname claims and availability candidates use the same Portless root", async () =>
  localEnvironment(async () => {
    const { storeLinkHostnames } = await import("./store-link-availability")
    expect(storeLinkHostnames(["test-shop-qa"])).toContain(
      "test-shop-qa.ewatrade-storefront.localhost",
    )
    expect(storeLinkHostnames(["test-shop-qa"])).toContain(
      "test-shop-qa.ewatrade.com",
    )
    expect(storeLinkHostnames(["test-shop-qa"])).not.toContain(
      "test-shop-qa.localhost",
    )
  }))
