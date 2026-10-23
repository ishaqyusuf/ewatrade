import { expect, test } from "bun:test"
import type { NormalizedWhatsAppMessageEvent } from "@ewatrade/communications"
import { processPlatformWhatsAppEvent } from "./whatsapp-platform-runtime"

const configured = {
  WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_OTP_ACCESS_TOKEN: "test-only",
  ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
  ASSISTANT_WHATSAPP_ENABLED: "true",
}
const message = (
  text: string,
  phoneNumberId = "123456789",
): NormalizedWhatsAppMessageEvent => ({
  kind: "message",
  phoneNumberId,
  messageId: "test-message",
  externalCustomerId: "2348000000001",
  text,
  type: "text",
})

test("platform sender routing does not leak OTP codes, statuses or disabled traffic into customer flow", async () => {
  const claims: unknown[] = []
  const disconnects: unknown[] = []
  const deps = {
    env: configured,
    accept: async () => ({
      kind: "ignored" as const,
      reason: "unlinked" as const,
    }),
    enqueue: async () => {},
    claim: async (input: unknown) => {
      claims.push(input)
      return true
    },
    disconnect: async (input: unknown) => {
      disconnects.push(input)
      return { disconnected: true }
    },
  }
  expect(await processPlatformWhatsAppEvent(message("123456"), deps)).toBe(true)
  expect(
    await processPlatformWhatsAppEvent(
      {
        kind: "status",
        phoneNumberId: "123456789",
        messageId: "otp-outbound",
        status: "delivered",
      },
      deps,
    ),
  ).toBe(true)
  expect(
    await processPlatformWhatsAppEvent(message("hello"), {
      ...deps,
      env: { WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789" },
    }),
  ).toBe(true)
  expect(
    await processPlatformWhatsAppEvent(
      message("hello", "customer-number"),
      deps,
    ),
  ).toBe(false)
  expect(claims).toEqual([])
  expect(
    await processPlatformWhatsAppEvent(message("Disconnect EwaTrade"), {
      ...deps,
      env: { WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789" },
    }),
  ).toBe(true)
  expect(disconnects).toEqual([
    { phoneNumberId: "123456789", senderId: "2348000000001" },
  ])
  const code = "a".repeat(43)
  expect(
    await processPlatformWhatsAppEvent(
      message(`Connect to EwaTrade: ${code}`),
      deps,
    ),
  ).toBe(true)
  expect(claims).toEqual([
    {
      code,
      phoneNumberId: "123456789",
      senderId: "2348000000001",
      messageId: "test-message",
    },
  ])
})

test("assistant webhook commits normalized private ingress and leaves dispatch to durable jobs", async () => {
  const accepted: unknown[] = []
  const deps = {
    enqueue: async () => {},
    env: {
      ...configured,
      ASSISTANT_WHATSAPP_PILOT_USER_IDS: "pilot-1, pilot-2",
    },
    claim: async () => true,
    disconnect: async () => {},
    accept: async (input: unknown, users: readonly string[]) => {
      accepted.push({ input, users })
      return {
        kind: "accepted" as const,
        id: "inbox-1",
        bindingId: "binding-1",
        requestId: "request-1",
      }
    },
  }
  expect(
    await processPlatformWhatsAppEvent(
      { ...message("123456"), timestamp: "1792050000" },
      deps,
    ),
  ).toBe(true)
  expect(accepted).toEqual([
    {
      input: {
        phoneNumberId: "123456789",
        senderId: "2348000000001",
        providerMessageId: "test-message",
        timestamp: "1792050000",
        type: "text",
        text: "123456",
        quickActionId: undefined,
        replyToMessageId: undefined,
        media: undefined,
        flowResponse: undefined,
      },
      users: ["pilot-1", "pilot-2"],
    },
  ])
  await expect(
    processPlatformWhatsAppEvent(message("hello"), {
      ...deps,
      accept: async () => {
        throw Error("database unavailable")
      },
    }),
  ).rejects.toThrow("database unavailable")
})

test("a committed inbox survives enqueue failure and provider acknowledgement remains successful", async () => {
  const ids: string[] = []
  expect(
    await processPlatformWhatsAppEvent(
      { ...message("search rice"), timestamp: "1792050000" },
      {
        env: configured,
        claim: async () => true,
        disconnect: async () => {},
        accept: async () => ({
          kind: "accepted",
          id: "durable-inbox",
          bindingId: "binding-1",
          requestId: "request-1",
        }),
        enqueue: async (id) => {
          ids.push(id)
          throw Error("queue unavailable")
        },
      },
    ),
  ).toBe(true)
  expect(ids).toEqual(["durable-inbox"])
})

test("platform statuses use only assistant receipt correlation, even while disabled, and persistence failure is retryable", async () => {
  const receipts: unknown[] = []
  const deps = {
    env: { WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789" },
    accept: async () => {
      throw Error("must not ingest receipt as a turn")
    },
    claim: async () => {
      throw Error("must not link receipt")
    },
    disconnect: async () => {},
    enqueue: async () => {},
    receipt: async (event: unknown) => {
      receipts.push(event)
    },
  }
  const event = {
    kind: "status" as const,
    phoneNumberId: "123456789",
    messageId: "otp-or-assistant",
    status: "sent" as const,
  }
  expect(await processPlatformWhatsAppEvent(event, deps)).toBe(true)
  expect(receipts).toEqual([event])
  await expect(
    processPlatformWhatsAppEvent(event, {
      ...deps,
      receipt: async () => {
        throw Error("database unavailable")
      },
    }),
  ).rejects.toThrow("database unavailable")
  expect(
    await processPlatformWhatsAppEvent(
      { ...event, phoneNumberId: "another-number" },
      deps,
    ),
  ).toBe(false)
  expect(receipts).toHaveLength(1)
})

test("server quota notice dispatch uses only the immutable outbox ID and failed immediate enqueue stays recoverable", async () => {
  const turns: string[] = []
  const replies: string[] = []
  let deny = false
  const deps = {
    env: configured,
    claim: async () => true,
    disconnect: async () => {},
    enqueue: async (id: string) => {
      turns.push(id)
    },
    enqueueDelivery: async (id: string) => {
      replies.push(id)
      throw Error("private queue error must not reach acknowledgement")
    },
    accept: async () =>
      deny
        ? { kind: "ignored" as const, reason: "rate_limited" as const }
        : {
            kind: "quota_notice_accepted" as const,
            id: "daily-server-inbox",
            bindingId: "binding",
            requestId: "server-notice",
            outboxId: "immutable-outbox",
          },
  }
  expect(
    await processPlatformWhatsAppEvent(message("private denied input"), deps),
  ).toBe(true)
  deny = true
  expect(
    await processPlatformWhatsAppEvent(message("duplicate denied input"), deps),
  ).toBe(true)
  expect(turns).toEqual([])
  expect(replies).toEqual(["immutable-outbox"])
})

test("exact bare opt-out aliases revoke before configuration while business stop requests retain normal admission", async () => {
  const disconnected: unknown[] = []
  const admitted: unknown[] = []
  const deps = {
    // No channel enablement, credentials, pilot user or Tenant enrollment.
    env: { WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789" },
    accept: async (input: unknown) => {
      admitted.push(input)
      return { kind: "ignored" as const, reason: "unlinked" as const }
    },
    enqueue: async () => {
      throw Error("No inbox was admitted")
    },
    claim: async () => {
      throw Error("An opt-out cannot claim a link")
    },
    disconnect: async (input: unknown) => {
      disconnected.push(input)
    },
  }
  for (const alias of [" STOP ", "Unsubscribe"])
    expect(await processPlatformWhatsAppEvent(message(alias), deps)).toBe(true)
  expect(disconnected).toEqual([
    { phoneNumberId: "123456789", senderId: "2348000000001" },
    { phoneNumberId: "123456789", senderId: "2348000000001" },
  ])
  expect(admitted).toEqual([])
  expect(
    await processPlatformWhatsAppEvent(
      message("Stop", "customer-number"),
      deps,
    ),
  ).toBe(false)
  for (const text of ["stop this transfer", "unsubscribe this customer"])
    expect(
      await processPlatformWhatsAppEvent(message(text), {
        ...deps,
        env: configured,
      }),
    ).toBe(true)
  expect(admitted).toHaveLength(2)
  expect(admitted).toMatchObject([
    { text: "stop this transfer" },
    { text: "unsubscribe this customer" },
  ])
  expect(disconnected).toHaveLength(2)
})

test("signed linking timestamp is preserved and onboarding verification never enters ordinary ingress", async () => {
  const claims: unknown[] = []
  const accepted: unknown[] = []
  const deps = {
    env: configured,
    accept: async (input: unknown) => {
      accepted.push(input)
      return { kind: "ignored" as const, reason: "unlinked" as const }
    },
    enqueue: async () => {},
    claim: async (input: unknown) => {
      claims.push(input)
      return true
    },
    disconnect: async () => {},
    onboarding: async () => ({ handled: true }),
  }
  await processPlatformWhatsAppEvent(
    {
      ...message(`Connect to EwaTrade: ${"a".repeat(43)}`),
      timestamp: "1792050000",
    },
    deps,
  )
  expect(claims).toEqual([
    {
      code: "a".repeat(43),
      phoneNumberId: "123456789",
      senderId: "2348000000001",
      messageId: "test-message",
      providerOccurredAt: new Date(1792050000 * 1000),
    },
  ])
  await processPlatformWhatsAppEvent(message("123456"), deps)
  expect(accepted).toEqual([])
})

test("disabled onboarding stays silent and STOP always revokes even when onboarding cleanup fails", async () => {
  const operations: string[] = []
  const deps = {
    env: { WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789" },
    accept: async () => ({
      kind: "ignored" as const,
      reason: "unlinked" as const,
    }),
    enqueue: async () => {},
    claim: async () => true,
    disconnect: async () => {
      operations.push("disconnect")
    },
    onboarding: async () => {
      operations.push("onboard")
      return { handled: true }
    },
    cancelOnboarding: async () => {
      operations.push("cancel")
      throw Error("cleanup unavailable")
    },
  }
  await processPlatformWhatsAppEvent(message("Register"), deps)
  expect(operations).toEqual([])
  await expect(
    processPlatformWhatsAppEvent(message("Stop"), deps),
  ).rejects.toThrow("cleanup unavailable")
  expect(operations).toEqual(["cancel", "disconnect"])
})

function hybridHarness() {
  const operations: string[] = []
  const deps = {
    env: configured,
    accept: async () => {
      operations.push("accept")
      return { kind: "ignored" as const, reason: "unlinked" as const }
    },
    enqueue: async () => {
      operations.push("enqueue")
    },
    claim: async () => {
      operations.push("claim")
      return true
    },
    disconnect: async () => {
      operations.push("disconnect")
    },
    onboarding: async () => {
      operations.push("onboarding")
      return { handled: true }
    },
    registrationFlow: async () => {
      operations.push("registration-launch")
      return false
    },
    registrationFlowReturn: async () => {
      operations.push("registration-return")
      return false
    },
    cancelRegistrationFlow: async () => {
      operations.push("cancel-registration")
    },
    cancelBusinessFlows: async () => {
      operations.push("cancel-business")
      return { count: 0 }
    },
    cancelOnboarding: async () => {
      operations.push("cancel-onboarding")
    },
    credentialNotice: async () => {
      operations.push("credential-notice")
    },
  }
  return { deps, operations }
}

test("native Flow replies stay structured and never enter onboarding or link parsing", async () => {
  const h = hybridHarness()
  const event = {
    ...message(`Connect to EwaTrade: ${"a".repeat(43)}`),
    type: "interactive" as const,
    flowResponse: {
      status: "valid" as const,
      flowToken: "native-test-token-12345",
      data: { form_kind: "sale", form_version: "1" },
    },
  }
  await processPlatformWhatsAppEvent(event, h.deps)
  expect(h.operations).toEqual(["registration-return", "accept"])
  h.operations.length = 0
  await processPlatformWhatsAppEvent(
    { ...event, flowResponse: { status: "invalid" } },
    h.deps,
  )
  expect(h.operations).toEqual(["registration-return", "accept"])
  h.operations.length = 0
  await processPlatformWhatsAppEvent(event, {
    ...h.deps,
    registrationFlowReturn: async () => {
      h.operations.push("registration-return")
      return true
    },
  })
  expect(h.operations).toEqual(["registration-return"])
})

test("credential-shaped messages never reach private onboarding, bound ingress or model dispatch", async () => {
  const h = hybridHarness()
  for (const input of [
    "my password is private-do-not-persist",
    "api key: sk-proj-testcredential1234567890",
    "verification code is 123456",
    "-----BEGIN PRIVATE KEY-----",
  ]) {
    await processPlatformWhatsAppEvent(message(input), h.deps)
    expect(h.operations).toEqual(["credential-notice"])
    h.operations.length = 0
  }
})

test("enabled DISCONNECT bypasses active onboarding and enters the bound confirmation control", async () => {
  const h = hybridHarness()
  await processPlatformWhatsAppEvent(message("DISCONNECT"), h.deps)
  expect(h.operations).toContain("accept")
  expect(h.operations).not.toContain("onboarding")
  expect(h.operations).not.toContain("disconnect")
  expect(h.operations).not.toContain("claim")
})

test("STOP cancels form authority before email proof and revokes immediately even while enabled", async () => {
  const h = hybridHarness()
  await processPlatformWhatsAppEvent(message("STOP"), h.deps)
  expect(h.operations).toEqual([
    "cancel-registration",
    "cancel-business",
    "cancel-onboarding",
    "disconnect",
  ])
})

test("CANCEL and REGISTER CHAT invalidate native authority before typed onboarding runs", async () => {
  for (const input of ["CANCEL", "REGISTER CHAT"]) {
    const h = hybridHarness()
    await processPlatformWhatsAppEvent(message(input), h.deps)
    expect(h.operations.slice(0, 2)).toEqual([
      "cancel-registration",
      "cancel-business",
    ])
    expect(h.operations.at(-1)).toBe("onboarding")
    expect(h.operations).not.toContain("accept")
    expect(h.operations).not.toContain("disconnect")
  }
})

test("STOP still attempts typed-proof cancellation when native cleanup fails", async () => {
  const h = hybridHarness()
  await expect(
    processPlatformWhatsAppEvent(message("STOP"), {
      ...h.deps,
      cancelRegistrationFlow: async () => {
        h.operations.push("cancel-registration")
        throw Error("native cleanup unavailable")
      },
    }),
  ).rejects.toThrow("native cleanup unavailable")
  expect(h.operations).toEqual([
    "cancel-registration",
    "cancel-business",
    "cancel-onboarding",
    "disconnect",
  ])
})
