import { expect, test } from "bun:test"
import {
  assistantWhatsAppOperationsSnapshot,
  readAssistantWhatsAppOperations,
} from "./channel-operations"

const window = {
  since: new Date("2026-10-14T12:00:00Z"),
  now: new Date("2026-10-15T12:00:00Z"),
}
const empty = {
  pendingInbox: "0",
  processingInbox: "0",
  failedInbox: "0",
  authorityDeniedInbox: "0",
  ingressQuotaNotices: "0",
  modelBudgetDeniedRuns: "0",
  deliveryQuotaHeldOutbox: "0",
  oldestInboxAgeMs: null,
  pendingOutbox: "0",
  sendingOutbox: "0",
  unknownOutbox: "0",
  failedOutbox: "0",
  oldestOutboxAgeMs: null,
  outsideServiceWindow: "0",
  unknownAttempts: "0",
  acceptedAttempts: "0",
  channelRuns: "0",
  failedRuns: "0",
  runningRuns: "0",
  averageRunMs: null,
  inputTokens: "0",
  cachedInputTokens: "0",
  outputTokens: "0",
  voiceAttempts: "0",
  voiceEstimateCount: "0",
  voiceEstimatedMicros: null,
  expiredInboxContent: "0",
  expiredOutboxContent: "0",
  expiredLiveGrants: "0",
  expiredPrivateMedia: "0",
}

test("no recorded billing or estimate remains unknown rather than an invented zero cost or provider claim", () => {
  const report = assistantWhatsAppOperationsSnapshot(empty, window)
  expect(report.status).toBe("logical_snapshot")
  if (report.status !== "logical_snapshot")
    throw Error("Expected logical snapshot")
  expect(report.cost.transport).toEqual({
    status: "unknown",
    billedAmountMicros: null,
    currency: null,
    reason: "provider_amount_not_recorded",
  })
  expect(report.cost.voice.estimatedCostMicros).toBeNull()
  expect(report.cost.model.billedAmountMicros).toBeNull()
  expect(report.providerAvailability).toBe("not_probed")
  expect(report.attentionRequired).toBe(false)
  const outsideWindow = assistantWhatsAppOperationsSnapshot(
    { ...empty, outsideServiceWindow: "1" },
    window,
  )
  if (outsideWindow.status !== "logical_snapshot")
    throw Error("Expected window diagnostics")
  expect(outsideWindow.attentionRequired).toBe(true)
})

test("unknown effects, latency and retention debt are visible without private identifiers or arbitrary errors", () => {
  const report = assistantWhatsAppOperationsSnapshot(
    {
      ...empty,
      pendingInbox: 2n,
      oldestInboxAgeMs: 350_000,
      unknownOutbox: "1",
      unknownAttempts: "1",
      expiredPrivateMedia: "2",
      voiceAttempts: "3",
      voiceEstimateCount: "2",
      voiceEstimatedMicros: "12345",
      phone: "2348000000000",
      text: "private transcript",
      code: "private-review-code",
      error: "https://credential:secret@example.test/private",
      actorUserId: "private-actor",
    },
    window,
  )
  expect(report.status).toBe("logical_snapshot")
  if (report.status !== "logical_snapshot")
    throw Error("Expected logical snapshot")
  expect(report.attentionRequired).toBe(true)
  expect(report.delivery.unknownRecovery).toBe(
    "receipt_reconciliation_only_no_resend",
  )
  expect(report.cost.voice).toMatchObject({
    attemptsWithEstimate: 2,
    attemptsWithoutEstimate: 1,
    estimatedCostMicros: "12345",
    billedAmountMicros: null,
  })
  const serialized = JSON.stringify(report)
  for (const secret of [
    "2348000000000",
    "private transcript",
    "private-review-code",
    "credential",
    "secret",
    "private-actor",
  ])
    expect(serialized.includes(secret)).toBe(false)
})

test("malformed or lossy metrics and raw DB errors fail with one fixed private-safe result", async () => {
  for (const invalid of [
    { ...empty, pendingInbox: -1 },
    { ...empty, pendingInbox: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
    { ...empty, voiceAttempts: "1", voiceEstimateCount: "2" },
    { ...empty, averageRunMs: Number.NaN },
  ])
    expect(assistantWhatsAppOperationsSnapshot(invalid, window)).toEqual({
      version: "whatsapp-operations-v1",
      status: "unavailable",
      code: "DIAGNOSTICS_UNAVAILABLE",
    })
  expect(
    await readAssistantWhatsAppOperations(
      {
        $queryRaw: async () => {
          throw Error("private postgres://password@host text phone code")
        },
      },
      window,
    ),
  ).toEqual({
    version: "whatsapp-operations-v1",
    status: "unavailable",
    code: "DIAGNOSTICS_UNAVAILABLE",
  })
})

test("operator read uses one aggregate query with dates only and invalid windows never query", async () => {
  const queries: string[] = []
  const db = {
    $queryRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
      queries.push(query.join("?"))
      expect(values.every((value) => value instanceof Date)).toBe(true)
      return [empty]
    },
  }
  expect((await readAssistantWhatsAppOperations(db, window)).status).toBe(
    "logical_snapshot",
  )
  expect(queries).toHaveLength(1)
  expect(queries[0]).toContain("id LIKE 'wa-quota-%'")
  expect(queries[0]).toContain(`"requestId"=id||'-notice'`)
  expect(queries[0]).not.toContain('"phoneNumberId"')
  expect(queries[0]).not.toContain('"senderId"')
  expect(queries[0]).not.toContain('"transcript"')
  expect(queries[0]).not.toContain('"callbackDigest"')
  for (const metric of [
    "failedInbox",
    "authorityDeniedInbox",
    "failedOutbox",
    "acceptedAttempts",
  ]) {
    const column = queries[0]
      ?.split("\n")
      .find((line) => line.includes(`AS "${metric}"`))
    expect(column).toContain(">=?")
    expect(column).toContain("<=?")
  }
  expect(
    (
      await readAssistantWhatsAppOperations(db, {
        since: window.now,
        now: window.since,
      })
    ).status,
  ).toBe("unavailable")
  expect(queries).toHaveLength(1)
})

test("budget refusals and quota-held replies report only recorded counts without inventing dropped ingress totals", () => {
  const report = assistantWhatsAppOperationsSnapshot(
    {
      ...empty,
      modelBudgetDeniedRuns: "3",
      deliveryQuotaHeldOutbox: "2",
      ingressQuotaNotices: "1",
    },
    window,
  )
  if (report.status !== "logical_snapshot")
    throw Error("Expected logical snapshot")
  expect(report.limits).toEqual({
    modelBudgetDeniedRunsInWindow: 3,
    deliveryQuotaHeldReplies: 2,
    ingressDeniedAdmissions: {
      status: "notice_count_only",
      noticeCountInWindow: 1,
    },
  })
})
