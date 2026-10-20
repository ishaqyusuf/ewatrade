import { expect, test } from "bun:test"
import { capabilityManifest } from "../capabilities/manifest"
import type { Capability } from "../capabilities/types"
import {
  assistantWhatsAppPilotTenantIds,
  assistantWhatsAppUserAllowed,
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

test("only explicit server public rollout opens enrollment; pilot remains exact and closed", () => {
  for (const env of [
    {},
    { ASSISTANT_WHATSAPP_ROLLOUT_MODE: "enabled" },
    { ASSISTANT_WHATSAPP_ROLLOUT_MODE: "PUBLIC" },
  ]) {
    expect(assistantWhatsAppUserAllowed("registered", [], env)).toBe(false)
    expect(isAssistantWhatsAppPilotTenant("business", env)).toBe(false)
    expect(assistantWhatsAppUserAllowed("pilot", ["pilot"], env)).toBe(true)
    expect(assistantWhatsAppUserAllowed("pilot", ["superpilot"], env)).toBe(
      false,
    )
  }
  const env = { ASSISTANT_WHATSAPP_ROLLOUT_MODE: "public" }
  expect(assistantWhatsAppUserAllowed("registered", [], env)).toBe(true)
  expect(isAssistantWhatsAppPilotTenant("business", env)).toBe(true)
  for (const invalid of ["", " ", "x".repeat(129)]) {
    expect(assistantWhatsAppUserAllowed(invalid, [], env)).toBe(false)
    expect(isAssistantWhatsAppPilotTenant(invalid, env)).toBe(false)
  }
  expect(whatsAppChannelPolicy(env)).toMatchObject({
    reads: false,
    writes: false,
    media: false,
  })
})

test("hosted public enrollment alone cannot release native source capabilities", () => {
  const hosted = {
    APP_ENV: "production",
    NODE_ENV: "production",
    ASSISTANT_WHATSAPP_ROLLOUT_MODE: "public",
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
  }
  expect(whatsAppCapabilityEnabled(search, hosted)).toBe(false)
  for (const ids of [
    "*",
    "search",
    "search.records.other",
    "other.search.records",
  ])
    expect(
      whatsAppCapabilityEnabled(search, {
        ...hosted,
        ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: ids,
      }),
    ).toBe(false)
  const released = {
    ...hosted,
    ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: ` ${search.id},${search.id} `,
  }
  expect(whatsAppCapabilityEnabled(search, released)).toBe(true)
  expect(
    whatsAppCapabilityEnabled(search, {
      ...released,
      ASSISTANT_WHATSAPP_READS_ENABLED: "false",
    }),
  ).toBe(false)
  expect(
    whatsAppCapabilityEnabled(search, {
      ...released,
      ASSISTANT_WHATSAPP_ROLLOUT_MODE: "pilot",
    }),
  ).toBe(false)
  for (const changed of [
    { ...search, rollout: "planned" as const },
    {
      ...search,
      whatsapp: { mode: "app_review" as const, rollout: "source" as const },
    },
    {
      ...search,
      whatsapp: { mode: "native" as const, rollout: "planned" as const },
    },
  ])
    expect(whatsAppCapabilityEnabled(changed, released)).toBe(false)
  expect(whatsAppCapabilityPolicyStamp([search], released)).not.toEqual(
    whatsAppCapabilityPolicyStamp([search], hosted),
  )
})

test("released native source writes still require the exact write gate", () => {
  const write = capabilityManifest.find(
    (capability) =>
      capability.mode === "write" &&
      capability.whatsapp?.mode === "native" &&
      capability.whatsapp.rollout === "source" &&
      capability.rollout !== "planned",
  )
  if (!write) throw new Error("Native source write required")
  const hosted = {
    APP_ENV: "production",
    NODE_ENV: "production",
    ASSISTANT_WHATSAPP_ROLLOUT_MODE: "public",
    ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: write.id,
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
  }
  expect(whatsAppCapabilityEnabled(write, hosted)).toBe(false)
  expect(
    whatsAppCapabilityEnabled(write, {
      ...hosted,
      ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    }),
  ).toBe(true)
})
