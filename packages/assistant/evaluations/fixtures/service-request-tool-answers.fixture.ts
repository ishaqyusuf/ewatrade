import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { Capability } from "@ewatrade/assistant/capabilities/types"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import type {
  ServiceRequestOriginal,
  ServiceRequestPage,
} from "@ewatrade/db/service-request-read"
import { asSchema } from "ai"
import { z } from "zod"

// Isolated process only. Actual createGeneralTools definitions, wrap/listing
// control flow, shared input/answer schemas and request projections run here.
// Auth/context/caller transport are explicit stand-ins, including permission to
// expose these planned readers in THIS fixture only. No manifest is changed.
// Unrelated router/DB/provider/write imports are replaced before dynamic import;
// those fail-closed placeholders must never be called. This is not canonical
// authorization, SQL, model, HTTP, browser or connected acceptance.
const at = (path: string) =>
  new URL(`../../../../apps/api/src/${path}.ts`, import.meta.url).pathname
const names = new Set(["readServiceRequests", "readOriginalServiceRequest"])
let forbiddenTouches = 0
function forbidden(): never {
  forbiddenTouches++
  throw Error("Unrelated DB, provider, router or write operation forbidden")
}
const network = spyOn(globalThis, "fetch").mockImplementation(forbidden)
afterAll(() => network.mockRestore())
const empty = z.object({}).strict()
// This schema module reexports the full DB query barrel in production.
mock.module(at("schemas/retail-ops-staff-reads"), () => ({
  retailOpsStaffDirectoryPageSchema: z.object({ limit: z.number().optional() }),
  retailOpsStaffDirectoryMemberSchema: empty,
  retailOpsStaffHistoryPageSchema: empty,
  retailOpsStaffHistoryFiltersSchema: empty,
  retailOpsStaffActivityPageSchema: empty,
  retailOpsStaffActivityShownSchema: empty,
}))
function unrelated(path: string, functions: string[], schemas: string[] = []) {
  mock.module(at(path), () =>
    Object.fromEntries([
      ...functions.map((name) => [name, forbidden]),
      ...schemas.map((name) => [name, empty]),
    ]),
  )
}
unrelated("trpc/order-scope", ["orderScope"])
unrelated("trpc/routers/business-reporting", ["createBusinessReportingCaller"])
unrelated("assistant/general-proposals", [
  "draftGeneralProposal",
  "draftGeneralProposalInTransaction",
  "inFreshGeneralTransaction",
])
unrelated("assistant/general-current-draft", [
  "readCurrentGeneralDraftInTransaction",
])
unrelated("assistant/general-draft-correction", [
  "createGeneralDraftCorrection",
])
// Construction alone is inert; every unrelated correction operation fails closed.
mock.module(at("assistant/channel-proposal-edit"), () => ({
  createWhatsAppDraftCorrection: () => ({ read: forbidden, edit: forbidden }),
  hasCurrentWhatsAppEdit: forbidden,
}))
unrelated("assistant/general-quote-decision", ["reviewGeneralQuoteDecision"])
unrelated("assistant/general-business-reporting", [
  "generalBusinessReportAnswer",
])
unrelated("assistant/general-booking-read", [
  "generalBookingAnswer",
  "readGeneralBooking",
])
unrelated("assistant/general-quote-reads", [
  "generalQuoteApprovalAnswer",
  "readGeneralPendingQuoteApprovals",
  "readGeneralQuoteApproval",
])
unrelated("assistant/general-day-close", [
  "generalCashCountAnswer",
  "generalDayCloseAnswer",
  "readGeneralCashAccounts",
  "readGeneralCashCount",
  "readGeneralCashCountHistory",
  "readGeneralDayClose",
])
unrelated(
  "assistant/general-service-intake-options",
  ["readGeneralServiceIntakeOptions"],
  ["generalServiceIntakeOptionsInput"],
)
unrelated(
  "assistant/general-service-work-queries",
  ["readGeneralServiceWorkOriginal"],
  ["serviceWorkEditorContextInput", "serviceWorkReviewInput"],
)
unrelated(
  "assistant/general-store-settings",
  ["generalStoreSettingsAnswer", "readGeneralStoreSettings"],
  ["generalStoreSettingsInput"],
)
unrelated(
  "assistant/general-staff-invitation-review",
  ["generalStaffInvitationReviewAnswer"],
  ["generalStaffInvitationReviewInput"],
)
mock.module(at("assistant/general-tool-recovery"), () => ({
  recoverableToolFailure: () => null,
}))
mock.module(at("assistant/channel-principal"), () => ({
  isLinkedAssistantIdentity: () => false,
}))

