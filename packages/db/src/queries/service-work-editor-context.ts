import type { Prisma } from "../../generated/prisma/client"
import {
  ServiceIntakeReviewError,
  assertAssistantServiceIntakeAuthority,
} from "./service-intake-review"
import { serviceAssigneeWhere } from "./service-work"
import { assertNonClinicalServiceWorkOrder } from "./service-work-order-scope"

export type ServiceWorkEditorContextInput = {
  tenantId: string
  storeId: string
  actorUserId: string
  jobId: string
  lineId?: string
}

function unavailable(message: string): never {
  throw new ServiceIntakeReviewError("CONFLICT", message)
}

/** Read-only choices; final GENERAL review/confirmation rechecks the owning command. */
export async function readServiceWorkEditorContextInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceWorkEditorContextInput,
) {
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  if (actor.role === "MANAGER" && actor.staffAccessMode === "SCOPED")
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "Scoped Manager Service lifecycle access is not available yet.",
    )
  const job = await tx.serviceJob.findFirst({
    where: {
      id: input.jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      commercialOrderId: true,
      commercialOrder: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          orderNumber: true,
          customerName: true,
          acceptedCommerceQuoteVersion: {
            select: { quote: { select: { sourceType: true } } },
          },
          prescriptionPickupFulfillment: { select: { id: true } },
          prescriptionDeliveryAddress: { select: { id: true } },
          _count: { select: { prescriptionPaymentIntents: true } },
        },
      },
      dueCommitments: {
        where: { supersededAt: null },
        orderBy: { effectiveAt: "desc" },
        take: 2,
        select: { promisedAt: true },
      },
    },
  })
  if (!job)
    unavailable("This saved Service Job is unavailable at the current Store.")
  if (
    job.commercialOrder.id !== job.commercialOrderId ||
    job.commercialOrder.tenantId !== input.tenantId ||
    job.commercialOrder.storeId !== input.storeId
  )
    unavailable("This Service Job has an invalid Order linkage.")
  assertNonClinicalServiceWorkOrder(job.commercialOrder)
  if (job.dueCommitments.length > 1)
    unavailable(
      "This Job has conflicting current promises. Resolve them in Service work.",
    )
  const line = input.lineId
    ? await tx.serviceJobLine.findFirst({
        where: { id: input.lineId, serviceJobId: job.id },
        select: {
          id: true,
          status: true,
          authorizationStatus: true,
          allocatedQuantity: true,
          commercialOrderLine: {
            select: {
              orderId: true,
              snapshot: { select: { offeringName: true, variantName: true } },
            },
          },
        },
      })
    : null
  if (
    input.lineId &&
    (!line || line.commercialOrderLine.orderId !== job.commercialOrderId)
  )
    unavailable("Choose the exact saved Line belonging to this Job and Order.")
  const memberships = await tx.membership.findMany({
    where: serviceAssigneeWhere(input),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 101,
    select: {
      user: {
        select: { id: true, displayName: true, name: true, email: true },
      },
    },
  })
  return {
    tenantId: input.tenantId,
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    job: {
      id: job.id,
      orderNumber: job.commercialOrder.orderNumber,
      customerName: job.commercialOrder.customerName,
      promisedAt: job.dueCommitments[0]?.promisedAt.toISOString() ?? null,
    },
    line: line
      ? {
          id: line.id,
          offeringName:
            line.commercialOrderLine.snapshot?.offeringName ?? "Service",
          variantName:
            line.commercialOrderLine.snapshot?.variantName ?? "Service",
          quantity: line.allocatedQuantity.toString(),
          status: line.status,
          authorizationStatus: line.authorizationStatus,
        }
      : null,
    // Do not offer a truncated selection as though it were the complete set.
    assigneesComplete: memberships.length <= 100,
    assignees:
      memberships.length > 100
        ? []
        : memberships.map(({ user }) => ({
            id: user.id,
            name: user.displayName?.trim() || user.name?.trim() || user.email,
          })),
  }
}
