import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { readRecordOriginSchema } from "./read-record-target"

const quantity = z
  .string()
  .trim()
  .max(40)
  .refine((value) => {
    try {
      parseExactDecimal(value, { allowZero: false, maxScale: 6 })
      return true
    } catch {
      return false
    }
  }, "Enter a positive quantity")
export const serviceJobRequestSchema = z
  .object({
    customerName: z.string().trim().min(1).max(160).optional(),
    lines: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            treatment: z.enum(["wash_and_iron", "iron_only", "wash_only"]),
            quantity,
            /** Stated price for a missing service only, in major currency units. */
            unitPrice: z
              .string()
              .regex(/^\d{1,6}(\.\d{1,2})?$/)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    notes: z.string().trim().max(1000).optional(),
    assumptions: z.array(z.string().trim().min(1).max(200)).max(3).optional(),
  })
  .strict()
export type ServiceJobRequest = z.infer<typeof serviceJobRequestSchema>

export const serviceJobCreatedSchema = z
  .object({
    intakeId: z.string().min(1),
    jobId: z.string().min(1).nullable(),
    orderId: z.string().min(1),
    orderNumber: z.string().min(1).max(160),
    currencyCode: z.string().length(3),
    totalMinor: z.number().int().nonnegative().safe(),
    customerName: z.string().max(160).nullable(),
    createdAt: z.string().datetime(),
    lines: z
      .array(
        z
          .object({
            name: z.string().min(1).max(300),
            offeringId: z.string().min(1),
            quantity,
            unitPriceMinor: z.number().int().nonnegative().safe(),
            totalMinor: z.number().int().nonnegative().safe(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
export type ServiceJobCreated = z.infer<typeof serviceJobCreatedSchema>

export const serviceJobDraftSchema = z
  .object({
    origin: readRecordOriginSchema,
    sourceAnswerId: z.string().min(1).max(160).optional(),
    sourceMessageId: z.string().min(1).max(160).optional(),
    created: serviceJobCreatedSchema.optional(),
    currencyCode: z.string().length(3),
    customer: z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().max(160),
        phone: z.string().nullable(),
        email: z.string().nullable(),
      })
      .strict()
      .optional(),
    lines: z
      .array(
        z
          .object({
            name: z.string().min(1).max(160),
            offeringId: z.string().min(1).optional(),
            quantity,
            unitPriceMinor: z.number().int().nonnegative().max(100_000_000),
            totalMinor: z.number().int().nonnegative().safe(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    totalMinor: z.number().int().nonnegative().safe(),
    notes: z.string().max(1000).optional(),
    assumptions: z.array(z.string().max(200)).max(3),
  })
  .strict()
export type ServiceJobDraft = z.infer<typeof serviceJobDraftSchema>

export const serviceTreatmentLabels = {
  wash_and_iron: "Wash & iron",
  iron_only: "Iron only",
  wash_only: "Wash only",
} as const
export function serviceNameKey(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/s$/, ""))
    .join(" ")
}
export type ServiceJobChoice = {
  offeringId: string
  name: string
  unitPriceMinor: number
  available?: boolean
}

/** Saved prices win; only truly missing lines use a merchant-stated price. */
export function resolveServiceJobLines(
  request: ServiceJobRequest,
  choices: ServiceJobChoice[],
) {
  const lines: ServiceJobDraft["lines"] = []
  const questions: string[] = []
  for (const line of request.lines) {
    const name = `${line.name} · ${serviceTreatmentLabels[line.treatment]}`
    const wanted = serviceNameKey(name)
    const matches = choices.filter(
      (choice) =>
        serviceNameKey(choice.name) === wanted ||
        serviceNameKey(choice.name).endsWith(` ${wanted}`),
    )
    if (matches.length > 1) {
      questions.push(`Which saved ${name} service should I use?`)
      continue
    }
    const match = matches[0]
    if (match?.available === false) {
      questions.push(
        `${name} is saved but unavailable at a fixed price in this Store. Check its catalog settings.`,
      )
      continue
    }
    if (!match && line.unitPrice === undefined) {
      questions.push(
        `What is the price per ${line.name.toLowerCase()} for ${serviceTreatmentLabels[line.treatment].toLowerCase()}?`,
      )
      continue
    }
    const minor =
      match?.unitPriceMinor ??
      Number(multiplyExactDecimals(line.unitPrice ?? "0", "100"))
    const totalMinor = Number(
      multiplyExactDecimals(line.quantity, String(minor)),
    )
    if (!Number.isSafeInteger(totalMinor)) {
      questions.push(
        `Use a quantity for ${name} that gives an exact currency amount.`,
      )
      continue
    }
    lines.push({
      name,
      quantity: line.quantity,
      unitPriceMinor: minor,
      totalMinor,
      ...(match ? { offeringId: match.offeringId } : {}),
    })
  }
  return { lines, questions }
}
