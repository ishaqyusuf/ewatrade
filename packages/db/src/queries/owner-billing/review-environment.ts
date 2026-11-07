import type { OwnerBillingEnvironment, OwnerBillingProvider } from "./policy"

export type AppStoreReviewConfig = Record<string, string | undefined>

/** Server configuration only: immutable User IDs, never email or request input. */
export function appStoreReviewOwnerIds(
  config: AppStoreReviewConfig = process.env,
): readonly string[] {
  if (
    config.APP_STORE_REVIEW_SANDBOX_ENABLED !== "true" ||
    config.APP_ENV !== "production" ||
    !["prod", "production"].includes(config.DEV_PROFILE ?? "") ||
    config.STORE_BILLING_ENVIRONMENT !== "production" ||
    config.OWNER_BILLING_ENABLED !== "true" ||
    config.STORE_BILLING_ENABLED !== "true"
  )
    return []
  try {
    const ids: unknown = JSON.parse(config.APP_STORE_REVIEW_OWNER_IDS ?? "")
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 5 ||
      ids.some(
        (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(id),
      ) ||
      new Set(ids).size !== ids.length
    )
      return []
    return ids
  } catch {
    return []
  }
}

export function isAppStoreReviewOwner(
  ownerUserId: string | undefined,
  config: AppStoreReviewConfig = process.env,
) {
  return Boolean(
    ownerUserId && appStoreReviewOwnerIds(config).includes(ownerUserId),
  )
}

/** Keep the verified environment intact, including in coverage/limit readers. */
export function resolveOwnerBillingEnvironment(
  environment: OwnerBillingEnvironment,
  ownerUserId: string,
  provider: OwnerBillingProvider | undefined,
  config: AppStoreReviewConfig = process.env,
): OwnerBillingEnvironment {
  return environment === "production" &&
    provider === "app_store" &&
    isAppStoreReviewOwner(ownerUserId, config)
    ? "sandbox"
    : environment
}
