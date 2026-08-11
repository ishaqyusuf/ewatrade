import {
  type ServiceCommerceDeliveryCommand,
  type ServiceCommerceFulfillmentActor,
  type ServiceCommerceFulfillmentAdapter,
  type ServiceCommercePickupCommand,
  serviceCommerceDeliveryCommandSchema,
  serviceCommercePickupCommandSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  createPrescriptionDeliveryAssignment,
  handoffPrescriptionPickup,
  markPrescriptionDeliveryReady,
  markPrescriptionPickupReady,
  recordPrescriptionPickupException,
  transitionPrescriptionDelivery,
} from "./prescription-fulfillment"
import {
  ServiceCommerceFulfillmentError,
  getServiceCommerceFulfillmentOrder,
} from "./service-commerce-fulfillment"

function assertPrescriptionSource(
  command: ServiceCommerceDeliveryCommand | ServiceCommercePickupCommand,
) {
  if (command.context.source.kind !== "prescription") {
    throw new ServiceCommerceFulfillmentError(
      "SOURCE_MISMATCH",
      "This fulfilment adapter only accepts Prescription sources.",
    )
  }
}

async function resolvePickupId(
  db: PrismaClient,
  command: ServiceCommercePickupCommand,
) {
  const fulfillment = await db.prescriptionPickupFulfillment.findFirst({
    select: { id: true },
    where: {
      orderId: command.context.orderId,
      storeId: command.context.storeId,
      tenantId: command.context.tenantId,
    },
  })
  if (!fulfillment) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_NOT_FOUND",
      "Pickup was not found.",
    )
  }
  return fulfillment.id
}

async function resolveDeliveryAssignmentId(
  db: PrismaClient,
  command: ServiceCommerceDeliveryCommand,
) {
  const assignment = await db.prescriptionDeliveryAssignment.findFirst({
    select: { id: true },
    where: {
      orderId: command.context.orderId,
      storeId: command.context.storeId,
      tenantId: command.context.tenantId,
    },
  })
  if (!assignment) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_NOT_FOUND",
      "Delivery was not found.",
    )
  }
  return assignment.id
}

async function project(
  db: PrismaClient,
  actor: ServiceCommerceFulfillmentActor,
  command: ServiceCommerceDeliveryCommand | ServiceCommercePickupCommand,
) {
  return getServiceCommerceFulfillmentOrder(db, {
    actorUserId: actor.userId,
    ...command.context,
  })
}

export function createPrescriptionServiceCommerceFulfillmentAdapter(
  db: PrismaClient,
): ServiceCommerceFulfillmentAdapter {
  return {
    async delivery(actor, rawCommand) {
      const command = serviceCommerceDeliveryCommandSchema.parse(rawCommand)
      assertPrescriptionSource(command)
      const input = command.input
      if (input.operation === "prepare") {
        await markPrescriptionDeliveryReady(db, {
          actorUserId: actor.userId,
          checks: input.checks,
          clientOperationId: input.clientOperationId,
          orderId: command.context.orderId,
          source: command.context.source,
          storeId: command.context.storeId,
          tenantId: command.context.tenantId,
        })
      } else if (input.operation === "assign") {
        await createPrescriptionDeliveryAssignment(db, {
          actorUserId: actor.userId,
          clientOperationId: input.clientOperationId,
          courierDisplayName: input.courierDisplayName,
          courierPhoneMasked: input.courierPhoneMasked,
          courierReference: input.courierReference,
          orderId: command.context.orderId,
          source: command.context.source,
          storeId: command.context.storeId,
          tenantId: command.context.tenantId,
        })
      } else {
        await transitionPrescriptionDelivery(db, {
          actorUserId: actor.userId,
          assignmentId: await resolveDeliveryAssignmentId(db, command),
          clientOperationId: input.clientOperationId,
          proofReference: input.proofReference,
          reason: input.reason,
          source: command.context.source,
          status:
            input.status === "returned_to_store"
              ? "returned_to_pharmacy"
              : input.status,
          storeId: command.context.storeId,
          tenantId: command.context.tenantId,
        })
      }
      return project(db, actor, command)
    },

    async pickup(actor, rawCommand) {
      const command = serviceCommercePickupCommandSchema.parse(rawCommand)
      assertPrescriptionSource(command)
      const input = command.input
      const fulfillmentId = await resolvePickupId(db, command)
      if (input.operation === "prepare") {
        await markPrescriptionPickupReady(db, {
          actorUserId: actor.userId,
          checks: input.checks,
          clientOperationId: input.clientOperationId,
          fulfillmentId,
          source: command.context.source,
          storeId: command.context.storeId,
          tenantId: command.context.tenantId,
        })
      } else if (input.operation === "handoff") {
        await handoffPrescriptionPickup(db, {
          actorUserId: actor.userId,
          clientOperationId: input.clientOperationId,
          collectorName: input.collectorName,
          collectorRelationship: input.collectorRelationship,
          fulfillmentId,
          pickupCode: input.handoffCapability,
          source: command.context.source,
          storeId: command.context.storeId,
          tenantId: command.context.tenantId,
        })
      } else {
        await recordPrescriptionPickupException(db, {
          actorUserId: actor.userId,
          clientOperationId: input.clientOperationId,
          exceptionCode: input.exceptionCode,
          fulfillmentId,
          reason: input.reason,
          source: command.context.source,
          status: input.status,
          storeId: command.context.storeId,
          tenantId: command.context.tenantId,
        })
      }
      return project(db, actor, command)
    },
  }
}
