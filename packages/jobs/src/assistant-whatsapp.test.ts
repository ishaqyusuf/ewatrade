import { expect, test } from "bun:test"
import { recoverAssistantWhatsAppTurns } from "./assistant-whatsapp"

test("shared recovery clears private expiry while disabled and never dispatches", async () => {
  let listed = false
  expect(
    await recoverAssistantWhatsAppTurns({
      enabled: () => false,
      expire: async () => ({ cleared: 2 }),
      list: async () => {
        listed = true
        return []
      },
      enqueue: async () => {},
    }),
  ).toEqual({ cleared: 2, attempted: 0, queued: 0 })
  expect(listed).toBe(false)
})
test("recovery continues its bounded batch after one enqueue failure", async () => {
  const ids: string[] = []
  expect(
    await recoverAssistantWhatsAppTurns({
      enabled: () => true,
      expire: async () => ({ cleared: 1 }),
      list: async () => [{ id: "one" }, { id: "two" }],
      enqueue: async (id) => {
        ids.push(id)
        if (id === "one") throw Error("queue unavailable")
      },
    }),
  ).toEqual({ cleared: 1, attempted: 2, queued: 1 })
  expect(ids).toEqual(["one", "two"])
})

test("delivery recovery respects the switch and continues after an enqueue failure", async () => {
  const { recoverAssistantWhatsAppDeliveries } = await import(
    "./assistant-whatsapp"
  )
  let listed = 0
  const queued: string[] = []
  const deps = {
    enabled: () => false,
    list: async () => {
      listed++
      return [{ id: "one" }, { id: "two" }]
    },
    enqueue: async (id: string) => {
      queued.push(id)
      if (id === "one") throw Error("queue unavailable")
    },
  }
  expect(await recoverAssistantWhatsAppDeliveries(deps)).toEqual({
    attempted: 0,
    queued: 0,
  })
  expect(listed).toBe(0)
  expect(
    await recoverAssistantWhatsAppDeliveries({ ...deps, enabled: () => true }),
  ).toEqual({ attempted: 2, queued: 1 })
  expect(queued).toEqual(["one", "two"])
})
