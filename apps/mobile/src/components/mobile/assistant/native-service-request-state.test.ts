import { expect, test } from "bun:test"
import { serviceRequestPageTargetSchema } from "@ewatrade/assistant/general/service-request-read"
import {
  nativeServiceRequestOriginal,
  nativeServiceRequestPage,
  nativeServiceRequestScope,
} from "./native-service-request-state"

const origin = { tenantId: "tenant", storeId: "store" }
const owner: NonNullable<Parameters<typeof nativeServiceRequestScope>[0]> = {
  id: "actor",
  businessId: "tenant",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  catalogEditor: true,
  status: "ACTIVE",
}
const scope = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  key: "fixture",
}
const at = "2026-10-15T08:00:00.123Z"
function target(filters: object = {}, suppliedOrigin = origin) {
  return serviceRequestPageTargetSchema.parse({
    kind: "service_request_page",
    origin: suppliedOrigin,
    filters,
  })
}
function row(id = "request") {
  return {
    id,
    revision: 3,
    status: "SUBMITTED",
    customerName: "Saved customer",
    requestedAt: null,
    createdAt: at,
    form: { id: "form", label: "Saved form" },
    lineCount: 1,
    originalTarget: { kind: "service_request", requestId: id, origin },
  }
}
function page() {
  return {
    actorUserId: "actor",
    ...origin,
    asOf: at,
    coverage: "service_requests_only",
    totalMatching: "1",
    nextCursor: null,
    items: [row()],
  }
}
function line(id = "line") {
  return {
    id,
    offeringId: "offering",
    offeringName: "Saved service",
    variantName: "Saved variant",
    optionSelections: [{ group: "Fabric", value: "Cotton" }],
    quantity: "12345678901234567890123456789012.123456",
    details: "Saved source note",
  }
}
function quote() {
  return {
    quoteId: "quote",
    versionId: "version",
    version: 1,
    status: "DRAFT",
    currencyCode: "NGN",
    totalMinor: 0,
    expiresAt: null,
    acceptedOrderId: null,
  }
}
function original() {
  return {
    actorUserId: "actor",
    ...origin,
    asOf: at,
    request: {
      id: "request",
      revision: 3,
      status: "SUBMITTED",
      createdAt: at,
      updatedAt: at,
      requestedAt: null,
      details: "Exact saved details",
      staffResponse: null,
      customer: {
        name: "Saved customer",
        phone: "+2348111111111",
        email: "saved@example.test",
      },
      channelOrigin: "STAFF",
      contactOptIn: false,
      consentVersion: "saved-consent",
    },
    form: { id: "form", label: "Saved form" },
    lines: [line()],
    currentQuote: quote(),
  }
}
function invalidRaw() {
  return [
    undefined,
    null,
    false,
    true,
    0,
    "record",
    [],
    [page()],
    {},
    { request: null },
    { items: null },
  ]
}

test("scope accepts current Owner/Admin and explicit legacy Manager without inferring a grant", () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    const result = nativeServiceRequestScope({ ...owner, role }, origin)
    expect(result).toMatchObject({
      actorUserId: "actor",
      tenantId: "tenant",
      storeId: "store",
    })
    expect(result?.key).toBeString()
  }
  expect(
    nativeServiceRequestScope({ ...owner, status: undefined }, origin),
  ).not.toBeNull()
  expect(
    nativeServiceRequestScope(
      { ...owner, role: "OWNER", staffAccessMode: "SCOPED" },
      origin,
    ),
  ).not.toBeNull()
  const denied: Array<Parameters<typeof nativeServiceRequestScope>[0]> = [
    null,
    undefined,
    {},
    { ...owner, id: "" },
    { ...owner, businessId: "" },
    { ...owner, storeId: "" },
    { ...owner, role: "CASHIER" },
    { ...owner, role: "OPERATOR" },
    { ...owner, role: "MEMBER" },
    { ...owner, role: "SUPPORT" },
    { ...owner, role: "MANAGER", staffAccessMode: undefined },
    { ...owner, role: "MANAGER", staffAccessMode: "SCOPED" },
    { ...owner, status: "SUSPENDED" },
    { ...owner, status: "INVITED" },
    { ...owner, status: "REMOVED" },
    { ...owner, role: "owner" },
  ]
  for (const profile of denied)
    expect(nativeServiceRequestScope(profile, origin)).toBeNull()
})

test("scope strictly preserves origin and partitions every current profile field", () => {
  for (const value of [
    null,
    {},
    { tenantId: "tenant", storeId: null },
    { ...origin, tenantId: "other" },
    { ...origin, storeId: "other" },
    { ...origin, actorUserId: "actor" },
  ])
    expect(nativeServiceRequestScope(owner, value)).toBeNull()
  const key = nativeServiceRequestScope(owner, origin)?.key
  for (const [profile, expectedOrigin] of [
    [{ ...owner, id: "other" }, origin],
    [
      { ...owner, businessId: "other" },
      { ...origin, tenantId: "other" },
    ],
    [
      { ...owner, storeId: "other" },
      { ...origin, storeId: "other" },
    ],
    [{ ...owner, role: "ADMIN" }, origin],
    [{ ...owner, staffAccessMode: "SCOPED" }, origin],
    [{ ...owner, catalogEditor: false }, origin],
    [{ ...owner, status: undefined }, origin],
  ] as const) {
    expect(nativeServiceRequestScope(profile, expectedOrigin)?.key).not.toBe(
      key,
    )
  }
})

