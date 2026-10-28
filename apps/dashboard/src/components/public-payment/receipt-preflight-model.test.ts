import { expect, test } from "bun:test"
import {
  PREFLIGHT_WAIT_MS,
  preflightPollDelay,
  preflightRunning,
  receiptStatusPollDelay,
  receiptStatusPollKey,
} from "./receipt-preflight-model"

test("receipt polling stops at a bounded deadline and never polls submitted or cancelled history", () => {
  expect(preflightPollDelay(0)).toBe(2_500)
  expect(preflightPollDelay(30_000)).toBe(6_000)
  expect(preflightPollDelay(PREFLIGHT_WAIT_MS)).toBe(false)
  expect(preflightRunning(undefined)).toBe(false)
  expect(
    preflightRunning({
      status: "DRAFT",
      state: "checking",
      receiptAssessment: null,
    }),
  ).toBe(true)
  expect(
    preflightRunning({
      status: "DRAFT",
      state: "draft_cancelled",
      receiptAssessment: null,
    }),
  ).toBe(false)
  expect(
    preflightRunning({
      status: "SUBMITTED",
      state: "checking",
      receiptAssessment: null,
    }),
  ).toBe(false)
})

test("submitted receipt polling follows pending/checking generations independently of financial status", () => {
  const status = {
    reportId: "report_1",
    status: "SUBMITTED" as const,
    receiptAssessment: {
      state: "pending" as const,
      generation: 1,
      pipelineVersion: "v1",
    },
  }
  const key = receiptStatusPollKey(status)
  expect(key).toBe("report_1:1:v1")
  expect(
    receiptStatusPollKey({
      ...status,
      receiptAssessment: { ...status.receiptAssessment, state: "checking" },
    }),
  ).toBe(key)
  expect(receiptStatusPollKey({ ...status, status: "CONFIRMED" })).toBe(key)
  expect(
    receiptStatusPollKey({
      ...status,
      receiptAssessment: { ...status.receiptAssessment, generation: 2 },
    }),
  ).not.toBe(key)
  expect(
    receiptStatusPollKey({
      ...status,
      receiptAssessment: { ...status.receiptAssessment, pipelineVersion: "v2" },
    }),
  ).not.toBe(key)
  for (const state of ["complete", "unavailable"] as const)
    expect(
      receiptStatusPollKey({
        ...status,
        receiptAssessment: { ...status.receiptAssessment, state },
      }),
    ).toBeNull()
  expect(receiptStatusPollKey({ ...status, status: "DRAFT" })).toBeNull()
  expect(
    receiptStatusPollKey({ ...status, receiptAssessment: null }),
  ).toBeNull()
})

test("receipt reads stop while hidden/offline, on generation change and at the original wall-clock deadline", () => {
  const poll = {
    elapsedMs: 0,
    visible: true,
    online: true,
    expectedKey: "r:1:v1",
    currentKey: "r:1:v1",
  }
  expect(receiptStatusPollDelay(poll)).toBe(2_500)
  expect(receiptStatusPollDelay({ ...poll, elapsedMs: 30_000 })).toBe(6_000)
  expect(receiptStatusPollDelay({ ...poll, visible: false })).toBe(false)
  expect(receiptStatusPollDelay({ ...poll, online: false })).toBe(false)
  expect(receiptStatusPollDelay({ ...poll, currentKey: "r:2:v1" })).toBe(false)
  expect(receiptStatusPollDelay({ ...poll, currentKey: null })).toBe(false)
  // Returning online/visible does not reset the budget or revive an old generation.
  expect(
    receiptStatusPollDelay({ ...poll, elapsedMs: PREFLIGHT_WAIT_MS - 1 }),
  ).toBe(6_000)
  expect(
    receiptStatusPollDelay({ ...poll, elapsedMs: PREFLIGHT_WAIT_MS }),
  ).toBe(false)
  expect(
    receiptStatusPollDelay({ ...poll, elapsedMs: PREFLIGHT_WAIT_MS + 60_000 }),
  ).toBe(false)
})
