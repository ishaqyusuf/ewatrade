import { evaluateServiceCommerceBookingSlot } from "@ewatrade/service-commerce"
import {
  assertServiceCommercePolicyAllowedReadOnlyInTransaction,
  evaluateServiceCommercePolicyBatchReadOnlyInTransaction,
} from "../service-commerce-policy"
import { readStaffStoreAccess } from "../staff-store-access"
import { assertStaffBookingCommandScopeInTransaction } from "./booking-command-authority"
import { factSet, refuse, revision, sameScope } from "./booking-review-shared"
import { readServiceCommerceBookingSlotFactsInTransaction } from "./lifecycle"
import {
  type BookingTransaction,
  ServiceCommerceBookingError,
  assertBookingRuntimeReady,
  readBookingSourceIdentity,
} from "./shared"

export async function authority(
  tx: BookingTransaction,
  input: { actorUserId: string; tenantId: string; storeId: string },
) {
  await assertStaffBookingCommandScopeInTransaction(tx, input)
  const member = await tx.membership.findFirst({
    where: {
      userId: input.actorUserId,
      tenantId: input.tenantId,
      status: "ACTIVE",
      acceptedAt: { not: null },
    },
    select: { id: true, role: true },
  })
  if (!member) refuse()
  const access = await readStaffStoreAccess(tx, member.id, input.tenantId)
  if (!access) refuse()
  await assertBookingRuntimeReady(tx, input)
  const runtime = await tx.serviceCommerceStoreProfile.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "ACTIVE",
      bookingEnabled: true,
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      revision: true,
      status: true,
      bookingEnabled: true,
    },
  })
  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      status: true,
      countryCode: true,
      currencyCode: true,
    },
  })
  if (
    !runtime ||
    !store ||
    store.id !== input.storeId ||
    store.tenantId !== input.tenantId
  )
    refuse()
  sameScope(runtime, input)
  revision(runtime.revision)
  const policy = await assertServiceCommercePolicyAllowedReadOnlyInTransaction(
    tx,
    {
      ...input,
      channel: "staff",
      subject: "booking",
      vertical: "service",
      purpose: "booking_command_review",
    },
  )
  const policies = await tx.serviceCommercePolicyDecision.findMany({
    where: { tenantId: input.tenantId, storeId: input.storeId },
  })
  for (const row of policies) sameScope(row, input)
  return {
    membershipId: member.id,
    role: member.role,
    accessMode: access.staffAccessMode,
    accessRevision: access.staffAccessRevision,
    assignments: access.staffStoreAssignments
      .map((row) => ({
        storeId: row.storeId,
        role: row.role,
        status: row.status,
        revision: row.revision,
      }))
      .sort((a, b) => a.storeId.localeCompare(b.storeId)),
    runtime,
    store,
    policy,
    policies: policies
      .filter((row) => row.vertical === "SERVICE" && row.subject === "BOOKING")
      .map((row) => ({
        id: row.id,
        channel: row.channel,
        jurisdictionCode: row.jurisdictionCode,
        outcome: row.outcome,
        revision: row.revision,
        effectiveAt: row.effectiveAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        approvalReferencePresent: Boolean(row.approvalReference),
        evidenceReferencePresent: Boolean(row.evidenceReference),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}
export async function source(
  tx: BookingTransaction,
  input: { tenantId: string; storeId: string },
  sourceId: string,
  requireEligible: boolean,
) {
  if (requireEligible) {
    const row = await readBookingSourceIdentity(tx, {
      ...input,
      source: { kind: "service", id: sourceId },
    })
    if (row.id !== sourceId) refuse()
    sameScope(row, input)
    revision(row.revision, true)
    return row
  }
  const row = await tx.serviceRequest.findFirst({
    where: { ...input, id: sourceId },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      revision: true,
      status: true,
    },
  })
  if (!row || row.id !== sourceId) refuse()
  sameScope(row, input)
  revision(row.revision, true)
  return row
}
export async function slot(
  tx: BookingTransaction,
  input: { tenantId: string; storeId: string },
  configId: string,
  resourceId: string,
  startAt: Date,
  endAt: Date,
  quantity: number,
  now: Date,
  exclusions: { excludeHoldId?: string; excludeBookingId?: string } = {},
) {
  // No smaller row cap than the canonical command. Whole-review byte refusal
  // below is explicit; never report partial facts as complete capacity.
  const facts = await readServiceCommerceBookingSlotFactsInTransaction(tx, {
    ...input,
    ...exclusions,
    configId,
    resourceId,
    startAt,
    endAt,
    now,
  })
  sameScope(facts.config, input)
  sameScope(facts.resource, input)
  sameScope(facts.settings, input)
  revision(facts.config.revision)
  revision(facts.resource.revision)
  revision(facts.settings.revision)
  if (
    facts.config.id !== configId ||
    facts.resource.id !== resourceId ||
    facts.config.resources[0]?.resourceId !== resourceId
  )
    refuse()
  const expectedEnd = startAt.getTime() + facts.config.durationMinutes * 60_000
  const horizon = now.getTime() + facts.config.bookingHorizonMinutes * 60_000
  if (
    endAt.getTime() !== expectedEnd ||
    startAt.getTime() > horizon ||
    endAt.getTime() > horizon
  )
    refuse("The exact slot duration or booking horizon changed.")
  const evaluation = evaluateServiceCommerceBookingSlot({
    availability: facts.availability,
    bookings: facts.bookings,
    holds: facts.holds,
    capacity: facts.resource.capacity,
    leadTimeMinutes: facts.config.leadTimeMinutes,
    startAt,
    endAt,
    now,
  })
  if (!evaluation.eligible || evaluation.remainingCapacity < quantity)
    throw new ServiceCommerceBookingError(
      "BOOKING_CAPACITY_CONFLICT",
      "The exact slot no longer has the reviewed capacity.",
    )
  return {
    config: {
      id: facts.config.id,
      offeringId: facts.config.offeringId,
      revision: facts.config.revision,
      status: facts.config.status,
      durationMinutes: facts.config.durationMinutes,
      leadTimeMinutes: facts.config.leadTimeMinutes,
      bookingHorizonMinutes: facts.config.bookingHorizonMinutes,
      holdDurationMinutes: facts.config.holdDurationMinutes,
      paymentRequirement: facts.config.paymentRequirement,
      depositAmountMinor: facts.config.depositAmountMinor,
      paymentPolicyRevision: facts.config.paymentPolicyRevision,
      cancellationPolicyRevision: facts.config.cancellationPolicyRevision,
      cancellationWindowMinutes: facts.config.cancellationWindowMinutes,
      refundPolicy: facts.config.refundPolicy,
      capacity: facts.config.capacity,
      createdAt: facts.config.createdAt,
      updatedAt: facts.config.updatedAt,
      resources: facts.config.resources
        .map((row) => ({
          resourceId: row.resourceId,
          capacityRequired: row.capacityRequired,
        }))
        .sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
    },
    resource: {
      id: facts.resource.id,
      name: facts.resource.name,
      kind: facts.resource.kind,
      capacity: facts.resource.capacity,
      revision: facts.resource.revision,
    },
    settings: {
      id: facts.settings.id,
      revision: facts.settings.revision,
      timezone: facts.settings.timezone,
      defaultSlotInterval: facts.settings.defaultSlotInterval,
      defaultHoldMinutes: facts.settings.defaultHoldMinutes,
      reminderLeadMinutes: facts.settings.reminderLeadMinutes,
    },
    availability: {
      ...facts.availability,
      rules: factSet(
        facts.availability.rules.map((rule) => ({
          ...rule,
          daysOfWeek: [...rule.daysOfWeek].sort((a, b) => a - b),
        })),
      ),
      exceptions: factSet(facts.availability.exceptions),
    },
    reservations: {
      bookings: factSet(facts.bookings),
      holds: factSet(facts.holds),
    },
    reservationFacts: {
      bookings: [...facts.reservationFacts.bookings].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      holds: [...facts.reservationFacts.holds].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    },
    evaluation,
  }
}
export async function order(
  tx: BookingTransaction,
  input: { tenantId: string; storeId: string },
  id?: string | null,
) {
  if (!id) return null
  const row = await tx.commercialOrder.findFirst({
    where: { id, tenantId: input.tenantId, storeId: input.storeId },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      status: true,
      completedAt: true,
      currencyCode: true,
      totalMinor: true,
      paymentStatus: true,
      acceptedCommerceQuoteVersion: {
        select: { id: true, quote: { select: { sourceType: true } } },
      },
      prescriptionPickupFulfillment: { select: { id: true } },
      prescriptionDeliveryAddress: { select: { id: true } },
      _count: { select: { prescriptionPaymentIntents: true } },
    },
  })
  if (!row || row.id !== id) refuse()
  sameScope(row, input)
  if (
    row.acceptedCommerceQuoteVersion?.quote.sourceType ===
      "PRESCRIPTION_REQUEST" ||
    row.prescriptionPickupFulfillment ||
    row.prescriptionDeliveryAddress ||
    !row._count ||
    row._count.prescriptionPaymentIntents !== 0
  )
    refuse("This nonclinical booking review cannot expose that Order.")
  return row
}
export async function notifications(
  tx: BookingTransaction,
  input: { actorUserId: string; tenantId: string; storeId: string },
  enabled: boolean,
  channel: "STAFF" | "WEB" | "WHATSAPP",
  requiredAuthorizer: boolean,
) {
  if (!enabled)
    return {
      contactPresent: false,
      intent: "not_created" as const,
      delivery: "unverified" as const,
    }
  const [policy] =
    await evaluateServiceCommercePolicyBatchReadOnlyInTransaction(tx, {
      ...input,
      purpose: "booking_notification_review",
      scopes: [
        {
          channel:
            channel === "STAFF"
              ? "staff"
              : channel === "WHATSAPP"
                ? "whatsapp"
                : "web",
          subject: "booking",
          vertical: "service",
        },
      ],
    })
  const authorizer =
    policy?.outcome === "allowed"
      ? await tx.serviceCommerceStoreTeamAssignment.findFirst({
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            capability: "ATTENDANT",
            status: "ACTIVE",
            membership: {
              acceptedAt: { not: null },
              status: "ACTIVE",
              tenantId: input.tenantId,
            },
          },
          select: { membership: { select: { userId: true } } },
        })
      : null
  if (requiredAuthorizer && policy?.outcome === "allowed" && !authorizer)
    refuse("An active Store attendant must authorize booking notifications.")
  return {
    contactPresent: true,
    policy,
    authorizationUserId: authorizer?.membership.userId ?? null,
    intent:
      policy?.outcome === "allowed" && authorizer
        ? ("may_create_durable_intent" as const)
        : ("not_created" as const),
    delivery: "unverified" as const,
  }
}
