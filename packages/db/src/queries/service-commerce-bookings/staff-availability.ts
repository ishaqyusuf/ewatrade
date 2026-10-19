import { createHash } from "node:crypto"
import {
  evaluateServiceCommerceBookingSlot,
  serviceCommerceBookingAvailabilityExceptionSchema,
  serviceCommerceBookingAvailabilityRuleSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"
import type { Prisma } from "../../../generated/prisma/client"
import { assertServiceCommercePolicyAllowedReadOnlyInTransaction } from "../service-commerce-policy"
import { readStaffStoreAccess } from "../staff-store-access"
import { readServiceCommerceBookingSlotFactsInTransaction } from "./lifecycle"
import {
  ServiceCommerceBookingError,
  assertBookingMember,
  assertBookingRuntimeReady,
  readBookingSourceIdentity,
} from "./shared"

const MAX_FACT_ROWS = 1_000
const MAX_CANDIDATES = 500
const exactId = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const inputSchema = z
  .object({
    actorUserId: exactId,
    tenantId: exactId,
    storeId: exactId,
    source: z.object({ kind: z.literal("service"), id: exactId }).strict(),
    offeringId: exactId,
    resourceId: exactId,
    from: z.date(),
    to: z.date(),
    quantity: z.number().int().min(1).max(10_000).default(1),
    limit: z.number().int().min(1).max(100).default(100),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict()
export type StaffServiceCommerceBookingAvailabilityInput = z.input<
  typeof inputSchema
>
const cursorSchema = z
  .object({
    version: z.literal(1),
    binding: z.string().regex(/^[a-f0-9]{64}$/),
    next: z.string().datetime(),
  })
  .strict()
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
function refuse(
  code: ServiceCommerceBookingError["code"],
  message: string,
): never {
  throw new ServiceCommerceBookingError(code, message)
}
function revision(value: number, positive = false) {
  return (
    Number.isSafeInteger(value) &&
    value >= (positive ? 1 : 0) &&
    value <= 2_147_483_647
  )
}
function sameScope(
  row: { tenantId: string; storeId: string },
  scope: { tenantId: string; storeId: string },
) {
  return row.tenantId === scope.tenantId && row.storeId === scope.storeId
}
async function authority(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof inputSchema>,
) {
  // Retain the native accepted Owner/Admin or explicitly assigned attendant
  // predicate; a broad POS role alone never grants booking authority.
  const actor = await assertBookingMember(tx, input)
  const [tenant, store, access] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: input.tenantId, isActive: true },
      select: { id: true, isActive: true },
    }),
    tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
      select: { id: true, tenantId: true, status: true },
    }),
    readStaffStoreAccess(tx, actor.id, input.tenantId),
  ])
  if (
    !tenant ||
    tenant.id !== input.tenantId ||
    !tenant.isActive ||
    !store ||
    store.id !== input.storeId ||
    store.tenantId !== input.tenantId ||
    store.status !== "ACTIVE" ||
    !access ||
    access.status !== "ACTIVE" ||
    access.role !== actor.role ||
    !["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"].includes(
      access.role,
    ) ||
    !["LEGACY", "SCOPED"].includes(access.staffAccessMode) ||
    !revision(access.staffAccessRevision, true) ||
    (access.staffAccessMode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(access.role) &&
      !access.staffStoreAssignments.some(
        (row) => row.storeId === input.storeId && row.status === "ACTIVE",
      ))
  ) {
    refuse(
      "BOOKING_FORBIDDEN",
      "Current accepted Store booking access is required.",
    )
  }
  await assertBookingRuntimeReady(tx, input)
  const policy = await assertServiceCommercePolicyAllowedReadOnlyInTransaction(
    tx,
    {
      ...input,
      channel: "staff",
      subject: "booking",
      vertical: "service",
      purpose: "booking_staff_availability",
    },
  )
  return {
    membershipId: actor.id,
    role: access.role,
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
    policy,
  }
}
function readCursor(cursor: string | undefined, binding: string) {
  if (cursor === undefined) return null
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error()
    const bytes = Buffer.from(cursor, "base64url")
    if (bytes.toString("base64url") !== cursor) throw Error()
    const parsed = cursorSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    )
    if (parsed.binding !== binding) throw Error()
    const next = new Date(parsed.next)
    if (next.toISOString() !== parsed.next) throw Error()
    return next
  } catch {
    return refuse(
      "BOOKING_CONFIGURATION_CONFLICT",
      "Keep the exact availability filters and current access, or start the first page again.",
    )
  }
}

