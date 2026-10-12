import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { EmailDeliveryReceipt, EmailMessage } from "@ewatrade/email"
import { createStaffInvitationEmailAdapter } from "./staff-invitation-email"

const config = {
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "EwaTrade <invite@example.com>",
  RESEND_API_KEY: "provider-free-test-value",
  EMAIL_QA_DOMAIN_ROUTES: '{"ishaq.qa.test":"tester@example.com"}',
}
const message: EmailMessage = {
  from: config.EMAIL_FROM,
  to: "amina@ishaq.qa.test",
  subject: "Invitation",
  html: "<p>Ephemeral test invitation</p>",
  text: "Ephemeral test invitation",
  idempotencyKey: "staff-invitation:notification",
  tags: [
    { name: "category", value: "staff_invitation" },
    { name: "destination_digest", value: "old" },
  ],
}

function fixture(
  env: NodeJS.ProcessEnv = config,
  receipt: EmailDeliveryReceipt | undefined = {
    provider: "resend",
    providerMessageId: "receipt",
  },
) {
  const sent: EmailMessage[] = []
  const guards: unknown[] = []
  const adapter = createStaffInvitationEmailAdapter(
    env,
    {
      send: async (value) => {
        sent.push(value)
        return receipt
      },
    },
    async (value) => {
      guards.push(value)
    },
  )
  return { adapter, guards, sent }
}

describe("staff invitation guarded email adapter", () => {
  test("configuration refusal happens before provider guard or transport", async () => {
    for (const patch of [
      { EMAIL_DELIVERY_MODE: "console" },
      { EMAIL_CAPTURE_FILE: "/tmp/not-written" },
      { RESEND_API_KEY: "" },
      { EMAIL_FROM: "invalid" },
    ]) {
      const f = fixture({ ...config, ...patch })
      await expect(
        f.adapter.assertProviderAllowed({
          tenantId: "tenant",
          recipient: message.to,
        }),
      ).rejects.toThrow("not configured")
      await expect(f.adapter.send(message)).rejects.toThrow("not configured")
      expect(f.sent).toEqual([])
      expect(f.guards).toEqual([])
    }
  })
  test("one QA destination retains original recipient and stable provider identity", async () => {
    const f = fixture()
    await f.adapter.assertProviderAllowed({
      tenantId: "tenant",
      recipient: message.to,
    })
    expect(f.guards).toEqual([
      { tenantId: "tenant", operation: "email", qaEmailRouted: true },
    ])
    expect(await f.adapter.send(message)).toEqual({
      providerKey: "resend",
      providerMessageId: "receipt",
    })
    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]).toMatchObject({
      to: "tester@example.com",
      qaRouted: true,
      qaOriginalRecipient: message.to,
      idempotencyKey: message.idempotencyKey,
      tags: [
        { name: "category", value: "staff_invitation" },
        {
          name: "destination_digest",
          value: createHash("sha256")
            .update("tester@example.com")
            .digest("hex"),
        },
      ],
    })
  })
  test("unmatched QA domains and multi-recipient test routing refuse before sending", async () => {
    const unmatched = fixture()
    await expect(
      unmatched.adapter.assertProviderAllowed({
        tenantId: "tenant",
        recipient: "staff@other.test",
      }),
    ).rejects.toThrow("unmatched")
    expect(unmatched.guards).toEqual([])
    const many = fixture({
      ...config,
      TEST_EMAILS: "one@example.com,two@example.com",
    })
    await expect(
      many.adapter.assertProviderAllowed({
        tenantId: "tenant",
        recipient: "staff@test.com",
      }),
    ).rejects.toThrow("one delivery destination")
    await expect(
      many.adapter.send({ ...message, to: "staff@test.com" }),
    ).rejects.toThrow("identity")
    expect(many.sent).toEqual([])
  })
  test("policy refusal stops dispatch and console/capture/missing receipts never certify acceptance", async () => {
    let sends = 0
    const blocked = createStaffInvitationEmailAdapter(
      config,
      {
        send: async () => {
          sends++
          return undefined
        },
      },
      async () => {
        throw Error("QA policy blocked")
      },
    )
    await expect(
      blocked.assertProviderAllowed({
        tenantId: "tenant",
        recipient: message.to,
      }),
    ).rejects.toThrow("QA policy blocked")
    expect(sends).toBe(0)
    for (const receipt of [
      undefined,
      { provider: "console", providerMessageId: "console" },
      { provider: "capture", providerMessageId: "capture" },
      { provider: "resend", providerMessageId: " " },
    ]) {
      // Explicit undefined must reach the fake transport, rather than a default fixture receipt.
      const adapter = createStaffInvitationEmailAdapter(
        config,
        { send: async () => receipt },
        async () => {},
      )
      await expect(adapter.send(message)).rejects.toThrow("unconfirmed")
    }
  })
})
