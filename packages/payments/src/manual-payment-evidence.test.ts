import { expect, test } from "bun:test"
import {
  createManualPaymentReference,
  paymentReferenceMatches,
} from "./manual-payment-reference"
import { manualTransferIdentity } from "./manual-transfer-identity"
import {
  RECEIPT_TEXT_FIELDS,
  type ReceiptCandidateLookup,
  type ReceiptExtraction,
  assessManualPaymentReceipt,
  hasAdvisoryReceiptTransferCandidate,
  parseReceiptExtraction,
  receiptAmountMinor,
} from "./receipt-assessment"
import { createReceiptExtractor } from "./receipt-extractor"

const receipt = (): ReceiptExtraction =>
  parseReceiptExtraction({
    ...Object.fromEntries(RECEIPT_TEXT_FIELDS.map((field) => [field, null])),
    documentKind: "single_transfer",
    printedStatus: "successful",
    dateAmbiguous: false,
    amountText: "1,250.50",
    currencyCode: "NGN",
    recipientAccount: "0012345678",
    dateTimeIso: "2026-10-28T11:00:00+01:00",
    narration: "EWA-ABC2345678",
    evidence: [],
  })
const context = {
  claimedAmountMinor: 125050,
  currencyCode: "NGN",
  receivingAccountNumber: "0012345678",
  paymentReference: "EWA-ABC2345678",
  claimedAt: new Date("2026-10-28T11:00:00Z"),
  oldestAcceptableAt: new Date("2026-10-21T11:00:00Z"),
  latestAcceptableAt: new Date("2026-10-28T11:15:00Z"),
  duplicateCandidate: false,
}
test("references are copy-friendly random hints; narration normalization preserves exact boundaries", () => {
  const references = Array.from({ length: 100 }, createManualPaymentReference)
  expect(new Set(references).size).toBe(100)
  for (const reference of references)
    expect(reference).toMatch(/^EWA-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
  expect(
    paymentReferenceMatches("EWA-ABC2345678", "  transfer  ewa-abc2345678 "),
  ).toBe(true)
  expect(paymentReferenceMatches("EWA-ABC2345678", "EWA-ABC23456789")).toBe(
    false,
  )
  expect(paymentReferenceMatches("EWA-ABC2345678", "EWA-ABC234")).toBe(false)
})
test("NIBSS uniqueness survives account aliases and changed destination; bank-local namespaces require future canonical bank codes", () => {
  const facts = {
    tenantId: "business",
    currencyCode: "NGN",
    receivingAccountId: "alias-one",
    receivingAccountNumber: "0012345678",
    namespace: "nibss_session_id",
    rawReference: "123456789012345678901234567890",
  }
  const first = manualTransferIdentity(facts)
  expect(
    manualTransferIdentity({
      ...facts,
      receivingAccountId: "alias-two",
      receivingAccountNumber: "0098765432",
    }).identityDigest,
  ).toBe(first.identityDigest)
  expect(
    manualTransferIdentity({ ...facts, tenantId: "other" }).identityDigest,
  ).not.toBe(first.identityDigest)
  expect(() =>
    manualTransferIdentity({
      ...facts,
      namespace: "bank_transaction_id:guessed",
    }),
  ).toThrow()
  expect(() =>
    manualTransferIdentity({ ...facts, rawReference: "EWA-ABC2345678" }),
  ).toThrow()
})
test("money parsing refuses fee/debit guessing, unsafe precision and ambiguous formats", () => {
  expect(receiptAmountMinor("1,250.50")).toBe(125050)
  for (const value of [
    "1,25.50",
    "1.000,50",
    "1250.501",
    "1e3",
    "-1",
    "1000000000",
    null,
  ])
    expect(receiptAmountMinor(value)).toBeNull()
  const reading = receipt()
  reading.amountText = null
  reading.totalDebitText = "1250.50"
  const result = assessManualPaymentReceipt(reading, context)
  expect(result.amountMinor).toBeNull()
  expect(result.disposition).toBe("needs_review")
  expect(result.fundsConfirmed).toBe(false)
})
test("matching evidence never confirms funds; mismatched and unknown fields require bank review", () => {
  expect(assessManualPaymentReceipt(receipt(), context)).toMatchObject({
    disposition: "consistent",
    fundsConfirmed: false,
  })
  const reading = receipt()
  reading.recipientAccount = "******5678"
  reading.dateTimeIso = null
  reading.dateOnly = "2026-10-28"
  reading.narration = "EWA-ABC234"
  reading.printedStatus = "pending"
  const result = assessManualPaymentReceipt(reading, {
    ...context,
    claimedAmountMinor: 120000,
    duplicateCandidate: true,
  })
  expect(result.findings.map((finding) => finding.code)).toEqual([
    "AMOUNT_MISMATCH",
    "RECIPIENT_UNKNOWN",
    "DATE_UNKNOWN",
    "PRINTED_STATUS_REVIEW",
    "REFERENCE_NEEDS_BANK_CHECK",
    "DUPLICATE_CANDIDATE",
  ])
  expect(result.fundsConfirmed).toBe(false)
})
test("extraction rejects prompt-output authority and malformed evidence", () => {
  expect(() =>
    parseReceiptExtraction({ ...receipt(), settlePayment: true }),
  ).toThrow()
  expect(() =>
    parseReceiptExtraction({ ...receipt(), amountText: 1250 }),
  ).toThrow()
  expect(() =>
    parseReceiptExtraction({
      ...receipt(),
      evidence: [{ field: "amountText", page: 4, text: "1250" }],
    }),
  ).toThrow()
})
test("disabled/unapproved extractor cannot dispatch; explicit admitted request contains no expected values", async () => {
  let calls = 0
  const transport = async (_url: string, init?: RequestInit) => {
    calls++
    const body = JSON.parse(String(init?.body))
    expect(body.store).toBe(false)
    expect(body.instructions).not.toContain("0012345678")
    return Response.json({
      id: "resp_test",
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(receipt()) }],
        },
      ],
    })
  }
  expect(
    createReceiptExtractor({
      enabled: true,
      processorApproved: false,
      apiKey: "test",
      fetchImpl: transport,
    }),
  ).toBeNull()
  expect(
    createReceiptExtractor({
      enabled: true,
      processorApproved: true,
      apiKey: "test",
      fetchImpl: transport,
    }),
  ).toBeNull()
  expect(calls).toBe(0)
  const extract = createReceiptExtractor({
    enabled: true,
    processorApproved: true,
    apiKey: "test",
    model: "gpt-4.1-mini",
    fetchImpl: transport,
  })
  if (!extract) throw new Error("Expected test transport adapter")
  await expect(
    extract({
      pages: [
        {
          bytes: new Uint8Array([1]),
          contentType: "image/png",
          width: 100,
          height: 100,
        },
      ],
    }),
  ).resolves.toMatchObject({
    provider: "openai",
    providerRequestId: "resp_test",
  })
  await expect(
    extract({
      pages: [
        {
          bytes: new Uint8Array([1]),
          contentType: "image/png",
          width: 100000,
          height: 100000,
        },
      ],
    }),
  ).rejects.toThrow("limits")
  expect(calls).toBe(1)
})

