import { expect, test } from "bun:test"
import {
  offlineCommandScope,
  ownsOfflineCommand,
  scopedOfflineCommands,
} from "./offline-command-scope"

const owner = {
  actorUserId: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
}

test("local queue scope requires original actor, business and Store", () => {
  expect(
    offlineCommandScope({
      id: "actor-a",
      businessId: "business-a",
      storeId: "store-a",
    }),
  ).toEqual(owner)
  for (const profile of [
    null,
    undefined,
    {},
    { id: "actor-a" },
    { id: "actor-a", businessId: "business-a" },
    { id: " ", businessId: "business-a", storeId: "store-a" },
  ])
    expect(offlineCommandScope(profile)).toBeNull()
})

test("same-business users and Store switches cannot adopt an offline command", () => {
  expect(ownsOfflineCommand(owner, owner)).toBe(true)
  for (const scope of [
    null,
    { ...owner, actorUserId: "actor-b" },
    { ...owner, businessId: "business-b" },
    { ...owner, storeId: "store-b" },
  ])
    expect(ownsOfflineCommand(owner, scope)).toBe(false)
})

test("legacy records stay intact and withheld instead of taking the current owner", () => {
  const legacy = {
    businessId: "business-a",
    payload: { customerName: "Retained privately" },
  }
  const current = { ...owner, payload: { customerName: "Current owner" } }
  const other = {
    ...owner,
    actorUserId: "actor-b",
    payload: { customerName: "Other owner" },
  }
  const commands = [legacy, current, other]
  const original = JSON.stringify(commands)
  expect(scopedOfflineCommands(commands, owner)).toEqual([current])
  expect(scopedOfflineCommands(commands, null)).toEqual([])
  expect(JSON.stringify(commands)).toBe(original)
})
