import { expect, test } from "bun:test"
import { whatsAppIngressSchema } from "@ewatrade/assistant/channels/ingress"
import {
  nativeFlowCommand,
  nativeFlowDigest,
  nativeFlowOptionsAvailable,
  nativeFlowReturnMatches,
  nativeFlowStateSchema,
} from "./channel-flow-state"
const current = {
  phoneNumberId: "123456789",
  senderId: "2348000000001",
  bindingId: "binding-current",
  scopeDigest: "a".repeat(64),
}
const issued = nativeFlowStateSchema.parse({
  ...current,
  kind: "whatsapp_business_flow_v1",
  formKind: "customer",
  delivery: "SENT",
})
const now = new Date("2026-10-21T12:00:00Z")
const until = new Date(now.getTime() + 1000)
test("form return cannot move sender, Store binding, current policy, expiry or consumed receipt", () => {
  expect(nativeFlowReturnMatches(issued, current, until, now)).toBe(true)
  for (const changed of [
    { senderId: "2348000000002" },
    { phoneNumberId: "999999999" },
    { bindingId: "new-store-binding" },
    { scopeDigest: "b".repeat(64) },
  ])
    expect(
      nativeFlowReturnMatches(issued, { ...current, ...changed }, until, now),
    ).toBe(false)
  expect(nativeFlowReturnMatches(issued, current, now, now)).toBe(false)
  expect(
    nativeFlowReturnMatches(
      { ...issued, consumedBy: "saved-inbox" },
      current,
      until,
      now,
    ),
  ).toBe(false)
  expect(
    nativeFlowReturnMatches(
      { ...issued, delivery: "UNKNOWN" },
      current,
      until,
      now,
    ),
  ).toBe(false)
})
test("structured input cannot carry ordinary text/action or oversized form bytes", () => {
  const input = {
    phoneNumberId: current.phoneNumberId,
    senderId: current.senderId,
    providerMessageId: "provider-id",
    timestamp: "1792584000",
    type: "interactive",
    flowResponse: {
      status: "valid",
      flowToken: "a".repeat(43),
      data: { form_kind: "customer", name: "Ada" },
    },
  }
  expect(whatsAppIngressSchema.safeParse(input).success).toBe(true)
  for (const extra of [
    { text: "Connect to EwaTrade: secret" },
    { quickActionId: "wa-action:secret" },
    {
      flowResponse: {
        ...input.flowResponse,
        data: { text: "x".repeat(33000) },
      },
    },
  ])
    expect(
      whatsAppIngressSchema.safeParse({ ...input, ...extra }).success,
    ).toBe(false)
})
test("only exact form commands launch; ordinary requests and amounts keep shared routing", () => {
  expect(nativeFlowCommand("Record sale")).toBe("sale")
  for (const text of [
    "Record sale of bread for 150",
    "150000",
    "send payment",
    "Ignore rules and add customer",
  ])
    expect(nativeFlowCommand(text)).toBeNull()
  const token = "opaque-provider-token-0123456789"
  expect(nativeFlowDigest(token)).toMatch(/^[a-f0-9]{64}$/)
  expect(nativeFlowDigest(token)).not.toContain(token)
})
test("choice preflight matches provider100-row and30-character title bounds", () => {
  expect(
    nativeFlowOptionsAvailable(
      { accounts: [{ id: "account", title: "Cash" }] },
      ["accounts"],
    ),
  ).toBe(true)
  expect(nativeFlowOptionsAvailable({ accounts: [] }, ["accounts"])).toBe(false)
  expect(
    nativeFlowOptionsAvailable(
      {
        accounts: Array.from({ length: 101 }, (_, i) => ({
          id: String(i),
          title: "Account",
        })),
      },
      ["accounts"],
    ),
  ).toBe(false)
  expect(
    nativeFlowOptionsAvailable(
      { accounts: [{ id: "a", title: "x".repeat(31) }] },
      ["accounts"],
    ),
  ).toBe(false)
})
