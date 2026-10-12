import { expect, test } from "bun:test"
import { generalBudgetLimits } from "./general-allowance"

test("hosted environments keep the monthly spend guard", () => {
  for (const APP_ENV of ["production", "preview", undefined])
    expect(generalBudgetLimits({ APP_ENV })).toMatchObject({
      maxRequests: 100,
      maxTokens: 600_000,
    })
  // Local overrides never apply outside local dev.
  expect(
    generalBudgetLimits({
      APP_ENV: "production",
      ASSISTANT_LOCAL_MAX_REQUESTS: "999999",
    }).maxRequests,
  ).toBe(100)
})

test("local dev gets a higher ceiling that env can tune", () => {
  expect(generalBudgetLimits({ APP_ENV: "local" })).toMatchObject({
    maxRequests: 2_000,
    maxTokens: 20_000_000,
  })
  expect(
    generalBudgetLimits({
      APP_ENV: "local",
      ASSISTANT_LOCAL_MAX_REQUESTS: "50",
      ASSISTANT_LOCAL_MAX_TOKENS: "not a number",
    }),
  ).toMatchObject({ maxRequests: 50, maxTokens: 20_000_000 })
})
