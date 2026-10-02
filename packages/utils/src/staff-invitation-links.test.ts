import { expect, test } from "bun:test"
import {
  buildStaffInvitationLinks,
  isQaStaffInvitation,
} from "./staff-invitation-links"

test("staff invitation targets the configured Portless app and encodes its token", () => {
  const links = buildStaffInvitationLinks(
    { DASHBOARD_URL: "https://ewatrade-dashboard.localhost" },
    "qa+/ token?",
  )
  const invite = new URL(links.inviteUrl)
  expect(links.appUrl).toBe("https://ewatrade-dashboard.localhost/")
  expect(invite.origin).toBe("https://ewatrade-dashboard.localhost")
  expect(invite.pathname).toBe("/staff-onboarding")
  expect(invite.searchParams.get("inviteToken")).toBe("qa+/ token?")
})

test("preview and production use their explicit app origin without stale path/query", () => {
  for (const origin of [
    "https://dashboard-preview.example.test",
    "https://dashboard.example.test",
  ]) {
    const invite = new URL(
      buildStaffInvitationLinks(
        { DASHBOARD_URL: `${origin}/old?old=1#old` },
        "fixture",
      ).inviteUrl,
    )
    expect(invite.origin).toBe(origin)
    expect(invite.pathname).toBe("/staff-onboarding")
    expect(invite.search).toBe("?inviteToken=fixture")
    expect(invite.hash).toBe("")
  }
})

test("public dashboard setting supports callers without server setting and no-token link stays unchanged", () => {
  const links = buildStaffInvitationLinks(
    { NEXT_PUBLIC_DASHBOARD_URL: "https://app.example.test/download" },
    null,
  )
  expect(links.inviteUrl).toBe(links.appUrl)
  expect(links.appUrl).toBe("https://app.example.test/download")
  expect(() =>
    buildStaffInvitationLinks({ DASHBOARD_URL: "not a URL" }, "fixture"),
  ).toThrow()
})

test("QA staff shortcut requires nonproduction profile and configured reserved domain; preview opts in", () => {
  const env = {
    APP_ENV: "local",
    QA_ACCELERATOR_ENABLED: "true",
    EMAIL_QA_DOMAIN_ROUTES: JSON.stringify({
      "ishaq.qa.test": "tester@example.com",
    }),
  }
  expect(isQaStaffInvitation("staff@ishaq.qa.test", env)).toBe(true)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      QA_ACCELERATOR_ENABLED: undefined,
    }),
  ).toBe(true)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      APP_ENV: "preview",
      QA_ACCELERATOR_ENABLED: undefined,
    }),
  ).toBe(false)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      APP_ENV: "unknown",
      QA_ACCELERATOR_ENABLED: undefined,
    }),
  ).toBe(false)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      APP_ENV: "preview",
      NODE_ENV: "production",
    }),
  ).toBe(true)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      APP_ENV: "production",
    }),
  ).toBe(false)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", { ...env, DEV_PROFILE: "prod" }),
  ).toBe(false)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      QA_ACCELERATOR_ENABLED: "false",
    }),
  ).toBe(false)
  expect(isQaStaffInvitation("staff@unknown.test", env)).toBe(false)
  expect(isQaStaffInvitation("real@example.com", env)).toBe(false)
  expect(
    isQaStaffInvitation("staff@ishaq.qa.test", {
      ...env,
      EMAIL_QA_DOMAIN_ROUTES: "invalid",
    }),
  ).toBe(false)
})
