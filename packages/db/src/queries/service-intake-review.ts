import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { listOrderPaymentAccounts } from "./finance/order-payment-accounts"
import {
  type CreateServiceIntakeInput,
  createAndConfirmServiceIntakeInTransaction,
  prepareServiceIntakeInTransaction,
  serviceAssigneeWhere,
  serviceIntakeReviewRevision,
} from "./service-work"

export class ServiceIntakeReviewError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "CONFLICT",
    message: string,
  ) {
    super(message)
    this.name = "ServiceIntakeReviewError"
  }
}
export type ReviewedServiceIntakeInput = Omit<
  CreateServiceIntakeInput,
  "clientIntakeId" | "schemaVersion"
> & {
  /** Original customer identity; the server loads its immutable contact snapshot. */
  customerId?: string
}

/** This stricter assistant ceiling does not expand native Service permissions. */
export async function assertAssistantServiceIntakeAuthority(
  tx: Prisma.TransactionClient,
  input: Pick<
    ReviewedServiceIntakeInput,
    "tenantId" | "storeId" | "actorUserId"
  >,
) {
  const [actor] = await tx.$queryRaw<
    Array<{ id: string; role: string; staffAccessMode: string }>
  >`
    SELECT m."id", m."role", m."staffAccessMode" FROM "Membership" m
    JOIN "Tenant" t ON t."id" = m."tenantId" AND t."isActive" = true
    WHERE m."tenantId" = ${input.tenantId} AND m."userId" = ${input.actorUserId}
      AND m."status" = 'ACTIVE' FOR SHARE OF m, t
  `
  if (!actor || !["OWNER", "ADMIN", "MANAGER"].includes(actor.role))
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "Owner, Admin or Manager service access is required.",
    )
  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
    select: { id: true },
  })
  if (!store)
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "The current Store is unavailable.",
    )
  if (actor.role === "MANAGER" && actor.staffAccessMode === "SCOPED") {
    const assignment = await tx.staffStoreAssignment.findFirst({
      where: {
        membershipId: actor.id,
        tenantId: input.tenantId,
        storeId: input.storeId,
        status: "ACTIVE",
        role: "MANAGER",
      },
      select: { id: true, revision: true },
    })
    if (!assignment)
      throw new ServiceIntakeReviewError(
        "FORBIDDEN",
        "Manager access at this Store is required.",
      )
  }
  return actor
}

/** Caller owns a Serializable transaction, including proposal receipt persistence. */
export async function reviewServiceIntakeInTransaction(
  tx: Prisma.TransactionClient,
  input: ReviewedServiceIntakeInput,
) {
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  if (
    input.customerId &&
    (input.customerName || input.customerEmail || input.customerPhone)
  )
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "Select a saved customer or enter contact details, without overrides.",
    )
  const customer = input.customerId
    ? await tx.customer.findFirst({
        where: { id: input.customerId, tenantId: input.tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          updatedAt: true,
        },
      })
    : null
  if (input.customerId && !customer)
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "The selected customer is unavailable in this business.",
    )
  const command: CreateServiceIntakeInput = {
    ...input,
    clientIntakeId: "service-intake-review",
    schemaVersion: 1,
    ...(customer
      ? {
          customerName: customer.name,
          customerPhone: customer.phone ?? undefined,
          customerEmail: customer.email ?? undefined,
        }
      : {}),
  }
  const prepared = await prepareServiceIntakeInTransaction(tx, command)
  if (prepared.offerings.some((o) => o.pricingPolicy !== "FIXED"))
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "Quote-required services must use the canonical quote workflow.",
    )
  const assignee = input.requestedAssigneeId
    ? await tx.membership.findFirst({
        where: serviceAssigneeWhere({
          tenantId: input.tenantId,
          storeId: input.storeId,
          userId: input.requestedAssigneeId,
        }),
        select: {
          id: true,
          role: true,
          staffAccessRevision: true,
          user: { select: { id: true, name: true } },
        },
      })
    : null
  if (input.requestedAssigneeId && !assignee)
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "Choose an active service assignee at this Store.",
    )
  const tracked = prepared.resolvedLines.filter(
    (line) => line.workPolicy === "TRACKED",
  )
  if (!tracked.length && (input.requestedAssigneeId || input.dueCommitmentAt))
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "Assignment and promised work time require a tracked Service line.",
    )
  // Native Intake has no receiving-account argument. Never silently guess or
  // bypass the owning payment command's Finance account requirements.
  if (prepared.initialPaymentMinor > 0) {
    const paymentAccounts = await listOrderPaymentAccounts(tx, {
      tenantId: input.tenantId,
      currencyCode: prepared.store.currencyCode,
    })
    if (paymentAccounts.book)
      throw new ServiceIntakeReviewError(
        "CONFLICT",
        "Create this intake without payment, then record payment with a receiving account in the Order.",
      )
  }
  const reminderChannel =
    input.notificationChannel?.toUpperCase() ??
    prepared.settings?.defaultNotificationChannel
  if (
    tracked.length &&
    prepared.dueCommitmentAt &&
    command.customerPhone &&
    prepared.settings?.autoNotifyReminder &&
    ["SMS", "WHATSAPP"].includes(reminderChannel ?? "")
  )
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "This intake would schedule an automatic customer reminder. Use the Service intake form to review that notification.",
    )
  const review = {
    storeId: input.storeId,
    currencyCode: prepared.store.currencyCode,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        }
      : {
          id: null,
          name: command.customerName ?? null,
          phone: command.customerPhone ?? null,
          email: command.customerEmail ?? null,
        },
    assignee: assignee
      ? { userId: assignee.user.id, name: assignee.user.name }
      : null,
    lines: prepared.resolvedLines,
    subtotalMinor: prepared.subtotalMinor,
    serviceChargeMinor: prepared.serviceChargeMinor,
    totalMinor: prepared.totalMinor,
    initialPaymentMinor: prepared.initialPaymentMinor,
    balanceMinor: prepared.totalMinor - prepared.initialPaymentMinor,
    dueCommitmentAt: prepared.dueCommitmentAt?.toISOString() ?? null,
    trackedLineCount: tracked.length,
    notification: "none" as const,
  }
  const revision = serviceIntakeReviewRevision({
    input,
    actor,
    customer,
    assignee,
    review,
    offerings: [...prepared.offerings].sort((a, b) => a.id.localeCompare(b.id)),
    settings: prepared.settings,
  })
  return { review, revision, command }
}

/** A closure may live only for the duration of this caller-owned transaction. */
export async function prepareReviewedServiceIntakeInTransaction(
  tx: Prisma.TransactionClient,
  input: ReviewedServiceIntakeInput,
) {
  const prepared = await reviewServiceIntakeInTransaction(tx, input)
  return {
    ...prepared,
    execute: async (clientIntakeId: string) => {
      const current = await reviewServiceIntakeInTransaction(tx, input)
      if (current.revision !== prepared.revision)
        throw new CatalogError(
          "REVISION_CONFLICT",
          "Service intake changed. Review again.",
        )
      return createAndConfirmServiceIntakeInTransaction(tx, {
        ...current.command,
        clientIntakeId,
        lines: current.command.lines.map((line) => {
          const saved = current.review.lines.find(
            (row) => row.offeringId === line.offeringId,
          )
          if (!saved)
            throw new CatalogError(
              "OFFERING_UNAVAILABLE",
              "Service Offering is unavailable.",
            )
          return { ...line, expectedFixedPriceMinor: saved.unitPriceMinor }
        }),
      })
    },
  }
}
