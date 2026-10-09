import { expect, test } from "bun:test"
import { customerSyncLabel } from "./customer-sync-label"
test("queued work stays visible alongside synced history", () => {
  expect(customerSyncLabel(3, 1)).toBe("1 waiting to sync")
  expect(customerSyncLabel(0, 2)).toBe("2 waiting to sync")
  expect(customerSyncLabel(3, 0)).toBe("Synced")
  expect(customerSyncLabel(0, 0)).toBe("Saved")
})
