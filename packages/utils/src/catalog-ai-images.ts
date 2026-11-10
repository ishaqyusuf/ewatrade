import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const micros = z.number().int().min(0).max(1_000_000_000)
export const catalogAiAllowanceSchema = z
  .object({
    period: z.enum(["lifetime", "monthly"]),
    images: z.number().int().min(0).max(1_000_000),
  })
  .strict()
export const catalogAiPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().min(0),
    generation: z
      .object({
        enabled: z.boolean(),
        paused: z.boolean(),
        allowance: catalogAiAllowanceSchema,
        outputCounts: z.tuple([z.literal(1)]),
        model: z.enum([
          "gpt-image-2.6-flare",
          "gpt-image-2.6-sunburst",
          "gpt-image-1.5",
        ]),
        quality: z.enum(["low", "medium", "high"]),
        concurrency: z.number().int().min(1).max(4),
        dailyCapMicros: micros,
        maxRequestMicros: micros.refine((value) => value > 0),
        roles: z
          .array(z.enum(["OWNER", "ADMIN", "MANAGER"]))
          .min(1)
          .max(3),
      })
      .strict(),
    businessOverrides: z
      .array(
        z
          .object({
            tenantId: id,
            enabled: z.boolean().nullable(),
            allowance: catalogAiAllowanceSchema.nullable(),
          })
          .strict(),
      )
      .max(1000),
    customerPriceCatalog: z
      .object({
        revision: z.number().int().min(0),
        entries: z
          .array(
            z
              .object({
                id,
                currency: z.string().regex(/^[A-Z]{3}$/),
                amountMinor: z.number().int().min(0).max(1_000_000_000),
                deliveredImages: z.number().int().min(1).max(1_000_000),
                effectiveAt: z.string().datetime(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    providerTokenRates: z
      .object({
        revision: z.number().int().min(0),
        entries: z
          .array(
            z
              .object({
                id,
                provider: z.literal("openai"),
                model: id,
                currency: z.literal("USD"),
                tokenClass: z.enum([
                  "text_input",
                  "image_input",
                  "cached_input",
                  "image_output",
                ]),
                amountMicrosPerMillionTokens: micros,
                effectiveAt: z.string().datetime(),
                provenance: z.string().trim().min(1).max(500),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    balanceSnapshot: z
      .object({
        accountId: id,
        currency: z.literal("USD"),
        amountMicros: micros,
        observedAt: z.string().datetime(),
        provenance: z.string().trim().min(1).max(500),
      })
      .strict()
      .nullable(),
    whatsapp: z
      .object({
        source: z.literal("existing_outbound_policy"),
        monthlyMessages: z.number().int().min(0).max(1_000_000).default(1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (
      new Set(policy.businessOverrides.map((entry) => entry.tenantId)).size !==
      policy.businessOverrides.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate business override",
        path: ["businessOverrides"],
      })
    for (const key of ["customerPriceCatalog", "providerTokenRates"] as const)
      if (
        new Set(policy[key].entries.map((entry) => entry.id)).size !==
        policy[key].entries.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Duplicate price identity",
          path: [key],
        })
  })
export type CatalogAiPolicy = z.infer<typeof catalogAiPolicySchema>
export const catalogAiPolicyWriteSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().min(0),
    reason: z.string().trim().min(5).max(500),
    policy: catalogAiPolicySchema,
  })
  .strict()
export type CatalogAiPolicyWrite = z.infer<typeof catalogAiPolicyWriteSchema>

export function emptyCatalogAiPolicy(): CatalogAiPolicy {
  return {
    schemaVersion: 1,
    revision: 0,
    generation: {
      enabled: false,
      paused: false,
      allowance: { period: "lifetime", images: 30 },
      outputCounts: [1],
      model: "gpt-image-2.6-flare",
      quality: "medium",
      concurrency: 1,
      dailyCapMicros: 10_000_000,
      maxRequestMicros: 1_000_000,
      roles: ["OWNER"],
    },
    businessOverrides: [],
    customerPriceCatalog: { revision: 0, entries: [] },
    providerTokenRates: { revision: 0, entries: [] },
    balanceSnapshot: null,
    whatsapp: { source: "existing_outbound_policy", monthlyMessages: 1000 },
  }
}

export function catalogAiEffectivePolicy(
  policy: CatalogAiPolicy,
  tenantId: string,
) {
  const override = policy.businessOverrides.find(
    (entry) => entry.tenantId === tenantId,
  )
  return {
    ...policy.generation,
    enabled:
      policy.generation.enabled &&
      !policy.generation.paused &&
      override?.enabled !== false,
    allowance: override?.allowance ?? policy.generation.allowance,
  }
}
export function catalogAiPeriodStart(
  period: "lifetime" | "monthly",
  now = new Date(),
) {
  return period === "lifetime"
    ? new Date(0)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
export function catalogAiAllowanceLabel(
  remaining: number,
  period: "lifetime" | "monthly",
) {
  return `${remaining} generation${remaining === 1 ? "" : "s"} left${period === "monthly" ? " this month" : ""}`
}
export type CatalogAiTokenUsage = {
  textInput: number
  imageInput: number
  output: number
}
export function catalogAiCostMicros(
  policy: CatalogAiPolicy,
  model: string,
  usage: CatalogAiTokenUsage,
  at: Date,
) {
  let total = 0n
  for (const [tokenClass, count] of [
    ["text_input", usage.textInput],
    ["image_input", usage.imageInput],
    ["image_output", usage.output],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 0) return null
    const rate = policy.providerTokenRates.entries
      .filter(
        (entry) =>
          entry.model === model &&
          entry.tokenClass === tokenClass &&
          new Date(entry.effectiveAt) <= at,
      )
      .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]
    if (!rate) return null
    total +=
      (BigInt(count) * BigInt(rate.amountMicrosPerMillionTokens) + 999_999n) /
      1_000_000n
  }
  return total <= 1_000_000_000n ? Number(total) : null
}

export const catalogAiFactsSchema = z
  .object({
    kind: z.enum(["PRODUCT", "SERVICE"]),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).default(""),
    category: z.string().trim().max(200).default(""),
  })
  .strict()
export type CatalogAiFacts = z.infer<typeof catalogAiFactsSchema>
