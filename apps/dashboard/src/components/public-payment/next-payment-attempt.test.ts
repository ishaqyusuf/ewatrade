import { expect, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import {
  type LinkAttempt,
  startNextPaymentAttempt,
} from "./next-payment-attempt"
import {
  type StoredReport,
  parseStoredReport,
  sameReportDetails,
} from "./report-storage"
import { sendPaymentReport } from "./send-payment-report"

const decided: StoredReport = {
  v: 1,
  clientReportId: "pr_decidedoperation",
  payerName: "Ada",
  claimedAmountMinor: 150000,
  receipt: null,
  reportToken: "decided-proof",
  previousReportToken: null,
  reportedAt: "2026-10-28T10:00:00.000Z",
  paymentAttemptId: "attempt_1",
  paymentReference: "EWA-OLDREF2345",
}
const issued = {
  paymentAttemptId: "attempt_2",
  paymentReference: "EWA-NEWREF6789",
}

function conflict(message: string) {
  return TRPCClientError.from({
    error: { message, code: -32009, data: { code: "CONFLICT" } },
  })
}

/** A browser record plus the server's attempt table, keyed by clientAttemptId. */
function harness(options: {
  answers: Array<() => typeof issued>
  link: () => LinkAttempt
}) {
  const saves: StoredReport[] = []
  const requests: Array<{ reportToken: string; clientAttemptId: string }> = []
  let reads = 0
  const client = {
    businessBanking: {
      nextPaymentAttempt: {
        mutate: async (input: {
          reportToken: string
          clientAttemptId: string
        }) => {
          // The attempt is persisted before the request reaches the server.
          expect(saves.at(-1)?.nextAttempt?.clientAttemptId).toBe(
            input.clientAttemptId,
          )
          requests.push(input)
          const answer = options.answers[requests.length - 1]
          if (!answer) throw new Error("No more answers")
          return { ...answer(), replay: requests.length > 1 }
        },
      },
    },
  }
  const run = (record: StoredReport) =>
    startNextPaymentAttempt({
      client,
      record,
      decidedAttemptId: "attempt_1",
      save: (saved) => {
        saves.push(saved)
      },
      readLink: async () => {
        reads += 1
        return options.link()
      },
    })
  return { saves, requests, run, reads: () => reads }
}

test("a lost answer and a reload replay one attempt, then open only on the exact link reference", async () => {
  const flow = harness({
    answers: [
      () => {
        throw new Error("Lost response")
      },
      () => issued,
    ],
    link: () => issued,
  })
  const first = await flow.run(decided)
  expect(first).toMatchObject({ kind: "error" })
  // The request id survived the lost answer; the reload starts from the saved record.
  const reloaded = parseStoredReport(JSON.stringify(flow.saves.at(-1)))
  expect(reloaded?.nextAttempt?.paymentAttemptId).toBeNull()
  if (!reloaded) throw new Error("Record did not survive a reload")
  const second = await flow.run(reloaded)
  expect(second).toEqual({ kind: "ready", attempt: issued })
  expect(new Set(flow.requests.map((r) => r.clientAttemptId)).size).toBe(1)
  expect(flow.requests.every((r) => r.reportToken === "decided-proof")).toBe(
    true,
  )
  // The decided report, its proof and reference stay; the new attempt sits beside them.
  const saved = flow.saves.at(-1)
  expect(saved).toMatchObject({
    clientReportId: decided.clientReportId,
    reportToken: "decided-proof",
    paymentAttemptId: "attempt_1",
    paymentReference: "EWA-OLDREF2345",
    nextAttempt: { ...issued },
  })
  expect(parseStoredReport(JSON.stringify(saved))).toEqual(saved ?? null)
})

test("a link that shows another attempt is offered explicitly, never swapped in", async () => {
  const newer = {
    paymentAttemptId: "attempt_3",
    paymentReference: "EWA-OTHER23456",
  }
  const afterIssue = harness({ answers: [() => issued], link: () => newer })
  expect(await afterIssue.run(decided)).toEqual({
    kind: "changed",
    attempt: newer,
  })

  const refused = harness({
    answers: [
      () => {
        throw conflict(
          "A newer payment attempt exists. Refresh the payment page.",
        )
      },
    ],
    link: () => newer,
  })
  expect(await refused.run(decided)).toEqual({
    kind: "changed",
    attempt: newer,
  })

  // The link still shows the decided attempt: nothing new to offer.
  const stale = harness({
    answers: [() => issued],
    link: () => ({
      paymentAttemptId: "attempt_1",
      paymentReference: decided.paymentReference ?? null,
    }),
  })
  expect(await stale.run(decided)).toMatchObject({ kind: "error" })
})

test("a replay that answers with a different attempt is refused and not saved", async () => {
  const flow = harness({
    answers: [
      () => ({
        paymentAttemptId: "attempt_9",
        paymentReference: "EWA-WRONG2345",
      }),
    ],
    link: () => issued,
  })
  const record = {
    ...decided,
    nextAttempt: { clientAttemptId: "pa_savedattempt", ...issued },
  }
  expect(await flow.run(record)).toMatchObject({ kind: "error", refresh: true })
  expect(flow.requests[0]?.clientAttemptId).toBe("pa_savedattempt")
  expect(flow.saves.map((saved) => saved.nextAttempt)).toEqual([
    record.nextAttempt,
  ])
  expect(flow.reads()).toBe(0)
})

test("a closed link or an unreadable link keeps the outcome and the saved attempt", async () => {
  const closed = harness({
    answers: [
      () => {
        throw TRPCClientError.from({
          error: { message: "Gone", code: -32004, data: { code: "NOT_FOUND" } },
        })
      },
    ],
    link: () => issued,
  })
  expect(await closed.run(decided)).toMatchObject({
    kind: "error",
    refresh: true,
  })
  expect(closed.reads()).toBe(0)

  const unreadable = harness({
    answers: [() => issued],
    link: () => {
      throw new Error("Offline")
    },
  })
  expect(await unreadable.run(decided)).toMatchObject({
    kind: "error",
    refresh: false,
  })
  expect(unreadable.saves.at(-1)?.nextAttempt).toMatchObject(issued)
})

test("stored attempt fields stay optional for old records and are validated when present", () => {
  const { paymentAttemptId, paymentReference, ...legacy } = decided
  expect(parseStoredReport(JSON.stringify(legacy))).toEqual(legacy)
  for (const bad of [
    { paymentAttemptId: "attempt 1" },
    { paymentAttemptId: 7 },
    { paymentReference: "ewa-lower" },
    {
      nextAttempt: {
        clientAttemptId: "short",
        paymentAttemptId: null,
        paymentReference: null,
      },
    },
    // Half an answer is never a usable attempt.
    {
      nextAttempt: {
        clientAttemptId: "pa_savedattempt",
        paymentAttemptId: "attempt_2",
        paymentReference: null,
      },
    },
    // Only a decided report's proof can ask for the next attempt.
    {
      reportToken: null,
      nextAttempt: {
        clientAttemptId: "pa_savedattempt",
        paymentAttemptId: null,
        paymentReference: null,
      },
    },
  ]) {
    expect(parseStoredReport(JSON.stringify({ ...decided, ...bad }))).toBeNull()
  }
})

test("report retries are bound to the attempt that was shown", async () => {
  const details = {
    payerName: "Ada",
    claimedAmountMinor: 150000,
    receipt: null,
  }
  expect(
    sameReportDetails(decided, { ...details, paymentAttemptId: "attempt_1" }),
  ).toBe(true)
  expect(
    sameReportDetails(decided, { ...details, paymentAttemptId: "attempt_2" }),
  ).toBe(false)
  expect(
    sameReportDetails(decided, { ...details, paymentAttemptId: null }),
  ).toBe(false)
  // Saved before attempts existed: unbound, so the unchanged retry still replays.
  const { paymentAttemptId: _unbound, ...legacy } = decided
  expect(
    sameReportDetails(legacy, { ...details, paymentAttemptId: "attempt_2" }),
  ).toBe(true)

  const sent: Array<Record<string, unknown>> = []
  let prepares = 0
  const client = {
    businessBanking: {
      reportPayment: {
        mutate: async (input: Record<string, unknown>) => {
          sent.push(input)
          if (++prepares === 1) throw new Error("Lost response")
          return {
            reportId: "report_2",
            reportToken: "new-proof",
            status: "DRAFT" as const,
            paymentReference: issued.paymentReference,
            paymentAttemptId: issued.paymentAttemptId,
            replay: true,
            receiptUploadPath: null,
          }
        },
      },
      submitReport: { mutate: async () => ({}) },
    },
  }
  const report: StoredReport = {
    ...decided,
    clientReportId: "pr_nextoperation",
    reportToken: null,
    previousReportToken: "decided-proof",
    ...issued,
  }
  const input = {
    // The mocks only answer the fields this flow reads.
    client: client as unknown as Parameters<
      typeof sendPaymentReport
    >[0]["client"],
    linkToken: "link",
    report,
    file: null,
    onStep() {},
    onPrepared() {},
  }
  await expect(sendPaymentReport(input)).rejects.toMatchObject({
    kind: "network",
  })
  await sendPaymentReport(input)
  expect(sent.map((request) => request.paymentAttemptId)).toEqual([
    "attempt_2",
    "attempt_2",
  ])
  expect(sent.map((request) => request.clientReportId)).toEqual([
    "pr_nextoperation",
    "pr_nextoperation",
  ])

  sent.length = 0
  prepares = 1
  await sendPaymentReport({
    ...input,
    report: { ...report, paymentAttemptId: null },
  })
  expect("paymentAttemptId" in (sent[0] ?? {})).toBe(false)
})
