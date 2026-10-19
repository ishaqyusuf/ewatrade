import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { Prisma } from "../../../generated/prisma/client"
import { reviewCommerceQuoteIssueReadOnlyInTransaction } from "../commerce-quote-issue-review"
import { allowedServiceCommercePolicyDecisionRows } from "./service-commerce-policy"
// Actual read helpers and native issuer, inert delegate state only. No real transaction or SQL acceptance.
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
    allowWrites: false,
    readbackMissing: false,
    readbackPatch: {} as Record<string, unknown>,
    readbackApprovalPatch: {} as Record<string, unknown>,
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
    maxVersion: 0,
    quoteEvidence: [] as Array<Record<string, unknown>>,
    version: null as Record<string, unknown> | null,
    history: [] as Array<Record<string, unknown>>,
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
  const writes: Array<{ table: string; method: string; input: unknown }> = []
  const savedOptions: Array<Record<string, unknown>> = []
  const savedLines: Array<Record<string, unknown>> = []
  const messages: Array<Record<string, unknown>> = []
  const invitations: Array<Record<string, unknown>> = []
  const presentations: Array<Record<string, unknown>> = []
  const notifications: Array<Record<string, unknown>> = []
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
  function data(input: unknown): Record<string, unknown> {
    const value = field(input, "data")
    return object(value) ? Object.fromEntries(Object.entries(value)) : {}
  }
  function rows() {
    return state.conversations.length
      ? state.conversations
      : state.links.map((link) => ({
          ...conversation(link.conversationId),
          accountAccess: null,
          guestIdentityId: "guest-1",
          store: { storeConversationAvailabilityConfiguration: null },
        }))
  }
  // Keep the same mutable conversation rows throughout native linked effects.
  delegates.storeConversation = {
    findMany: () => rows(),
    findFirst: (input) =>
      rows().find((row) => matches(row, field(input, "where"))) ?? null,
    updateMany: (input) => {
      if (!state.conversations.length) state.conversations = rows()
      const row = state.conversations.find((row) =>
        matches(row, field(input, "where")),
      )
      if (!row) return { count: 0 }
      Object.assign(row, data(input))
      return { count: 1 }
    },
  }
  delegates.commerceQuote = {
    ...delegates.commerceQuote,
    upsert: (input) => {
      const create = field(input, "create")
      if (!state.quote)
        state.quote = {
          ...(object(create) ? create : {}),
          id: "quote-new",
          currentVersionId: null,
          currentVersion: null,
        }
      return state.quote
    },
    updateMany: (input) => {
      if (!state.quote || !matches(state.quote, field(input, "where")))
        return { count: 0 }
      Object.assign(state.quote, data(input))
      state.quote.currentVersion = state.version
      return { count: 1 }
    },
  }
  delegates.commerceQuoteVersion = {
    aggregate: () => ({ _max: { version: state.maxVersion || null } }),
    findUnique: (input) =>
      [state.version, ...state.history].find(
        (row) =>
          row &&
          matches(
            row,
            field(field(input, "where"), "quoteId_clientVersionId") ??
              field(input, "where"),
          ),
      ) ?? null,
    findFirst: (input) => {
      if (!state.version) return null
      const approval = field(state.version, "quoteApproval")
      const row = {
        ...state.version,
        quote: state.quote,
        options: savedOptions,
        quoteApproval: object(approval)
          ? { ...approval, ...state.readbackApprovalPatch }
          : null,
        _count: { options: savedOptions.length },
      }
      if (!matches(row, field(input, "where"))) return null
      if (field(field(input, "select"), "createdByUserId"))
        return state.readbackMissing ? null : { ...row, ...state.readbackPatch }
      return row
    },
    create: (input) => {
      if (state.version) state.history.push(state.version)
      state.version = {
        ...data(input),
        id: "version-new",
        createdAt: new Date(),
        issuedAt: null,
        expiresAt: field(data(input), "expiresAt") ?? null,
        quoteApproval: null,
      }
      state.maxVersion = Number(state.version.version)
      return state.version
    },
    updateMany: (input) => {
      const row = [state.version, ...state.history].find(
        (row) => row && matches(row, field(input, "where")),
      )
      if (!row) return { count: 0 }
      Object.assign(row, data(input))
      return { count: 1 }
    },
  }
  delegates.commerceQuoteOption = {
    create: (input) => {
      const row = { ...data(input), id: `option-${savedOptions.length}` }
      savedOptions.push(row)
      return row
    },
  }
  delegates.commerceQuoteLine = {
    findMany: () => state.quoteEvidence,
    createMany: (input) => {
      const rows = field(input, "data")
      if (!Array.isArray(rows)) throw Error("Expected exact saved lines")
      for (const row of rows)
        savedLines.push(Object.fromEntries(Object.entries(row)))
      return { count: rows.length }
    },
  }
  delegates.serviceRequest = {
    ...delegates.serviceRequest,
    updateMany: (input) => {
      if (!matches(source, field(input, "where"))) return { count: 0 }
      const changes = data(input)
      if (typeof changes.status === "string") source.status = changes.status
      if (field(changes.revision, "increment") === 1) source.revision++
      return { count: 1 }
    },
  }
  delegates.serviceCommerceQuoteApproval = {
    create: (input) => {
      const row = { ...data(input), id: "approval-new", status: "PENDING" }
      if (state.version) state.version.quoteApproval = row
      return row
    },
    findFirst: () => null,
  }
  delegates.serviceCommerceQuoteApprovalAuditEvent = {
    create: () => ({ id: "approval-audit" }),
  }
  delegates.storeConversationMessage = {
    create: (input) => {
      const row = { ...data(input), id: `message-${messages.length}` }
      messages.push(row)
      return row
    },
  }
  delegates.storeConversationRequestLink = {
    ...delegates.storeConversationRequestLink,
    create: (input) => data(input),
  }
  delegates.storeConversationActionMessage = {
    findUnique: (input) =>
      presentations.find((row) =>
        matches(
          row,
          field(field(input, "where"), "conversationId_quoteVersionId"),
        ),
      ) ?? null,
    create: (input) => {
      const row = data(input)
      presentations.push(row)
      return row
    },
  }
  delegates.storeConversationAccountInvitation = {
    findUnique: (input) =>
      invitations.find((row) =>
        matches(row, field(field(input, "where"), "conversationId_milestone")),
      ) ?? null,
    create: (input) => {
      const row = { ...data(input), id: "invitation-new" }
      invitations.push(row)
      return row
    },
  }
  delegates.storeConversationNotificationIntent = {
    findFirst: () => null,
    create: (input) => {
      const row = { ...data(input), id: "notification-new" }
      notifications.push(row)
      return row
    },
  }
  delegates.storeConversationNotificationAuditEvent = {
    create: () => ({ id: "notification-audit" }),
  }
  const writeMethods = new Set(["create", "createMany", "updateMany", "upsert"])
  const tx = new Proxy(
    {},
    {
      get: (_target, table) => {
        if (table === "$queryRaw")
          return async (query: unknown) => {
            const sql = field(query, "sql")
            const values = field(query, "values")
            if (
              typeof sql !== "string" ||
              !sql.includes('FROM "StoreConversation"') ||
              !sql.includes("FOR UPDATE") ||
              !Array.isArray(values) ||
              values[1] !== scope.tenantId ||
              values[2] !== scope.storeId
            )
              return forbidden("raw query outside exact conversation lock")
            reads.push({ table: "$queryRaw", method: "lock", input: query })
            return rows().some((row) => row.id === values[0])
              ? [{ id: values[0] }]
              : []
          }
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
              if (writeMethods.has(String(method))) {
                if (!state.allowWrites)
                  return forbidden(`${table}.${String(method)}`)
                writes.push({ table, method: String(method), input })
              } else reads.push({ table, method: String(method), input })
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
  return {
    state,
    reads,
    writes,
    denied,
    review,
    tx,
    savedOptions,
    savedLines,
    messages,
    invitations,
    presentations,
    notifications,
  }
}

export {
  fixture as reviewedIssueFixture,
  intent as reviewedIssueIntent,
  publication as reviewedIssuePublication,
  scope as reviewedIssueScope,
  field,
  matches,
  project,
}
