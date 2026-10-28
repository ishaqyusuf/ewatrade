import { expect, test } from "bun:test"
import {
  type ManualReceiptAssessmentDependencies,
  runManualReceiptAssessment,
} from "./manual-payment-receipt-assessment"
const payload = { tenantId: "business", assessmentId: "assessment" }
const setup = (
  options: {
    admitted?: boolean
    extractionFails?: boolean
    saveFails?: boolean
  } = {},
) => {
  const effects: string[] = []
  const dependencies: ManualReceiptAssessmentDependencies = {
    claim: async () => ({ leaseToken: "lease" }),
    prepare: async () =>
      options.admitted
        ? {
            pages: [
              {
                bytes: new Uint8Array([1]),
                contentType: "image/png",
                width: 1,
                height: 1,
              },
            ],
            context: {
              claimedAmountMinor: 1,
              currencyCode: "NGN",
              receivingAccountNumber: "0012345678",
              paymentReference: null,
              claimedAt: new Date(),
              oldestAcceptableAt: new Date(),
              latestAcceptableAt: new Date(),
              duplicateCandidate: false,
            },
            extractor: async () => {
              effects.push("provider")
              throw new Error("uncertain provider result")
            },
          }
        : null,
    start: async () => {
      effects.push("start")
      return true
    },
    finish: async () => {
      effects.push("finish")
      return true
    },
    unavailable: async () => {
      effects.push("unavailable")
    },
  }
  return { effects, dependencies }
}
test("unconfigured processor takes durable manual fallback without loading/sending customer bytes", async () => {
  const { dependencies, effects } = setup()
  expect(await runManualReceiptAssessment(payload, dependencies)).toEqual({
    status: "unavailable",
  })
  expect(effects).toEqual(["unavailable"])
})
test("provider failure is persisted unavailable with one dispatch, never retried", async () => {
  const { dependencies, effects } = setup({ admitted: true })
  expect(await runManualReceiptAssessment(payload, dependencies)).toEqual({
    status: "unavailable",
  })
  expect(effects).toEqual(["start", "provider", "unavailable"])
})
test("a lost durable claim never reaches preparation or provider", async () => {
  const { dependencies, effects } = setup({ admitted: true })
  dependencies.claim = async () => null
  expect(await runManualReceiptAssessment(payload, dependencies)).toEqual({
    status: "skipped",
  })
  expect(effects).toEqual([])
})
test("job payload rejects embedded receipts/tokens", async () => {
  const { dependencies } = setup()
  const invalid = { ...payload, receipt: "private" }
  await expect(
    runManualReceiptAssessment(invalid, dependencies),
  ).rejects.toThrow("identity")
})
test("admission/reservation failure never dispatches provider work", async () => {
  const { dependencies, effects } = setup({ admitted: true })
  dependencies.start = async () => {
    throw new Error("scope changed")
  }
  expect(await runManualReceiptAssessment(payload, dependencies)).toEqual({
    status: "unavailable",
  })
  expect(effects).toEqual(["unavailable"])
})
