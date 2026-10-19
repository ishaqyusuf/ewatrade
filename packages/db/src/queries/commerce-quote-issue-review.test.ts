import { afterAll, expect, setSystemTime, spyOn, test } from "bun:test"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { Prisma } from "../../generated/prisma/client"
import { reviewCommerceQuoteIssueReadOnlyInTransaction } from "./commerce-quote-issue-review"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

// Actual review parent and actual source-owned options/pricing calculator.
// A whitelist of in-memory read delegates stands in for persistence. Every
// mutation, nested transaction, raw command and network request fails closed.
// This proves source behavior, not SQL isolation, connected authority or rollout.
const scope = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
}
const publication = {
  version: "quote-review-source",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-01-01",
}
function denyNetwork(): never {
  throw Error("Pure Quote review attempted network/provider I/O")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(denyNetwork, { preconnect: denyNetwork }),
)
afterAll(() => network.mockRestore())

function object(value: unknown): value is object {
  return typeof value === "object" && value !== null
}
function field(value: unknown, key: string): unknown {
  return object(value) ? Reflect.get(value, key) : undefined
}
function matches(value: unknown, where: unknown): boolean {
  if (!object(where)) return value === where
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true
    if (key === "in") return Array.isArray(expected) && expected.includes(value)
    if (key === "not") return !matches(value, expected)
    if (key === "equals") return matches(value, expected)
    if (key === "AND")
      return (
        Array.isArray(expected) &&
        expected.every((part) => matches(value, part))
      )
    if (key === "OR")
      return (
        Array.isArray(expected) && expected.some((part) => matches(value, part))
      )
    return matches(field(value, key), expected)
  })
}
function project(value: unknown, select: unknown): unknown {
  if (value === null || !object(select)) return value
  if (Array.isArray(value)) return value.map((row) => project(row, select))
  return Object.fromEntries(
    Object.entries(select).map(([key, choice]) => [
      key,
      choice === true
        ? field(value, key)
        : project(field(value, key), field(choice, "select")),
    ]),
  )
}
function intent(): Parameters<
  typeof reviewCommerceQuoteIssueReadOnlyInTransaction
