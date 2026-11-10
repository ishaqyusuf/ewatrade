import { expect, test } from "bun:test"
import {
  catalogAiAllowanceLabel,
  catalogAiCostMicros,
  catalogAiEffectivePolicy,
  catalogAiPeriodStart,
  catalogAiPolicySchema,
  emptyCatalogAiPolicy,
} from "./catalog-ai-images"

test("global pause cannot be bypassed by a business override; allowance changes do not fabricate usage", () => {
  const policy = emptyCatalogAiPolicy()
  policy.generation.enabled = true
  policy.generation.paused = true
  policy.businessOverrides = [
    {
      tenantId: "one",
      enabled: true,
      allowance: { period: "monthly", images: 12 },
    },
  ]
  expect(catalogAiEffectivePolicy(policy, "one")).toMatchObject({
    enabled: false,
    allowance: { period: "monthly", images: 12 },
  })
  expect(catalogAiEffectivePolicy(policy, "other").allowance).toEqual({
    period: "lifetime",
    images: 30,
  })
})
test("merchant allowance copy hides lifetime and adds this month only for monthly", () => {
  expect(catalogAiAllowanceLabel(30, "lifetime")).toBe("30 generations left")
  expect(catalogAiAllowanceLabel(1, "monthly")).toBe(
    "1 generation left this month",
  )
  expect(catalogAiAllowanceLabel(0, "monthly")).toBe(
    "0 generations left this month",
  )
})
test("monthly windows use UTC calendar boundaries, including year rollover", () => {
  expect(
    catalogAiPeriodStart(
      "monthly",
      new Date("2027-01-01T00:01:00Z"),
    ).toISOString(),
  ).toBe("2027-01-01T00:00:00.000Z")
  expect(catalogAiPeriodStart("lifetime").getTime()).toBe(0)
})
test("a missing rate is unknown cost; latest effective version applies with integer rounding", () => {
  const policy = emptyCatalogAiPolicy()
  const at = new Date("2026-11-10T12:00:00Z")
  expect(
    catalogAiCostMicros(
      policy,
      policy.generation.model,
      { textInput: 1, imageInput: 1, output: 1 },
      at,
    ),
  ).toBeNull()
  for (const [tokenClass, amount] of [
    ["text_input", 5_000_000],
    ["image_input", 8_000_000],
    ["image_output", 30_000_000],
  ] as const)
    policy.providerTokenRates.entries.push({
      id: tokenClass,
      provider: "openai",
      model: policy.generation.model,
      currency: "USD",
      tokenClass,
      amountMicrosPerMillionTokens: amount,
      effectiveAt: "2026-11-01T00:00:00Z",
      provenance: "test only",
    })
  expect(
    catalogAiCostMicros(
      policy,
      policy.generation.model,
      { textInput: 100, imageInput: 200, output: 1000 },
      at,
    ),
  ).toBe(32_100)
  const outputRate = policy.providerTokenRates.entries[2]
  if (!outputRate) throw new Error("Expected fixture output rate")
  policy.providerTokenRates.entries.push({
    ...outputRate,
    id: "future",
    amountMicrosPerMillionTokens: 1,
    effectiveAt: "2026-12-01T00:00:00Z",
  })
  expect(
    catalogAiCostMicros(
      policy,
      policy.generation.model,
      { textInput: 1, imageInput: 0, output: 1 },
      at,
    ),
  ).toBe(35)
  expect(
    catalogAiCostMicros(
      policy,
      policy.generation.model,
      { textInput: -1, imageInput: 0, output: 0 },
      at,
    ),
  ).toBeNull()
})
test("policy refuses multiple outputs, unsafe prices and duplicate override identities", () => {
  const policy = emptyCatalogAiPolicy()
  expect(
    catalogAiPolicySchema.safeParse({
      ...policy,
      generation: { ...policy.generation, outputCounts: [1, 2] },
    }).success,
  ).toBe(false)
  expect(
    catalogAiPolicySchema.safeParse({
      ...policy,
      businessOverrides: [
        { tenantId: "one", enabled: null, allowance: null },
        { tenantId: "one", enabled: false, allowance: null },
      ],
    }).success,
  ).toBe(false)
  expect(
    catalogAiPolicySchema.safeParse({
      ...policy,
      generation: { ...policy.generation, maxRequestMicros: -1 },
    }).success,
  ).toBe(false)
  expect(catalogAiPolicySchema.parse(policy).whatsapp.monthlyMessages).toBe(
    1000,
  )
})