/**
 * Caller owns a consistent read transaction and fresh authenticated outer scope.
 * One exact configured resource, live unreserved pages. No customer capability,
 * policy audit, reservation, notification, lock, mutation or root transaction.
 * This does not grant hold/confirm/revise authority or assess payment readiness.
 */
export async function readStaffServiceCommerceBookingAvailabilityInTransaction(
  tx: Prisma.TransactionClient,
  raw: StaffServiceCommerceBookingAvailabilityInput,
) {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success)
    refuse(
      "BOOKING_INVALID_INPUT",
      "Choose an exact Service booking availability window.",
    )
  const input = structuredClone(parsed.data)
  const now = new Date(Date.now())
  if (
    input.to <= input.from ||
    input.to.getTime() - input.from.getTime() > 31 * 86_400_000
  )
    refuse(
      "BOOKING_INVALID_INPUT",
      "Booking slot window must be positive and at most 31 days.",
    )
  const current = await authority(tx, input)
  const source = await readBookingSourceIdentity(tx, input)
  if (
    source.id !== input.source.id ||
    !sameScope(source, input) ||
    !revision(source.revision, true)
  )
    refuse(
      "BOOKING_NOT_FOUND",
      "The exact eligible Service Request is unavailable.",
    )
  const selected = await tx.serviceBookingOfferingConfig.findFirst({
    where: {
      offeringId: input.offeringId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "ACTIVE",
    },
    select: { id: true },
  })
  if (!selected)
    refuse(
      "BOOKING_NOT_FOUND",
      "The exact active booking configuration is unavailable.",
    )
  // One bounded current-fact load for the entire requested window, reused for
  // every candidate by the same canonical evaluator used by native commands.
  const facts = await readServiceCommerceBookingSlotFactsInTransaction(tx, {
    configId: selected.id,
    resourceId: input.resourceId,
    storeId: input.storeId,
    tenantId: input.tenantId,
    startAt: input.from,
    endAt: input.to,
    now,
    maxRows: MAX_FACT_ROWS,
  })
  const { config, resource, settings } = facts
  if (
    config.id !== selected.id ||
    config.offeringId !== input.offeringId ||
    !sameScope(config, input) ||
    config.status !== "ACTIVE" ||
    resource.id !== input.resourceId ||
    !sameScope(resource, input) ||
    resource.status !== "ACTIVE" ||
    !sameScope(settings, input) ||
    config.resources[0]?.resourceId !== input.resourceId ||
    !revision(config.revision) ||
    !revision(resource.revision) ||
    !revision(settings.revision) ||
    !Number.isSafeInteger(resource.capacity) ||
    resource.capacity < 1 ||
    resource.capacity > 10_000 ||
    !Number.isSafeInteger(settings.defaultSlotInterval) ||
    settings.defaultSlotInterval < 1 ||
    settings.defaultSlotInterval > 43_200 ||
    !Number.isSafeInteger(config.durationMinutes) ||
    config.durationMinutes < 1 ||
    config.durationMinutes > 43_200 ||
    !Number.isSafeInteger(config.bookingHorizonMinutes) ||
    config.bookingHorizonMinutes < 1 ||
    config.bookingHorizonMinutes > 43_200 ||
    !Number.isSafeInteger(config.leadTimeMinutes) ||
    config.leadTimeMinutes < 0 ||
    config.leadTimeMinutes > 525_600
  )
    refuse(
      "BOOKING_CONFIGURATION_CONFLICT",
      "Complete current booking configuration is unavailable.",
    )
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone }).format(
      now,
    )
  } catch {
    refuse(
      "BOOKING_CONFIGURATION_CONFLICT",
      "The saved Store booking timezone is unavailable.",
    )
  }
  const reservationValid = (row: {
    startAt: Date
    endAt: Date
    quantity: number
  }) =>
    [row.startAt, row.endAt].every(
      (at) => at instanceof Date && Number.isFinite(at.getTime()),
    ) &&
    row.endAt > row.startAt &&
    Number.isSafeInteger(row.quantity) &&
    row.quantity >= 1 &&
    row.quantity <= 10_000
  if (
    !serviceCommerceBookingAvailabilityRuleSchema
      .array()
      .safeParse(facts.availability.rules).success ||
    !serviceCommerceBookingAvailabilityExceptionSchema
      .array()
      .safeParse(facts.availability.exceptions).success ||
    !facts.bookings.every(reservationValid) ||
    !facts.holds.every(
      (row) =>
        reservationValid(row) &&
        row.expiresAt instanceof Date &&
        Number.isFinite(row.expiresAt.getTime()),
    )
  )
    refuse(
      "BOOKING_CONFIGURATION_CONFLICT",
      "Complete valid current capacity facts are unavailable. Availability is unknown.",
    )
  const binding = fingerprint({
    version: 1,
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    source,
    offeringId: input.offeringId,
    resourceId: input.resourceId,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    quantity: input.quantity,
    limit: input.limit,
    authority: current,
    configuration: { id: config.id, revision: config.revision },
    resource: {
      id: resource.id,
      revision: resource.revision,
      capacity: resource.capacity,
    },
    settings: {
      id: settings.id,
      revision: settings.revision,
      timezone: settings.timezone,
      interval: settings.defaultSlotInterval,
    },
  })
  const interval = settings.defaultSlotInterval * 60_000
  const duration = config.durationMinutes * 60_000
  const originalFirst = Math.ceil(input.from.getTime() / interval) * interval
  const after = readCursor(input.cursor, binding)
  if (
    after &&
    (after.getTime() < originalFirst ||
      after >= input.to ||
      (after.getTime() - originalFirst) % interval !== 0)
  )
    refuse(
      "BOOKING_INVALID_INPUT",
      "The exact booking continuation is unavailable.",
    )
  const effectiveFrom = new Date(Math.max(input.from.getTime(), now.getTime()))
  const effectiveTo = new Date(
    Math.min(
      input.to.getTime(),
      now.getTime() + config.bookingHorizonMinutes * 60_000,
    ),
  )
  let candidate = Math.max(
    after?.getTime() ?? originalFirst,
    Math.ceil(effectiveFrom.getTime() / interval) * interval,
  )
  const slots: Array<{
    resourceId: string
    startAt: string
    endAt: string
    remainingCapacity: number
  }> = []
  let scannedCandidates = 0
  while (
    candidate + duration <= effectiveTo.getTime() &&
    scannedCandidates < MAX_CANDIDATES &&
    slots.length < input.limit
  ) {
    const startAt = new Date(candidate)
    const endAt = new Date(candidate + duration)
    const evaluation = evaluateServiceCommerceBookingSlot({
      availability: facts.availability,
      bookings: facts.bookings,
      holds: facts.holds,
      capacity: resource.capacity,
      leadTimeMinutes: config.leadTimeMinutes,
      now,
      startAt,
      endAt,
    })
    if (evaluation.eligible && evaluation.remainingCapacity >= input.quantity)
      slots.push({
        resourceId: resource.id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        remainingCapacity: evaluation.remainingCapacity,
      })
    candidate += interval
    scannedCandidates++
  }
  const nextCursor =
    candidate + duration <= effectiveTo.getTime()
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            binding,
            next: new Date(candidate).toISOString(),
          }),
        ).toString("base64url")
      : null
  return {
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    source: {
      kind: "service" as const,
      id: source.id,
      revision: source.revision,
    },
    offeringId: config.offeringId,
    resource: {
      id: resource.id,
      label: resource.name,
      capacity: resource.capacity,
      revision: resource.revision,
    },
    configuration: {
      id: config.id,
      revision: config.revision,
      durationMinutes: config.durationMinutes,
      leadTimeMinutes: config.leadTimeMinutes,
      bookingHorizonMinutes: config.bookingHorizonMinutes,
    },
    settingsRevision: settings.revision,
    timezone: settings.timezone,
    asOf: now.toISOString(),
    requestedWindow: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    },
    effectiveWindow: {
      from: effectiveFrom.toISOString(),
      to: effectiveTo.toISOString(),
    },
    quantity: input.quantity,
    slots,
    nextCursor,
    coverage: {
      scannedCandidates,
      scanLimit: MAX_CANDIDATES,
      pageLimit: input.limit,
      reachedEnd: nextCursor === null,
      livePage: true as const,
    },
    capacityAssessment: "live_unreserved" as const,
    paymentReadiness: "not_checked" as const,
    providerSettlement: "not_checked" as const,
  }
}
export type StaffServiceCommerceBookingAvailability = Awaited<
  ReturnType<typeof readStaffServiceCommerceBookingAvailabilityInTransaction>
>
