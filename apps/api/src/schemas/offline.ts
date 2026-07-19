import { z } from "zod"

import { catalogCreateSimpleProductSchema } from "./catalog"
import {
  inventoryCreateCloseoutSchema,
  inventoryCreateStockCountSchema,
  inventoryMoveCustodySchema,
  inventorySingleBalanceOperationSchema,
} from "./inventory"
import { commercialOrderCreateSchema } from "./orders"
import {
  serviceEvidenceCaptureSchema,
  serviceIntakeCreateSchema,
  serviceJobAssignSchema,
  serviceJobLineTransitionSchema,
  serviceJobNoteSchema,
} from "./services"

const productSetupPayloadSchema = catalogCreateSimpleProductSchema
  .omit({ clientOperationId: true, kind: true, storeId: true })
  .extend({ kind: z.literal("product_setup") })
  .strict()

const stockReceiptPayloadSchema = inventorySingleBalanceOperationSchema
  .omit({
    clientOperationId: true,
    direction: true,
    linkedOperationId: true,
    schemaVersion: true,
    source: true,
    storeId: true,
    type: true,
  })
  .extend({ kind: z.literal("stock_receipt") })
  .strict()

const stockCountPayloadSchema = inventoryCreateStockCountSchema
  .omit({
    actorNote: true,
    clientOperationId: true,
    schemaVersion: true,
    storeId: true,
  })
  .extend({
    kind: z.literal("stock_count"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

const commercialOrderPayloadSchema = commercialOrderCreateSchema
  .omit({ clientOrderId: true, schemaVersion: true, storeId: true })
  .extend({ kind: z.literal("commercial_order") })
  .strict()

const custodyMovePayloadSchema = inventoryMoveCustodySchema
  .omit({
    clientOperationId: true,
    schemaVersion: true,
    source: true,
  })
  .extend({ kind: z.literal("custody_move") })
  .strict()

const inventoryCloseoutPayloadSchema = inventoryCreateCloseoutSchema
  .omit({ clientOperationId: true, schemaVersion: true, storeId: true })
  .extend({
    kind: z.literal("inventory_closeout"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

const serviceIntakePayloadSchema = serviceIntakeCreateSchema
  .omit({ clientIntakeId: true, schemaVersion: true, storeId: true })
  .extend({ kind: z.literal("service_intake") })
  .strict()

const serviceTransitionPayloadSchema = serviceJobLineTransitionSchema
  .omit({ clientCommandId: true, schemaVersion: true, source: true })
  .extend({ kind: z.literal("service_transition") })
  .strict()

const serviceNotePayloadSchema = serviceJobNoteSchema
  .omit({ clientCommandId: true })
  .extend({ kind: z.literal("service_note") })
  .strict()

const serviceSelfAssignmentPayloadSchema = serviceJobAssignSchema
  .omit({ assigneeUserId: true })
  .extend({ kind: z.literal("service_self_assignment") })
  .strict()

const serviceEvidenceCapturePayloadSchema = serviceEvidenceCaptureSchema
  .omit({ jobId: true })
  .extend({
    intakeClientId: z.string().trim().min(8).max(160).optional(),
    jobId: z.string().trim().min(1).optional(),
    kind: z.literal("service_evidence_capture"),
  })
  .strict()

export const offlineCommandPayloadSchema = z.discriminatedUnion("kind", [
  productSetupPayloadSchema,
  stockReceiptPayloadSchema,
  stockCountPayloadSchema,
  commercialOrderPayloadSchema,
  custodyMovePayloadSchema,
  inventoryCloseoutPayloadSchema,
  serviceIntakePayloadSchema,
  serviceTransitionPayloadSchema,
  serviceNotePayloadSchema,
  serviceSelfAssignmentPayloadSchema,
  serviceEvidenceCapturePayloadSchema,
])

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
    decision: z.enum(["discard", "retry"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
