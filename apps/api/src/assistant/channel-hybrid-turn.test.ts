import { expect, test } from "bun:test"
import {
  defaultChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import type { GeneralContext } from "./general-context"

const lease = {
  inboxId: "hybrid-ingress",
  bindingId: "binding",
  owner: "worker",
  generation: 2,
}
const principal = {
  kind: "linked_whatsapp" as const,
  bindingId: "binding",
  grantId: "grant",
  identityGeneration: 1,
  grantGeneration: 1,
  selectionGeneration: 1,
  phoneNumberId: "123456789",
  senderId: "2348000000000",
}

/** Exercise the real worker boundary; every database/provider/model effect is injected. */
function fixture(content: unknown, expectedText = "How much rice is left?") {
  const calls: string[] = []
  let models = 0
  const inbox = {
    id: lease.inboxId,
    kind: "TURN" as const,
    requestId: "hybrid-request",
    userMessageId: "user-message",
    content,
  }
  const ctx = {} as GeneralContext
  const deps = defaultChannelTurnDependencies()
  deps.enabled = () => true
  deps.control = async () => {
    calls.push("control")
    return null
  }
  deps.claim = async (id) => {
    expect(id).toBe(lease.inboxId)
    calls.push("claim")
    return {
      kind: "claimed",
      principal,
      lease,
      inbox,
      conversationId: "saved-chat",
      purpose: "GENERAL",
    } as unknown as Awaited<ReturnType<typeof deps.claim>>
  }
  deps.recover = async (proof) => {
    expect(proof).toBe(lease)
    calls.push("recover")
    return null
  }
  deps.context = async (actor, requestId, proof) => {
    expect(actor).toBe(principal)
    expect(requestId).toBe(inbox.requestId)
    expect(proof).toBe(lease)
    calls.push("context")
    return ctx
  }
  deps.readPage = async (context, proof, input) => {
    expect(context).toBe(ctx)
    expect(proof).toBe(lease)
    expect(input).toBe(inbox)
    calls.push("read-page")
    return Boolean(
      content &&
        typeof content === "object" &&
        "type" in content &&
        content.type === "read_page",
    )
  }
  deps.flow = async (context, proof, input) => {
    expect(context).toBe(ctx)
    expect(proof).toBe(lease)
    expect(input).toBe(inbox)
    calls.push("flow")
    return Boolean(
      content &&
        typeof content === "object" &&
        "type" in content &&
        ["native_flow", "invalid_native_flow"].includes(String(content.type)),
    )
  }
  deps.prepareMedia = async () => {
    throw Error("Deterministic forms/pages must not enter media preparation")
  }
  deps.createTurn = async (context, input) => {
    expect(context).toBe(ctx)
    expect(input).toEqual({
      conversationId: "saved-chat",
      requestId: inbox.requestId,
      message: {
        id: inbox.userMessageId,
        role: "user",
        parts: [{ type: "text", text: expectedText }],
      },
    })
    calls.push("model")
    models++
    return {
      runId: "run",
      stream: new ReadableStream({
        pull(controller) {
          calls.push("stream-drained")
          controller.close()
        },
      }),
      completion: Promise.resolve({
        runId: "run",
        status: "COMPLETED",
        persisted: true,
        assistantMessageId: "saved-answer",
      }),
    }
  }
  deps.settle = async (proof, errorCode) => {
    expect(proof).toBe(lease)
    expect(errorCode).toBeUndefined()
    calls.push("settle")
    return { state: "COMPLETED" } as Awaited<ReturnType<typeof deps.settle>>
  }
  deps.next = async (bindingId) => {
    expect(bindingId).toBe(lease.bindingId)
    calls.push("next")
    return null
  }
  deps.retry = async () => {
    throw Error("Successful deterministic handling must not retry")
  }
  return { deps, calls, models: () => models }
}

test("a durable text burst enters one shared turn without exposing inbox metadata to the model", async () => {
  const text =
    "Create product Egg\n\nSmall price 150 naira\n\nBig price 200 naira"
  const f = fixture(
    {
      type: "text",
      text,
      burst: {
        originalText: "Create product Egg",
        sourceIds: ["in-2", "in-3"],
      },
    },
    text,
  )
  expect(await processAssistantChannelTurn(lease.inboxId, f.deps)).toEqual({
    status: "completed",
  })
  expect(f.models()).toBe(1)
  expect(f.calls.filter((call) => call === "settle")).toHaveLength(1)
})

for (const type of ["native_flow", "invalid_native_flow"] as const) {
  test(`${type} settles through the real worker before media/model processing`, async () => {
    const f = fixture({
      type,
      tokenDigest: "a".repeat(64),
      data: { form_kind: "customer" },
    })
    expect(await processAssistantChannelTurn(lease.inboxId, f.deps)).toEqual({
      status: "completed",
    })
    expect(f.calls).toEqual([
      "control",
      "claim",
      "recover",
      "context",
      "read-page",
      "flow",
      "settle",
      "next",
    ])
    expect(f.models()).toBe(0)
  })
}

test("a saved read page settles before Flow, media or model processing", async () => {
  const f = fixture({ type: "read_page", cursor: "saved-page" })
  expect(await processAssistantChannelTurn(lease.inboxId, f.deps)).toEqual({
    status: "completed",
  })
  expect(f.calls).toEqual([
    "control",
    "claim",
    "recover",
    "context",
    "read-page",
    "settle",
    "next",
  ])
  expect(f.models()).toBe(0)
})

test("ordinary text keeps the shared assistant and drains its saved reply before settlement", async () => {
  const f = fixture({ type: "text", text: "How much rice is left?" })
  expect(await processAssistantChannelTurn(lease.inboxId, f.deps)).toEqual({
    status: "completed",
  })
  expect(f.calls).toEqual([
    "control",
    "claim",
    "recover",
    "context",
    "read-page",
    "flow",
    "model",
    "stream-drained",
    "settle",
    "next",
  ])
  expect(f.models()).toBe(1)
})

test("a valid saved reply choice supplies only plain user text to the shared assistant", async () => {
  const content = {
    type: "reply_choice",
    command: {
      kind: "reply_choice",
      index: 1,
      replyToMessageId: "sent-question",
    },
  }
  const f = fixture(content)
  f.deps.replyChoice = async (_ctx, proof, input) => {
    expect(proof).toBe(lease)
    expect(input.content).toEqual(content)
    f.calls.push("reply-choice")
    return { kind: "input", text: "How much rice is left?" }
  }
  f.deps.flow = async (_ctx, proof, input) => {
    expect(proof).toBe(lease)
    expect(input.content).toEqual({
      type: "text",
      text: "How much rice is left?",
    })
    f.calls.push("flow")
    return false
  }
  expect(await processAssistantChannelTurn(lease.inboxId, f.deps)).toEqual({
    status: "completed",
  })
  expect(f.calls).toEqual([
    "control",
    "claim",
    "recover",
    "context",
    "reply-choice",
    "read-page",
    "flow",
    "model",
    "stream-drained",
    "settle",
    "next",
  ])
  expect(f.models()).toBe(1)
})

test("invalid or stale saved reply choices settle before media, forms or model work", async () => {
  for (const type of ["reply_choice", "invalid_reply_choice"]) {
    const content = {
      type,
      command: {
        kind: "reply_choice",
        index: 1,
        replyToMessageId: "expired-question",
      },
    }
    const f = fixture(content)
    f.deps.replyChoice = async (_ctx, proof, input) => {
      expect(proof).toBe(lease)
      expect(input.content).toEqual(content)
      f.calls.push("reply-choice")
      return { kind: "completed" }
    }
    expect(await processAssistantChannelTurn(lease.inboxId, f.deps)).toEqual({
      status: "completed",
    })
    expect(f.calls).toEqual([
      "control",
      "claim",
      "recover",
      "context",
      "reply-choice",
      "settle",
      "next",
    ])
    expect(f.models()).toBe(0)
  }
})
