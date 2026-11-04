import { describe, expect, mock, test } from "bun:test"
import { WhatsAppProviderSendError } from "@ewatrade/communications"
import type { InvitedRetailOpsStaff } from "@ewatrade/db/queries"
import { sendStaffInviteWhatsApp } from "./staff-invite-whatsapp"

function invited(
  phone: string | null,
  shouldSend = true,
): InvitedRetailOpsStaff {
  return {
    invite: {
      acceptanceToken: "a".repeat(43),
      id: "membership_1",
      invitedAt: new Date(),
      invitedByUserId: "owner",
      role: "CASHIER",
      status: "INVITED",
    },
    staff: {
      displayName: "Ada",
      email: "x@phone.ewatrade.invalid",
      id: "u",
      name: "Ada",
    },
    contacts: { email: null, phone },
    notification: { shouldSend },
    storeId: "store",
    tenantId: "tenant",
  }
}

function db() {
  const updates: unknown[] = []
  return {
    updates,
    client: {
      retailOpsStaffInviteToken: {
        findFirst: async () => ({ id: "token", metadata: null }),
        update: async ({ data }: { data: unknown }) => updates.push(data),
      },
    } as never,
  }
}

const liveEnv = { APP_ENV: "production", NODE_ENV: "production" }

describe("inline staff invite WhatsApp", () => {
  test("sends nothing for an email-only invite or a replay", async () => {
    const store = db()
    const sender = mock(async () => ({ messageId: "wamid" }))
    expect(
      await sendStaffInviteWhatsApp({
        db: store.client,
        businessName: "Shop",
        invitedStaff: invited(null),
        env: liveEnv,
        sender,
      }),
    ).toBeNull()
    expect(
      await sendStaffInviteWhatsApp({
        db: store.client,
        businessName: "Shop",
        invitedStaff: invited("+2348035550142", false),
        env: liveEnv,
        sender,
      }),
    ).toBeNull()
    expect(sender).not.toHaveBeenCalled()
    expect(store.updates).toEqual([])
  })

  test("records the outcome on the open invite", async () => {
    const store = db()
    expect(
      await sendStaffInviteWhatsApp({
        db: store.client,
        businessName: "Shop",
        invitedStaff: invited("+2348035550142"),
        env: liveEnv,
        sender: async () => ({ messageId: "wamid.9" }),
      }),
    ).toBe("SENT")
    expect(
      await sendStaffInviteWhatsApp({
        db: store.client,
        businessName: "Shop",
        invitedStaff: invited("+2348035550142"),
        env: liveEnv,
        sender: async () => {
          throw new WhatsAppProviderSendError(
            "PROVIDER_REJECTED",
            "DEFINITE_FAILURE",
          )
        },
      }),
    ).toBe("FAILED")
    expect(
      await sendStaffInviteWhatsApp({
        db: store.client,
        businessName: "Shop",
        invitedStaff: invited("+2348035550142"),
        env: liveEnv,
      }),
    ).toBe("NOT_CONFIGURED")
    expect(store.updates).toHaveLength(3)
  })

  test("local profile prints the link and never calls Meta", async () => {
    const store = db()
    const sender = mock(async () => ({ messageId: "wamid" }))
    const info = console.info
    const lines: string[] = []
    console.info = (line: string) => lines.push(line)
    try {
      expect(
        await sendStaffInviteWhatsApp({
          db: store.client,
          businessName: "Shop",
          invitedStaff: invited("+2348035550142"),
          env: {
            DEV_PROFILE: "local",
            APP_ENV: "local",
            NODE_ENV: "development",
            DASHBOARD_URL: "http://localhost:3001",
          },
          sender,
        }),
      ).toBe("LOCAL_ONLY")
    } finally {
      console.info = info
    }
    expect(sender).not.toHaveBeenCalled()
    expect(lines[0]).toContain("+234•••0142")
    expect(lines[0]).toContain("/staff-onboarding?inviteToken=")
  })
})
