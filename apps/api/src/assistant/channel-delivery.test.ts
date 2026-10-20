import { expect, test } from "bun:test"
import { WhatsAppProviderSendError } from "@ewatrade/communications"
import {
  type ChannelDeliveryDependencies,
  processAssistantChannelDelivery,
} from "./channel-delivery"

function fixture() {
  const outcomes: unknown[] = []
  const sends: unknown[] = []
  const deps: ChannelDeliveryDependencies = {
    config: () => ({
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      displayNumber: "2348000000000",
      permittedUserIds: ["user"],
    }),
    begin: async () => ({
      kind: "started",
      dispatchBefore: new Date(Date.now() + 60_000),
      userId: "user",
      phoneNumberId: "123456789",
      senderId: "2348000000001",
      body: "Business · Store\n\nExact saved reply",
      callbackData: "ewa-wa-v1:00000000-0000-4000-8000-000000000000",
      proof: {
        outboxId: "out",
        attemptId: "attempt",
        generation: 1,
        owner: "00000000-0000-4000-8000-000000000000",
      },
    }),
    finish: async (_proof, outcome) => {
      outcomes.push(outcome)
      return {
        state:
          outcome.kind === "accepted"
            ? "SENT"
            : outcome.kind === "cancelled"
              ? "CANCELLED"
              : outcome.kind === "unknown"
                ? "UNKNOWN"
                : "PENDING",
      }
    },
    next: async () => null,
    send: async (input) => {
      sends.push(input)
      return { messageId: "wamid.synthetic" }
    },
  }
  return { deps, outcomes, sends }
}
test("delivery uses only admitted saved body/recipient and returns metadata", async () => {
  const { deps, outcomes, sends } = fixture()
  expect(await processAssistantChannelDelivery("out", deps)).toEqual({
    status: "sent",
  })
  expect(sends).toEqual([
    {
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      to: "2348000000001",
      body: "Business · Store\n\nExact saved reply",
      callbackData: "ewa-wa-v1:00000000-0000-4000-8000-000000000000",
    },
  ])
  expect(outcomes).toEqual([
    { kind: "accepted", providerMessageId: "wamid.synthetic" },
  ])
})
test("review buttons use the same admitted body, callback and effect ledger", async () => {
  const { deps, outcomes, sends } = fixture()
  const buttons = [
    { id: `ewa-wa-action-v1:${"a".repeat(43)}:confirm`, title: "Confirm" },
    { id: `ewa-wa-action-v1:${"b".repeat(43)}:cancel`, title: "Cancel" },
  ]
  const interactive: unknown[] = []
  expect(
    await processAssistantChannelDelivery("out", {
      ...deps,
      begin: async (...args) => {
        const begun = await deps.begin(...args)
        return begun.kind === "started" ? { ...begun, buttons } : begun
      },
      sendButtons: async (input) => {
        interactive.push(input)
        return { messageId: "wamid.synthetic.buttons" }
      },
    }),
  ).toEqual({ status: "sent" })
  expect(sends).toHaveLength(0)
  expect(interactive).toEqual([
    {
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      to: "2348000000001",
      body: "Business · Store\n\nExact saved reply",
      callbackData: "ewa-wa-v1:00000000-0000-4000-8000-000000000000",
      buttons,
    },
  ])
  expect(outcomes).toEqual([
    { kind: "accepted", providerMessageId: "wamid.synthetic.buttons" },
  ])
})
test("disabled admission and a switch flipped before network both send nothing", async () => {
  const { deps, sends, outcomes } = fixture()
  expect(
    await processAssistantChannelDelivery("out", {
      ...deps,
      config: () => null,
    }),
  ).toEqual({ status: "disabled" })
  let configs = 0
  expect(
    await processAssistantChannelDelivery("out", {
      ...deps,
      config: () => (++configs === 1 ? deps.config() : null),
    }),
  ).toEqual({ status: "cancelled" })
  expect(outcomes).toEqual([{ kind: "cancelled" }])
  expect(sends).toEqual([])
})
test("only definite rejection can retry; all transport and malformed outcomes are unknown", async () => {
  for (const error of [
    new Error("private-network-data"),
    new WhatsAppProviderSendError("PROVIDER_REJECTED", "OUTCOME_UNKNOWN"),
    new WhatsAppProviderSendError("PROVIDER_RESULT_INVALID", "OUTCOME_UNKNOWN"),
    new WhatsAppProviderSendError("PROVIDER_REJECTED", "DEFINITE_FAILURE"),
  ]) {
    const { deps, outcomes } = fixture()
    const definite =
      error instanceof WhatsAppProviderSendError &&
      error.outcome === "DEFINITE_FAILURE"
    expect(
      await processAssistantChannelDelivery("out", {
        ...deps,
        send: async () => {
          throw error
        },
      }),
    ).toEqual({ status: definite ? "failed" : "unknown" })
    expect(outcomes).toEqual([{ kind: definite ? "rejected" : "unknown" }])
  }
})
test("database failure after acceptance never becomes a retryable provider rejection", async () => {
  const { deps, sends } = fixture()
  const outcomes: unknown[] = []
  await expect(
    processAssistantChannelDelivery("out", {
      ...deps,
      finish: async (_proof, outcome) => {
        outcomes.push(outcome)
        throw Error("database unavailable")
      },
    }),
  ).rejects.toThrow("database unavailable")
  expect(sends).toHaveLength(1)
  expect(outcomes).toEqual([
    { kind: "accepted", providerMessageId: "wamid.synthetic" },
  ])
})
test("an uncertain original response respects a receipt that already proved delivery", async () => {
  const { deps } = fixture()
  expect(
    await processAssistantChannelDelivery("out", {
      ...deps,
      send: async () => {
        throw Error("timeout")
      },
      finish: async () => ({ state: "READ" }),
    }),
  ).toEqual({ status: "sent" })
})

test("a window or grant deadline crossed after admission cancels before the provider call", async () => {
  const { deps, sends, outcomes } = fixture()
  const begin: ChannelDeliveryDependencies["begin"] = async (id, options) => {
    const claim = await deps.begin(id, options)
    return claim.kind === "started"
      ? { ...claim, dispatchBefore: new Date(0) }
      : claim
  }
  expect(
    await processAssistantChannelDelivery("out", { ...deps, begin }),
  ).toEqual({ status: "cancelled" })
  expect(sends).toEqual([])
  expect(outcomes).toEqual([{ kind: "cancelled" }])
})

test("public enrollment permits an admitted nonpilot but never bypasses canonical delivery admission", async () => {
  const previous = process.env.ASSISTANT_WHATSAPP_ROLLOUT_MODE
  process.env.ASSISTANT_WHATSAPP_ROLLOUT_MODE = "public"
  try {
    const { deps, sends } = fixture()
    const config = deps.config()
    if (!config) throw Error("Fixture configuration required")
    const publicDeps = {
      ...deps,
      config: () => ({ ...config, permittedUserIds: [] }),
    }
    expect(await processAssistantChannelDelivery("out", publicDeps)).toEqual({
      status: "sent",
    })
    expect(sends).toHaveLength(1)
    sends.length = 0
    expect(
      await processAssistantChannelDelivery("out", {
        ...publicDeps,
        begin: async () => ({ kind: "idle" as const }),
      }),
    ).toEqual({ status: "idle" })
    expect(sends).toHaveLength(0)
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_ROLLOUT_MODE")
    else process.env.ASSISTANT_WHATSAPP_ROLLOUT_MODE = previous
  }
})
