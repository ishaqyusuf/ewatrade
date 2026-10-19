import { expect, test } from "bun:test"
import {
  ASSISTANT_DATA_MAX_BYTES,
  type AssistantDataTransferDependencies,
  AssistantDataTransferError,
  assistantDataTransferMessage,
  shareAssistantData,
} from "./assistant-data-transfer"

const archive = JSON.stringify({
  version: 1,
  scope: "own_private_assistant",
  originals: [],
  conversations: [{ text: "Private owner prose" }],
})
function harness() {
  let identity = { userId: "owner", token: "real-own-token" }
  const events: string[] = []
  const deps: AssistantDataTransferDependencies = {
    baseUrl: "https://api.example.test/",
    currentIdentity: () => identity,
    isCurrent: () => true,
    fetch: async (url, init) => {
      expect(url).toBe("https://api.example.test/api/assistant/private-export")
      expect(init).toMatchObject({
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
        headers: { "x-app-authorization": "Bearer real-own-token" },
      })
      expect(JSON.stringify(init.headers)).not.toContain("tenant")
      return new Response(archive, {
        headers: { "content-type": "application/json" },
      })
    },
    createFile: async (bytes) => {
      expect(new TextDecoder().decode(bytes)).toBe(archive)
      events.push("create-owned")
      return {
        uri: "file:///owned/generated/assistant.json",
        remove: async () => {
          events.push("remove-owned")
        },
      }
    },
    share: async (uri, current) => {
      current()
      expect(uri).toBe("file:///owned/generated/assistant.json")
      events.push("share-owned")
    },
  }
  return {
    deps,
    events,
    switchAccount: () => {
      identity = { userId: "other-owner", token: "other-token" }
    },
  }
}

test("own export uses a private authenticated bounded response and removes its generated file after sharing", async () => {
  const h = harness()
  await shareAssistantData(h.deps, new AbortController().signal)
  expect(h.events).toEqual(["create-owned", "share-owned", "remove-owned"])
})

test("declared and streamed overflow refuse before any file or share", async () => {
  for (const declared of [true, false]) {
    const h = harness()
    h.deps.fetch = async () =>
      new Response(
        declared ? "" : new Uint8Array(ASSISTANT_DATA_MAX_BYTES + 1),
        {
          headers: {
            "content-type": "application/json",
            ...(declared
              ? { "content-length": String(ASSISTANT_DATA_MAX_BYTES + 1) }
              : {}),
          },
        },
      )
    await expect(
      shareAssistantData(h.deps, new AbortController().signal),
    ).rejects.toMatchObject({ code: "LIMIT" })
    expect(h.events).toEqual([])
  }
})

test("an account change while reading refuses before writing or sharing another owner's bytes", async () => {
  const h = harness()
  h.deps.fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          h.switchAccount()
          controller.enqueue(new TextEncoder().encode(archive))
          controller.close()
        },
      }),
      { headers: { "content-type": "application/json" } },
    )
  await expect(
    shareAssistantData(h.deps, new AbortController().signal),
  ).rejects.toMatchObject({ code: "CHANGED" })
  expect(h.events).toEqual([])
})

test("logout or blur removes the owned copy even while the native share sheet is unresolved", async () => {
  const h = harness()
  let entered = () => {}
  const sharing = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release = () => {}
  const pendingShare = new Promise<void>((resolve) => {
    release = resolve
  })
  h.deps.share = async (_uri, current) => {
    current()
    entered()
    await pendingShare
  }
  const controller = new AbortController()
  const result = shareAssistantData(h.deps, controller.signal)
  try {
    await sharing
    controller.abort()
    await Promise.resolve()
    expect(h.events).toEqual(["create-owned", "remove-owned"])
  } finally {
    release()
  }
  await expect(result).rejects.toMatchObject({ code: "CANCELLED" })
  expect(h.events.filter((event) => event === "remove-owned")).toHaveLength(1)
})

test("sharing rechecks the current identity and cleanup failures remain explicit without raw server errors", async () => {
  const h = harness()
  h.deps.share = async (_uri, current) => {
    h.switchAccount()
    current()
  }
  await expect(
    shareAssistantData(h.deps, new AbortController().signal),
  ).rejects.toMatchObject({ code: "CHANGED" })
  expect(h.events).toEqual(["create-owned", "remove-owned"])
  h.deps.currentIdentity = () => ({ userId: "owner", token: "qas_derived" })
  await expect(
    shareAssistantData(h.deps, new AbortController().signal),
  ).rejects.toMatchObject({ code: "SIGN_IN" })
  const failed = harness()
  failed.deps.createFile = async () => ({
    uri: "file:///owned/generated/assistant.json",
    remove: async () => {
      throw Error("Private filesystem detail")
    },
  })
  await expect(
    shareAssistantData(failed.deps, new AbortController().signal),
  ).rejects.toMatchObject({ code: "CLEANUP_FAILED" })
  expect(
    assistantDataTransferMessage(new Error("private server payload")),
  ).not.toContain("private server payload")
  expect(
    assistantDataTransferMessage(new AssistantDataTransferError("SIGN_IN")),
  ).toContain("Sign in again")
})