test("page preserves canonical count, original targets and independent current snapshot facts", () => {
  const input = {
    ...page(),
    totalMatching: "90071992547409931234",
    nextCursor: "exact-scope-bound-cursor",
  }
  expect<unknown>(nativeServiceRequestPage(input, scope, target())).toEqual(
    input,
  )
  expect(
    nativeServiceRequestPage(
      { ...page(), totalMatching: "0", items: [] },
      scope,
      target(),
    ),
  ).toMatchObject({ totalMatching: "0", items: [], nextCursor: null })
  expect(
    nativeServiceRequestPage(
      { ...page(), totalMatching: "42", items: [] },
      scope,
      target({ cursor: "earlier-page" }),
    ),
  ).toMatchObject({ totalMatching: "42", items: [] })
  const ten = {
    ...page(),
    totalMatching: "27",
    items: Array.from({ length: 10 }, (_, index) => row(`request-${index}`)),
  }
  expect(nativeServiceRequestPage(ten, scope, target())?.items).toHaveLength(10)
  expect(nativeServiceRequestPage(ten, scope, target({ limit: 9 }))).toBeNull()
  expect(
    nativeServiceRequestPage(
      { ...ten, items: [...ten.items, row("eleventh")] },
      scope,
      target(),
    ),
  ).toBeNull()
})

test("page refuses foreign scope, origin, identity mismatch, duplicate identities and status substitution", () => {
  for (const change of [
    { actorUserId: "other" },
    { tenantId: "other" },
    { storeId: "other" },
    { coverage: "all_requests" },
  ])
    expect(
      nativeServiceRequestPage({ ...page(), ...change }, scope, target()),
    ).toBeNull()
  for (const change of [
    {
      ...row(),
      originalTarget: { ...row().originalTarget, requestId: "other" },
    },
    {
      ...row(),
      originalTarget: {
        ...row().originalTarget,
        origin: { ...origin, tenantId: "other" },
      },
    },
    {
      ...row(),
      originalTarget: {
        ...row().originalTarget,
        origin: { ...origin, storeId: "other" },
      },
    },
    {
      ...row(),
      originalTarget: { ...row().originalTarget, kind: "service_job" },
    },
  ])
    expect(
      nativeServiceRequestPage({ ...page(), items: [change] }, scope, target()),
    ).toBeNull()
  expect(
    nativeServiceRequestPage(
      { ...page(), totalMatching: "2", items: [row(), row()] },
      scope,
      target(),
    ),
  ).toBeNull()
  expect(
    nativeServiceRequestPage(page(), scope, target({ status: "declined" })),
  ).toBeNull()
  for (const status of [
    "submitted",
    "needs_information",
    "quoted",
    "declined",
    "withdrawn",
    "converted",
  ])
    expect(
      nativeServiceRequestPage(
        { ...page(), items: [{ ...row(), status: status.toUpperCase() }] },
        scope,
        target({ status }),
      ),
    ).not.toBeNull()
  expect(
    nativeServiceRequestPage(
      page(),
      scope,
      target({}, { ...origin, tenantId: "other" }),
    ),
  ).toBeNull()
  expect(
    nativeServiceRequestPage(
      page(),
      scope,
      target({}, { ...origin, storeId: "other" }),
    ),
  ).toBeNull()
})

test("arbitrary malformed pages return null without throwing or displaying private/unsupported fields", () => {
  for (const raw of [
    ...invalidRaw(),
    { ...page(), totalMatching: "-1" },
    { ...page(), totalMatching: "01" },
    { ...page(), totalMatching: "1.5" },
    { ...page(), totalMatching: "1e3" },
    { ...page(), totalMatching: "9".repeat(21) },
    { ...page(), totalMatching: "0" },
    { ...page(), totalMatching: 1 },
    { ...page(), nextCursor: "" },
    { ...page(), nextCursor: "x".repeat(4097) },
    { ...page(), asOf: "yesterday" },
    { ...page(), isComplete: true },
    { ...page(), providerToken: "PRIVATE" },
    ...[
      { status: "APPROVED" },
      { revision: 0 },
      { lineCount: -1 },
      { lineCount: 1.5 },
      { requestedAt: "yesterday" },
      { customerPhone: "PRIVATE" },
      { details: "PRIVATE" },
      { form: { id: "form", label: "Form", publicToken: "PRIVATE" } },
    ].map((change) => ({ ...page(), items: [{ ...row(), ...change }] })),
  ]) {
    expect(() => nativeServiceRequestPage(raw, scope, target())).not.toThrow()
    expect(nativeServiceRequestPage(raw, scope, target())).toBeNull()
  }
})

