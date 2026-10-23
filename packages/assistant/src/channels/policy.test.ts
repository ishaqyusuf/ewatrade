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
  whatsAppWebReviewDraftEnabled,
} from "./policy"
const search: Capability | undefined = capabilityManifest.find(
  (capability) => capability.id === "search.records",
)
if (!search) throw Error("Search required")
const local = { APP_ENV: "local", ASSISTANT_WHATSAPP_READS_ENABLED: "true" }

test("Preview pilot release stays finite without opening Production or bypassing pilot enrollment", () => {
  const product = capabilityManifest.find(
    (c) => c.id === "catalog.product.create",
  )
  if (!product) throw Error("Product capability required")
  const preview = {
    APP_ENV: "preview",
    NODE_ENV: "production",
    ASSISTANT_WHATSAPP_ROLLOUT_MODE: "pilot",
    ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: product.id,
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
  }
  expect(whatsAppCapabilityEnabled(product, preview)).toBe(true)
  expect(whatsAppWebReviewDraftEnabled(product, preview)).toBe(true)
  expect(
    whatsAppCapabilityEnabled(product, { ...preview, APP_ENV: "production" }),
  ).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled(product, {
      ...preview,
      APP_ENV: "production",
    }),
  ).toBe(false)
  expect(
    whatsAppCapabilityEnabled(product, {
      ...preview,
      ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: "other",
    }),
  ).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled(product, {
      ...preview,
      ASSISTANT_WHATSAPP_WRITES_ENABLED: "false",
    }),
  ).toBe(false)
  expect(assistantWhatsAppUserAllowed("qa-actor", ["qa-actor"], preview)).toBe(
    true,
  )
  expect(assistantWhatsAppUserAllowed("other", ["qa-actor"], preview)).toBe(
    false,
  )
  expect(
    isAssistantWhatsAppPilotTenant("qa-tenant", {
      ...preview,
      ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "qa-tenant",
    }),
  ).toBe(true)
  expect(
    isAssistantWhatsAppPilotTenant("other", {
      ...preview,
      ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "qa-tenant",
    }),
  ).toBe(false)
  expect(whatsAppCapabilityPolicyStamp([product], preview)).not.toEqual(
    whatsAppCapabilityPolicyStamp([product], {
      ...preview,
      ASSISTANT_WHATSAPP_ROLLOUT_MODE: "",
    }),
  )
})

test("web review drafts never enroll native execution or bypass exact hosted release and write gates", () => {
  const action = capabilityManifest.find(
    (capability) =>
      capability.mode === "write" &&
      capability.whatsapp?.mode === "app_review" &&
      capability.clients.includes("dashboard") &&
      capability.rollout !== "planned",
  )
  if (!action) throw Error("Existing app review action required")
  const source = { APP_ENV: "local", ASSISTANT_WHATSAPP_WRITES_ENABLED: "true" }
  expect(whatsAppWebReviewDraftEnabled(action, source)).toBe(true)
  expect(whatsAppCapabilityEnabled(action, source)).toBe(false)
  expect(whatsAppWebReviewDraftEnabled(action, {})).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled(action, {
      ...source,
      NODE_ENV: "production",
    }),
  ).toBe(false)
  const hosted = {
    APP_ENV: "production",
    NODE_ENV: "production",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    ASSISTANT_WHATSAPP_ROLLOUT_MODE: "public",
    ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: action.id,
  }
  expect(whatsAppWebReviewDraftEnabled(action, hosted)).toBe(true)
  expect(whatsAppCapabilityEnabled(action, hosted)).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled(action, {
      ...hosted,
      ASSISTANT_WHATSAPP_WRITES_ENABLED: "false",
    }),
  ).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled(action, {
      ...hosted,
      ASSISTANT_WHATSAPP_RELEASED_CAPABILITY_IDS: `${action.id}-other`,
    }),
  ).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled({ ...action, rollout: "planned" }, source),
  ).toBe(false)
  expect(
    whatsAppWebReviewDraftEnabled({ ...action, clients: ["mobile"] }, source),
  ).toBe(false)
  expect(whatsAppWebReviewDraftEnabled(search, source)).toBe(false)
})
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
