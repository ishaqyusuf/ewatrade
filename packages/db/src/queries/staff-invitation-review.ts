import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertQaTenantIdentity } from "./qa-maintenance"
import {
  getRetailOpsStaffInviteRecipientProblem,
  isCountedStaffMembership,
} from "./retail-ops-staff"
import { getRetailOpsSubscriptionSnapshot } from "./retail-ops-subscriptions"
import {
  STAFF_STORE_ACCESS_ROLLOUT_READY,
  StaffStoreAccessError,
  validateStaffStoreAccess,
} from "./staff-store-access"

const id = z.string().trim().min(1).max(160)
export const staffInvitationReviewInput = z.object({
  email: z.string().trim().email().max(254).transform(email => email.toLowerCase()),
  name: z.string().trim().min(1).max(120).optional(),
  assignments: z.array(z.object({
    storeId: id,
    role: z.enum(["CASHIER", "OPERATOR", "MANAGER"]),
  }).strict()).min(1).max(100),
  defaultStoreId: id,
  catalogEditor: z.boolean(),
}).strict()

type Scope = { tenantId: string; actorUserId: string }
export type StaffInvitationReviewInput = z.infer<typeof staffInvitationReviewInput>

/** Read-only snapshot. It does not reserve a seat or authorize a later command. */
export async function reviewStaffInvitationInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffInvitationReviewInput & Scope,
) {
  const parsed = staffInvitationReviewInput.parse({
    email: input.email,
    name: input.name,
    assignments: input.assignments,
    defaultStoreId: input.defaultStoreId,
    catalogEditor: input.catalogEditor,
  })
  const actor = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId, userId: input.actorUserId,
      status: "ACTIVE", tenant: { isActive: true },
    },
    select: { role: true },
  })
  if (!actor || !["OWNER", "ADMIN"].includes(actor.role))
    throw new StaffStoreAccessError("FORBIDDEN", "Only Owner/Admin can review staff invitations.")
  await assertQaTenantIdentity(tx, { email: parsed.email, tenantId: input.tenantId })
  await validateStaffStoreAccess(tx, { ...parsed, tenantId: input.tenantId })
  const [membership, stores, subscription] = await Promise.all([
    tx.membership.findFirst({
      where: { tenantId: input.tenantId, user: { email: parsed.email } },
      select: { id: true, role: true, status: true, staffAccessRevision: true },
    }),
    tx.store.findMany({
      where: { tenantId: input.tenantId, id: { in: parsed.assignments.map(row => row.storeId) }, status: "ACTIVE" },
      select: { id: true, name: true },
    }),
    getRetailOpsSubscriptionSnapshot(tx, { tenantId: input.tenantId }),
  ])
  const seat = subscription.entitlements.find(row => row.key === "staff")
  if (!seat) throw Error("Staff entitlement is unavailable.")
  const additionalSeat = !membership || !isCountedStaffMembership(membership)
  const recipientProblem = getRetailOpsStaffInviteRecipientProblem(membership)
  const blockers: Array<{ code: string; message: string }> = []
  if (recipientProblem) blockers.push(recipientProblem)
  if (additionalSeat && seat.isAtLimit)
    blockers.push({ code: "STAFF_SEAT_LIMIT", message: `${subscription.plan.name} has no remaining staff seat. Resolve the plan limit before inviting.` })
  if (!STAFF_STORE_ACCESS_ROLLOUT_READY)
    blockers.push({ code: "STAFF_ROLLOUT_UNAVAILABLE", message: "Store staff assignments are not available in this runtime." })
  const assignments = parsed.assignments.map(row => {
    const store = stores.find(store => store.id === row.storeId)
    if (!store) throw new StaffStoreAccessError("INVALID_INPUT", "A selected Store is unavailable for this business.")
    return { ...row, storeName: store.name }
  })
  const role = assignments.find(row => row.storeId === parsed.defaultStoreId)!.role
  return {
    version: 1 as const,
    asOf: new Date().toISOString(),
    business: subscription.tenant,
    recipient: { email: parsed.email, name: parsed.name ?? null },
    currentMembership: membership,
    proposed: { role, status: "INVITED" as const, assignments, defaultStoreId: parsed.defaultStoreId, catalogEditor: parsed.catalogEditor },
    seats: { used: seat.used, limit: seat.limit, additional: additionalSeat ? 1 : 0, planName: subscription.plan.name },
    blockers,
    notification: { status: "not_requested" as const, recipientEmail: parsed.email, sideEffect: "Confirmation would save an invitation and request an invitation email. This review has not saved, queued or delivered either." },
    warnings: [
      "An invitation does not activate this person or create credentials; onboarding is required.",
      ...(membership ? ["Refreshing an invitation replaces the intended role and Store assignments and invalidates previous pending links."] : []),
      "This snapshot reserves no seat. Confirmation must recheck current access, assignments, recipient and subscription limits.",
      "Reliable email delivery, resend/revoke and lost-response recovery require the durable invitation command/outbox workflow.",
    ],
  }
}

export async function reviewStaffInvitation(
  db: PrismaClient,
  input: StaffInvitationReviewInput & Scope,
) {
  return db.$transaction(tx => reviewStaffInvitationInTransaction(tx, input), {
    isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000,
  })
}
export type StaffInvitationReview = Awaited<ReturnType<typeof reviewStaffInvitation>>