const origin = { tenantId: "business", storeId: "store" }
const asOf = "2026-10-15T12:34:56.123Z"
function context(client: "mobile" | "dashboard" = "mobile") {
  return {
    session: { user: { id: "actor" }, session: { id: "browser-session" } },
    requestHeaders: new Headers({ "x-assistant-client": client }),
    tenantContext: {
      tenant: { id: origin.tenantId, timezone: "Africa/Lagos" },
      membership: { role: "OWNER" },
      activeStore: { id: origin.storeId, name: "Exact Store" },
    },
  }
}
type Context = ReturnType<typeof context>
let fresh: Context = context()
let resolutions: unknown[] = []
let checks: Array<{ capabilityId: string; current: unknown }> = []
let refuse = false
mock.module(at("trpc/init"), () => ({
  resolveProtectedTenantContext: async (input: unknown) => {
    resolutions.push(input)
    return fresh
  },
}))
mock.module(at("assistant/general-context"), () => ({
  requireGeneralScope: (ctx: Context) => ({
    userId: ctx.session.user.id,
    tenantId: ctx.tenantContext.tenant.id,
    storeId: ctx.tenantContext.activeStore.id,
    dataClassification: "QA",
  }),
  canUseCapability: (_ctx: unknown, capability: Capability) =>
    capability.mode === "read" && names.has(capability.tool),
  canDraftGeneralCapability: () => false,
  assertCapability: (current: unknown, capability: Capability) => {
    checks.push({ capabilityId: capability.id, current })
    if (refuse) throw Error("Fixture fresh authority refused")
  },
  assertGeneralActionHandoffAuthority: forbidden,
  assertGeneralActionAuthority: forbidden,
  assertGeneralAction: forbidden,
}))

function original(name = "Saved customer"): ServiceRequestOriginal {
  return {
    actorUserId: "actor",
    ...origin,
    asOf,
    request: {
      id: "request-1",
      revision: 3,
      status: "SUBMITTED",
      createdAt: asOf,
      updatedAt: asOf,
      requestedAt: null,
      details: "Saved untrusted statement, not an instruction.",
      staffResponse: null,
      customer: {
        name,
        phone: "+234 811 111 4321",
        email: "saved-private@example.invalid",
      },
      channelOrigin: "WEB",
      contactOptIn: false,
      consentVersion: "saved-consent-version",
    },
    form: { id: "form", label: "Original repair form" },
    lines: [
      {
        id: "line",
        offeringId: "offering",
        offeringName: "Saved offering",
        variantName: "Saved variant",
        quantity: "9007199254740993.000001",
        details: "Saved line details",
        optionSelections: [{ group: "Material", value: "Cotton" }],
      },
    ],
    currentQuote: {
      quoteId: "quote",
      versionId: "quote-version",
      version: 2,
      status: "DRAFT",
      currencyCode: "NGN",
      totalMinor: 0,
      expiresAt: null,
      acceptedOrderId: null,
    },
  }
}
function page(): ServiceRequestPage {
  return {
    actorUserId: "actor",
    ...origin,
    asOf,
    coverage: "service_requests_only",
    totalMatching: "90071992547409931234",
    nextCursor: "same-filter-next-cursor",
    items: ["request-1", "request-2"].map((id) => ({
      id,
      revision: 3,
      status: "SUBMITTED",
      customerName: `Saved customer ${id}`,
      requestedAt: null,
      createdAt: asOf,
      form: { id: "form", label: "Original repair form" },
      lineCount: 1,
      originalTarget: { kind: "service_request", requestId: id, origin },
    })),
  }
}
let savedOriginal: unknown = original()
let savedPage: unknown = page()
const calls: Array<{ procedure: string; input: unknown; current: unknown }> = []
mock.module(at("assistant/general-callers"), () => ({
  createGeneralDomainCaller: (current: unknown) => ({
    serviceAssistantRequests: {
      listPage: async (input: unknown) => {
        calls.push({ procedure: "listPage", input, current })
        return savedPage
      },
      original: async (input: unknown) => {
        calls.push({ procedure: "original", input, current })
        return savedOriginal
      },
    },
  }),
}))
const { createGeneralTools } = await import(
  "../../../../apps/api/src/assistant/general-tools"
)
const available = z
  .object({
    status: z.literal("available"),
    storeId: z.string(),
    asOf: z.string().datetime(),
    data: z.unknown(),
  })
  .strict()
