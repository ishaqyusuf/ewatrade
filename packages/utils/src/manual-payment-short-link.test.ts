import { expect, test } from "bun:test"
import {
  isManualPaymentShortCode,
  manualPaymentLinkId,
  manualPaymentLinkPath,
  manualPaymentShortCode,
} from "./manual-payment-short-link"

const code = "Ab3x9Kp7Lm2Qv8Ts4Wy6ZA"

test("only the reserved random-handle namespace becomes a public code", () => {
  expect(code).toHaveLength(22)
  expect(manualPaymentLinkId(code)).toBe(`mpl_${code}`)
  expect(manualPaymentShortCode(`mpl_${code}`)).toBe(code)
  for (const id of ["cmvpj1l910005f89kltc59fc2", code, `report_${code}`])
    expect(manualPaymentShortCode(id)).toBeNull()
})

test("short routes accept exactly one URL-safe code and preserve legacy token paths", () => {
  expect(manualPaymentLinkPath(code)).toBe(`/p/${code}`)
  expect(manualPaymentLinkPath("intent.1793123743446.signature")).toBe(
    "/pay/intent.1793123743446.signature",
  )
  for (const invalid of [
    "Ab3x9K",
    `${code}a`,
    `${code}/image`,
    `${code}?x=1`,
    "../private",
  ])
    expect(isManualPaymentShortCode(invalid)).toBe(false)
  expect(manualPaymentLinkId("../private")).toBeNull()
  expect(manualPaymentLinkPath("../private")).toBe("/pay/..%2Fprivate")
})
