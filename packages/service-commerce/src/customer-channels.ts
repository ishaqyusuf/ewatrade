import type {
  ServiceCommerceChannelRecommendation,
  ServiceCommerceChannelRecommendationInput,
  ServiceCommerceEntryPoint,
  ServiceCommerceEntryPointAction,
  ServiceCommerceEntryPointChannel,
  ServiceCommerceEntryPointProjection,
  ServiceCommerceEntryPointPublishBlocker,
  ServiceCommerceStoreAttendantAssignmentStatus,
} from "./schemas"

const CONVERSATIONAL_SALES_PROFILES = new Set([
  "beauty-salon-spa",
  "electronics-phone-shops",
  "fabrics-tailoring",
  "fashion-apparel",
  "food-bakery-catering",
  "hardware-building-materials",
  "laundry-dry-cleaning",
  "professional-services",
  "repair-maintenance",
  "wholesale-distribution",
])

export function recommendServiceCommerceChannelDefaults(
  input: ServiceCommerceChannelRecommendationInput,
): ServiceCommerceChannelRecommendation | null {
  const hasOnboardingFacts = Boolean(
    input.businessProfileKey ||
      input.operatingModel ||
      input.orderChannels.length > 0 ||
      input.teamSize,
  )
  if (!hasOnboardingFacts) return null

  const explicitlyUsesWhatsApp = input.orderChannels.includes("phone_whatsapp")
  const conversationalCategory = Boolean(
    input.businessProfileKey &&
      CONVERSATIONAL_SALES_PROFILES.has(input.businessProfileKey),
  )
  const recommendsWhatsApp = explicitlyUsesWhatsApp || conversationalCategory
  const policyReviewRequired =
    input.businessProfileKey === "pharmacy-health-retail"
  const teamAttendants = input.teamSize !== null && input.teamSize !== "solo"
  const centralConnection =
    recommendsWhatsApp &&
    input.storeCount > 1 &&
    (input.teamSize === "6_10" || input.teamSize === "11_plus")

  const reasons: ServiceCommerceChannelRecommendation["reasons"] = []
  if (explicitlyUsesWhatsApp) reasons.push("onboarding_whatsapp")
  if (conversationalCategory) reasons.push("category_conversational_sales")
  if (centralConnection) reasons.push("multi_store_team")
  if (policyReviewRequired) reasons.push("pharmacy_policy_review")

  return {
    advisoryOnly: true,
    attendantMode: teamAttendants ? "team_attendants" : "owner_attendant",
    authorizationEffect: "none",
    connectionMode: centralConnection
      ? "central_with_branch_choice"
      : "store_specific",
    policyReviewRequired,
    reasons,
    recommendedChannels: recommendsWhatsApp ? ["web", "whatsapp"] : ["web"],
    setupSteps: [
      ...(recommendsWhatsApp ? (["connect_whatsapp"] as const) : []),
      "assign_attendants",
      ...(centralConnection ? (["configure_store_routing"] as const) : []),
      ...(policyReviewRequired ? (["review_vertical_policy"] as const) : []),
      "publish_entry_point",
    ],
  }
}

export function getServiceCommerceEntryPointPublishBlockers(input: {
  attendants: ServiceCommerceStoreAttendantAssignmentStatus[]
  channels: ServiceCommerceEntryPointChannel[]
}): ServiceCommerceEntryPointPublishBlocker[] {
  const blockers: ServiceCommerceEntryPointPublishBlocker[] = []

  if (!input.attendants.some((attendant) => attendant.status === "active")) {
    blockers.push("active_attendant_missing")
  }
  if (!input.channels.some((channel) => channel.readiness === "available")) {
    blockers.push("allowed_channel_missing")
  }

  return blockers
}

export function projectServiceCommerceEntryPoint(input: {
  attendants: ServiceCommerceStoreAttendantAssignmentStatus[]
  channels: ServiceCommerceEntryPointChannel[]
  entryPoint: ServiceCommerceEntryPoint
}): ServiceCommerceEntryPointProjection {
  const publishBlockers = getServiceCommerceEntryPointPublishBlockers(input)
  const actions: ServiceCommerceEntryPointAction[] =
    input.entryPoint.status === "published" && publishBlockers.length === 0
      ? ["copy_link", "download_qr"]
      : []

  return { ...input.entryPoint, actions, publishBlockers }
}
