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
            treatment: z.string().trim().min(1).max(80).optional(),
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
            quoteRequired: z.boolean().optional(),
            resolution: z
              .enum([
                "missing",
                "ambiguous",
                "unavailable",
                "incomplete_search",
                "price_needed",
              ])
              .optional(),
            issue: z.string().max(300).optional(),
            unitPriceMinor: z
              .number()
              .int()
              .nonnegative()
              .max(100_000_000)
              .optional(),
            totalMinor: z.number().int().nonnegative().safe().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    totalMinor: z.number().int().nonnegative().safe().optional(),
    notes: z.string().max(1000).optional(),
    issues: z.array(z.string().max(300)).max(25).optional(),
    customerIssue: z.string().max(300).optional(),
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
  unitPriceMinor?: number
  requiresQuote?: boolean
  aliases?: string[]
  available?: boolean
}

/** Saved prices win; only truly missing lines use a merchant-stated price. */
export function resolveServiceJobLines(
  request: ServiceJobRequest,
  choices: ServiceJobChoice[],
  complete = true,
) {
  const lines: ServiceJobDraft["lines"] = []
  const questions: string[] = []
  for (const line of request.lines) {
    const treatment =
      line.treatment &&
      serviceNameKey(line.treatment) !== serviceNameKey(line.name)
        ? (Object.entries(serviceTreatmentLabels).find(
            ([key]) => key === line.treatment,
          )?.[1] ?? line.treatment)
        : undefined
    const name = treatment ? `${line.name} · ${treatment}` : line.name
    const wanted = serviceNameKey(name)
    const matches = choices.filter((choice) =>
      [choice.name, ...(choice.aliases ?? [])].some(
        (name) =>
          serviceNameKey(name) === wanted ||
          serviceNameKey(name).endsWith(` ${wanted}`),
      ),
    )
    const base = { name, quantity: line.quantity }
    if (!complete) {
      lines.push({
        ...base,
        resolution: "incomplete_search",
        issue:
          "Catalog search is incomplete. Select the exact saved service in the form.",
      })
      continue
    }
    if (matches.length > 1) {
      const issue = `Which saved ${name} service should I use?`
      questions.push(issue)
      lines.push({ ...base, resolution: "ambiguous", issue })
      continue
    }
    const match = matches[0]
    if (match?.available === false) {
      const issue = `${name} is saved but unavailable in this Store. Check its catalog settings.`
      questions.push(issue)
      lines.push({
        ...base,
        offeringId: match.offeringId,
        resolution: "unavailable",
        issue,
      })
      continue
    }
    if (
      (!match || match.requiresQuote || match.unitPriceMinor === undefined) &&
      line.unitPrice === undefined
    ) {
      const issue = match
        ? `Enter the quote price for ${name} in the form.`
        : `Enter the ${treatment ? `${treatment.toLowerCase()} ` : ""}price per ${line.name.toLowerCase()} in the form.`
      lines.push({
        ...base,
        ...(match ? { offeringId: match.offeringId } : {}),
        resolution: match ? "price_needed" : "missing",
        issue,
      })
      continue
    }
    const minor =
      (match?.requiresQuote ? undefined : match?.unitPriceMinor) ??
      Number(multiplyExactDecimals(line.unitPrice ?? "0", "100"))
    const totalMinor = Number(
      multiplyExactDecimals(line.quantity, String(minor)),
    )
    if (!Number.isSafeInteger(totalMinor)) {
      const issue = `Use a quantity for ${name} that gives an exact currency amount.`
      questions.push(issue)
      lines.push({
        ...base,
        ...(match ? { offeringId: match.offeringId } : {}),
        resolution: "price_needed",
        issue,
      })
      continue
    }
    lines.push({
      name,
      quantity: line.quantity,
      unitPriceMinor: minor,
      totalMinor,
      ...(match ? { offeringId: match.offeringId } : {}),
      ...(match?.requiresQuote ? { quoteRequired: true } : {}),
    })
  }
  return { lines, questions }
}
