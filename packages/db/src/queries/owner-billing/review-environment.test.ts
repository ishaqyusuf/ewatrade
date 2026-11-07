import { expect, test } from "bun:test"
import {
  appStoreReviewOwnerIds,
  isAppStoreReviewOwner,
  resolveOwnerBillingEnvironment,
} from "./review-environment"

const ownerId = "review-owner-123"
const config = {
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  STORE_BILLING_ENVIRONMENT: "production",
  STORE_BILLING_ENABLED: "true",
  OWNER_BILLING_ENABLED: "true",
  APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
  APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([ownerId]),
}

test("App Review accepts only explicitly enabled immutable owner IDs on the Production profile", () => {
  expect(appStoreReviewOwnerIds(config)).toEqual([ownerId])
  expect(
    appStoreReviewOwnerIds({ ...config, DEV_PROFILE: "production" }),
  ).toEqual([ownerId])
  expect(isAppStoreReviewOwner(ownerId, config)).toBe(true)
  expect(isAppStoreReviewOwner("other-owner-123", config)).toBe(false)
  expect(isAppStoreReviewOwner(undefined, config)).toBe(false)
  for (const change of [
    { APP_ENV: "preview" },
    { DEV_PROFILE: "preview" },
    { STORE_BILLING_ENVIRONMENT: "sandbox" },
    { STORE_BILLING_ENABLED: "false" },
    { OWNER_BILLING_ENABLED: "false" },
    { APP_STORE_REVIEW_SANDBOX_ENABLED: "false" },
    { APP_STORE_REVIEW_OWNER_IDS: "invalid" },
    { APP_STORE_REVIEW_OWNER_IDS: "[]" },
    { APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([ownerId, ownerId]) },
    { APP_STORE_REVIEW_OWNER_IDS: JSON.stringify(["reviewer@example.com"]) },
    { APP_STORE_REVIEW_OWNER_IDS: JSON.stringify(["*"]) },
    { APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([123]) },
    {
      APP_STORE_REVIEW_OWNER_IDS: JSON.stringify(
        Array.from({ length: 6 }, (_, i) => `review-owner-${i}`),
      ),
    },
  ])
    expect(isAppStoreReviewOwner(ownerId, { ...config, ...change })).toBe(false)
})

test("review environment exception is Apple-only and never relabels ordinary or Google coverage", () => {
  expect(
    resolveOwnerBillingEnvironment("production", ownerId, "app_store", config),
  ).toBe("sandbox")
  expect(
    resolveOwnerBillingEnvironment("production", ownerId, "play_store", config),
  ).toBe("production")
  expect(
    resolveOwnerBillingEnvironment(
      "production",
      "other-owner-123",
      "app_store",
      config,
    ),
  ).toBe("production")
  expect(
    resolveOwnerBillingEnvironment("production", ownerId, undefined, config),
  ).toBe("production")
  expect(
    resolveOwnerBillingEnvironment(
      "sandbox",
      "other-owner-123",
      "app_store",
      config,
    ),
  ).toBe("sandbox")
  expect(
    resolveOwnerBillingEnvironment("production", ownerId, "app_store", {}),
  ).toBe("production")
})
