import { describe, expect, test } from "bun:test"
import { shouldPreviewEarlyAccess } from "./early-access-preview"

const input = {
  email: "qa+onboarding@ishaq.qa.test",
  env: {
    APP_ENV: "local",
    DEV_PROFILE: "local",
    NODE_ENV: "development",
    EMAIL_QA_DOMAIN_ROUTES: '{"ishaq.qa.test":"tester@example.com"}',
  },
}

describe("QA early-access email preview", () => {
  test("allows the exact configured QA namespace, including uppercase", async () => {
    expect(await shouldPreviewEarlyAccess(input)).toBe(true)
    expect(
      await shouldPreviewEarlyAccess({ ...input, email: "QA@ISHAQ.QA.TEST" }),
    ).toBe(true)
  })

  test("configured QA addresses are independent of runtime environment", async () => {
    for (const env of [
      { EMAIL_QA_DOMAIN_ROUTES: input.env.EMAIL_QA_DOMAIN_ROUTES },
      { ...input.env, NODE_ENV: "production" },
      { ...input.env, APP_ENV: "production" },
      { ...input.env, DEV_PROFILE: "prod" },
      { ...input.env, APP_ENV: "preview" },
      { ...input.env, DEV_PROFILE: "preview" },
      { ...input.env, VERCEL_ENV: "production" },
      { ...input.env, VERCEL_ENV: "preview" },
    ]) {
      expect(await shouldPreviewEarlyAccess({ ...input, env })).toBe(true)
    }
  })

  test("ordinary addresses and unconfigured namespaces keep the delivery flow", async () => {
    for (const email of [
      "owner@example.com",
      "owner@test.com",
      "owner@other.qa.test",
      "owner@ishaq.qa.tests",
      "owner@sub.ishaq.qa.test",
      "owner@ishaq.qa.test.example.com",
    ]) {
      expect(await shouldPreviewEarlyAccess({ ...input, email })).toBe(false)
    }
  })

  test("missing, malformed or invalid QA routes cannot expose a continuation", async () => {
    for (const routes of [
      undefined,
      "",
      "not-json",
      '{"ishaq.qa.test":"bad"}',
    ]) {
      expect(
        await shouldPreviewEarlyAccess({
          ...input,
          env: { ...input.env, EMAIL_QA_DOMAIN_ROUTES: routes },
        }),
      ).toBe(false)
    }
  })
})
