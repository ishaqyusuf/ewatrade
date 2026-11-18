import { expect, test } from "bun:test"
import {
  queueRefusalReason,
  runAssistantWhatsAppTurnNow,
} from "./channel-turn-now"

test("runs the turn, sends its reply and follows queued turns a bounded number of times", async () => {
  const calls: string[] = []
  await runAssistantWhatsAppTurnNow("a", {
    process: async (id) => {
      calls.push(`process:${id}`)
      return { status: "completed", nextIngressId: `${id}+` }
    },
    dispatch: async (id) => {
      calls.push(`dispatch:${id}`)
    },
  })
  expect(calls).toEqual([
    "process:a",
    "dispatch:a",
    "process:a+",
    "dispatch:a+",
    "process:a++",
    "dispatch:a++",
  ])
})

test("a busy or failed turn sends nothing and a failed send stays for recovery", async () => {
  const sent: string[] = []
  await runAssistantWhatsAppTurnNow("busy", {
    process: async () => ({ status: "busy" }),
    dispatch: async (id) => {
      sent.push(id)
    },
  })
  expect(sent).toEqual([])
  await runAssistantWhatsAppTurnNow("done", {
    process: async () => ({ status: "completed" }),
    dispatch: async () => {
      throw Error("provider down")
    },
  })
})

test("refusal reasons keep status and short text but hide Trigger keys", () => {
  const error = Object.assign(Error("Unauthorized tr_prod_abc123XYZ"), {
    status: 401,
  })
  expect(queueRefusalReason(error)).toEqual({
    reason: "Error",
    status: 401,
    message: "Unauthorized [key]",
  })
  expect(queueRefusalReason("x")).toEqual({ reason: "unknown" })
})