test("original preserves all exact saved contact/consent/source snapshots and full38,6 decimal text", () => {
  const input = original()
  const result = nativeServiceRequestOriginal(input, scope, "request")
  expect<unknown>(result).toEqual(input)
  expect(result?.lines[0]?.quantity).toBe(
    "12345678901234567890123456789012.123456",
  )
  expect(result?.request.customer).toEqual(input.request.customer)
  expect(result?.request.contactOptIn).toBe(false)
  expect(result?.currentQuote?.totalMinor).toBe(0)
  expect(
    nativeServiceRequestOriginal(
      { ...input, currentQuote: null },
      scope,
      "request",
    )?.currentQuote,
  ).toBeNull()
  expect(
    nativeServiceRequestOriginal({ ...input, lines: [] }, scope, "request")
      ?.lines,
  ).toEqual([])
  for (const channelOrigin of ["WEB", "STAFF", "WHATSAPP"])
    expect(
      nativeServiceRequestOriginal(
        { ...input, request: { ...input.request, channelOrigin } },
        scope,
        "request",
      ),
    ).not.toBeNull()
})

test("original100line bound and exact quantities/options never coerce floats or silently truncate", () => {
  const input = original()
  const hundred = {
    ...input,
    lines: Array.from({ length: 100 }, (_, index) => line(`line-${index}`)),
  }
  expect(
    nativeServiceRequestOriginal(hundred, scope, "request")?.lines,
  ).toHaveLength(100)
  expect(
    nativeServiceRequestOriginal(
      { ...hundred, lines: [...hundred.lines, line("line-101")] },
      scope,
      "request",
    ),
  ).toBeNull()
  for (const quantity of [
    "0",
    "0.000000",
    "-1",
    "1e3",
    "1.0000001",
    "9".repeat(33),
    " 1 ",
    "NaN",
    "Infinity",
    1,
    null,
  ])
    expect(
      nativeServiceRequestOriginal(
        { ...input, lines: [{ ...line(), quantity }] },
        scope,
        "request",
      ),
    ).toBeNull()
  for (const quantity of [
    "1",
    "0.000001",
    "9007199254740993.000001",
    "9".repeat(32),
  ])
    expect(
      nativeServiceRequestOriginal(
        { ...input, lines: [{ ...line(), quantity }] },
        scope,
        "request",
      )?.lines[0]?.quantity,
    ).toBe(quantity)
  for (const optionSelections of [
    null,
    {},
    [{ group: "Saved", value: "x", href: "PRIVATE" }],
    [{ group: "x".repeat(501), value: "x" }],
    [{ group: "x", value: "x".repeat(501) }],
    Array.from({ length: 101 }, () => ({ group: "g", value: "v" })),
  ])
    expect(
      nativeServiceRequestOriginal(
        { ...input, lines: [{ ...line(), optionSelections }] },
        scope,
        "request",
      ),
    ).toBeNull()
})

test("original rejects wrong scope/id, future states, malformed flags and unsupported private additions", () => {
  const input = original()
  for (const raw of [
    ...invalidRaw(),
    ...[
      { actorUserId: "other" },
      { tenantId: "other" },
      { storeId: "other" },
      { asOf: "yesterday" },
      { publicToken: "PRIVATE" },
    ].map((change) => ({ ...input, ...change })),
    ...[
      { id: "other" },
      { status: "APPROVED" },
      { revision: 0 },
      { contactOptIn: "yes" },
      { consentVersion: true },
      { channelOrigin: "MODEL" },
      { customer: { ...input.request.customer, privateToken: "PRIVATE" } },
      { privateMedia: "PRIVATE" },
    ].map((change) => ({ ...input, request: { ...input.request, ...change } })),
    { ...input, form: { ...input.form, href: "PRIVATE" } },
    { ...input, lines: [{ ...line(), currentPriceMinor: 1 }] },
    ...[
      { status: "PAID" },
      { version: 0 },
      { currencyCode: "ngn" },
      { currencyCode: "NAIRA" },
      { expiresAt: "yesterday" },
      { totalMinor: 1.5 },
      { totalMinor: Number.NaN },
      { totalMinor: Number.POSITIVE_INFINITY },
      { totalMinor: Number.MAX_SAFE_INTEGER + 1 },
      { acceptanceToken: "PRIVATE" },
    ].map((change) => ({ ...input, currentQuote: { ...quote(), ...change } })),
  ]) {
    expect(() =>
      nativeServiceRequestOriginal(raw, scope, "request"),
    ).not.toThrow()
    expect(nativeServiceRequestOriginal(raw, scope, "request")).toBeNull()
  }
  expect(nativeServiceRequestOriginal(input, scope, "different")).toBeNull()
  expect(
    nativeServiceRequestOriginal(
      { ...input, currentQuote: { ...quote(), totalMinor: -1 } },
      scope,
      "request",
    ),
  ).toBeNull()
})
