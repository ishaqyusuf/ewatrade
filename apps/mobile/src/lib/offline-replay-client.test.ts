import { expect, test } from "bun:test"
import type { OfflineReplayBatch } from "@/store/offlineCommandStore"
import {
  registerInput,
  replayInput,
  replayableBatch,
} from "./offline-replay-client"

const at = new Date("2026-10-17T08:00:00.000Z")
const command = (id: string) =>
  ({
    clientCommandId: id,
    createdAtClient: at,
    dependencyClientIds: [],
    eventVersion: 1,
    payload: { type: "commercial_order.create" },
  }) as unknown as OfflineReplayBatch["commands"][number]

const batch: OfflineReplayBatch = {
  scope: {
    actorUserId: "actor-a",
    businessId: "business-a",
    storeId: "store-a",
  },
  deviceId: "device-partition-a",
  commands: [command("command-0001"), command("command-0002")],
}

test("narrowing keeps the captured scope and device and drops empty batches", () => {
  const narrowed = replayableBatch(batch, (id) => id === "command-0002")
  expect(narrowed?.scope).toBe(batch.scope)
  expect(narrowed?.deviceId).toBe("device-partition-a")
  expect(narrowed?.commands.map((c) => c.clientCommandId)).toEqual([
    "command-0002",
  ])
  expect(replayableBatch(batch, () => false)).toBeNull()
  expect(replayableBatch(null)).toBeNull()
})

test("replay sends the batch's own device and original Store only", () => {
  expect(replayInput(batch)).toEqual({
    commands: [
      {
        clientCommandId: "command-0001",
        createdAtClient: at,
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { type: "commercial_order.create" },
      },
      {
        clientCommandId: "command-0002",
        createdAtClient: at,
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { type: "commercial_order.create" },
      },
    ],
    deviceId: "device-partition-a",
    storeId: "store-a",
  })
})

test("registration binds the partition device and Store", () => {
  expect(registerInput(batch, { appVersion: "1.2.0", os: "android" })).toEqual({
    appVersion: "1.2.0",
    deviceId: "device-partition-a",
    deviceName: "android device",
    platform: "android",
    storeId: "store-a",
  })
  expect(registerInput(batch, { os: "macos" }).platform).toBe("unknown")
})

test("an unfiltered batch is the exact issued object", () => {
  expect(replayableBatch(batch)).toBe(batch)
  expect(replayableBatch(batch, () => true)).toBe(batch)
})
