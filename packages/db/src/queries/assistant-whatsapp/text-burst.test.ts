import { expect, test } from "bun:test"
import {
  assistantWhatsAppBurstText,
  assistantWhatsAppTextBurst,
  waitForAssistantWhatsAppTextBurst,
} from "./text-burst"

const now = new Date("2026-10-22T14:00:00Z")
function row(sequence = 1, text = "Create product Egg") {
  return {
    id: `in-${sequence}`,
    bindingId: "binding-a",
    identityId: null,
    kind: "TURN",
    state: "PENDING",
    sequence,
    attempts: 0,
    receivedAt: new Date(now.getTime() + (sequence - 1) * 300),
    expiresAt: new Date(now.getTime() + 60_000),
    content: { type: "text", text },
  }
}
const claimTime = new Date(now.getTime() + 1500)

test("adjacent details become one ordered text turn with original attribution", () => {
  const result = assistantWhatsAppTextBurst(
    row(),
    [row(2, "Small: 150 naira"), row(3, "Big: 200 naira")],
    claimTime,
  )
  expect(result?.text).toBe(
    "Create product Egg\n\nSmall: 150 naira\n\nBig: 200 naira",
  )
  expect(result?.originalText).toBe("Create product Egg")
  expect(result?.members.map((value) => value.id)).toEqual(["in-2", "in-3"])
})

test("scope, sequence, retry, expiry and action barriers never swallow later rows", () => {
  for (const change of [
    { bindingId: "binding-b" },
    { identityId: "identity" },
    { kind: "ACTION" },
    { state: "PROCESSING" },
    { attempts: 1 },
    { sequence: 9 },
    { expiresAt: now },
    { content: { type: "text", text: "YES" } },
    { receivedAt: new Date(now.getTime() + 1501) },
    {
      content: { type: "text", text: "Price 150", replyToMessageId: "quoted" },
    },
  ]) {
    expect(
      assistantWhatsAppTextBurst(
        row(),
        [{ ...row(2), ...change }, row(3)],
        claimTime,
      ),
    ).toBeNull()
  }
})

test("original retries and identity/control heads cannot become another burst", () => {
  for (const change of [
    { attempts: 1 },
    { kind: "CONTROL" },
    { identityId: "identity" },
    { bindingId: null },
    { state: "COMPLETED" },
    {
      content: {
        type: "text",
        text: "combined",
        burst: { sourceIds: ["old"] },
      },
    },
  ]) {
    expect(
      assistantWhatsAppTextBurst({ ...row(), ...change }, [row(2)], claimTime),
    ).toBeNull()
  }
})

test("five-message and 8000-character limits preserve excess fragments for later turns", () => {
  const result = assistantWhatsAppTextBurst(
    row(),
    [row(2), row(3), row(4), row(5), row(6)],
    claimTime,
  )
  expect(result?.members).toHaveLength(4)
  expect(
    assistantWhatsAppTextBurst(
      row(1, "a".repeat(7990)),
      [row(2, "b".repeat(20))],
      claimTime,
    ),
  ).toBeNull()
})

test("verification, controls, decisions and provider proofs are never ordinary burst text", () => {
  for (const text of [
    "123456",
    "STOP",
    "CANCEL",
    "CONNECT",
    "YES",
    "APPROVE abc",
    "EDIT abc",
    "NEXT",
  ])
    expect(assistantWhatsAppBurstText({ type: "text", text })).toBeNull()
  expect(
    assistantWhatsAppBurstText({ type: "interactive", text: "hello" }),
  ).toBeNull()
  expect(
    assistantWhatsAppBurstText({
      type: "text",
      text: "hello",
      quickActionDigest: "proof",
    }),
  ).toBeNull()
})

function database(value: ReturnType<typeof row> | null) {
  return {
    assistantWhatsAppInbox: { findUnique: async () => value },
  } as unknown as Parameters<typeof waitForAssistantWhatsAppTextBurst>[0]
}

test("bounded wait is outside claim and skipped for late workers/retries/actions/proof", async () => {
  const waits: number[] = []
  const wait = async (ms: number) => {
    waits.push(ms)
  }
  await waitForAssistantWhatsAppTextBurst(
    database(row()),
    "in-1",
    wait,
    new Date(now.getTime() + 500),
  )
  expect(waits).toEqual([1000])
  for (const value of [
    null,
    { ...row(), kind: "ACTION" },
    { ...row(), attempts: 1 },
    row(1, "123456"),
    { ...row(), state: "PROCESSING" },
  ])
    await waitForAssistantWhatsAppTextBurst(database(value), "in-1", wait, now)
  await waitForAssistantWhatsAppTextBurst(
    database(row()),
    "in-1",
    wait,
    claimTime,
  )
  expect(waits).toEqual([1000])
})
