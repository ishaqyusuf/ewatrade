import { afterAll, beforeAll, expect, test } from "bun:test"
import { createPaymentLinkToken } from "@ewatrade/payments"
import {
  manualReportIdentity,
  resolveManualLinkIdentity,
} from "./manual-payment-tokens"

const code = "Ab3x9Kp7Lm2Qv8Ts4Wy6ZA"
const now = new Date("2026-10-27T13:00:00Z")
const expiresAt = new Date("2026-10-28T13:00:00Z")
const secret = "manual-short-link-test-key-32-characters"
const previous = process.env.PAYMENT_LINK_SIGNING_KEY
beforeAll(() => {
  process.env.PAYMENT_LINK_SIGNING_KEY = secret
})
afterAll(() => {
  if (previous === undefined)
    Reflect.deleteProperty(process.env, "PAYMENT_LINK_SIGNING_KEY")
  else process.env.PAYMENT_LINK_SIGNING_KEY = previous
})

test("a short code resolves only its exact reserved link and keeps stored expiry", async () => {
  const proof = { linkId: `mpl_${code}`, expiresAt }
  const seen: string[] = []
  expect(
    await resolveManualLinkIdentity(code, {
      now,
      readShortLink: async (value) => {
        seen.push(value)
        return proof
      },
    }),
  ).toEqual(proof)
  expect(seen).toEqual([code])
  await expect(
    resolveManualLinkIdentity(code, {
      now,
      readShortLink: async () => null,
    }),
  ).rejects.toThrow("invalid or expired")
  await expect(
    resolveManualLinkIdentity(code, {
      now,
      readShortLink: async () => ({ ...proof, linkId: "legacy-id" }),
    }),
  ).rejects.toThrow("invalid or expired")
})

test("expired codes remain readable for their expiry screen but cannot prepare a report", async () => {
  const proof = { linkId: `mpl_${code}`, expiresAt: now }
  const readShortLink = async () => proof
  await expect(
    resolveManualLinkIdentity(code, { now, readShortLink }),
  ).rejects.toThrow("invalid or expired")
  expect(
    await resolveManualLinkIdentity(code, {
      now,
      readShortLink,
      allowExpired: true,
    }),
  ).toEqual(proof)
  await expect(
    resolveManualLinkIdentity(code, {
      now: new Date("invalid"),
      readShortLink,
      allowExpired: true,
    }),
  ).rejects.toThrow("invalid or expired")
})

test("legacy signatures stay mandatory and no raw legacy ID triggers a short lookup", async () => {
  let reads = 0
  const readShortLink = async () => {
    reads++
    return null
  }
  const token = createPaymentLinkToken(
    { intentId: "legacy-id", expiresAt },
    secret,
  )
  expect(
    await resolveManualLinkIdentity(token, { now, readShortLink }),
  ).toEqual({ linkId: "legacy-id", expiresAt })
  await expect(
    resolveManualLinkIdentity("legacy-id", { now, readShortLink }),
  ).rejects.toThrow()
  await expect(
    resolveManualLinkIdentity(token.replace("legacy-id", "foreign-id"), {
      now,
      readShortLink,
    }),
  ).rejects.toThrow()
  expect(reads).toBe(0)
})

test("short handles cannot become report-status authority or a different signing purpose", async () => {
  expect(() => manualReportIdentity(code)).toThrow()
  const report = createPaymentLinkToken(
    { intentId: "report-id", expiresAt },
    secret,
    "manual-report",
  )
  await expect(
    resolveManualLinkIdentity(report, {
      now,
      readShortLink: async () => null,
    }),
  ).rejects.toThrow()
})