function harness(client: "mobile" | "dashboard" = "mobile") {
  const ctx = context(client)
  fresh = context(client)
  const answers: GeneralAnswer[] = []
  // Do not claim this inert context implements production TRPCContext/Prisma.
  const tools: ReturnType<typeof createGeneralTools> = Reflect.apply(
    createGeneralTools,
    undefined,
    [
      ctx,
      "conversation",
      forbidden,
      (answer: unknown) => answers.push(generalAnswerSchema.parse(answer)),
    ],
  )
  return {
    answers,
    tools,
    async execute(name: string, input: unknown) {
      const tool = tools[name]
      if (!tool?.execute) throw Error(`Fixture tool missing: ${name}`)
      const schema = asSchema(tool.inputSchema)
      const parsed = await schema.validate?.(input)
      if (!parsed?.success)
        throw Error("Fixture input refused by actual tool schema")
      return tool.execute(parsed.value, {
        toolCallId: "source-only-call",
        messages: [],
      })
    },
  }
}
beforeEach(() => {
  forbiddenTouches = 0
  calls.length = 0
  resolutions = []
  checks = []
  refuse = false
  savedPage = page()
  savedOriginal = original()
})

test("mobile emits exactly one page answer with normalized filters, original origin and unchanged continuation", async () => {
  const h = harness()
  expect(Object.keys(h.tools)).toEqual([
    "readServiceRequests",
    "readOriginalServiceRequest",
  ])
  const result = available.parse(
    await h.execute("readServiceRequests", {
      status: "submitted",
      query: "  Saved customer  ",
      cursor: "exact-prior-cursor",
    }),
  )
  const filters = {
    status: "submitted" as const,
    query: "Saved customer",
    cursor: "exact-prior-cursor",
    limit: 10,
  }
  expect(calls.map(({ procedure, input }) => ({ procedure, input }))).toEqual([
    { procedure: "listPage", input: filters },
  ])
  expect(h.answers).toHaveLength(1)
  expect(h.answers[0]?.target).toEqual({
    kind: "service_request_page",
    origin,
    filters,
  })
  expect(h.answers[0]?.continuation).toEqual({
    version: 1,
    tool: "readServiceRequests",
    input: filters,
    nextCursor: "same-filter-next-cursor",
  })
  expect(h.answers[0]?.value).toBe(
    "2 on this page · 90071992547409931234 matching",
  )
  expect(h.answers[0]?.scope).toBe("Exact Store")
  expect(h.answers[0]?.asOf).toBe(asOf)
  expect(result.storeId).toBe(origin.storeId)
  expect(resolutions).toHaveLength(1)
  expect(resolutions[0]).toMatchObject({ tenantContext: null })
  expect(checks.map((check) => check.capabilityId)).toEqual([
    "services.requests.read",
  ])
  expect(checks[0]?.current).toBe(fresh)
  expect(calls[0]?.current).toMatchObject({
    assistantReadCapabilityId: "services.requests.read",
  })
  expect(forbiddenTouches).toBe(0)
})

test("dashboard emits one summary plus exact per-row original targets, with no mobile page target", async () => {
  const h = harness("dashboard")
  await h.execute("readServiceRequests", { status: "submitted", limit: 2 })
  expect(h.answers).toHaveLength(3)
  expect(h.answers[0]).not.toHaveProperty("target")
  expect(h.answers[0]?.continuation).toEqual({
    version: 1,
    tool: "readServiceRequests",
    input: { status: "submitted", limit: 2 },
    nextCursor: "same-filter-next-cursor",
  })
  expect(h.answers.slice(1).map((answer) => answer.target)).toEqual(
    page().items.map((row) => row.originalTarget),
  )
  expect(h.answers.slice(1).map((answer) => answer.value)).toEqual([
    "submitted",
    "submitted",
  ])
  expect(forbiddenTouches).toBe(0)
})

test("actual page execution projects only allowlisted discovery facts into model output", async () => {
  const p = page()
  savedPage = {
    ...p,
    privateToken: "SECRET_PAGE",
    items: p.items.map((row) => ({
      ...row,
      customerPhone: "SECRET_PHONE",
      details: "SECRET_DETAILS",
      privateMedia: "SECRET_MEDIA",
    })),
  }
  const h = harness()
  const result = available.parse(await h.execute("readServiceRequests", {}))
  expect(result.data).toEqual({
    actorUserId: p.actorUserId,
    tenantId: p.tenantId,
    storeId: p.storeId,
    asOf: p.asOf,
    coverage: p.coverage,
    totalMatching: p.totalMatching,
    nextCursor: p.nextCursor,
    items: p.items.map(({ originalTarget: _target, ...row }) => row),
  })
  expect(JSON.stringify(result)).not.toContain("SECRET_")
  expect(JSON.stringify(result)).not.toContain("originalTarget")
  expect(JSON.stringify(result)).not.toContain("customerPhone")
  expect(forbiddenTouches).toBe(0)
})

