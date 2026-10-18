import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { findRetailOpsPlan } from "@ewatrade/db/subscription-plans"
import {
  defaultBusinessOffer,
  findBusinessType,
  groupBusinessTypes,
} from "@ewatrade/utils/business-types"
import type {
  OwnerSetupBusiness,
  OwnerSetupDraft,
} from "@ewatrade/utils/owner-signup"
import { syncOwnerSignupPlan } from "@ewatrade/utils/owner-signup"
import { isValidStoreLink } from "@ewatrade/utils/store-link"

export type OwnerSetup = NonNullable<
  RouterOutputs["tenant"]["ownerSignupSetup"]
>
function planCapacity(planId: OwnerSetupDraft["planId"]) {
  const plan = findRetailOpsPlan(planId)
  if (!plan) throw new Error("Choose a supported plan")
  return plan.limits.businesses
}
export const OWNER_PLAN_LIMITS = {
  starter: planCapacity("starter"),
  growth: planCapacity("growth"),
  pro: planCapacity("pro"),
} as const
export { syncOwnerSignupPlan as ownerPlanForBusinessCount } from "@ewatrade/utils/owner-signup"
export function emptyBusiness(id: string): OwnerSetupBusiness {
  return {
    id,
    name: "",
    slug: "",
    typeKeys: [],
    operatingModel: "products_and_services",
    countryCode: "",
    currencyCode: "",
  }
}
export function initialOwnerDraft(setup: OwnerSetup): OwnerSetupDraft {
  const draft = setup.draft
  const first = {
    ...(draft?.businesses[0] ?? emptyBusiness("business-0")),
    name: setup.name,
    slug: setup.slug,
    id: "business-0",
  }
  const businesses = [first, ...(draft?.businesses.slice(1) ?? [])]
  const planId = syncOwnerSignupPlan(
    draft?.planId ?? "starter",
    businesses.length,
  )
  return {
    planId,
    businesses,
    selectedTypeKeys:
      draft?.selectedTypeKeys ?? businesses.flatMap((b) => b.typeKeys),
    otherType:
      draft?.otherType ??
      businesses.find((b) => b.typeKeys.includes("other"))?.otherType ??
      "",
    step: draft?.step ?? "type",
    storeIndex: Math.max(
      0,
      Math.min(
        draft?.storeIndex ?? 0,
        businesses.length - 1,
        OWNER_PLAN_LIMITS[planId] - 1,
      ),
    ),
    groupedFor: draft?.groupedFor ?? "",
  }
}
export function arrangeOwnerTypes(
  draft: OwnerSetupDraft,
  kind: "suggested" | "together" | "separate",
): OwnerSetupDraft {
  const keys = draft.selectedTypeKeys ?? []
  const sets =
    kind === "together"
      ? [keys]
      : kind === "separate"
        ? keys.map((key) => [key])
        : groupBusinessTypes(keys)
  const used = new Set<string>()
  const businesses = sets.map((typeKeys, index) => {
    const old =
      index === 0
        ? draft.businesses[0]
        : draft.businesses
            .slice(1)
            .find(
              (business) =>
                !used.has(business.id ?? "") &&
                business.typeKeys.some((key) => typeKeys.includes(key)),
            )
    let nextId = 1
    while (
      used.has(`business-${nextId}`) ||
      draft.businesses.some((b) => b.id === `business-${nextId}`)
    )
      nextId++
    const business = old ?? emptyBusiness(`business-${nextId}`)
    used.add(business.id ?? "")
    return {
      ...business,
      typeKeys,
      otherType: typeKeys.includes("other") ? draft.otherType : undefined,
      operatingModel: business.offerTouched
        ? business.operatingModel
        : defaultBusinessOffer(typeKeys),
    }
  })
  return {
    ...draft,
    businesses,
    planId: syncOwnerSignupPlan(draft.planId, businesses.length),
    groupedFor: keys.join(","),
    storeIndex: 0,
  }
}
export function businessLabel(business: OwnerSetupBusiness, index: number) {
  return business.name.trim() || `Business ${index + 1}`
}
export function typeLabel(key: string, other?: string) {
  return key === "other" && other?.trim()
    ? other
    : (findBusinessType(key)?.label ?? key)
}
export function identitiesReady(draft: OwnerSetupDraft) {
  return (
    draft.businesses.length > 0 &&
    draft.businesses.every(
      (b) => b.name.trim() && isValidStoreLink(b.slug) && b.typeKeys.length,
    ) &&
    new Set(draft.businesses.map((b) => b.slug)).size ===
      draft.businesses.length
  )
}
export function storeReady(business: OwnerSetupBusiness) {
  return Boolean(
    business.countryCode && business.currencyCode && business.operatingModel,
  )
}
