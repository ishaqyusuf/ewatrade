import { expect, test } from "bun:test"
import {
  queueCreatedAt,
  queueItemTitle,
  queueStatusLabel,
} from "./queue-display"
test("queued rows name customers and preserve pending versus approval", () => {
  expect(queueItemTitle({ customerName: " Aisha ", lines: [{}] })).toBe(
    "Aisha · 1 item",
  )
  expect(queueItemTitle({})).toBe("Walk-in customer")
  expect(queueStatusLabel("pending")).toBe("Waiting to sync")
  expect(queueStatusLabel("approval")).toBe("Waiting for approval")
  expect(queueStatusLabel("unknown")).toBe("Status unavailable")
})

test("unknown queue times stay unknown", () => {
  expect(queueCreatedAt({})).toBe("Time unavailable")
  expect(queueCreatedAt("invalid")).toBe("Time unavailable")
})
