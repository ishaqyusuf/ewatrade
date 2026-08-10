import {
  SERVICE_COMMERCE_CAPABILITIES,
  type ServiceCommerceActivationBlocker,
  type ServiceCommerceCapability,
  type ServiceCommerceProfileConfiguration,
  type ServiceCommerceReadinessBlocker,
  type ServiceCommerceReadinessState,
  type ServiceCommerceRecoveryAction,
} from "./schemas"

export function getServiceCommerceActivationBlockers(input: {
  configuration: ServiceCommerceProfileConfiguration
  storeActive: boolean
}): ServiceCommerceActivationBlocker[] {
  const blockers: ServiceCommerceActivationBlocker[] = []
  const { capabilities } = input.configuration

  if (!input.storeActive) blockers.push("store_inactive")
  if (input.configuration.status === "suspended") {
    blockers.push("profile_suspended")
  }
  if (!capabilities.intake) blockers.push("intake_disabled")
  if (!capabilities.web && !capabilities.staff && !capabilities.whatsapp) {
    blockers.push("channel_missing")
  }
  if (!capabilities.quote && !capabilities.booking) {
    blockers.push("outcome_missing")
  }
  if (
    input.configuration.catalogAdoptionMode === "progressive" &&
    !capabilities.progressive_catalog
  ) {
    blockers.push("progressive_catalog_disabled")
  }

  return blockers
}

export type ServiceCommerceCapabilityReadiness = {
  blockers: ServiceCommerceReadinessBlocker[]
  readiness: ServiceCommerceReadinessState
  recovery: ServiceCommerceRecoveryAction | null
}

export type ServiceCommerceReadiness = {
  capabilities: Record<
    ServiceCommerceCapability,
    ServiceCommerceCapabilityReadiness
  >
  catalogAdoption: {
    mode: ServiceCommerceProfileConfiguration["catalogAdoptionMode"]
    privateDraftCapture: ServiceCommerceReadinessState
    procureToOrder: ServiceCommerceReadinessState
    publicActivation: ServiceCommerceReadinessState
    trackedInventory: ServiceCommerceReadinessState
  }
}

export function getServiceCommerceRuntimeActivationBlockers(input: {
  configuration: ServiceCommerceProfileConfiguration
  readiness: ServiceCommerceReadiness
  storeActive: boolean
}): ServiceCommerceActivationBlocker[] {
  const blockers = getServiceCommerceActivationBlockers(input)
  const { capabilities } = input.configuration

  if (
    (capabilities.web || capabilities.staff || capabilities.whatsapp) &&
    !(["web", "staff", "whatsapp"] as const).some(
      (capability) =>
        input.readiness.capabilities[capability].readiness === "available",
    )
  ) {
    blockers.push("channel_unavailable")
  }
  if (
    (capabilities.quote || capabilities.booking) &&
    !(["quote", "booking"] as const).some(
      (capability) =>
        input.readiness.capabilities[capability].readiness === "available",
    )
  ) {
    blockers.push("outcome_unavailable")
  }

  return blockers
}

export type DeriveServiceCommerceReadinessInput = {
  configuration: ServiceCommerceProfileConfiguration
  providerUnavailable: ServiceCommerceCapability[]
  restricted: ServiceCommerceCapability[]
  setupRequired: ServiceCommerceCapability[]
  storeActive: boolean
  trackedInventoryReady: boolean
}

function blocked(
  blocker: ServiceCommerceReadinessBlocker,
  readiness: ServiceCommerceReadinessState,
  recovery: ServiceCommerceRecoveryAction,
): ServiceCommerceCapabilityReadiness {
  return { blockers: [blocker], readiness, recovery }
}

function capabilityReadiness(
  capability: ServiceCommerceCapability,
  input: DeriveServiceCommerceReadinessInput,
): ServiceCommerceCapabilityReadiness {
  if (!input.storeActive) {
    return blocked("store_inactive", "unavailable", "activate_store")
  }
  if (input.configuration.status === "disabled") {
    return blocked("profile_disabled", "unavailable", "manage_setup")
  }
  if (input.configuration.status === "suspended") {
    return blocked("profile_suspended", "restricted", "review_policy")
  }
  if (!input.configuration.capabilities[capability]) {
    return blocked("capability_disabled", "unavailable", "manage_setup")
  }
  if (input.restricted.includes(capability)) {
    return blocked("policy_restricted", "restricted", "review_policy")
  }
  if (input.providerUnavailable.includes(capability)) {
    return blocked("provider_unavailable", "unavailable", "retry_provider")
  }
  if (input.setupRequired.includes(capability)) {
    return blocked("setup_incomplete", "setup_required", "manage_setup")
  }
  return { blockers: [], readiness: "available", recovery: null }
}

export function deriveServiceCommerceReadiness(
  input: DeriveServiceCommerceReadinessInput,
): ServiceCommerceReadiness {
  const capabilities = Object.fromEntries(
    SERVICE_COMMERCE_CAPABILITIES.map((capability) => [
      capability,
      capabilityReadiness(capability, input),
    ]),
  ) as ServiceCommerceReadiness["capabilities"]
  const catalogAvailable = capabilities.progressive_catalog.readiness
  const profileReadiness = capabilities.intake.readiness
  const profileAvailable = profileReadiness === "available"

  return {
    capabilities,
    catalogAdoption: {
      mode: input.configuration.catalogAdoptionMode,
      privateDraftCapture: catalogAvailable,
      procureToOrder: !profileAvailable
        ? profileReadiness
        : input.configuration.procureToOrderEnabled
          ? "available"
          : "setup_required",
      publicActivation: !profileAvailable
        ? profileReadiness
        : input.configuration.catalogAdoptionMode === "inventory_managed" &&
            input.trackedInventoryReady
          ? "available"
          : "setup_required",
      trackedInventory: !profileAvailable
        ? profileReadiness
        : input.trackedInventoryReady
          ? "available"
          : "setup_required",
    },
  }
}
