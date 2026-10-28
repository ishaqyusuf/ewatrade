import { expect, spyOn, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import { closeDraftForReplacement, preparedFromStatus } from "./draft-report"
import { readRefundDestination } from "./refund-destination"
import type { StoredReport } from "./report-storage"
import {
  prepareReport,
  submitPreparedReport,
  uploadPreparedReceipt,
} from "./send-payment-report"

const draft = {
  reportId: "r_1",
  status: "DRAFT" as const,
  state: "checking" as const,
  revision: 4,
}

test("replacement closes the current revision under its original proof", async () => {
  const sent: unknown[] = []
  await closeDraftForReplacement(
    {
      businessBanking: {
        reportStatus: {
          query: async (input) => {
            sent.push(input)
            return draft
          },
        },
        cancelDraftReport: {
          mutate: async (input) => {
            sent.push(input)
            return { state: "draft_cancelled" }
          },
        },
      },
    },
    "old-proof",
  )
  expect(sent).toEqual([
    { reportToken: "old-proof" },
    { reportToken: "old-proof", expectedRevision: 4 },
  ])
})

test("submitted reports cannot be cancelled and a lost cancel answer remains unknown", async () => {
  let cancels = 0
  const client = {
    businessBanking: {
      reportStatus: {
        query: async () => ({ ...draft, status: "SUBMITTED" as const }),
      },
      cancelDraftReport: {
        mutate: async () => {
          cancels++
          return { state: "draft_cancelled" as const }
        },
      },
    },
  }
  await expect(closeDraftForReplacement(client, "proof")).rejects.toMatchObject(
    { kind: "conflict" },
  )
  expect(cancels).toBe(0)
  await expect(
    closeDraftForReplacement(
      {
        businessBanking: {
          reportStatus: { query: async () => draft },
          cancelDraftReport: {
            mutate: async () => {
              throw new TypeError("lost")
            },
          },
        },
      },
      "proof",
    ),
  ).rejects.toMatchObject({ kind: "network" })
})

test("a cancellation confirmed on a later read permits recovery without another mutation", async () => {
  await closeDraftForReplacement(
    {
      businessBanking: {
        reportStatus: {
          query: async () => ({ ...draft, state: "draft_cancelled" }),
        },
        cancelDraftReport: {
          mutate: async () => {
            throw new Error("should not call")
          },
        },
      },
    },
    "proof",
  )
  expect(() =>
    preparedFromStatus("proof", { ...draft, state: "draft_cancelled" }, true),
  ).toThrow()
  expect(preparedFromStatus("proof", draft, true).receiptUploadPath).toBe(
    "/api/manual-payments/reports/r_1/receipt",
  )
})

test("refund destination validates exact bank name, ten digits and holder without inventing a code", () => {
  expect(
    readRefundDestination({
      bankName: " ",
      accountNumber: "",
      accountName: "",
    }),
  ).toEqual({ kind: "empty" })
  expect(
    readRefundDestination({
      bankName: "Example Bank",
      accountNumber: "12345",
      accountName: "Ada",
    }).kind,
  ).toBe("invalid")
  expect(
    readRefundDestination({
      bankName: " Example   Bank ",
      accountNumber: "0123 456-789",
      accountName: " Ada   Obi ",
    }),
  ).toEqual({
    kind: "valid",
    destination: {
      bankName: "Example Bank",
      accountNumber: "0123456789",
      accountName: "Ada Obi",
    },
  })
})

const report: StoredReport = {
  v: 1,
  clientReportId: "pr_stable123",
  payerName: "Ada",
  claimedAmountMinor: 200000,
  receipt: null,
  reportToken: null,
  previousReportToken: null,
  reportedAt: null,
  allocation: { allocationPreference: "REFUND", requestedApplyMinor: 100000 },
  refundDetails: true,
}

test("private refund prepare is separate from explicit final submission", async () => {
  const calls: string[] = []
  const destination = {
    bankName: "Example Bank",
    accountNumber: "0123456789",
    accountName: "Ada",
  }
  const prepared = {
    reportToken: "private-proof",
    status: "DRAFT" as const,
    receiptUploadPath: null,
  }
  const client = {
    businessBanking: {
      reportPayment: {
        mutate: async () => {
          throw new Error("ordinary must not carry bank details")
        },
      },
      reportPaymentWithRefund: {
        mutate: async (input: {
          allocation?: { refundDestination?: unknown }
        }) => {
          calls.push("private-prepare")
          expect(input.allocation?.refundDestination).toEqual(destination)
          return prepared
        },
      },
      submitReport: {
        mutate: async () => {
          calls.push("submit")
          throw TRPCClientError.from({
            error: {
              message: "test ends here",
              code: -32000,
              data: { code: "BAD_REQUEST" },
            },
          })
        },
      },
    },
  }
  const result = await prepareReport({
    client,
    linkToken: "link",
    report,
    refundDestination: destination,
  })
  expect(calls).toEqual(["private-prepare"])
  expect(JSON.stringify(report)).not.toContain("0123456789")
  await expect(
    submitPreparedReport({ client, prepared: result, hasFile: false }),
  ).rejects.toMatchObject({ kind: "invalid" })
  expect(calls).toEqual(["private-prepare", "submit"])
})

test("private receipt upload carries only its report proof and never submits", async () => {
  const receipt = {
    contentType: "image/png" as const,
    contentDigest: "a".repeat(64),
    sizeBytes: 4,
    fileName: "receipt.png",
  }
  const file = new File(["test"], receipt.fileName, {
    type: receipt.contentType,
  })
  const upload = spyOn(globalThis, "fetch").mockImplementation(
    async (url, init) => {
      expect(url).toBe("/api/manual-payments/reports/r_1/receipt")
      expect(init?.method).toBe("PUT")
      expect(init?.credentials).toBe("omit")
      expect(init?.headers).toEqual({
        Authorization: "Bearer receipt-proof",
        "Content-Type": "image/png",
      })
      expect(init?.body).toBe(file)
      return new Response(null, { status: 200 })
    },
  )
  try {
    expect(
      await uploadPreparedReceipt({
        prepared: {
          reportToken: "receipt-proof",
          status: "DRAFT",
          receiptUploadPath: "/api/manual-payments/reports/r_1/receipt",
        },
        report: { ...report, receipt },
        file,
      }),
    ).toBe(true)
    expect(upload).toHaveBeenCalledTimes(1)
  } finally {
    upload.mockRestore()
  }
})