>[1] {
  return {
    ...scope,
    sourceType: "service_request",
    sourceId: "request-1",
    clientQuoteId: "quote-command-1",
    clientVersionId: "version-command-1",
    availabilityOutcome: "unavailable",
    lines: [
      {
        outcome: "unavailable",
        sourceLineId: "line-1",
        customerNote: "Saved unavailable explanation",
      },
    ],
    operation: { kind: "issue" },
  }
}
function conversation(id: string) {
  return {
    id,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    lastMessageSequence: 10,
    customerBlockedAt: null,
    accountInvitations: [],
    actionMessages: [],
  }
}
function fixture() {
  const store = {
    id: scope.storeId,
    tenantId: scope.tenantId,
    status: "ACTIVE",
    name: "Exact Store",
    currencyCode: "NGN",
    countryCode: "NG",
    businessProfileKey: "general",
  }
  const membership = {
    id: "member-1",
    userId: scope.actorUserId,
    tenantId: scope.tenantId,
    role: "OWNER",
    status: "ACTIVE",
    staffAccessMode: "LEGACY",
    staffAccessRevision: 7,
    catalogEditor: false,
    retailOpsStaffProfile: { defaultStoreId: scope.storeId },
    staffStoreAssignments: [],
    tenant: { id: scope.tenantId, isActive: true },
  }
  const source = {
    id: "request-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    revision: 3,
    status: "SUBMITTED",
    customerName: "Saved customer",
    customerPhone: "PRIVATE_PHONE",
    customerEmail: "PRIVATE_EMAIL",
    details: "Saved source request",
    staffResponse: null,
    requestedAt: null,
    channelOrigin: "WEB",
    contactOptIn: false,
    consentVersion: "saved-consent",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    requestFormId: "form-1",
    requestForm: {
      id: "form-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      label: "Saved form",
    },
  }
  const sourceLine = {
    id: "line-1",
    requestId: source.id,
    offeringId: "offering-1",
    offeringName: "Saved service",
    variantName: "Saved variant",
    optionSelections: [{ group: "Size", value: "Standard" }],
    requestedQuantity: new Prisma.Decimal("1.25"),
    details: "Saved line",
    createdAt: source.createdAt,
    request: source,
  }
  const offering = {
    id: "offering-1",
    tenantId: scope.tenantId,
    kind: "SERVICE",
    status: "ACTIVE",
    currencyCode: "NGN",
    name: "Current service",
    fixedPriceMinor: 100,
    updatedAt: source.createdAt,
    priceChanges: [],
    catalogItem: { name: "Current item", status: "ACTIVE" },
    serviceOffering: { quantityScale: 2 },
    productUnitOffering: null,
    storeAvailability: [{ isAvailable: true }],
    variant: {
      name: "Default",
      selections: [{ group: { name: "Size" }, value: { label: "Standard" } }],
    },
  }
  const state = {
    store: true,
    membership: true,
    source: true,
    policyAllowed: true,
    terms: true,
    sourceRow: source,
    member: membership,
    lines: [sourceLine],
    offering,
    profile: {
      id: "profile-1",
      status: "DISABLED",
      revision: 3,
      attachmentsEnabled: false,
      attachmentsProviderReady: false,
      bookingEnabled: false,
      catalogAdoptionMode: "PROGRESSIVE",
      deliveryEnabled: false,
      intakeEnabled: true,
      paymentEnabled: false,
      pickupEnabled: false,
      policyRestrictedCapabilities: [],
      procureToOrderEnabled: false,
      progressiveCatalogEnabled: false,
      quoteEnabled: true,
      serviceCompletionEnabled: false,
      staffEnabled: true,
      webEnabled: false,
      whatsappEnabled: false,
    },
    inquiry: {
      ...source,
      id: "inquiry-1",
      status: "READY_TO_QUOTE",
      vertical: "SERVICE",
      demandReason: "NEEDS_QUOTE",
      summary: "Saved inquiry summary",
      lines: [
        {
          id: "inquiry-line-1",
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          inquiryId: "inquiry-1",
          position: 0,
          description: "Saved product demand",
          requestedQuantity: new Prisma.Decimal("2"),
        },
      ],
    },
    quote: null as Record<string, unknown> | null,
    commandQuote: null as Record<string, unknown> | null,
    usedVersion: false,
    maxVersion: 1,
    quoteEvidence: [] as Array<Record<string, unknown>>,
    version: null as Record<string, unknown> | null,
    releasePolicy: null as {
      mode: string
      revision: number
      selectedApproverMembershipIds: string[]
    } | null,
    team: [] as Array<{ capability: string; membershipId: string }>,
    links: [] as Array<{ conversationId: string }>,
    conversations: [] as Array<Record<string, unknown>>,
    hideConversations: false,
  }
  const reads: Array<{ table: string; method: string; input: unknown }> = []
  const denied: string[] = []
  function forbidden(path: string): never {
    denied.push(path)
    throw Error(`Pure Quote review attempted forbidden ${path}`)
  }
  const delegates: Record<
    string,
    Record<string, (input: unknown) => unknown>
  > = {
    store: {
      findFirst: (input) =>
        state.store && matches(store, field(input, "where"))
          ? { ...store, serviceCommerceProfile: state.profile }
          : null,
    },
    tenant: {
      findFirst: (input) =>
        matches(membership.tenant, field(input, "where"))
          ? membership.tenant
          : null,
    },
    membership: {
      findFirst: (input) =>
        state.membership && matches(membership, field(input, "where"))
          ? membership
          : null,
    },
    staffStoreAssignment: { findFirst: () => null },
    serviceRequest: {
      findFirst: (input) =>
        state.source && matches(source, field(input, "where"))
          ? { ...source, lines: state.lines }
          : null,
    },
    serviceRequestLine: {
      findMany: (input) =>
        state.lines.filter((line) => matches(line, field(input, "where"))),
      count: (input) =>
        state.lines.filter((line) => matches(line, field(input, "where")))
          .length,
    },
    serviceCommercePolicyDecision: {
      findMany: () =>
        state.policyAllowed ? allowedServiceCommercePolicyDecisionRows() : [],
    },
    serviceCommerceQuoteReleasePolicy: { findFirst: () => state.releasePolicy },
    serviceCommerceStoreTeamAssignment: { findMany: () => state.team },
    legalAcceptance: {
      findUnique: (input) => {
        const version = field(
          field(field(input, "where"), "userId_version"),
          "version",
        )
        return state.terms
          ? {
              documentHash:
                version === publication.version
                  ? publication.documentHash
                  : currentEffectiveLegalPublication()?.documentHash,
              acceptedAt: new Date("2026-10-01T00:00:00Z"),
            }
          : null
      },
    },
    commerceQuote: {
      findFirst: (input) =>
        state.quote && matches(state.quote, field(input, "where"))
          ? state.quote
          : null,
      findUnique: (input) => {
        const where = field(input, "where")
        const sourceWhere = field(where, "tenantId_sourceType_sourceId")
        const commandWhere = field(where, "tenantId_clientQuoteId")
        if (commandWhere && state.commandQuote) return state.commandQuote
        return state.quote && matches(state.quote, sourceWhere ?? commandWhere)
          ? state.quote
          : null
      },
    },
    commerceQuoteVersion: {
      findFirst: (input) =>
        state.version && matches(state.version, field(input, "where"))
          ? state.version
          : null,
      findUnique: () =>
        state.usedVersion ? { id: "already-used-version" } : null,
      aggregate: () => ({ _max: { version: state.maxVersion } }),
    },
    sellableOffering: {
      findMany: (input) => {
        const ids = field(field(field(input, "where"), "id"), "in")
        return Array.isArray(ids) && ids.includes(offering.id) ? [offering] : []
      },
      findFirst: (input) =>
        matches(offering, field(input, "where")) ? offering : null,
    },
    commerceQuoteLine: { findMany: () => state.quoteEvidence },
    commercialOrderLine: { findMany: () => [] },
    stockBalanceSource: { findFirst: () => null },
    storeConversationRequestLink: { findMany: () => state.links },
    storeConversation: {
      findMany: () =>
        state.hideConversations
          ? []
          : state.conversations.length
            ? state.conversations
            : state.links.map((link) => conversation(link.conversationId)),
    },
    commerceInquiry: {
      findFirst: (input) =>
        matches(state.inquiry, field(input, "where")) ? state.inquiry : null,
    },
    commerceInquiryLine: {
      count: (input) =>
        state.inquiry.lines.filter((line) =>
          matches(line, field(input, "where")),
        ).length,
    },
    storeConversationActionMessage: { findMany: () => [] },
  }
  const tx = new Proxy(
    {},
    {
      get: (_target, table) => {
        if (typeof table !== "string" || table.startsWith("$"))
          return () => forbidden(String(table))
        return new Proxy(
          {},
          {
            get: (_delegate, method) => async (input: unknown) => {
              const handler =
                typeof method === "string"
                  ? delegates[table]?.[method]
                  : undefined
              if (!handler) return forbidden(`${table}.${String(method)}`)
              reads.push({ table, method: String(method), input })
              return project(handler(input), field(input, "select"))
            },
          },
        )
      },
    },
  )
  async function review(
    input = intent(),
    terms: typeof publication | null = publication,
  ): Promise<
    Awaited<ReturnType<typeof reviewCommerceQuoteIssueReadOnlyInTransaction>>
  > {
    return Reflect.apply(
      reviewCommerceQuoteIssueReadOnlyInTransaction,
      undefined,
      [tx, input, terms],
    )
  }
  return { state, reads, denied, review }
}

