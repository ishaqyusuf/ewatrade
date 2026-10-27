import { afterEach, expect, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import {
  type StoredReport,
  clearStoredReport,
  hasPersistedReport,
  parseStoredReport,
  readStoredReport,
  sameReportDetails,
  writeStoredReport,
} from "./report-storage"
import {
  ReportFlowError,
  receiptUploadUrl,
  sendPaymentReport,
} from "./send-payment-report"

const report: StoredReport = {
  v: 1,
  clientReportId: "pr_stableoperation",
  payerName: "Ada",
  claimedAmountMinor: 150000,
  receipt: null,
  reportToken: null,
  previousReportToken: null,
  reportedAt: null,
}
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
afterEach(() => {
  clearStoredReport("test-link")
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow)
  else Reflect.deleteProperty(globalThis, "window")
})

test("denied reads/writes preserve the same operation and report proof during this visit", () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem() {
          throw new Error("Denied")
        },
        setItem() {
          throw new Error("Quota")
        },
        removeItem() {
          throw new Error("Denied")
        },
      },
    },
  })
  expect(readStoredReport("test-link")).toBeNull()
  writeStoredReport("test-link", report)
  expect(readStoredReport("test-link")?.clientReportId).toBe(
    report.clientReportId,
  )
  const prepared = { ...report, reportToken: "private-proof" }
  writeStoredReport("test-link", prepared)
  expect(readStoredReport("test-link")?.reportToken).toBe("private-proof")
  expect(hasPersistedReport("test-link", "private-proof")).toBe(false)
  clearStoredReport("test-link")
  expect(readStoredReport("test-link")).toBeNull()
})

test("reload records refuse malformed amounts and receipt metadata", () => {
  for (const claimedAmountMinor of [0, -1, 1.5, 100_000_001]) {
    expect(
      parseStoredReport(JSON.stringify({ ...report, claimedAmountMinor })),
    ).toBeNull()
  }
  expect(parseStoredReport(JSON.stringify(report))).toEqual(report)
  expect(
    sameReportDetails(report, {
      payerName: "Ada",
      claimedAmountMinor: 150000,
      receipt: null,
    }),
  ).toBe(true)
  expect(
    sameReportDetails(report, {
      payerName: "Ada",
      claimedAmountMinor: 150001,
      receipt: null,
    }),
  ).toBe(false)
})

test("receipt proof refuses remote, redirect-shaped and unexpected upload paths", () => {
  expect(
    receiptUploadUrl("/api/manual-payments/reports/report_1/receipt"),
  ).toBe("/api/manual-payments/reports/report_1/receipt")
  for (const path of [
    "https://evil.test/api/manual-payments/reports/r/receipt",
    "//evil.test/receipt",
    "/api/manual-payments/reports/../receipt",
    "/api/manual-payments/reports/r/receipt?redirect=evil",
    "/api/manual-payments/reports/r/receipt#proof",
  ]) {
    expect(() => receiptUploadUrl(path)).toThrow(ReportFlowError)
  }
})

test("lost submit response retries one stable report operation without making a payment", async () => {
  const operations: string[] = []
  let submissions = 0
  const client = {
    businessBanking: {
      reportPayment: {
        mutate: async (input: { clientReportId: string }) => {
          operations.push(input.clientReportId)
          return {
            reportId: "report_1",
            reportToken: "private-proof",
            status: "DRAFT" as const,
            replay: operations.length > 1,
            receiptUploadPath: null,
          }
        },
      },
      submitReport: {
        mutate: async ({ reportToken }: { reportToken: string }) => {
          expect(reportToken).toBe("private-proof")
          if (++submissions === 1) throw new Error("Lost response")
          return {
            reportId: "report_1",
            revision: 2,
            status: "SUBMITTED" as const,
            state: "checking" as const,
            claimedAmountMinor: 150000,
            receivedAmountMinor: null,
            totalMinor: 150000,
            paidMinor: 0,
            balanceMinor: 150000,
            currencyCode: "NGN",
            message: "The business is checking your transfer.",
          }
        },
      },
    },
  }
  const steps: string[] = []
  const input = {
    client,
    linkToken: "link",
    report,
    file: null,
    onStep: (step: string) => {
      steps.push(step)
    },
    onPrepared: (token: string) => {
      expect(token).toBe("private-proof")
    },
  }
  await expect(sendPaymentReport(input)).rejects.toMatchObject({
    kind: "network",
  })
  await sendPaymentReport(input)
  expect(operations).toEqual([report.clientReportId, report.clientReportId])
  expect(steps).toEqual(["preparing", "submitting", "preparing", "submitting"])
  expect(Object.keys(client.businessBanking)).toEqual([
    "reportPayment",
    "submitReport",
  ])
})

test("a reloaded receipt draft asks for the same receipt when upload never finished", async () => {
  const failure = TRPCClientError.from({
    error: {
      message: "Receipt not uploaded",
      code: -32009,
      data: { code: "CONFLICT" },
    },
  })
  const client = {
    businessBanking: {
      reportPayment: {
        mutate: async () => ({
          reportId: "r",
          reportToken: "private-proof",
          status: "DRAFT" as const,
          replay: true,
          receiptUploadPath: "/api/manual-payments/reports/r/receipt",
        }),
      },
      submitReport: {
        mutate: async () => {
          throw failure
        },
      },
    },
  }
  await expect(
    sendPaymentReport({
      client,
      linkToken: "link",
      report: {
        ...report,
        receipt: {
          fileName: "receipt.png",
          contentType: "image/png",
          contentDigest: "a".repeat(64),
          sizeBytes: 100,
        },
      },
      file: null,
      onStep() {},
      onPrepared() {},
    }),
  ).rejects.toMatchObject({ kind: "receipt_needed" })
})