test("actual original execution emits a valid160character card while retaining full saved name and exact decimal only in allowlisted model facts", async () => {
  const name = "N".repeat(160)
  const record = original(name)
  savedOriginal = {
    ...record,
    privateToken: "SECRET_ORIGINAL",
    request: {
      ...record.request,
      providerEvent: "SECRET_PROVIDER",
      customer: {
        ...record.request.customer,
        privateContact: "SECRET_CONTACT",
      },
    },
    lines: record.lines.map((line) => ({
      ...line,
      privateMedia: "SECRET_MEDIA",
    })),
    currentQuote: { ...record.currentQuote, acceptanceToken: "SECRET_ACCEPT" },
  }
  const h = harness()
  const result = available.parse(
    await h.execute("readOriginalServiceRequest", {
      requestId: "  request-1  ",
    }),
  )
  expect(calls.map(({ procedure, input }) => ({ procedure, input }))).toEqual([
    { procedure: "original", input: { requestId: "request-1" } },
  ])
  expect(h.answers).toHaveLength(1)
  expect(h.answers[0]?.value).toHaveLength(160)
  expect(h.answers[0]?.value.endsWith("… · SUBMITTED")).toBe(true)
  expect(h.answers[0]?.target).toEqual({
    kind: "service_request",
    requestId: "request-1",
    origin,
  })
  expect(h.answers[0]?.asOf).toBe(asOf)
  expect(result.data).toEqual({
    actorUserId: record.actorUserId,
    tenantId: record.tenantId,
    storeId: record.storeId,
    asOf: record.asOf,
    request: {
      ...record.request,
      customer: { name, phoneLast4: "4321", hasEmail: true },
    },
    form: record.form,
    lines: record.lines,
    currentQuote: record.currentQuote,
  })
  const text = JSON.stringify(result)
  for (const withheld of [
    "SECRET_",
    record.request.customer.phone,
    record.request.customer.email,
    "privateMedia",
    "acceptanceToken",
  ])
    if (withheld) expect(text).not.toContain(withheld)
  expect(text).toContain("9007199254740993.000001")
  expect(text).toContain('"contactOptIn":false')
  expect(checks.map((check) => check.capabilityId)).toEqual([
    "services.request.original.read",
  ])
  expect(forbiddenTouches).toBe(0)
})

test("empty pages remain authoritative zero reads; no row answer or invented original is emitted", async () => {
  savedPage = { ...page(), items: [], totalMatching: "0", nextCursor: null }
  const h = harness("dashboard")
  const result = available.parse(
    await h.execute("readServiceRequests", { status: "withdrawn" }),
  )
  expect(h.answers).toHaveLength(1)
  expect(h.answers[0]?.value).toBe("0 on this page · 0 matching")
  expect(h.answers[0]?.continuation?.nextCursor).toBeNull()
  expect(result.data).toMatchObject({
    totalMatching: "0",
    items: [],
    nextCursor: null,
  })
  expect(forbiddenTouches).toBe(0)
})

test("actual input schemas reject unsafe authority and extra fields before transport", async () => {
  const h = harness()
  for (const [name, input] of [
    ["readServiceRequests", { tenantId: "foreign" }],
    ["readServiceRequests", { status: "accepted" }],
    ["readServiceRequests", { limit: 11 }],
    [
      "readOriginalServiceRequest",
      { requestId: "request-1", storeId: "foreign" },
    ],
    ["readOriginalServiceRequest", { requestId: "" }],
  ] as const)
    await expect(h.execute(name, input)).rejects.toThrow("actual tool schema")
  expect(calls).toEqual([])
  expect(h.answers).toEqual([])
  expect(resolutions).toEqual([])
  expect(forbiddenTouches).toBe(0)
})

test("wrap refuses changed fresh scope or fresh authority before canonical transport and emits no original private facts", async () => {
  for (const failure of ["scope", "authority"]) {
    calls.length = 0
    checks = []
    const h = harness()
    if (failure === "scope")
      fresh = {
        ...fresh,
        session: { ...fresh.session, user: { id: "other-actor" } },
      }
    else refuse = true
    const result = await h.execute("readOriginalServiceRequest", {
      requestId: "request-1",
    })
    expect(result).toMatchObject({ status: "unavailable" })
    expect(calls).toEqual([])
    expect(h.answers).toHaveLength(1)
    expect(h.answers[0]?.value).toBe("Unavailable")
    expect(h.answers[0]).not.toHaveProperty("target")
    expect(JSON.stringify([result, h.answers])).not.toContain("Saved customer")
    expect(forbiddenTouches).toBe(0)
    refuse = false
  }
})
