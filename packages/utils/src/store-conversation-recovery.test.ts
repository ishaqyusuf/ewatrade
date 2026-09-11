import { describe, expect, test } from "bun:test"

import {
  drainMountedStoreConversationActionRecovery,
  drainStoreConversationRecovery,
} from "./store-conversation-recovery"

describe("Store Conversation recovery", () => {
  test("drains every bounded page without gaps", async () => {
    const calls: number[] = []
    const result = await drainStoreConversationRecovery({
      afterSequence: 4,
      fetchPage: async (afterSequence) => {
        calls.push(afterSequence)
        return afterSequence === 4
          ? {
              messages: [{ sequence: 5 }, { sequence: 6 }],
              nextCursor: 6,
            }
          : { messages: [{ sequence: 7 }], nextCursor: null }
      },
      sequenceOf: (message: { sequence: number }) => message.sequence,
    })

    expect(calls).toEqual([4, 6])
    expect(result.messages.map((message) => message.sequence)).toEqual([
      5, 6, 7,
    ])
    expect(result.throughSequence).toBe(7)
  })

  test("fails closed when a cursor cannot advance", async () => {
    await expect(
      drainStoreConversationRecovery({
        afterSequence: 4,
        fetchPage: async () => ({ messages: [], nextCursor: 4 }),
        sequenceOf: (message: { sequence: number }) => message.sequence,
      }),
    ).rejects.toThrow("did not advance")
  })

  test("refreshes every mounted action through bounded server batches", async () => {
    const actionMessageIds = Array.from(
      { length: 205 },
      (_, index) => `message_${index + 1}`,
    )
    const batches: string[][] = []

    const result = await drainMountedStoreConversationActionRecovery({
      actionMessageIds,
      afterSequence: 7,
      fetchPage: async (batch, afterSequence) => {
        batches.push(batch)
        return {
          messages:
            batches.length === 1 ? [{ id: "message_206", sequence: 8 }] : [],
          nextCursor: null,
          throughSequence: afterSequence,
        }
      },
      sequenceOf: (message: { id: string; sequence: number }) =>
        message.sequence,
    })

    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5])
    expect(batches.flat()).toEqual(actionMessageIds)
    expect(result.messages).toEqual([{ id: "message_206", sequence: 8 }])
    expect(result.throughSequence).toBe(8)
  })

  test("still performs one recovery read when no action is mounted", async () => {
    const batches: string[][] = []
    await drainMountedStoreConversationActionRecovery({
      actionMessageIds: [],
      afterSequence: 0,
      fetchPage: async (batch) => {
        batches.push(batch)
        return { messages: [], nextCursor: null }
      },
      sequenceOf: (message: { sequence: number }) => message.sequence,
    })

    expect(batches).toEqual([[]])
  })
})
