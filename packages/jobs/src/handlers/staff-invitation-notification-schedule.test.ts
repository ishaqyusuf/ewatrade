import { describe, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import {
  type StaffInvitationScheduleDependencies,
  runStaffInvitationNotificationSchedule,
} from "./staff-invitation-notification-schedule"

const config = {
  STAFF_INVITATION_NOTIFICATIONS_ENABLED: "true",
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "invite@example.com",
  RESEND_API_KEY: "provider-free-test-value",
  STAFF_INVITATION_ENCRYPTION_KEY_ID: "ephemeral-test",
  STAFF_INVITATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}

describe("staff invitation outbox discovery", () => {
  test("disabled gate performs no database discovery or queue submission", async () => {
    let calls = 0
    const deps: StaffInvitationScheduleDependencies = {
      listDue: async () => {
        calls++
        return []
      },
      enqueue: async () => {
        calls++
      },
    }
    expect(await runStaffInvitationNotificationSchedule({}, deps)).toEqual({
      enabled: false,
      notificationsQueued: 0,
    })
    expect(calls).toBe(0)
  })
  test("bounded discovery projects only identities and awaits every enqueue", async () => {
    const now = new Date("2026-10-12T12:00:00Z")
    const calls: unknown[] = []
    const deps: StaffInvitationScheduleDependencies = {
      listDue: async (input) => {
        calls.push(input)
        return [
          { tenantId: "tenant-a", id: "one" },
          { tenantId: "tenant-b", id: "two" },
        ]
      },
      enqueue: async (input) => {
        calls.push(input)
      },
    }
    expect(
      await runStaffInvitationNotificationSchedule(config, deps, now),
    ).toEqual({ enabled: true, notificationsQueued: 2 })
    expect(calls).toEqual([
      { limit: 100, now },
      { tenantId: "tenant-a", notificationId: "one" },
      { tenantId: "tenant-b", notificationId: "two" },
    ])
  })
  test("partial enqueue failure is reported without private errors and remaining submissions finish", async () => {
    const queued: string[] = []
    await expect(
      runStaffInvitationNotificationSchedule(config, {
        listDue: async () => [
          { tenantId: "tenant", id: "one" },
          { tenantId: "tenant", id: "two" },
        ],
        enqueue: async ({ notificationId }) => {
          queued.push(notificationId)
          if (notificationId === "one") throw Error("private queue context")
        },
      }),
    ).rejects.toThrow("Could not queue 1 staff invitation notification(s).")
    expect(queued).toEqual(["one", "two"])
  })
  test("incomplete live configuration leaves pending outbox unclaimed and undiscovered", async () => {
    let calls = 0
    const deps: StaffInvitationScheduleDependencies = {
      listDue: async () => {
        calls++
        return []
      },
      enqueue: async () => {
        calls++
      },
    }
    for (const patch of [
      { RESEND_API_KEY: "" },
      { STAFF_INVITATION_ENCRYPTION_KEY: "" },
      { STAFF_INVITATION_DECRYPTION_KEYS: "not-json" },
    ])
      expect(
        await runStaffInvitationNotificationSchedule(
          { ...config, ...patch },
          deps,
        ),
      ).toEqual({
        enabled: true,
        deliveryConfigured: false,
        notificationsQueued: 0,
      })
    expect(calls).toBe(0)
  })
})
