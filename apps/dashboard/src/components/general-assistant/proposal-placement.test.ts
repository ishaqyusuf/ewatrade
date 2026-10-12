import { expect, test } from "bun:test"
import { placeProposals } from "./proposal-placement"

const t = (minute: number) => Date.UTC(2026, 9, 12, 10, minute)
const iso = (minute: number) => new Date(t(minute)).toISOString()
const messages = [
  { id: "u1", role: "user" },
  { id: "a1", role: "assistant" },
  { id: "u2", role: "user" },
  { id: "a2", role: "assistant" },
]
const times = new Map([
  ["u1", t(0)],
  ["a1", t(2)],
  ["u2", t(5)],
  ["a2", t(7)],
])

test("each draft shows after the reply of the turn that created it", () => {
  const { after, rest } = placeProposals(messages, times, [
    { id: "p1", createdAt: iso(1) },
    { id: "p2", createdAt: iso(6) },
    { id: "p3", createdAt: iso(6) },
  ])
  expect(after.get("a1")?.map((p) => p.id)).toEqual(["p1"])
  expect(after.get("a2")?.map((p) => p.id)).toEqual(["p2", "p3"])
  expect(rest).toEqual([])
})

test("drafts without a time stay at the end", () => {
  const { after, rest } = placeProposals(messages, times, [{ id: "old" }])
  expect(after.size).toBe(0)
  expect(rest.map((p) => p.id)).toEqual(["old"])
})

test("a reply still streaming takes its turn's drafts", () => {
  const streaming = [
    ...messages,
    { id: "u3", role: "user" },
    { id: "a3", role: "assistant" },
  ]
  const { after } = placeProposals(streaming, times, [
    { id: "new", createdAt: iso(9) },
  ])
  expect(after.get("a3")?.map((p) => p.id)).toEqual(["new"])
})

test("before its reply arrives, a draft waits under the user message", () => {
  const waiting = [...messages, { id: "u3", role: "user" }]
  const { after } = placeProposals(waiting, times, [
    { id: "new", createdAt: iso(9) },
  ])
  expect(after.get("u3")?.map((p) => p.id)).toEqual(["new"])
})
