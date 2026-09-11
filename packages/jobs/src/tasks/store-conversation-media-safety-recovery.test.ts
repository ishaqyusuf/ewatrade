import { describe, expect, test } from "bun:test"

import {
  StoreConversationMediaSafetyRecoveryError,
  runStoreConversationMediaSafetyRecovery,
} from "./store-conversation-media-safety-recovery"

const generic = {
  kind: "generic" as const,
  mediaAssetId: "media-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}
const prescription = {
  kind: "prescription" as const,
  requestId: "prescription-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

describe("Store Conversation media safety recovery", () => {
  test("queues only bounded identifier-only work across pages", async () => {
    const calls: unknown[] = []
    const result = await runStoreConversationMediaSafetyRecovery(
      {},
      {
        enqueue: async (work) => calls.push(["enqueue", work]),
        list: async (input) => {
          calls.push(["list", input])
          return input.cursor
            ? { items: [prescription], nextCursor: null }
            : { items: [generic], nextCursor: "cursor-1" }
        },
        prepare: async (work) => {
          calls.push(["prepare", work])
          return work
        },
      },
    )

    expect(result).toEqual({
      failed: 0,
      nextCursor: null,
      queued: 2,
      scanned: 2,
    })
    expect(calls).toEqual([
      ["list", { limit: 100 }],
      ["prepare", generic],
      ["enqueue", generic],
      ["list", { cursor: "cursor-1", limit: 100 }],
      ["enqueue", prescription],
    ])
    const serialized = JSON.stringify(calls)
    expect(serialized).not.toContain("objectKey")
    expect(serialized).not.toContain("provider")
    expect(serialized).not.toContain("content")
  })

  test("attempts the whole page, reports a partial failure, and is safe to retry", async () => {
    let attempt = 0
    const queued: string[] = []
    const dependencies = {
      enqueue: async (work: typeof generic | typeof prescription) => {
        queued.push(work.kind)
        if (attempt === 0 && work.kind === "prescription") {
          throw new Error("queue unavailable")
        }
      },
      list: async () => ({ items: [generic, prescription], nextCursor: null }),
      prepare: async (work: typeof generic) => work,
    }

    const first = runStoreConversationMediaSafetyRecovery({}, dependencies)
    await expect(first).rejects.toBeInstanceOf(
      StoreConversationMediaSafetyRecoveryError,
    )
    await expect(first).rejects.toMatchObject({
      result: { failed: 1, queued: 1, scanned: 2 },
    })
    expect(queued.toSorted()).toEqual(["generic", "prescription"])

    attempt = 1
    await expect(
      runStoreConversationMediaSafetyRecovery({}, dependencies),
    ).resolves.toEqual({
      failed: 0,
      nextCursor: null,
      queued: 2,
      scanned: 2,
    })
    expect(queued.toSorted()).toEqual([
      "generic",
      "generic",
      "prescription",
      "prescription",
    ])
  })

  test("prepares stored or retryable generic media before it reaches the safety handler", async () => {
    const calls: unknown[] = []
    await expect(
      runStoreConversationMediaSafetyRecovery(
        {},
        {
          enqueue: async (work) => calls.push(["enqueue", work]),
          list: async () => ({ items: [generic], nextCursor: null }),
          prepare: async (work) => {
            calls.push(["prepare", work])
            return work
          },
        },
      ),
    ).resolves.toEqual({
      failed: 0,
      nextCursor: null,
      queued: 1,
      scanned: 1,
    })
    expect(calls).toEqual([
      ["prepare", generic],
      ["enqueue", generic],
    ])
  })

  test("returns an opaque continuation after 500 rows so later work cannot starve", async () => {
    let maxConcurrent = 0
    let concurrent = 0
    const listed: string[] = []
    const dependencies = {
      enqueue: async () => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await Promise.resolve()
        concurrent -= 1
      },
      list: async (input: { cursor?: string }) => {
        listed.push(input.cursor ?? "start")
        const pageNumber = input.cursor
          ? Number(input.cursor.replace("cursor-", "")) + 1
          : 1
        const count = pageNumber <= 5 ? 100 : 1
        return {
          items: Array.from({ length: count }, (_, index) => ({
            kind: "generic" as const,
            mediaAssetId: `media-${pageNumber}-${index}`,
            storeId: "store-1",
            tenantId: "tenant-1",
          })),
          nextCursor: pageNumber <= 5 ? `cursor-${pageNumber}` : null,
        }
      },
      prepare: async (work: typeof generic) => work,
    }

    const first = await runStoreConversationMediaSafetyRecovery(
      {},
      dependencies,
    )
    expect(first).toEqual({
      failed: 0,
      nextCursor: "cursor-5",
      queued: 500,
      scanned: 500,
    })
    const continuation = await runStoreConversationMediaSafetyRecovery(
      { cursor: first.nextCursor ?? undefined },
      dependencies,
    )
    expect(continuation).toEqual({
      failed: 0,
      nextCursor: null,
      queued: 1,
      scanned: 1,
    })
    expect(listed).toEqual([
      "start",
      "cursor-1",
      "cursor-2",
      "cursor-3",
      "cursor-4",
      "cursor-5",
    ])
    expect(maxConcurrent).toBeLessThanOrEqual(10)
  })
})
