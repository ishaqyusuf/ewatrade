import { z } from "zod"

import { serviceCommerceSourceRefSchema } from "./source"

export const SERVICE_COMMERCE_FULFILLMENT_OPTIONS = [
  "none",
  "service",
  "pickup",
  "delivery",
] as const

export const serviceCommerceFulfillmentOptionSchema = z.enum(
  SERVICE_COMMERCE_FULFILLMENT_OPTIONS,
)

export type ServiceCommerceFulfillmentOption = z.infer<
  typeof serviceCommerceFulfillmentOptionSchema
>

export const SERVICE_COMMERCE_PICKUP_STATUSES = [
  "preparing",
  "ready",
  "exception",
  "handed_off",
  "abandoned",
  "cancelled",
] as const

export const SERVICE_COMMERCE_PICKUP_EXCEPTION_CODES = [
  "abandoned",
  "cancelled",
  "damaged_item",
  "incorrect_collector",
  "missing_item",
] as const

export const SERVICE_COMMERCE_DELIVERY_STATUSES = [
  "ready_for_assignment",
  "assigned",
  "collected",
  "in_transit",
  "failed",
  "rescheduled",
  "returned_to_store",
  "delivered",
  "cancelled",
] as const

export const SERVICE_COMMERCE_FULFILLMENT_ORDER_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "fulfilling",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
  "refunded",
] as const

export const serviceCommercePickupStatusSchema = z.enum(
  SERVICE_COMMERCE_PICKUP_STATUSES,
)
export const serviceCommercePickupExceptionCodeSchema = z.enum(
  SERVICE_COMMERCE_PICKUP_EXCEPTION_CODES,
)
export const serviceCommerceDeliveryStatusSchema = z.enum(
  SERVICE_COMMERCE_DELIVERY_STATUSES,
)

export const serviceCommerceFulfillmentContextSchema = z
  .object({
    orderId: z.string().trim().min(1).max(191),
    source: serviceCommerceSourceRefSchema,
    storeId: z.string().trim().min(1).max(191),
    tenantId: z.string().trim().min(1).max(191),
  })
  .strict()

const commandIdSchema = z.string().trim().min(1).max(191)
const reasonSchema = z.string().trim().min(1).max(500)

export const serviceCommercePickupOperationSchema = z.discriminatedUnion(
  "operation",
  [
    z
      .object({
        checks: z
          .record(z.string().trim().min(1).max(80), z.literal(true))
          .refine((value) => Object.keys(value).length > 0, {
            message: "At least one completed preparation check is required.",
          }),
        clientOperationId: commandIdSchema,
        operation: z.literal("prepare"),
      })
      .strict(),
    z
      .object({
        clientOperationId: commandIdSchema,
        collectorName: z.string().trim().min(1).max(191),
        collectorRelationship: z.string().trim().min(1).max(191).optional(),
        handoffCapability: z.string().trim().min(1).max(500),
        operation: z.literal("handoff"),
      })
      .strict(),
    z
      .object({
        clientOperationId: commandIdSchema,
        exceptionCode: serviceCommercePickupExceptionCodeSchema,
        operation: z.literal("record_exception"),
        reason: reasonSchema,
        status: z.enum(["abandoned", "cancelled", "exception"]),
      })
      .strict(),
  ],
)

export const serviceCommerceDeliveryOperationSchema = z.discriminatedUnion(
  "operation",
  [
    z
      .object({
        checks: z
          .record(z.string().trim().min(1).max(80), z.literal(true))
          .refine((value) => Object.keys(value).length > 0, {
            message: "At least one completed preparation check is required.",
          }),
        clientOperationId: commandIdSchema,
        operation: z.literal("prepare"),
      })
      .strict(),
    z
      .object({
        clientOperationId: commandIdSchema,
        courierDisplayName: z.string().trim().min(1).max(191),
        courierPhoneMasked: z.string().trim().min(1).max(80).optional(),
        courierReference: z.string().trim().min(1).max(191),
        operation: z.literal("assign"),
      })
      .strict(),
    z
      .object({
        clientOperationId: commandIdSchema,
        operation: z.literal("transition"),
        proofReference: z.string().trim().min(1).max(500).optional(),
        reason: reasonSchema.optional(),
        status: z.enum([
          "cancelled",
          "collected",
          "delivered",
          "failed",
          "in_transit",
          "rescheduled",
          "returned_to_store",
        ]),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.status === "delivered" && !value.proofReference) {
          context.addIssue({
            code: "custom",
            message: "Delivery proof is required before completion.",
            path: ["proofReference"],
          })
        }
        if (
          ["failed", "rescheduled", "returned_to_store"].includes(
            value.status,
          ) &&
          !value.reason
        ) {
          context.addIssue({
            code: "custom",
            message: "A structured reason is required for this outcome.",
            path: ["reason"],
          })
        }
      }),
  ],
)