test("wired receipt rules flag definitely old date-only evidence and refuse rollover dates", () => {
  const reading = receipt()
  reading.dateTimeIso = null
  reading.dateOnly = "2026-09-03"
  reading.dateRaw = "3 September 2026"
  expect(
    assessManualPaymentReceipt(reading, context).findings.some(
      (finding) => finding.code === "DATE_OLD",
    ),
  ).toBe(true)
  reading.dateTimeIso = "2026-02-31T10:00:00Z"
  reading.dateRaw = "2026-02-31"
  const result = assessManualPaymentReceipt(reading, context)
  expect(
    result.findings.some((finding) => finding.code === "DATE_UNKNOWN"),
  ).toBe(true)
  expect(result.findings.some((finding) => finding.code === "DATE_OLD")).toBe(
    false,
  )
})

test("changed receipt bytes with same printed NIBSS reference produce only a Tenant-scoped advisory candidate", async () => {
  const printed = "123456789012345678901234567890"
  const registry = [
    {
      tenantId: "business",
      currencyCode: "NGN",
      reportId: "old-confirmed",
      reference: printed,
    },
  ]
  const observed: Parameters<ReceiptCandidateLookup>[0][] = []
  const lookup: ReceiptCandidateLookup = async (scope) => {
    observed.push(scope)
    return registry.some(
      (row) =>
        row.tenantId === scope.tenantId &&
        row.currencyCode === scope.currencyCode &&
        row.reportId !== scope.excludeReportId &&
        row.reference === scope.printedSessionId,
    )
  }
  // Artifact A and edited/cropped artifact B have different digests; semantic lookup
  // takes their independently extracted text, not file identity or OCR authority.
  const first = { digest: "artifact-A", printedBankReference: printed }
  const changed = { digest: "artifact-B", printedBankReference: printed }
  expect(first.digest).not.toBe(changed.digest)
  const candidate = await hasAdvisoryReceiptTransferCandidate(
    {
      tenantId: "business",
      currencyCode: "NGN",
      reportId: "new-report",
      printedBankReference: changed.printedBankReference,
    },
    lookup,
  )
  expect(candidate).toBe(true)
  const assessment = assessManualPaymentReceipt(receipt(), {
    ...context,
    duplicateCandidate: candidate,
  })
  expect(
    assessment.findings.some(
      (finding) => finding.code === "DUPLICATE_CANDIDATE",
    ),
  ).toBe(true)
  expect(assessment.fundsConfirmed).toBe(false)
  expect(
    await hasAdvisoryReceiptTransferCandidate(
      {
        tenantId: "different-business",
        currencyCode: "NGN",
        reportId: "new-report",
        printedBankReference: printed,
      },
      lookup,
    ),
  ).toBe(false)
  expect(observed[1]?.tenantId).toBe("different-business")
  const reads = observed.length
  expect(
    await hasAdvisoryReceiptTransferCandidate(
      {
        tenantId: "business",
        currencyCode: "NGN",
        reportId: "new-report",
        printedBankReference: "EWA-ABC2345678",
      },
      lookup,
    ),
  ).toBe(false)
  expect(observed.length).toBe(reads)
})
