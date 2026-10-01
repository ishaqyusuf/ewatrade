import { expect, test } from "bun:test"
import { shouldWithholdDraftLegalContent } from "./legal-publication-visibility"

test("withholds unapproved legal copy on public Production deployments", () => {
  expect(
    shouldWithholdDraftLegalContent(false, { APP_ENV: "production" }),
  ).toBe(true)
  expect(
    shouldWithholdDraftLegalContent(false, { VERCEL_ENV: "production" }),
  ).toBe(true)
  expect(shouldWithholdDraftLegalContent(true, { APP_ENV: "production" })).toBe(
    false,
  )
  expect(
    shouldWithholdDraftLegalContent(false, {
      APP_ENV: "preview",
      VERCEL_ENV: "preview",
    }),
  ).toBe(false)
})
