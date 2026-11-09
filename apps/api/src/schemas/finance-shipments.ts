import { z } from "zod"
import { financeBookSchema, financeCommandSchema } from "./finance"
import { inventorySingleBalanceOperationSchema } from "./inventory"

const id = financeBookSchema.shape.bookId
const currencyCode = z.string().regex(/^[A-Z]{3}$/)
// Exact decimals stay strings; the command re-parses them at their own scale.
const decimal = z
  .string()
  .trim()
  .regex(/^\d{1,20}(\.\d{1,18})?$/)
const minorAmount = z.string().regex(/^\d{1,15}$/)
const revision = z.number().int().min(0).max(2_147_483_646)

const shipmentLine = z
  .object({
    description: z.string().trim().min(1).max(200),
    proposedName: z.string().trim().min(1).max(160).optional(),
    balanceSourceId: id.optional(),
    enteredInventoryUnitId: id.optional(),
    expectedQuantity: decimal,
    sourceCurrencyCode: currencyCode,
    sourceUnitPrice: decimal,
    freightOverrideMinor: minorAmount.optional(),
  })
  .strict()

const shipmentDraft = {
  supplierId: id,
  storeId: id,
  name: z.string().trim().min(1).max(160),
  reference: z.string().trim().max(160).optional(),
  expectedAt: z.coerce.date().optional(),
  freightAmount: decimal,
  freightCurrencyCode: currencyCode,
  rates: z
    .array(
      z
        .object({
          currencyCode,
          rate: decimal,
          rateDate: z.coerce.date(),
          source: z.string().trim().min(1).max(160),
        })
        .strict(),
    )
    .max(10),
  lines: z.array(shipmentLine).min(1).max(50),
}

export const financeShipmentCreateSchema = financeCommandSchema
  .extend(shipmentDraft)
  .strict()

const shipmentCommand = financeCommandSchema.extend({
  shipmentId: id,
  expectedRevision: revision,
})

export const financeShipmentUpdateSchema = shipmentCommand
  .extend(shipmentDraft)
  .strict()

export const financeShipmentRevisionSchema = shipmentCommand.strict()

export const financeShipmentMapLineSchema = shipmentCommand
  .extend({ lineId: id, balanceSourceId: id, enteredInventoryUnitId: id })
  .strict()

export const financeShipmentAdjustSchema = shipmentCommand
  .extend({
    lineId: id,
    amountMinor: z.string().regex(/^-?\d{1,15}$/),
    reason: z.string().trim().min(1).max(400),
  })
  .strict()

export const financeShipmentCloseSchema = shipmentCommand
  .extend({ reason: z.string().trim().min(1).max(400) })
  .strict()

export const financeShipmentReceiveSchema = financeCommandSchema
  .extend({
    shipmentId: id,
    receivedAt: z.coerce.date(),
    reference: z.string().trim().max(160).optional(),
    dueAt: z.coerce.date().optional(),
    lines: z
      .array(
        z
          .object({
            lineId: id,
            quantity:
              inventorySingleBalanceOperationSchema.shape.enteredQuantity,
            expectedBalanceRevision: revision,
            expectedConfigurationVersionId: id,
            categories:
              inventorySingleBalanceOperationSchema.shape.categories.unwrap(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueAt && value.dueAt < value.receivedAt)
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "The due date cannot precede the arrival.",
      })
  })

export const financeShipmentDetailSchema = financeBookSchema
  .extend({ shipmentId: id })
  .strict()

export const financeShipmentsSchema = financeBookSchema
  .extend({
    status: z
      .enum([
        "DRAFT",
        "EXPECTED",
        "PARTIALLY_RECEIVED",
        "RECEIVED",
        "CLOSED_SHORT",
        "CANCELLED",
      ])
      .optional(),
    supplierId: id.optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
    // useInfiniteQuery adds the paging direction to the input.
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict()
