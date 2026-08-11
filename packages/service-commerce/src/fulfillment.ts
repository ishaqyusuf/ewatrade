import type {
  ServiceCommerceDeliveryCommand,
  ServiceCommerceDeliveryStatus,
  ServiceCommerceDeliveryZoneRule,
  ServiceCommerceFulfillmentProjection,
  ServiceCommercePickupCommand,
  ServiceCommercePickupStatus,
} from "./schemas"

export interface ServiceCommerceFulfillmentAdapter {
  delivery(
    actor: ServiceCommerceFulfillmentActor,
    command: ServiceCommerceDeliveryCommand,
  ): Promise<ServiceCommerceFulfillmentProjection>
  pickup(
    actor: ServiceCommerceFulfillmentActor,
    command: ServiceCommercePickupCommand,
  ): Promise<ServiceCommerceFulfillmentProjection>
}

export type ServiceCommerceFulfillmentActor = { userId: string }

const PICKUP_TRANSITIONS: Record<
  ServiceCommercePickupStatus,
  ServiceCommercePickupStatus[]
> = {
  abandoned: [],
  cancelled: [],
  exception: ["cancelled", "preparing", "ready"],
  handed_off: [],
  preparing: ["cancelled", "exception", "ready"],
  ready: ["abandoned", "cancelled", "exception", "handed_off"],
}

const DELIVERY_TRANSITIONS: Record<
  ServiceCommerceDeliveryStatus,
  ServiceCommerceDeliveryStatus[]
> = {
  assigned: ["cancelled", "collected", "failed", "rescheduled"],
  cancelled: [],
  collected: ["failed", "in_transit", "returned_to_store"],
  delivered: [],
  failed: ["cancelled", "rescheduled", "returned_to_store"],
  in_transit: ["delivered", "failed", "returned_to_store"],
  ready_for_assignment: ["assigned", "cancelled"],
  rescheduled: ["assigned", "cancelled"],
  returned_to_store: ["cancelled", "rescheduled"],
}

export function deriveServiceCommerceFulfillmentNextOperations(
  input:
    | { kind: "delivery"; status: ServiceCommerceDeliveryStatus | null }
    | { kind: "pickup"; status: ServiceCommercePickupStatus },
) {
  if (input.kind === "pickup") {
    if (input.status === "preparing" || input.status === "exception") {
      return ["prepare", "record_exception"] as const
    }
    if (input.status === "ready") {
      return ["handoff", "record_exception"] as const
    }
    return [] as const
  }
  if (input.status === null) return ["prepare"] as const
  if (
    input.status === "ready_for_assignment" ||
    input.status === "rescheduled"
  ) {
    return ["assign", "transition"] as const
  }
  if (input.status === "assigned") {
    return ["assign", "transition"] as const
  }
  return DELIVERY_TRANSITIONS[input.status].length > 0
    ? (["transition"] as const)
    : ([] as const)
}

export function assertServiceCommercePickupTransition(
  from: ServiceCommercePickupStatus,
  to: ServiceCommercePickupStatus,
) {
  if (!PICKUP_TRANSITIONS[from].includes(to)) {
    throw new Error(`Pickup cannot move from ${from} to ${to}.`)
  }
}

export function assertServiceCommerceDeliveryTransition(
  from: ServiceCommerceDeliveryStatus,
  to: ServiceCommerceDeliveryStatus,
) {
  if (!DELIVERY_TRANSITIONS[from].includes(to)) {
    throw new Error(`Delivery cannot move from ${from} to ${to}.`)
  }
}

function normalizeLocation(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function evaluateServiceCommerceDeliveryZone(
  rules: ServiceCommerceDeliveryZoneRule[],
  address: { locality: string; postalCode?: string },
) {
  const locality = normalizeLocation(address.locality)
  const postalCode = normalizeLocation(address.postalCode ?? "")
  const matches = rules
    .filter((rule) =>
      rule.matchValues.some((raw) => {
        const value = normalizeLocation(raw)
        return rule.matchType === "locality"
          ? locality === value
          : postalCode.startsWith(value)
      }),
    )
    .sort((left, right) => right.priority - left.priority)
  if (matches.length === 0) return { outcome: "ineligible" as const }
  if (matches.length > 1 && matches[0]?.priority === matches[1]?.priority) {
    return { outcome: "ambiguous" as const }
  }
  const zone = matches[0]
  if (!zone) return { outcome: "ineligible" as const }
  return zone.feePolicy === "manual"
    ? { outcome: "manual_review" as const, zone }
    : {
        feeMinor: zone.fixedFeeMinor ?? 0,
        outcome: "eligible" as const,
        zone,
      }
}

export type ServiceCommerceFulfillmentBlocker =
  | "not_authorized"
  | "not_eligible"
  | "not_packed"
  | "not_paid"
  | "not_ready"
  | "vertical_release_required"

export function deriveServiceCommerceFulfillmentGates(input: {
  actorAuthorized: boolean
  eligible: boolean
  packed: boolean
  paid: boolean
  ready: boolean
  verticalReleaseReady: boolean
}) {
  const blockers: ServiceCommerceFulfillmentBlocker[] = []
  if (!input.actorAuthorized) blockers.push("not_authorized")
  if (!input.paid) blockers.push("not_paid")
  if (!input.eligible) blockers.push("not_eligible")
  if (!input.verticalReleaseReady) blockers.push("vertical_release_required")
  if (!input.packed) blockers.push("not_packed")
  if (!input.ready) blockers.push("not_ready")
  const baseReady =
    input.actorAuthorized &&
    input.paid &&
    input.eligible &&
    input.verticalReleaseReady
  return {
    blockers,
    canAssignDelivery: baseReady && input.packed && input.ready,
    canCompletePickup: baseReady && input.packed && input.ready,
    canPrepare: baseReady,
  }
}

export function projectServiceCommerceFulfillmentEvent(input: {
  effectiveAt: Date
  kind: "pickup"
  reasonCode?: string | null
  status: ServiceCommercePickupStatus
}): {
  effectiveAt: Date
  kind: "pickup"
  reasonCode: string | null
  status: ServiceCommercePickupStatus
}
export function projectServiceCommerceFulfillmentEvent(input: {
  effectiveAt: Date
  kind: "delivery"
  reasonCode?: string | null
  status: ServiceCommerceDeliveryStatus
}): {
  effectiveAt: Date
  kind: "delivery"
  reasonCode: string | null
  status: ServiceCommerceDeliveryStatus
}
export function projectServiceCommerceFulfillmentEvent(
  input:
    | {
        effectiveAt: Date
        kind: "delivery"
        reasonCode?: string | null
        status: ServiceCommerceDeliveryStatus
      }
    | {
        effectiveAt: Date
        kind: "pickup"
        reasonCode?: string | null
        status: ServiceCommercePickupStatus
      },
) {
  return {
    effectiveAt: input.effectiveAt,
    kind: input.kind,
    reasonCode: input.reasonCode?.trim() || null,
    status: input.status,
  }
}