export const serviceCommercePickupCommandSchema = z
  .object({
    context: serviceCommerceFulfillmentContextSchema,
    input: serviceCommercePickupOperationSchema,
  })
  .strict()

export const serviceCommerceDeliveryCommandSchema = z
  .object({
    context: serviceCommerceFulfillmentContextSchema,
    input: serviceCommerceDeliveryOperationSchema,
  })
  .strict()

const serviceCommercePickupEventProjectionSchema = z
  .object({
    effectiveAt: z.date(),
    kind: z.literal("pickup"),
    reasonCode: z.string().trim().min(1).max(80).nullable(),
    status: serviceCommercePickupStatusSchema,
  })
  .strict()

const serviceCommerceDeliveryEventProjectionSchema = z
  .object({
    effectiveAt: z.date(),
    kind: z.literal("delivery"),
    reasonCode: z.string().trim().min(1).max(80).nullable(),
    status: serviceCommerceDeliveryStatusSchema,
  })
  .strict()

export const serviceCommerceFulfillmentEventProjectionSchema =
  z.discriminatedUnion("kind", [
    serviceCommercePickupEventProjectionSchema,
    serviceCommerceDeliveryEventProjectionSchema,
  ])

export const serviceCommerceFulfillmentOperationalStateSchema =
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("pickup"),
        latestEvent: serviceCommercePickupEventProjectionSchema.nullable(),
        nextOperations: z.array(
          z.enum(["prepare", "handoff", "record_exception"]),
        ),
        preparedAt: z.date().nullable(),
        proofPresent: z.literal(false),
        revision: z.number().int().nonnegative(),
        status: serviceCommercePickupStatusSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("delivery"),
        latestEvent: serviceCommerceDeliveryEventProjectionSchema.nullable(),
        nextOperations: z.array(z.enum(["prepare", "assign", "transition"])),
        preparedAt: z.date().nullable(),
        proofPresent: z.boolean(),
        revision: z.number().int().nonnegative().nullable(),
        status: serviceCommerceDeliveryStatusSchema.nullable(),
      })
      .strict(),
  ])

export const serviceCommerceFulfillmentProjectionSchema = z
  .object({
    currencyCode: z.string().trim().length(3),
    fulfilmentPromise: z.string().nullable(),
    fulfilmentType: z.enum(["delivery", "pickup", "unspecified"]),
    orderId: z.string().trim().min(1).max(191),
    orderStatus: z.enum(SERVICE_COMMERCE_FULFILLMENT_ORDER_STATUSES),
    operationalState:
      serviceCommerceFulfillmentOperationalStateSchema.nullable(),
    paid: z.boolean(),
    quoteVersionId: z.string().trim().min(1).max(191),
    source: serviceCommerceSourceRefSchema,
    totalMinor: z.number().int().nonnegative(),
  })
  .strict()

export const serviceCommerceDeliveryZoneRuleSchema = z
  .object({
    currencyCode: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    feePolicy: z.enum(["fixed", "manual"]),
    fixedFeeMinor: z.number().int().nonnegative().nullable().optional(),
    id: z.string().trim().min(1).max(191),
    matchType: z.enum(["locality", "postal_prefix"]),
    matchValues: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
    priority: z.number().int(),
    promiseText: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.feePolicy === "fixed" && value.fixedFeeMinor == null) {
      context.addIssue({
        code: "custom",
        message: "Fixed delivery zones require a fee.",
        path: ["fixedFeeMinor"],
      })
    }
    if (value.feePolicy === "manual" && value.fixedFeeMinor != null) {
      context.addIssue({
        code: "custom",
        message: "Manual delivery zones cannot persist a fixed fee.",
        path: ["fixedFeeMinor"],
      })
    }
  })

export type ServiceCommercePickupStatus = z.infer<
  typeof serviceCommercePickupStatusSchema
>
export type ServiceCommercePickupExceptionCode = z.infer<
  typeof serviceCommercePickupExceptionCodeSchema
>
export type ServiceCommerceDeliveryStatus = z.infer<
  typeof serviceCommerceDeliveryStatusSchema
>
export type ServiceCommerceFulfillmentContext = z.infer<
  typeof serviceCommerceFulfillmentContextSchema
>
export type ServiceCommercePickupCommand = z.infer<
  typeof serviceCommercePickupCommandSchema
>
export type ServiceCommerceDeliveryCommand = z.infer<
  typeof serviceCommerceDeliveryCommandSchema
>
export type ServiceCommerceFulfillmentProjection = z.infer<
  typeof serviceCommerceFulfillmentProjectionSchema
>
export type ServiceCommerceDeliveryZoneRule = z.infer<
  typeof serviceCommerceDeliveryZoneRuleSchema
>
