import { expect, test } from "bun:test"
import {
  generalBudgetLimits,
  generalBudgetLimitsWithCredit,
  generalBudgetScopeKey,
  generalTokenAllowanceKey,
} from "./general-allowance"

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

const scope = { tenantId: "business-a" }
const now = new Date("2026-10-21T17:30:00.000Z")
const credit = {
  scopeKey: generalBudgetScopeKey(scope, now),
  tokenLimit: 2_000_000,
  expiresAt: "2026-10-21T19:30:00.000Z",
}
const hosted = generalBudgetLimits({ APP_ENV: "production" })

test("temporary token credit uses the exact server-derived monthly configuration key", () => {
  expect(generalTokenAllowanceKey(credit.scopeKey)).toBe(
    "assistant.allowance:assistant:business-a:GENERAL:2026-10",
  )
  expect(generalBudgetLimitsWithCredit(credit, scope, now, hosted)).toEqual({
    ...hosted,
    maxTokens: 2_000_000,
  })
  expect(hosted.maxRequests).toBe(100)
  expect(hosted.maxTokens).toBe(600_000)
  expect(credit.tokenLimit).toBe(2_000_000)
})

test("expired, foreign or previous-month token credits fall back to normal limits", () => {
  for (const value of [
    { ...credit, expiresAt: now.toISOString() },
    { ...credit, expiresAt: "2026-10-20T19:30:00.000Z" },
    { ...credit, scopeKey: "assistant:business-b:GENERAL:2026-10" },
    { ...credit, scopeKey: "assistant:business-a:GENERAL:2026-09" },
    { ...credit, scopeKey: "assistant:business-a:SETUP:2026-10" },
  ])
    expect(generalBudgetLimitsWithCredit(value, scope, now, hosted)).toEqual(
      hosted,
    )
  expect(
    generalBudgetLimitsWithCredit(
      credit,
      scope,
      new Date("2026-11-01T00:00:00.000Z"),
      hosted,
    ),
  ).toEqual(hosted)
})

test("malformed or unbounded credits cannot change token or request limits", () => {
  for (const value of [
    null,
    undefined,
    {},
    { ...credit, tokenLimit: 5_000_001 },
    { ...credit, tokenLimit: 0 },
    { ...credit, tokenLimit: -1 },
    { ...credit, tokenLimit: 1.5 },
    { ...credit, tokenLimit: Number.POSITIVE_INFINITY },
    { ...credit, tokenLimit: "2000000" },
    { ...credit, expiresAt: "invalid" },
    { ...credit, maxRequests: 999999 },
  ])
    expect(generalBudgetLimitsWithCredit(value, scope, now, hosted)).toEqual(
      hosted,
    )
})

test("credits never lower existing hosted or local token ceilings", () => {
  expect(
    generalBudgetLimitsWithCredit(
      { ...credit, tokenLimit: 500_000 },
      scope,
      now,
      hosted,
    ),
  ).toEqual(hosted)
  const local = generalBudgetLimits({ APP_ENV: "local" })
  expect(generalBudgetLimitsWithCredit(credit, scope, now, local)).toEqual(
    local,
  )
  expect(
    generalBudgetLimitsWithCredit(
      { ...credit, tokenLimit: 5_000_000 },
      scope,
      now,
      hosted,
    ),
  ).toEqual({ ...hosted, maxTokens: 5_000_000 })
})
