import { describe, expect, test } from "bun:test"
import { shouldPreviewEarlyAccess } from "./early-access-preview"
import { getQaWebRequestOrigin } from "./qa-request-origin"

const input = {
  email: "qa+onboarding@ishaq.qa.test",
  requestUrl: "https://ewatrade.localhost/api/early-access",
  env: {
    APP_ENV: "local",
    DEV_PROFILE: "local",
    NODE_ENV: "development",
    EMAIL_QA_DOMAIN_ROUTES: '{"ishaq.qa.test":"tester@example.com"}',
  },
}

describe("local QA early-access email preview", () => {
  test("uses the public Portless origin instead of Next's internal request URL", () => {
    const headers = new Headers({
      host: "localhost:3092",
      "x-forwarded-host": "ewatrade.localhost",
      "x-forwarded-proto": "https",
    })
    const requestUrl = getQaWebRequestOrigin({
      headers,
      nextUrl: { origin: "http://localhost:3092", protocol: "http:" },
    })
    expect(shouldPreviewEarlyAccess({ ...input, requestUrl })).toBe(true)
  })
  test("allows the exact configured QA namespace on the local website", () => {
    expect(shouldPreviewEarlyAccess(input)).toBe(true)
    expect(
      shouldPreviewEarlyAccess({ ...input, email: "QA@ISHAQ.QA.TEST" }),
    ).toBe(true)
  })

  test("never exposes the link in production, preview, or unidentified runtimes", () => {
    for (const env of [
      {},
      { ...input.env, NODE_ENV: "production" },
      { ...input.env, APP_ENV: "production" },
      { ...input.env, DEV_PROFILE: "prod" },
      { ...input.env, APP_ENV: "preview" },
      { ...input.env, DEV_PROFILE: "preview" },
      { ...input.env, VERCEL_ENV: "production" },
      { ...input.env, VERCEL_ENV: "preview" },
    ]) {
      expect(shouldPreviewEarlyAccess({ ...input, env })).toBe(false)
    }
  })

  test("refuses public hosts and malformed request URLs", () => {
    for (const requestUrl of [
      "https://ewatrade.com/api/early-access",
      "https://ewatrade.localhost.example.com/api/early-access",
      "not-a-url",
    ]) {
      expect(shouldPreviewEarlyAccess({ ...input, requestUrl })).toBe(false)
    }
  })

  test("ordinary addresses and unconfigured namespaces keep the delivery flow", () => {
    for (const email of [
      "owner@example.com",
      "owner@test.com",
      "owner@other.qa.test",
      "owner@ishaq.qa.tests",
    ]) {
      expect(shouldPreviewEarlyAccess({ ...input, email })).toBe(false)
    }
  })

  test("missing, malformed or invalid QA routes cannot expose a continuation", () => {
    for (const routes of [
      undefined,
      "",
      "not-json",
      '{"ishaq.qa.test":"bad"}',
    ]) {
      expect(
        shouldPreviewEarlyAccess({
          ...input,
          env: { ...input.env, EMAIL_QA_DOMAIN_ROUTES: routes },
        }),
      ).toBe(false)
    }
  })
})
