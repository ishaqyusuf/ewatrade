import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { assertAssistantServiceIntakeAuthority } from "./service-intake-review"

/** Exact owning record. Catalog/customer changes never replace its saved facts. */
export async function readServiceIntakeReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    actorUserId: string
    intakeId: string
  },
) {
  await assertAssistantServiceIntakeAuthority(tx, input)
  const intake = await tx.serviceIntake.findFirst({
    where: {
      id: input.intakeId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "CONFIRMED",
    },
    include: {
      commercialOrder: {
        select: {
          id: true,
          orderNumber: true,
          currencyCode: true,
          lines: {
            include: { snapshot: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          payments: {
            where: { type: "PAYMENT" },
            select: {
              id: true,
              clientPaymentId: true,
              amountMinor: true,
              method: true,
              reference: true,
              recordedAt: true,
              recordedByUserId: true,
            },
          },
        },
      },
      jobs: {
        select: {
          id: true,
          lines: {
            select: {
              id: true,
              commercialOrderLineId: true,
              authorizationStatus: true,
              status: true,
              allocatedQuantity: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  })
  if (!intake?.commercialOrder)
    throw new CatalogError(
      "SERVICE_INTAKE_NOT_FOUND",
      "The confirmed Service intake is unavailable in this Store.",
    )
  const lines = intake.commercialOrder.lines.map((line) => {
    const snapshot = line.snapshot
    if (
      !snapshot ||
      !snapshot.serviceWorkPolicy ||
      !snapshot.serviceAuthorizationPolicy
    )
      throw new CatalogError(
        "INVALID_SERVICE_TRANSITION",
        "Original Service snapshot is unavailable.",
      )
    return {
      orderLineId: line.id,
      offeringId: snapshot.offeringId,
      itemName: snapshot.catalogItemName,
      variantName: snapshot.variantName,
      offeringName: snapshot.offeringName,
      quantity: snapshot.quantity.toString(),
      unitPriceMinor: snapshot.unitPriceMinor,
      totalMinor: snapshot.totalMinor,
      workPolicy: snapshot.serviceWorkPolicy,
      authorizationPolicy: snapshot.serviceAuthorizationPolicy,
    }
  })
  const subtotalMinor = lines.reduce(
    (total, line) => total + line.totalMinor,
    0,
  )
  const totalMinor = subtotalMinor + intake.serviceChargeMinor
  const payment =
    intake.commercialOrder.payments.find(
      (row) =>
        row.clientPaymentId === `${intake.clientIntakeId}:initial-payment`,
    ) ?? null
  return {
    intakeId: intake.id,
    orderId: intake.commercialOrder.id,
    orderNumber: intake.commercialOrder.orderNumber,
    currencyCode: intake.commercialOrder.currencyCode,
    confirmedAt: intake.confirmedAt,
    createdByUserId: intake.createdByUserId,
    customer: {
      name: intake.customerName,
      phone: intake.customerPhone,
      email: intake.customerEmail,
    },
    instructions: intake.instructions,
    conditionNote: intake.conditionNote,
    requestedAt: intake.requestedAt,
    promisedAt: intake.dueCommitmentAt,
    assigneeUserId: intake.requestedAssigneeId,
    serviceLevel: intake.serviceLevel,
    priority: intake.priority,
    lines,
    subtotalMinor,
    serviceChargeMinor: intake.serviceChargeMinor,
    totalMinor,
    initialPaymentMinor: intake.initialPaymentMinor,
    initialPayment: payment,
    initialBalanceMinor: totalMinor - intake.initialPaymentMinor,
    jobs: intake.jobs.map((job) => ({
      ...job,
      lines: job.lines.map((line) => ({
        ...line,
        allocatedQuantity: line.allocatedQuantity.toString(),
      })),
    })),
  }
}
export type ServiceIntakeReceiptRecord = Awaited<
  ReturnType<typeof readServiceIntakeReceiptInTransaction>
>
