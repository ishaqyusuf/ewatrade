import { describe, expect, test } from "bun:test"
import { resolveSignupLegalAcceptance } from "./signup-legal"

const approved = {
  approved: true,
  version: "2026-10-01",
  documentHash: "approved-snapshot-digest",
}

describe("web signup legal acceptance", () => {
  test("production signup refuses draft legal publication", () => {
    expect(() =>
      resolveSignupLegalAcceptance(
        {},
        { ...approved, approved: false },
        { NODE_ENV: "production" },
      ),
    ).toThrow("Signup is unavailable")
  })

  test("an unidentified runtime cannot create an account against draft legal text", () => {
    expect(() =>
      resolveSignupLegalAcceptance({}, { ...approved, approved: false }, {}),
    ).toThrow("Signup is unavailable")
  })

  test("draft signup records no acceptance and rejects a submitted claim", () => {
    expect(
      resolveSignupLegalAcceptance({}, { ...approved, approved: false }),
    ).toBeNull()
    expect(() =>
      resolveSignupLegalAcceptance(
        {
          legalVersion: approved.version,
          acceptedTerms: true,
          acknowledgedPrivacyNotice: true,
        },
        { ...approved, approved: false },
      ),
    ).toThrow("Draft legal documents")
  })

  test("approved signup requires both explicit choices and the exact version", () => {
    expect(() => resolveSignupLegalAcceptance({}, approved)).toThrow()
    expect(() =>
      resolveSignupLegalAcceptance(
        {
          legalVersion: "old",
          acceptedTerms: true,
          acknowledgedPrivacyNotice: true,
        },
        approved,
      ),
    ).toThrow()
    expect(() =>
      resolveSignupLegalAcceptance(
        { legalVersion: approved.version, acceptedTerms: true },
        approved,
      ),
    ).toThrow()
    expect(
      resolveSignupLegalAcceptance(
        {
          legalVersion: approved.version,
          acceptedTerms: true,
          acknowledgedPrivacyNotice: true,
        },
        approved,
      ),
    ).toEqual({
      version: approved.version,
      documentHash: approved.documentHash,
    })
  })
})

test("local and built preview signup skip legal checks without inventing acceptance", () => {
  for (const env of [
    { DEV_PROFILE: "local" },
    { APP_ENV: "local" },
    { APP_ENV: "preview", NODE_ENV: "production" },
  ]) {
    expect(resolveSignupLegalAcceptance({}, approved, env)).toBeNull()
    expect(
      resolveSignupLegalAcceptance({}, { ...approved, approved: false }, env),
    ).toBeNull()
  }
  expect(() =>
    resolveSignupLegalAcceptance({}, approved, { APP_ENV: "production" }),
  ).toThrow("must be reviewed")
  expect(() =>
    resolveSignupLegalAcceptance({}, approved, {
      APP_ENV: "preview",
      DEV_PROFILE: "prod",
    }),
  ).toThrow("must be reviewed")
})
