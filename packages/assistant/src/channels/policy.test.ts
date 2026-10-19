import { expect, test } from "bun:test"
import { capabilityManifest } from "../capabilities/manifest"
import type { Capability } from "../capabilities/types"
import {
  assistantWhatsAppPilotTenantIds,
  isAssistantWhatsAppPilotTenant,
  whatsAppCapabilityEnabled,
  whatsAppCapabilityPolicyStamp,
  whatsAppChannelPolicy,
} from "./policy"
const search: Capability | undefined = capabilityManifest.find(
  (capability) => capability.id === "search.records",
)
if (!search) throw Error("Search required")
const local = { APP_ENV: "local", ASSISTANT_WHATSAPP_READS_ENABLED: "true" }
test("Tenant enrollment is separate, explicit, bounded and empty by default", () => {
  expect(assistantWhatsAppPilotTenantIds({})).toEqual([])
  expect(
    isAssistantWhatsAppPilotTenant("tenant", {
      ASSISTANT_WHATSAPP_PILOT_USER_IDS: "tenant",
    }),
  ).toBe(false)
  const env = {
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: ` tenant-a,tenant-a, tenant-b, ,${"x".repeat(129)}`,
  }
  expect(assistantWhatsAppPilotTenantIds(env)).toEqual(["tenant-a", "tenant-b"])
  expect(isAssistantWhatsAppPilotTenant("tenant-a", env)).toBe(true)
  expect(isAssistantWhatsAppPilotTenant("other", env)).toBe(false)
  expect(isAssistantWhatsAppPilotTenant("", env)).toBe(false)
})
test("WhatsApp source needs explicit native support, local nonproduction runtime and a current gate", () => {
  expect(whatsAppCapabilityEnabled(search, local)).toBe(true)
  for (const env of [
    {},
    { APP_ENV: "production", ASSISTANT_WHATSAPP_READS_ENABLED: "true" },
    { ...local, NODE_ENV: "production" },
    { ...local, ASSISTANT_WHATSAPP_READS_ENABLED: "false" },
  ])
    expect(whatsAppCapabilityEnabled(search, env)).toBe(false)
  for (const change of [
    { clients: ["dashboard"] as const },
    { whatsapp: undefined },
    { whatsapp: { mode: "app_review", rollout: "enabled" } as const },
    { rollout: "planned" as const },
    { whatsapp: { mode: "native", rollout: "planned" } as const },
  ])
    expect(whatsAppCapabilityEnabled({ ...search, ...change }, local)).toBe(
      false,
    )
  expect(
    whatsAppCapabilityEnabled(
      { ...search, whatsapp: { mode: "native", rollout: "pilot" } },
      { APP_ENV: "production", ASSISTANT_WHATSAPP_READS_ENABLED: "true" },
    ),
  ).toBe(true)
})
test("default channel gates are closed and source compatibility never grants write support", () => {
  expect(whatsAppChannelPolicy({})).toMatchObject({
    reads: false,
    writes: false,
    media: false,
  })
  const write = capabilityManifest.find(
    (capability) => capability.id === "sales.order.create",
  )
  if (!write) throw Error("Write required")
  expect(
    whatsAppCapabilityEnabled(write, {
      ...local,
      ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    }),
  ).toBe(false)
})
test("policy evidence changes for gate/rollout changes but ignores documentation edits", () => {
  const original = whatsAppCapabilityPolicyStamp([search], local)
  expect(
    whatsAppCapabilityPolicyStamp(
      [{ ...search, tests: [], examples: [] }],
      local,
    ),
  ).toEqual(original)
  expect(
    whatsAppCapabilityPolicyStamp([search], {
      ...local,
      ASSISTANT_WHATSAPP_READS_ENABLED: "false",
    }),
  ).not.toEqual(original)
  expect(
    whatsAppCapabilityPolicyStamp(
      [{ ...search, whatsapp: { mode: "native", rollout: "planned" } }],
      local,
    ),
  ).not.toEqual(original)
})

test("unknown rollout metadata fails closed even when transpilation does not enforce types", () => {
  const malformed: Capability = {
    ...search,
    whatsapp: JSON.parse('{"mode":"native","rollout":"future"}'),
  }
  expect(
    whatsAppCapabilityEnabled(malformed, {
      APP_ENV: "production",
      ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    }),
  ).toBe(false)
})
