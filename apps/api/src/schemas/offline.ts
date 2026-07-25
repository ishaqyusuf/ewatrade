import { z } from "zod"

import {
  commercialOrderCreateSchema,
  commercialOrderPaymentSchema,
} from "./orders"

const offlineInitialPaymentSchema = commercialOrderPaymentSchema.omit({
  orderId: true,
  type: true,
})

const commercialOrderPayloadSchema = commercialOrderCreateSchema
  .omit({ clientOrderId: true, schemaVersion: true, storeId: true })
  .extend({
    initialPayment: offlineInitialPaymentSchema.optional(),
    kind: z.literal("commercial_order"),
  })
  .strict()

export const offlineCommandPayloadSchema = commercialOrderPayloadSchema

export const offlineSettingsUpdateSchema = z
  .object({
    approvalRequired: z.boolean(),
    enabled: z.boolean(),
  })
  .strict()

export const offlineReplaySchema = z
  .object({
    commands: z
      .array(
        z
          .object({
            clientCommandId: z.string().trim().min(8).max(160),
            createdAtClient: z.coerce.date(),
            dependencyClientIds: z
              .array(z.string().trim().min(8).max(160))
              .max(100)
              .default([]),
            eventVersion: z.number().int().positive(),
            payload: offlineCommandPayloadSchema,
          })
          .strict(),
      )
      .min(1)
      .max(250),
    deviceId: z.string().trim().min(8).max(160),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const offlineRegisterDeviceSchema = z
  .object({
    appVersion: z.string().trim().max(40).optional(),
    deviceId: z.string().trim().min(8).max(160),
    deviceName: z.string().trim().max(120).optional(),
    platform: z.enum(["android", "ios", "unknown", "web"]),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const offlineListConflictsSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()

export const offlineReviewConflictSchema = z
  .object({
    commandId: z.string().trim().min(1),
    decision: z.enum(["approve", "discard", "reject", "retry"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
