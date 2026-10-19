import { CATALOG_FREE_DESCRIPTION_MAX_LENGTH } from "@ewatrade/utils/catalog-free-lines"
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

// The original registration, not a body Tenant/author override, selects recovery.
export const offlineRecoverySchema = offlineReplaySchema.extend({
  storeId: z.string().trim().min(1),
})

export const offlineRecoveryDecisionSchema = z
  .object({
    commandId: z.string().trim().min(1),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(1).max(500),
    envelope: offlineReplaySchema.shape.commands.element,
  })
  .strict()

export const offlineQuickSaleCorrectionSchema = z
  .object({
    deviceId: z.string().trim().min(8).max(160),
    storeId: z.string().trim().min(1),
    envelope: offlineReplaySchema.shape.commands.element,
    replacementClientCommandId: z.string().trim().min(8).max(160),
    replacementClientPaymentId: z.string().trim().min(8).max(160).optional(),
    descriptions: z
      .array(
        z
          .object({
            lineIndex: z.number().int().nonnegative().max(99),
            description: z
              .string()
              .trim()
              .min(1)
              .max(CATALOG_FREE_DESCRIPTION_MAX_LENGTH),
          })
          .strict(),
      )
      .min(1)
      .max(100),
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
