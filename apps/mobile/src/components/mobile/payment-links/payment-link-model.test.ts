import { expect, test } from "bun:test"
import {
  isNibssSessionId,
  receivedDecision,
  verifiedPayment,
  whatsAppDraftToNumber,
  whatsAppWithText,
} from "./payment-link-model"

test("a typed Nigerian number opens a draft to its international form", () => {
  expect(whatsAppDraftToNumber("234", "08035550142", "Pay ₦5,000")).toEqual({
    display: "+234 803 555 0142",
    url: "https://wa.me/2348035550142?text=Pay%20%E2%82%A65%2C000",
  })
  expect(whatsAppDraftToNumber("234", "8035550142", "Hi")?.url).toBe(
    "https://wa.me/2348035550142?text=Hi",
  )
})

test("a number from another picked country uses that country's code", () => {
  expect(whatsAppDraftToNumber("44", "07400123456", "Hi")?.url).toBe(
    "https://wa.me/447400123456?text=Hi",
  )
})

test("an invalid or empty number gives no draft", () => {
  expect(whatsAppDraftToNumber("234", "", "Hi")).toBeNull()
  expect(whatsAppDraftToNumber("234", "0803", "Hi")).toBeNull()
  expect(whatsAppDraftToNumber("234", "0803555014299999", "Hi")).toBeNull()
})

test("the saved-phone link keeps only the server's wa.me digits", () => {
  expect(whatsAppWithText("https://wa.me/2348035550142?text=old", "new")).toBe(
    "https://wa.me/2348035550142?text=new",
  )
  expect(whatsAppWithText("https://evil.example/2348035550142", "x")).toBeNull()
  expect(whatsAppWithText(null, "x")).toBeNull()
})

const confirmed = {
  state: "confirmed" as const,
  source: "merchant_bank_check" as const,
  confirmedAt: "2026-10-27T09:42:00.000Z",
  receivedAt: "2026-10-27T09:30:00.000Z",
  receivedAmountMinor: 500_000,
  canonicalPaymentId: "pay_1",
}

test("only a saved bank-check confirmation counts as verified", () => {
  expect(verifiedPayment(confirmed)?.receivedAmountMinor).toBe(500_000)
  expect(verifiedPayment({ ...confirmed, canonicalPaymentId: null })).toBeNull()
  expect(verifiedPayment({ ...confirmed, source: null })).toBeNull()
  expect(
    verifiedPayment({
      state: "unverified",
      source: null,
      confirmedAt: null,
      receivedAt: null,
      receivedAmountMinor: null,
      canonicalPaymentId: null,
    }),
  ).toBeNull()
  expect(verifiedPayment(null)).toBeNull()
})

const decision = {
  reportId: "r1",
  expectedRevision: 2,
  receivedAmountMinor: 500_000,
  moneyAccountId: "acc",
  receivedAt: new Date("2026-10-27T09:30:00.000Z"),
  reference: "  ",
  note: "",
  bankChecked: true,
  nibssSession: false,
}

test("a received decision needs the bank check and attests it", () => {
  expect(receivedDecision({ ...decision, bankChecked: false })).toBeNull()
  const sent = receivedDecision(decision)
  expect(sent?.bankCheckAttested).toBe(true)
  expect(sent?.reference).toBeUndefined()
  expect(sent && "transferReferenceNamespace" in sent).toBe(false)
})

test("the NIBSS namespace is sent only for a marked 30-digit session ID", () => {
  const session = "000015261027093012345678901234"
  expect(isNibssSessionId(` ${session} `)).toBe(true)
  expect(isNibssSessionId("FT2610271234")).toBe(false)
  expect(
    receivedDecision({ ...decision, reference: session, nibssSession: true })
      ?.transferReferenceNamespace,
  ).toBe("nibss_session_id")
  expect(
    receivedDecision({ ...decision, reference: session })
      ?.transferReferenceNamespace,
  ).toBeUndefined()
  expect(
    receivedDecision({ ...decision, reference: "FT123", nibssSession: true })
      ?.transferReferenceNamespace,
  ).toBeUndefined()
})