test("actual pure review binds the exact source and immutable intent without any mutation or provider call", async () => {
  const f = fixture()
  const result = await f.review()
  expect(result.target.id).toBe("request-1")
  expect(result.target.revision).toMatch(/^[a-f0-9]{64}$/)
  expect(f.denied).toEqual([])
  expect(network).not.toHaveBeenCalled()
})

test("Service review retains Owner/Admin and explicit legacy Manager ceilings", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    const f = fixture()
    f.state.member.role = role
    expect((await f.review()).target.id).toBe("request-1")
    expect(f.denied).toEqual([])
  }
  for (const [role, mode] of [
    ["MANAGER", "SCOPED"],
    ["MANAGER", "UNKNOWN"],
    ["CASHIER", "LEGACY"],
    ["OPERATOR", "LEGACY"],
  ]) {
    const f = fixture()
    f.state.member.role = role ?? ""
    f.state.member.staffAccessMode = mode ?? ""
    await expect(f.review()).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})

test("foreign actor/business/Store/source and inactive persisted authority refuse without writes", async () => {
  for (const change of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { sourceId: "foreign" },
  ]) {
    const f = fixture()
    await expect(f.review({ ...intent(), ...change })).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
  for (const change of [
    "tenant",
    "membership",
    "status",
    "revision",
    "store",
    "source",
    "converted",
    "withdrawn",
  ]) {
    const f = fixture()
    if (change === "tenant") f.state.member.tenant.isActive = false
    if (change === "membership") f.state.membership = false
    if (change === "status") f.state.member.status = "SUSPENDED"
    if (change === "revision") f.state.member.staffAccessRevision = 0
    if (change === "store") f.state.store = false
    if (change === "source") f.state.source = false
    if (change === "converted") f.state.sourceRow.status = "CONVERTED"
    if (change === "withdrawn") f.state.sourceRow.status = "WITHDRAWN"
    await expect(f.review()).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})

test("new issue requires canonical quote absence; revision requires the exact current nonaccepted original", async () => {
  const f = fixture()
  const current = {
    id: "version-1",
    quoteId: "quote-1",
    version: 1,
    status: "ISSUED",
    clientVersionId: "prior-version-command",
    payloadHash: "prior-input",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    expiresAt: null,
    acceptedOrderId: null,
    quoteApproval: null,
  }
  f.state.version = current
  f.state.quote = {
    id: "quote-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    sourceId: "request-1",
    sourceType: "SERVICE_REQUEST",
    clientQuoteId: "quote-command-1",
    currentVersionId: current.id,
    currentVersion: current,
  }
  await expect(f.review()).rejects.toThrow()
  const revise = {
    ...intent(),
    operation: {
      kind: "revise" as const,
      quoteId: "quote-1",
      quoteVersionId: current.id,
    },
  }
  expect((await f.review(revise)).target.id).toBe("request-1")
  await expect(
    f.review({
      ...revise,
      operation: { ...revise.operation, quoteId: "foreign" },
    }),
  ).rejects.toThrow()
  await expect(
    f.review({
      ...revise,
      operation: { ...revise.operation, quoteVersionId: "foreign" },
    }),
  ).rejects.toThrow()
  current.status = "ACCEPTED"
  await expect(f.review(revise)).rejects.toThrow()
  current.status = "ISSUED"
  f.state.quote.storeId = "foreign"
  await expect(f.review(revise)).rejects.toThrow()
  f.state.quote.storeId = scope.storeId
  f.state.commandQuote = { id: "other-quote" }
  await expect(f.review(revise)).rejects.toMatchObject({
    code: "IDEMPOTENCY_MISMATCH",
  })
  expect(f.denied).toEqual([])
})

test("immediate release needs current Terms and vertical policy, while approval preparation requires another active selected approver", async () => {
  for (const denied of ["terms", "publication", "policy"]) {
    const f = fixture()
    if (denied === "terms") f.state.terms = false
    if (denied === "policy") f.state.policyAllowed = false
    await expect(
      f.review(intent(), denied === "publication" ? null : publication),
    ).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
  const f = fixture()
  f.state.releasePolicy = {
    mode: "APPROVAL_REQUIRED",
    revision: 3,
    selectedApproverMembershipIds: ["checker-1"],
  }
  f.state.team = [
    { capability: "ATTENDANT", membershipId: "member-1" },
    { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
  ]
  f.state.terms = false
  expect((await f.review()).target.id).toBe("request-1")
  f.state.team = [{ capability: "QUOTE_APPROVER", membershipId: "checker-1" }]
  await expect(f.review()).rejects.toThrow()
  f.state.team = [{ capability: "ATTENDANT", membershipId: "member-1" }]
  await expect(f.review()).rejects.toThrow()
  f.state.releasePolicy.selectedApproverMembershipIds = ["member-1"]
  f.state.team.push({ capability: "QUOTE_APPROVER", membershipId: "member-1" })
  await expect(f.review()).rejects.toThrow()
  expect(f.denied).toEqual([])
})

test("digest binds meaningful source, saved-line, current access, policy, team and linked-effect drift", async () => {
  for (const change of [
    "source-revision",
    "source-details",
    "saved-line",
    "access",
    "policy",
    "team",
    "links",
    "intent",
  ]) {
    const f = fixture()
    const before = await f.review()
    const next = intent()
    if (change === "source-revision") f.state.sourceRow.revision++
    if (change === "source-details")
      f.state.sourceRow.details = "Changed customer request"
    if (change === "saved-line") {
      const saved = f.state.lines[0]
      if (!saved) throw Error("Expected saved source line")
      saved.details = "Changed saved line"
    }
    if (change === "access") f.state.member.staffAccessRevision++
    if (change === "policy") {
      f.state.releasePolicy = {
        mode: "ATTENDANT_CAN_RELEASE",
        revision: 4,
        selectedApproverMembershipIds: [],
      }
      f.state.team = [{ capability: "ATTENDANT", membershipId: "member-1" }]
    }
    if (change === "team")
      f.state.team = [
        { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
      ]
    if (change === "links") f.state.links = [{ conversationId: "linked-chat" }]
    if (change === "intent")
      next.lines = [
        {
          outcome: "unavailable",
          sourceLineId: "line-1",
          customerNote: "Different stated explanation",
        },
      ]
    expect((await f.review(next)).target.revision).not.toBe(
      before.target.revision,
    )
    expect(f.denied).toEqual([])
  }
})

test("review refuses incomplete101conversation or101line shapes rather than silently truncating proof", async () => {
  const f = fixture()
  f.state.links = Array.from({ length: 100 }, (_, index) => ({
    conversationId: `chat-${index}`,
  }))
  expect((await f.review()).target.id).toBe("request-1")
  f.state.links.push({ conversationId: "chat-100" })
  await expect(f.review()).rejects.toThrow()
  const g = fixture()
  const base = g.state.lines[0]
  if (!base) throw Error("Expected original saved line")
  g.state.lines = Array.from({ length: 101 }, (_, index) => ({
    ...base,
    id: `line-${index}`,
  }))
  await expect(g.review()).rejects.toThrow()
  expect(f.denied).toEqual([])
  expect(g.denied).toEqual([])
})

test("current read and catalog evaluation clocks do not change digest, but real current price evidence does", async () => {
  const f = fixture()
  const input = {
    ...intent(),
    availabilityOutcome: "full" as const,
    lines: [
      {
        outcome: "included" as const,
        offeringId: "offering-1",
        sourceLineId: "line-1",
        quantity: "1.25",
        unitPriceMinor: 100,
      },
    ],
  }
  try {
    setSystemTime(new Date("2026-10-16T12:00:00Z"))
    const first = await f.review(input)
    setSystemTime(new Date("2026-10-16T12:01:00Z"))
    const second = await f.review(input)
    expect(second.target.revision).toBe(first.target.revision)
    f.state.offering.fixedPriceMinor = 200
    const changed = await f.review(input)
    expect(changed.target.revision).not.toBe(first.target.revision)
    expect(f.denied).toEqual([])
  } finally {
    setSystemTime()
  }
})

test("complete native20by100 options and100source lines remain complete with100linked effects", async () => {
  const f = fixture()
  const base = f.state.lines[0]
  if (!base) throw Error("Expected original saved line")
  f.state.lines = Array.from({ length: 100 }, (_, index) => ({
    ...base,
    id: `line-${index}`,
  }))
  f.state.links = Array.from({ length: 100 }, (_, index) => ({
    conversationId: `chat-${index}`,
  }))
  const {
    lines: _lines,
    availabilityOutcome: _availability,
    ...input
  } = intent()
  const result = await f.review({
    ...input,
    options: Array.from({ length: 20 }, (_, choice) => ({
      clientOptionId: `option-${choice}`,
      label: `Choice ${choice}`,
      availabilityOutcome: "unavailable",
      lines: f.state.lines.map((line) => ({
        sourceLineId: line.id,
        outcome: "unavailable",
      })),
    })),
  })
  expect(result.review.options).toHaveLength(20)
  expect(result.review.options.map((option) => option.lines.length)).toEqual(
    Array(20).fill(100),
  )
  expect(result.review.options.map((option) => option.totalMinor)).toEqual(
    Array(20).fill(0),
  )
  expect(result.review.source.lines).toHaveLength(100)
  expect(result.review.effects.linkedConversations).toHaveLength(100)
  expect(
    f.reads.find((read) => read.table === "storeConversationRequestLink")
      ?.input,
  ).toMatchObject({
    take: 101,
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      sourceId: "request-1",
      kind: "SERVICE_REQUEST",
    },
  })
  expect(f.denied).toEqual([])
})

test("Inquiry parent uses its own source/line scope, native operator ceiling and active pure workspace", async () => {
  const input = {
    ...intent(),
    sourceType: "commerce_inquiry" as const,
    sourceId: "inquiry-1",
    lines: [
      { sourceLineId: "inquiry-line-1", outcome: "unavailable" as const },
    ],
  }
  for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]) {
    const f = fixture()
    f.state.profile.status = "ACTIVE"
    f.state.member.role = role
    const result = await f.review(input)
    expect(result.review.source.kind).toBe("commerce_inquiry")
    expect(result.review.effects.createsInquiryIssuedAudit).toBe(true)
    expect(result.review.source.lines[0]?.requestedQuantity).toBe("2")
    expect(f.denied).toEqual([])
  }
  for (const defect of [
    "disabled",
    "clinical",
    "foreign-line",
    "not-ready",
    "scoped",
  ]) {
    const f = fixture()
    f.state.profile.status = "ACTIVE"
    if (defect === "disabled") f.state.profile.status = "DISABLED"
    if (defect === "clinical") f.state.inquiry.vertical = "PHARMACY"
    if (defect === "foreign-line") {
      const line = f.state.inquiry.lines[0]
      if (!line) throw Error("Expected saved Inquiry line")
      line.storeId = "foreign"
    }
    if (defect === "not-ready") f.state.inquiry.status = "RECEIVED"
    if (defect === "scoped") {
      f.state.member.role = "OPERATOR"
      f.state.member.staffAccessMode = "SCOPED"
    }
    await expect(f.review(input)).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})

test("source snapshots reject foreign form/line, oversized quantities and malformed saved option objects", async () => {
  for (const defect of ["form", "line", "quantity", "options"]) {
    const f = fixture()
    const line = f.state.lines[0]
    if (!line) throw Error("Expected original source line")
    if (defect === "form") f.state.sourceRow.requestForm.storeId = "foreign"
    if (defect === "line") line.requestId = "foreign"
    if (defect === "quantity")
      line.requestedQuantity = new Prisma.Decimal(
        "123456789012345678901234567890123.000001",
      )
    if (defect === "options")
      Reflect.set(line, "optionSelections", [
        { group: "Size", value: "Standard", privateToken: "SECRET" },
      ])
    await expect(f.review()).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})

test("linked effect proof rejects missing, duplicate, foreign or incomplete records and binds invitation/blocking drift", async () => {
  for (const defect of [
    "missing",
    "duplicate",
    "foreign",
    "sequence",
    "invitation-count",
    "invitation-scope",
    "presentation",
  ]) {
    const f = fixture()
    f.state.links = [{ conversationId: "chat" }]
    const row = conversation("chat")
    if (defect === "missing") f.state.hideConversations = true
    if (defect === "duplicate") f.state.links.push({ conversationId: "chat" })
    if (defect === "foreign") row.storeId = "foreign"
    if (defect === "sequence") row.lastMessageSequence = 2_147_483_646
    if (defect === "invitation-count")
      Reflect.set(row, "accountInvitations", [{}, {}])
    if (defect === "invitation-scope")
      Reflect.set(row, "accountInvitations", [
        {
          tenantId: scope.tenantId,
          storeId: "foreign",
          conversationId: "chat",
        },
      ])
    if (defect === "presentation")
      Reflect.set(row, "actionMessages", [
        {
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          conversationId: "chat",
          quoteVersionId: "foreign",
          sourceId: "request-1",
          sourceKind: "SERVICE_REQUEST",
        },
      ])
    f.state.conversations = [row]
    await expect(f.review()).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
  const f = fixture()
  f.state.links = [{ conversationId: "chat" }]
  const before = await f.review()
  f.state.conversations = [
    {
      ...conversation("chat"),
      customerBlockedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ]
  const blocked = await f.review()
  expect(blocked.target.revision).not.toBe(before.target.revision)
  expect(blocked.review.effects.schedulesNativeUnreadNotificationIntents).toBe(
    false,
  )
  expect(
    blocked.review.effects.linkedConversations?.[0]?.newVersionPresentation,
  ).toBe("skipped_customer_blocked")
  f.state.conversations = [
    {
      ...conversation("chat"),
      accountInvitations: [
        {
          id: "invitation",
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          conversationId: "chat",
          messageId: "message",
          quoteVersionId: "prior-version",
          status: "ACTIVE",
          createdAt: new Date("2026-10-01T00:00:00Z"),
          dismissedAt: null,
          linkedAt: null,
        },
      ],
    },
  ]
  const invited = await f.review()
  expect(invited.target.revision).not.toBe(before.target.revision)
  expect(
    invited.review.effects.linkedConversations?.[0]?.newVersionInvitation,
  ).toBe("preserve_existing")
  expect(f.denied).toEqual([])
})

test("snapshot precedes asynchronous authority; wider native callbacks and unavailable production screening are never invoked", async () => {
  const f = fixture()
  let callbacks = 0
  const input = {
    ...intent(),
    lines: [
      {
        outcome: "unavailable" as const,
        sourceLineId: "line-1",
        customerNote: "[[qa-reject]] Original unscreened text",
      },
    ],
    authorize: () => {
      callbacks++
      throw Error("No callback")
    },
    protectActionId: () => {
      callbacks++
      throw Error("No callback")
    },
  }
  const terms = { ...publication }
  const previous = {
    APP_ENV: process.env.APP_ENV,
    STORE_CONVERSATION_TEXT_SAFETY_PROVIDER:
      process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER,
  }
  try {
    process.env.APP_ENV = "production"
    process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = "qa-fixture"
    const pending = f.review(input, terms)
    input.sourceId = "foreign"
    const line = input.lines[0]
    if (!line) throw Error("Expected original intention")
    line.customerNote = "Changed after starting"
    terms.documentHash = "b".repeat(64)
    const result = await pending
    expect(result.target.id).toBe("request-1")
    expect(result.review.options[0]?.lines[0]?.customerNote).toBe(
      "[[qa-reject]] Original unscreened text",
    )
    expect(result.review.effects.textScreening).toBe(
      "required_before_execution_not_checked",
    )
    expect(result.review.effects.providerDelivery).toBe(
      "not_performed_or_proven",
    )
    expect(result.review.effects.createsOrderBookingPaymentOrReservation).toBe(
      false,
    )
    expect(callbacks).toBe(0)
    expect(f.denied).toEqual([])
    expect(network).not.toHaveBeenCalled()
    for (const forbiddenKey of [
      "acceptanceTokenDigest",
      "rawToken",
      "screenedTexts",
      "preparedQuoteIssue",
    ])
      expect(JSON.stringify(result)).not.toContain(forbiddenKey)
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
  }
})

test("pending approval does not read or fabricate linked effects, even with101linked conversations", async () => {
  const f = fixture()
  f.state.releasePolicy = {
    mode: "APPROVAL_REQUIRED",
    revision: 3,
    selectedApproverMembershipIds: ["checker-1"],
  }
  f.state.team = [
    { capability: "ATTENDANT", membershipId: "member-1" },
    { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
  ]
  f.state.links = Array.from({ length: 101 }, (_, index) => ({
    conversationId: `chat-${index}`,
  }))
  const result = await f.review()
  expect(result.review.effects.linkedConversations).toBeNull()
  expect(result.review.effects.linkedCoverage).toBe(
    "not_read_no_effects_until_approval",
  )
  expect(result.review.effects.linkedEffects).toBe(
    "deferred_until_approved_release",
  )
  expect(result.review.effects.schedulesNativeUnreadNotificationIntents).toBe(
    false,
  )
  expect(
    f.reads.some((read) => read.table.startsWith("storeConversation")),
  ).toBe(false)
  expect(f.denied).toEqual([])
})

test("linked sequence capacity matches blocked zero, preserved invitation one, and new invitation two increments", async () => {
  const maximum = 2_147_483_647
  for (const mode of ["blocked", "preserve", "new"]) {
    const f = fixture()
    f.state.links = [{ conversationId: "chat" }]
    const increments = mode === "blocked" ? 0 : mode === "preserve" ? 1 : 2
    const row = {
      ...conversation("chat"),
      lastMessageSequence: maximum - increments,
      customerBlockedAt:
        mode === "blocked" ? new Date("2026-10-01T00:00:00Z") : null,
      accountInvitations:
        mode === "preserve"
          ? [
              {
                id: "invitation",
                tenantId: scope.tenantId,
                storeId: scope.storeId,
                conversationId: "chat",
                messageId: "message",
                quoteVersionId: "prior-version",
                status: "PENDING",
                createdAt: new Date("2026-10-01T00:00:00Z"),
                dismissedAt: null,
                linkedAt: null,
              },
            ]
          : [],
    }
    f.state.conversations = [row]
    expect(
      (await f.review()).review.effects.linkedConversations?.[0]
        ?.lastMessageSequence,
    ).toBe(maximum - increments)
    row.lastMessageSequence++
    await expect(f.review()).rejects.toThrow()
    expect(f.denied).toEqual([])
  }
})

test("tied unordered history evidence permutations preserve digest while chosen current price remains fixed", async () => {
  const f = fixture()
  const input = {
    ...intent(),
    availabilityOutcome: "full" as const,
    lines: [
      {
        outcome: "included" as const,
        offeringId: "offering-1",
        sourceLineId: "line-1",
        quantity: "1",
        unitPriceMinor: 100,
      },
    ],
  }
  const history = (id: string, price: number) => ({
    id,
    offeringId: "offering-1",
    unitPriceMinor: price,
    quoteOptionId: null,
    quoteOption: null,
    quoteVersionId: `version-${id}`,
    quoteVersion: {
      acceptedAt: new Date("2026-10-01T00:00:00Z"),
      currencyCode: "NGN",
      _count: { options: 0 },
      quote: { storeId: scope.storeId },
    },
  })
  f.state.quoteEvidence = [history("a", 150), history("b", 175)]
  const first = await f.review(input)
  f.state.quoteEvidence.reverse()
  const second = await f.review(input)
  expect(second.target.revision).toBe(first.target.revision)
  expect(
    second.review.options[0]?.lines[0]?.catalogSuggestedUnitPriceMinor,
  ).toBe(100)
  expect(second.review.evidence.priceSuggestions[0]?.evidence).toHaveLength(3)
  expect(f.denied).toEqual([])
})

test("next version uses canonical maximum including noncurrent history and refuses exhausted storage sequence", async () => {
  const f = fixture()
  const version = {
    id: "version-1",
    quoteId: "quote-1",
    version: 1,
    status: "ISSUED",
    clientVersionId: "prior-version-command",
    payloadHash: "prior-input",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    expiresAt: null,
    acceptedOrderId: null,
    quoteApproval: null,
  }
  f.state.quote = {
    id: "quote-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    sourceId: "request-1",
    sourceType: "SERVICE_REQUEST",
    clientQuoteId: "quote-command-1",
    currentVersionId: version.id,
    currentVersion: version,
  }
  const input = {
    ...intent(),
    operation: {
      kind: "revise" as const,
      quoteId: "quote-1",
      quoteVersionId: version.id,
    },
  }
  const first = await f.review(input)
  expect(first.review.effects.newVersionSequence).toBe(2)
  f.state.maxVersion = 7
  const changed = await f.review(input)
  expect(changed.review.effects.newVersionSequence).toBe(8)
  expect(changed.target.revision).not.toBe(first.target.revision)
  expect(
    f.reads
      .filter(
        (read) =>
          read.table === "commerceQuoteVersion" && read.method === "aggregate",
      )
      .at(-1)?.input,
  ).toEqual({ _max: { version: true }, where: { quoteId: "quote-1" } })
  f.state.maxVersion = 2_147_483_647
  await expect(f.review(input)).rejects.toThrow()
  f.state.maxVersion = 0
  await expect(f.review(input)).rejects.toThrow()
  f.state.maxVersion = 1
  f.state.usedVersion = true
  await expect(f.review(input)).rejects.toThrow("saved result")
  expect(f.denied).toEqual([])
})

test("source revision overflow blocks only release that actually increments the original source", async () => {
  const f = fixture()
  f.state.sourceRow.revision = 2_147_483_647
  await expect(f.review()).rejects.toThrow()
  f.state.releasePolicy = {
    mode: "APPROVAL_REQUIRED",
    revision: 3,
    selectedApproverMembershipIds: ["checker-1"],
  }
  f.state.team = [
    { capability: "ATTENDANT", membershipId: "member-1" },
    { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
  ]
  const pending = await f.review()
  expect(pending.review.effects.sourceRevisionIncrement).toBe(0)
  f.state.releasePolicy = null
  f.state.sourceRow.status = "QUOTED"
  const alreadyQuoted = await f.review()
  expect(alreadyQuoted.review.effects.sourceRevisionIncrement).toBe(0)
  expect(f.denied).toEqual([])
})

test("actual complete review refuses escaped JSON beyond64MiB without serializing a giant proof or invoking writes", async () => {
  const f = fixture()
  const original = f.state.lines[0]
  if (!original) throw Error("Expected original saved Request line")
  // Reuse the physical strings/selection objects. JSON must still count each
  // logical occurrence: U+0001 is six UTF-8 bytes as an escaped JSON character.
  const controlText = "\u0001".repeat(500)
  const selections = Array.from({ length: 100 }, () => ({
    group: controlText,
    value: controlText,
  }))
  f.state.lines = Array.from({ length: 100 }, (_, index) => ({
    ...original,
    id: `line-${index}`,
    optionSelections: selections,
  }))
  const {
    lines: _lines,
    availabilityOutcome: _availability,
    ...base
  } = intent()
  const input = {
    ...base,
    options: Array.from({ length: 20 }, (_, choice) => ({
      clientOptionId: `option-${choice}`,
      label: `Choice ${choice}`,
      availabilityOutcome: "unavailable" as const,
      lines: f.state.lines.map((line) => ({
        sourceLineId: line.id,
        outcome: "unavailable" as const,
        customerNote: controlText,
      })),
    })),
  }
  // Source snapshots alone account for60MB; notes occur in both intent and
  // resolved review, adding12MB. Do not JSON.stringify this logical document.
  const minimumEscapedBytes = 100 * 100 * 2 * 500 * 6 + 2 * 20 * 100 * 500 * 6
  expect(minimumEscapedBytes).toBeGreaterThan(64 * 1024 * 1024)
  await expect(f.review(input)).rejects.toMatchObject({
    code: "QUOTE_CONFLICT",
    reason: "complete_review_too_large",
  })
  expect(
    f.reads.some(
      (read) => read.table === "serviceRequestLine" && read.method === "count",
    ),
  ).toBe(true)
  expect(f.denied).toEqual([])
  expect(network).not.toHaveBeenCalled()
})
