import { describe, expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  type IssueCommerceQuoteInput,
  type IssueCommerceQuoteOptionInput,
  approveCommerceQuoteVersionInTransaction,
  issuePreparedCommerceQuoteInTransaction,
  prepareCommerceQuoteIssue,
  readCommerceQuoteIssueOptionsInTransaction,
} from "./commerce-quotes"
import { resolveServiceCommerceCatalogSourceLine } from "./service-commerce-catalog-source"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

type FixtureUnit = {
  id: string
  name: string
  factor: Prisma.Decimal
  transactionScale: number
  stockBehavior: string
  configurationVersion?: FixtureConfiguration
}
type FixtureConfiguration = {
  id: string
  status: string
  units: FixtureUnit[]
  product: { id: string; currentUnitConfigurationVersionId: string }
}
type FixtureBalance = {
  id: string
  tenantId: string
  inventoryUnitId: string
  revision: number
  onHandQuantity: Prisma.Decimal
  reservedQuantity: Prisma.Decimal
}
type FixtureAttestation = {
  id: string
  type: string
  sourceLinkId: string
  sourceLink: { id: string }
  quantity: Prisma.Decimal
  sourceVersionFingerprint: string
  expiresAt: Date
  configurationVersionId: string | null
  balanceSourceId: string | null
  balanceRevision: number | null
}
type SourceWhere = { id: string; tenantId: string; storeId: string }
type ReviewedOptions = Awaited<
  ReturnType<typeof readCommerceQuoteIssueOptionsInTransaction>
>
type PersistedLine = ReviewedOptions["options"][number]["lines"][number] & {
  quoteOptionId: string
  quoteVersionId: string
}

const scope = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
}
const publication = {
  version: "source-options",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-09-28",
}

function offering(id = "offering-1") {
  return {
    id,
    tenantId: scope.tenantId,
    kind: "SERVICE",
    status: "ACTIVE",
    currencyCode: "NGN",
    name: `Service ${id}`,
    fixedPriceMinor: 700 as number | null,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    priceChanges: [],
    catalogItem: { name: "Saved current catalog name" },
    serviceOffering: { quantityScale: 2 },
    productUnitOffering: null as { inventoryUnit: FixtureUnit } | null,
    storeAvailability: [{ isAvailable: true }],
    variant: {
      name: "Default",
      selections: [{ group: { name: "Size" }, value: { label: "Standard" } }],
    },
  }
}

function line(
  overrides: Partial<IssueCommerceQuoteOptionInput["lines"][number]> = {},
) {
  return {
    offeringId: "offering-1",
    sourceLineId: "line-1",
    outcome: "included" as const,
    quantity: "1",
    unitPriceMinor: 100,
    ...overrides,
  }
}
function option(
  overrides: Partial<IssueCommerceQuoteOptionInput> = {},
): IssueCommerceQuoteOptionInput {
  return {
    clientOptionId: "option-command-1",
    label: " Standard ",
    availabilityOutcome: "full",
    lines: [line()],
    ...overrides,
  }
}
function intent(options = [option()]): IssueCommerceQuoteInput {
  return {
    ...scope,
    clientQuoteId: "quote-command-1",
    clientVersionId: "version-command-1",
    sourceType: "service_request",
    sourceId: "request-1",
    options,
  }
}

/** Actual source functions, whitelisted delegates; no global module mocks or DB. */
function fixture(initialOfferings = [offering()]) {
  const state = {
    allowWrites: false,
    policyAllowed: true,
    sourceAvailable: true,
    inquiryVertical: "SERVICE",
    requestLines: [{ id: "line-1", offeringId: "offering-1" }],
    offerings: initialOfferings,
    balance: null as FixtureBalance | null,
    attestation: null as FixtureAttestation | null,
    sourceLink: null as Record<string, unknown> | null,
    actorMembershipId: "member-1",
    previousVersion: null as Record<string, unknown> | null,
    approval: null as Record<string, unknown> | null,
  }
  const reads: Array<{ table: string; method: string; input: unknown }> = []
  const writes: Array<{ table: string; method: string; input: unknown }> = []
  const optionRows: Array<Record<string, unknown>> = []
  const lineRows: PersistedLine[][] = []
  const versionRows: Array<Record<string, unknown>> = []
  const delegates: Record<
    string,
    Record<string, (...args: never[]) => unknown>
  > = {
    store: {
      findFirst: ({ where }: { where: SourceWhere }) =>
        where.id === scope.storeId && where.tenantId === scope.tenantId
          ? { id: scope.storeId, currencyCode: "NGN", countryCode: "NG" }
          : null,
    },
    serviceCommercePolicyDecision: {
      findMany: () =>
        state.policyAllowed ? allowedServiceCommercePolicyDecisionRows() : [],
    },
    serviceRequest: {
      findFirst: ({ where }: { where: SourceWhere }) =>
        state.sourceAvailable &&
        where.id === "request-1" &&
        where.tenantId === scope.tenantId &&
        where.storeId === scope.storeId
          ? { status: "SUBMITTED" }
          : null,
      updateMany: () => ({ count: 1 }),
    },
    serviceRequestLine: {
      count: ({
        where,
      }: {
        where: {
          requestId: string
          request: { tenantId: string; storeId: string }
          id: { in: string[] }
        }
      }) =>
        where.requestId === "request-1" &&
        where.request.tenantId === scope.tenantId &&
        where.request.storeId === scope.storeId
          ? state.requestLines.filter((row) => where.id.in.includes(row.id))
              .length
          : 0,
      findFirst: ({
        where,
      }: { where: { id: string; request: SourceWhere } }) =>
        where.id === "line-1" &&
        where.request.id === "request-1" &&
        where.request.tenantId === scope.tenantId &&
        where.request.storeId === scope.storeId
          ? {
              id: "line-1",
              details: "Original request detail",
              offeringId: "offering-1",
              offeringName: "Original requested service",
              variantName: "Original variant",
              requestedQuantity: new Prisma.Decimal(2),
              createdAt: new Date("2026-10-01T00:00:00Z"),
              offering: { kind: "SERVICE" },
              request: {
                status: "SUBMITTED",
                updatedAt: new Date("2026-10-01T00:00:00Z"),
              },
            }
          : null,
      findMany: ({
        where,
      }: {
        where: {
          requestId: string
          request?: { tenantId: string; storeId: string }
        }
      }) =>
        where.requestId === "request-1" &&
        where.request?.tenantId === scope.tenantId &&
        where.request?.storeId === scope.storeId
          ? state.requestLines
          : [],
    },
    commerceInquiry: {
      findFirst: ({ where }: { where: SourceWhere }) =>
        state.sourceAvailable &&
        where.id === "inquiry-1" &&
        where.tenantId === scope.tenantId &&
        where.storeId === scope.storeId
          ? { status: "READY_TO_QUOTE", vertical: state.inquiryVertical }
          : null,
    },
    commerceInquiryLine: {
      count: ({
        where,
      }: {
        where: {
          inquiryId: string
          tenantId: string
          storeId: string
          id: { in: string[] }
        }
      }) =>
        where.inquiryId === "inquiry-1" &&
        where.tenantId === scope.tenantId &&
        where.storeId === scope.storeId
          ? where.id.in.filter((id: string) => id === "line-1").length
          : 0,
      findFirst: ({ where }: { where: SourceWhere & { inquiryId: string } }) =>
        where.id === "line-1" &&
        where.inquiryId === "inquiry-1" &&
        where.tenantId === scope.tenantId &&
        where.storeId === scope.storeId
          ? {
              id: "line-1",
              description: "Exact product request",
              position: 0,
              requestedQuantity: new Prisma.Decimal(2),
              createdAt: new Date("2026-10-01T00:00:00Z"),
              inquiry: {
                status: "READY_TO_QUOTE",
                updatedAt: new Date("2026-10-01T00:00:00Z"),
              },
            }
          : null,
    },
    sellableOffering: {
      findMany: ({
        where,
      }: { where: { id: { in: string[] }; currencyCode?: string } }) =>
        state.offerings.filter(
          (row) =>
            where.id.in.includes(row.id) &&
            (!where.currencyCode || row.currencyCode === where.currencyCode),
        ),
      findFirst: ({ where }: { where: SourceWhere }) =>
        state.offerings.find(
          (row) => row.id === where.id && row.tenantId === where.tenantId,
        ) ?? null,
    },
    commerceQuoteLine: {
      findMany: () => [],
      createMany: ({ data }: { data: PersistedLine[] }) => {
        lineRows.push(data)
        return { count: data.length }
      },
    },
    commercialOrderLine: { findMany: () => [] },
    stockBalanceSource: {
      findUnique: () => state.balance,
      upsert: () =>
        state.balance ?? {
          id: "balance-1",
          tenantId: scope.tenantId,
          inventoryUnitId: "unit-1",
          revision: 0,
          onHandQuantity: new Prisma.Decimal(0),
          reservedQuantity: new Prisma.Decimal(0),
        },
    },
    catalogAvailabilityAttestation: { findFirst: () => state.attestation },
    catalogSourceLineLink: { findFirst: () => state.sourceLink },
    membership: {
      findFirst: () => ({
        id: state.actorMembershipId,
        role: "OWNER",
        status: "ACTIVE",
      }),
    },
    serviceCommerceQuoteReleasePolicy: {
      findFirst: () => ({
        mode: "APPROVAL_REQUIRED",
        revision: 3,
        selectedApproverMembershipIds: ["checker-1"],
      }),
    },
    serviceCommerceStoreTeamAssignment: {
      findMany: () => [
        { capability: "ATTENDANT", membershipId: "member-1" },
        { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
      ],
    },
    commerceQuote: {
      upsert: ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        id: "quote-1",
        currentVersionId: null,
      }),
      updateMany: () => ({ count: 1 }),
    },
    commerceQuoteVersion: {
      findUnique: () => state.previousVersion,
      aggregate: () => ({ _max: { version: null } }),
      create: ({ data }: { data: Record<string, unknown> }) => {
        versionRows.push(data)
        return { ...data, id: "version-1" }
      },
      updateMany: () => ({ count: 1 }),
    },
    commerceQuoteOption: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        optionRows.push(data)
        return { id: `saved-option-${optionRows.length}` }
      },
    },
    serviceCommerceQuoteApproval: {
      create: () => ({ id: "approval-1" }),
      findFirst: () => state.approval,
      updateMany: () => ({ count: 1 }),
    },
    legalAcceptance: {
      findUnique: () => ({ documentHash: publication.documentHash }),
    },
    serviceCommercePolicyAuditEvent: { createMany: () => ({ count: 1 }) },
    storeConversationRequestLink: { findMany: () => [] },
    serviceCommerceQuoteApprovalAuditEvent: {
      create: () => ({ id: "audit-1" }),
    },
  }
  const tx = new Proxy(
    {},
    {
      get: (_target, table: string) =>
        new Proxy(
          {},
          {
            get: (_delegate, method: string) => async (input: unknown) => {
              const isRead = [
                "findFirst",
                "findUnique",
                "findMany",
                "count",
                "aggregate",
              ].includes(method)
              if (isRead) reads.push({ table, method, input })
              else {
                writes.push({ table, method, input })
                if (!state.allowWrites)
                  throw Error(`Pure read attempted ${table}.${method}`)
              }
              const handler = delegates[table]?.[method]
              if (!handler)
                throw Error(`Unexpected source delegate ${table}.${method}`)
              return Reflect.apply(handler, undefined, [input])
            },
          },
        ),
    },
  ) as Prisma.TransactionClient
  return { tx, state, reads, writes, optionRows, lineRows, versionRows }
}

async function write(
  f: ReturnType<typeof fixture>,
  input: IssueCommerceQuoteInput,
) {
  const prepared = await prepareCommerceQuoteIssue(input, publication)
  f.state.allowWrites = true
  return issuePreparedCommerceQuoteInTransaction(f.tx, prepared)
}
function withoutEvaluationClock(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutEvaluationClock)
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "catalogPriceEvaluationAt")
        .map(([key, entry]) => [key, withoutEvaluationClock(entry)]),
    )
  return value
}
function expectPersistedParity(
  f: ReturnType<typeof fixture>,
  reviewed: Awaited<
    ReturnType<typeof readCommerceQuoteIssueOptionsInTransaction>
  >,
) {
  expect(f.optionRows).toHaveLength(reviewed.options.length)
  for (const [index, saved] of f.optionRows.entries()) {
    const option = reviewed.options[index]
    const lines = f.lineRows[index]
    if (!option || !lines) throw Error("Missing persisted option/lines")
    expect(saved).toMatchObject({
      clientOptionId: option.clientOptionId,
      label: option.label,
      position: option.position,
      subtotalMinor: option.subtotalMinor,
      totalMinor: option.totalMinor,
      discountMinor: option.discountMinor,
      taxMinor: option.taxMinor,
      fulfilmentFeeMinor: option.fulfilmentFeeMinor,
    })
    const persisted = lines.map(
      ({ quoteOptionId: _option, quoteVersionId: _version, ...line }) => line,
    )
    expect(withoutEvaluationClock(persisted)).toEqual(
      withoutEvaluationClock(option.lines),
    )
  }
}

describe("canonical Quote new-version options and pure pricing", () => {
  test("actual writer and read use the same complete per-option snapshots; alternatives are never added", async () => {
    const f = fixture()
    const input = intent([
      option({
        availabilityOutcome: "partial",
        discountMinor: 25,
        taxMinor: 50,
        fulfilmentFeeMinor: 30,
        fulfilmentType: "pickup",
        fulfilmentPromise: " Tomorrow ",
        customerNote: " Original note ",
        lines: [
          line({
            quantity: "1.25",
            unitPriceMinor: 200,
            customerNote: " Line note ",
          }),
          line({ outcome: "alternative", quantity: "2", unitPriceMinor: 300 }),
          {
            sourceLineId: "line-1",
            outcome: "unavailable",
            catalogItemName: " Original unavailable ",
            offeringName: " Saved item ",
          },
        ],
      }),
      option({
        clientOptionId: "option-command-2",
        label: "Premium",
        lines: [line({ unitPriceMinor: 900 })],
      }),
    ])
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(f.writes).toEqual([])
    expect(reviewed.options.map((row) => row.totalMinor)).toEqual([305, 900])
    expect(reviewed.options[0]?.lines.map((row) => row.totalMinor)).toEqual([
      250, 600, 0,
    ])
    expect(reviewed.options[0]?.lines[0]).toMatchObject({
      quantity: "1.25",
      unitPriceMinor: 200,
      sourceLineId: "line-1",
      catalogItemName: "Saved current catalog name",
      catalogPriceOverride: true,
      catalogSuggestedUnitPriceMinor: 700,
      optionSelections: [{ group: "Size", value: "Standard" }],
    })
    expect(await write(f, input)).toMatchObject({
      releaseState: "pending_approval",
      approvalId: "approval-1",
    })
    expectPersistedParity(f, reviewed)
    expect(f.versionRows[0]).toMatchObject({
      totalMinor: 0,
      status: "DRAFT",
      acceptanceTokenDigest: null,
    })
  })

  test("legacy shape retains the canonical default option, inferred Request line and writer snapshots", async () => {
    const f = fixture()
    // Existing ServiceQuoteForm omits line IDs even when the same Offering occurs twice.
    // Preserve the native last-map-entry fallback; explicit owned IDs remain exact.
    f.state.requestLines.push({
      id: "last-same-offering-line",
      offeringId: "offering-1",
    })
    const { options: _options, ...base } = intent()
    const input: IssueCommerceQuoteInput = {
      ...base,
      availabilityOutcome: "full",
      fulfilmentType: "unspecified",
      discountMinor: 5,
      taxMinor: 2,
      lines: [
        line({ sourceLineId: undefined, quantity: "0.5", unitPriceMinor: 200 }),
      ],
    }
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(reviewed).toMatchObject({
      currencyCode: "NGN",
      sourceState: { alreadyQuoted: false },
      options: [
        {
          clientOptionId: "version-command-1:default",
          label: "Quote",
          totalMinor: 97,
          lines: [
            {
              sourceLineId: "last-same-offering-line",
              quantity: "0.5",
              totalMinor: 100,
            },
          ],
        },
      ],
    })
    await write(f, input)
    expectPersistedParity(f, reviewed)
    expect(f.versionRows[0]?.totalMinor).toBe(97)
    f.state.allowWrites = false
    const explicit = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      intent(),
    )
    expect(explicit.options[0]?.lines[0]?.sourceLineId).toBe("line-1")
  })

  test("pure reads cannot call wider native callbacks, screening, audits, writes or nested transactions", async () => {
    const f = fixture()
    let callbackCalls = 0
    const input = {
      ...intent(),
      authorize: async () => {
        callbackCalls++
        throw Error("No callback")
      },
      protectActionId: () => {
        callbackCalls++
        throw Error("No callback")
      },
    }
    const previous = process.env.APP_ENV
    try {
      process.env.APP_ENV = "production"
      await expect(
        readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
      ).resolves.toMatchObject({ currencyCode: "NGN" })
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, "APP_ENV")
      else process.env.APP_ENV = previous
    }
    expect(callbackCalls).toBe(0)
    expect(f.writes).toEqual([])
    expect(
      f.reads.some((row) => row.table === "serviceCommercePolicyDecision"),
    ).toBe(true)
    expect(
      f.reads.some(
        (row) => row.table === "membership" || row.table === "commerceQuote",
      ),
    ).toBe(false)
    // The options helper deliberately does not claim full actor/Quote/release authority.
  })

  test("policy, missing source and clinical reads refuse without mutations", async () => {
    const f = fixture()
    f.state.policyAllowed = false
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, intent()),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" })
    f.state.policyAllowed = true
    f.state.sourceAvailable = false
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, intent()),
    ).rejects.toMatchObject({ code: "QUOTE_SOURCE_NOT_FOUND" })
    f.state.sourceAvailable = true
    f.state.inquiryVertical = "PHARMACY"
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, {
        ...intent(),
        sourceType: "commerce_inquiry",
        sourceId: "inquiry-1",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, {
        ...intent(),
        sourceType: "prescription_request",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
    expect(f.writes).toEqual([])
  })

  test("supplied foreign Request lines fail for active and unavailable lines; owned substitutions remain valid", async () => {
    for (const foreign of [
      line({ sourceLineId: "foreign-line" }),
      { sourceLineId: "foreign-line", outcome: "unavailable" as const },
    ]) {
      const f = fixture()
      const input = intent([
        option({
          availabilityOutcome:
            foreign.outcome === "unavailable" ? "unavailable" : "full",
          lines: [foreign],
        }),
      ])
      await expect(
        readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
      expect(f.writes).toEqual([])
      await expect(write(f, input)).rejects.toMatchObject({
        code: "QUOTE_CONFLICT",
      })
      expect(f.versionRows).toEqual([])
    }
    const f = fixture([offering(), offering("substitute")])
    const input = intent([
      option({ lines: [line({ offeringId: "substitute" })] }),
    ])
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(reviewed.options[0]?.lines[0]).toMatchObject({
      offeringId: "substitute",
      sourceLineId: "line-1",
    })
    await write(f, input)
    expectPersistedParity(f, reviewed)
  })

  test("exact fractional products and every persisted money bound are shared by writer/read", async () => {
    const invalid = [
      option({ lines: [line({ unitPriceMinor: Number.NaN })] }),
      option({ lines: [line({ unitPriceMinor: Number.POSITIVE_INFINITY })] }),
      option({ lines: [line({ unitPriceMinor: -1 })] }),
      option({ lines: [line({ unitPriceMinor: 0.5 })] }),
      option({ lines: [line({ unitPriceMinor: 2_147_483_648 })] }),
      option({ lines: [line({ quantity: "0.5", unitPriceMinor: 1 })] }),
      option({
        lines: [line({ quantity: "9007199254740993", unitPriceMinor: 1 })],
      }),
      option({ lines: [line({ quantity: "0.001", unitPriceMinor: 1000 })] }),
      option({ lines: [line({ unitPriceMinor: 2_147_483_647 }), line()] }),
      option({
        lines: [line({ unitPriceMinor: 2_147_483_647 })],
        fulfilmentFeeMinor: 1,
      }),
      option({ taxMinor: 2_147_483_648 }),
      option({ discountMinor: Number.NaN }),
      option({ fulfilmentFeeMinor: -1 }),
      option({ discountMinor: 101 }),
    ]
    for (const value of invalid) {
      const f = fixture()
      const input = intent([value])
      await expect(
        readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
      ).rejects.toThrow()
      expect(f.writes).toEqual([])
      await expect(write(f, input)).rejects.toThrow()
      expect(f.versionRows).toEqual([])
    }
    for (const amount of [0, 2_147_483_647]) {
      const f = fixture()
      const input = intent([
        option({ lines: [line({ unitPriceMinor: amount })] }),
      ])
      const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
        f.tx,
        input,
      )
      expect(reviewed.options[0]?.totalMinor).toBe(amount)
      await write(f, input)
      expectPersistedParity(f, reviewed)
    }
  })

  test.each(["read", "write"] as const)(
    "%s rejects zero-price quantities outside Decimal38,6 before version persistence",
    async (mode) => {
      for (const quantity of [
        `1${"0".repeat(32)}`,
        `${"9".repeat(40)}.123456`,
      ]) {
        const service = offering()
        service.serviceOffering.quantityScale = 6
        const f = fixture([service])
        const input = intent([
          option({ lines: [line({ quantity, unitPriceMinor: 0 })] }),
        ])
        const result =
          mode === "read"
            ? readCommerceQuoteIssueOptionsInTransaction(f.tx, input)
            : write(f, input)
        await expect(result).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
        expect(f.versionRows).toEqual([])
        expect(f.lineRows).toEqual([])
        if (mode === "read") expect(f.writes).toEqual([])
      }
    },
  )

  test("zero-price quantities retain full Decimal38,6 precision and normalize redundant zeros before storage bounds", async () => {
    const maximum = `${"9".repeat(32)}.123456`
    for (const quantity of [
      maximum,
      `${"0".repeat(20)}${maximum}000000`,
      `${"9".repeat(32)}.000000000000`,
    ]) {
      const service = offering()
      service.serviceOffering.quantityScale = 6
      const f = fixture([service])
      const input = intent([
        option({ lines: [line({ quantity, unitPriceMinor: 0 })] }),
      ])
      const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
        f.tx,
        input,
      )
      expect(reviewed.options[0]?.lines[0]?.quantity).toBe(
        quantity.includes(".123456") ? maximum : "9".repeat(32),
      )
      expect(reviewed.options[0]?.lines[0]?.totalMinor).toBe(0)
      await write(f, input)
      expectPersistedParity(f, reviewed)
    }
  })

  test("full20×100 options retain all rows and separate totals while price suggestion coverage stays honest", async () => {
    const offerings = Array.from({ length: 2000 }, (_, index) =>
      offering(`offering-${index}`),
    )
    const first = offerings[0]
    if (!first) throw Error("Missing first Offering")
    first.fixedPriceMinor = null
    const f = fixture(offerings)
    f.state.requestLines = Array.from({ length: 100 }, (_, index) => ({
      id: `line-${index}`,
      offeringId: `offering-${index}`,
    }))
    const input = intent(
      Array.from({ length: 20 }, (_, choice) =>
        option({
          clientOptionId: `option-${choice}`,
          label: `Choice ${choice}`,
          lines: Array.from({ length: 100 }, (_, index) =>
            line({
              sourceLineId: `line-${index}`,
              offeringId: `offering-${choice * 100 + index}`,
              unitPriceMinor: choice + 1,
            }),
          ),
        }),
      ),
    )
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(reviewed.options).toHaveLength(20)
    expect(reviewed.options.map((row) => row.lines.length)).toEqual(
      Array(20).fill(100),
    )
    expect(reviewed.options.map((row) => row.totalMinor)).toEqual(
      Array.from({ length: 20 }, (_, index) => 100 * (index + 1)),
    )
    expect(reviewed.priceSuggestionCoverage.requestedOfferingIds).toHaveLength(
      2000,
    )
    expect(reviewed.priceSuggestionCoverage.evaluatedOfferingIds).toEqual(
      offerings.slice(0, 100).map((row) => row.id),
    )
    expect(
      reviewed.priceSuggestionCoverage.unevaluatedOfferingIds,
    ).toHaveLength(1900)
    expect(reviewed.evidence.priceSuggestions).toHaveLength(100)
    expect(
      reviewed.options[0]?.lines[0]?.catalogSuggestedUnitPriceMinor,
    ).toBeNull()
    expect(
      reviewed.options[1]?.lines[0]?.catalogSuggestedUnitPriceMinor,
    ).toBeNull()
    expect(f.writes).toEqual([])
    await write(f, input)
    expectPersistedParity(f, reviewed)
    expect(f.lineRows.flat()).toHaveLength(2000)
  })

  test("canonical option/line bounds and outcome consistency refuse whole reviews", async () => {
    const inputs = [
      intent([]),
      intent(
        Array.from({ length: 21 }, (_, index) =>
          option({ clientOptionId: `option-${index}` }),
        ),
      ),
      intent([option({ lines: [] })]),
      intent([option({ lines: Array.from({ length: 101 }, () => line()) })]),
      intent([option({ availabilityOutcome: "unavailable" })]),
    ]
    for (const input of inputs) {
      const f = fixture()
      await expect(
        readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
      expect(f.writes).toEqual([])
    }
  })

  test("Inquiry configured inventory read returns current evidence without creating a balance; writer default still upserts", async () => {
    const product = offering()
    product.kind = "PRODUCT_UNIT"
    const unit: FixtureUnit = {
      id: "unit-1",
      name: "each",
      factor: new Prisma.Decimal(1),
      transactionScale: 0,
      stockBehavior: "PACKAGED_STOCK",
    }
    const configuration = {
      id: "config-1",
      status: "CURRENT",
      units: [unit],
      product: {
        id: "product-1",
        currentUnitConfigurationVersionId: "config-1",
      },
    }
    unit.configurationVersion = configuration
    product.productUnitOffering = { inventoryUnit: unit }
    const f = fixture([product])
    f.state.balance = {
      id: "balance-1",
      tenantId: scope.tenantId,
      inventoryUnitId: "unit-1",
      revision: 4,
      onHandQuantity: new Prisma.Decimal(12),
      reservedQuantity: new Prisma.Decimal(2),
    }
    const input = {
      ...intent(),
      sourceId: "inquiry-1",
      sourceType: "commerce_inquiry" as const,
    }
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(reviewed.options[0]?.lines[0]).toMatchObject({
      configurationVersionId: "config-1",
      balanceRevision: 4,
    })
    expect(reviewed.evidence.sourcePreparations).toEqual([
      {
        kind: "tracked_inventory",
        offeringId: "offering-1",
        sourceLineId: "line-1",
        balanceSourceId: "balance-1",
        configurationVersionId: "config-1",
        revision: 4,
        availableOfferingQuantity: "10",
        availableBalanceQuantity: "10",
      },
    ])
    expect(f.writes).toEqual([])
    expect(
      f.reads.some(
        (row) =>
          row.table === "stockBalanceSource" && row.method === "findUnique",
      ),
    ).toBe(true)
    await write(f, input)
    expectPersistedParity(f, reviewed)
    expect(
      f.writes.some(
        (row) => row.table === "stockBalanceSource" && row.method === "upsert",
      ),
    ).toBe(true)
    f.state.balance = null
    f.state.allowWrites = false
    const before = f.writes.length
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
    ).rejects.toMatchObject({ code: "OFFERING_UNAVAILABLE" })
    expect(f.writes).toHaveLength(before)
  })

  test("Inquiry manual attestation uses exact source fingerprint/expiry/quantity facts, never stock creation", async () => {
    const product = offering()
    product.kind = "PRODUCT_UNIT"
    product.status = "DRAFT"
    product.storeAvailability = [{ isAvailable: false }]
    const f = fixture([product])
    const source = await resolveServiceCommerceCatalogSourceLine(f.tx, {
      ...scope,
      source: { kind: "commerce_inquiry", id: "inquiry-1" },
      sourceLineId: "line-1",
      operation: "quote",
    })
    f.state.attestation = {
      id: "attestation-1",
      type: "MANUAL_PROCURE_TO_ORDER",
      sourceLinkId: "link-1",
      sourceLink: { id: "link-1" },
      quantity: new Prisma.Decimal(2),
      sourceVersionFingerprint: source.ref.fingerprint,
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      configurationVersionId: null,
      balanceSourceId: null,
      balanceRevision: null,
    }
    const input = {
      ...intent([
        option({
          lines: [
            line({ quantity: "2", availabilityAttestationId: "attestation-1" }),
          ],
        }),
      ]),
      sourceId: "inquiry-1",
      sourceType: "commerce_inquiry" as const,
    }
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(reviewed.evidence.sourcePreparations).toEqual([
      {
        kind: "availability_attestation",
        offeringId: "offering-1",
        sourceLineId: "line-1",
        id: "attestation-1",
        type: "MANUAL_PROCURE_TO_ORDER",
        quantity: "2",
        sourceVersionFingerprint: source.ref.fingerprint,
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        balanceSourceId: null,
        configurationVersionId: null,
        balanceRevision: null,
        sourceLinkId: "link-1",
      },
    ])
    expect(f.writes).toEqual([])
    expect(f.reads.some((row) => row.table === "stockBalanceSource")).toBe(
      false,
    )
    f.state.attestation.sourceVersionFingerprint = "changed"
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    f.state.attestation.sourceVersionFingerprint = source.ref.fingerprint
    f.state.attestation.expiresAt = new Date("2020-01-01T00:00:00Z")
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })
  test("private Service draft keeps its verified exact source-link evidence in both paths", async () => {
    const draft = offering()
    draft.status = "DRAFT"
    draft.storeAvailability = [{ isAvailable: false }]
    const f = fixture([draft])
    const source = await resolveServiceCommerceCatalogSourceLine(f.tx, {
      ...scope,
      source: { kind: "service", id: "request-1" },
      sourceLineId: "line-1",
      operation: "quote",
    })
    f.state.sourceLink = {
      id: "source-link-1",
      sourceVersionFingerprint: source.ref.fingerprint,
    }
    const input = intent()
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      input,
    )
    expect(reviewed.evidence.sourcePreparations).toEqual([
      {
        kind: "catalog_source_link",
        id: "source-link-1",
        sourceVersionFingerprint: source.ref.fingerprint,
        offeringId: "offering-1",
        sourceLineId: "line-1",
      },
    ])
    expect(reviewed.evidence.offerings[0]).toMatchObject({
      status: "DRAFT",
      storeAvailable: false,
    })
    expect(f.writes).toEqual([])
    await write(f, input)
    expectPersistedParity(f, reviewed)
    f.state.allowWrites = false
    const before = f.writes.length
    f.state.sourceLink.sourceVersionFingerprint = "stale-link"
    await expect(
      readCommerceQuoteIssueOptionsInTransaction(f.tx, input),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(f.writes).toHaveLength(before)
  })
  test("exact version replay freshly refuses removed supplied Request-line ownership without rerunning pricing", async () => {
    const f = fixture()
    const input = intent()
    await write(f, input)
    const payloadHash = f.versionRows[0]?.payloadHash
    if (typeof payloadHash !== "string")
      throw Error("Missing exact saved version hash")
    f.state.previousVersion = {
      id: "version-1",
      status: "DRAFT",
      payloadHash,
      quoteApproval: { status: "PENDING" },
    }
    f.state.requestLines = []
    const before = f.writes.length
    const prepared = await prepareCommerceQuoteIssue(input, publication)
    await expect(
      issuePreparedCommerceQuoteInTransaction(f.tx, prepared),
    ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
    expect(f.writes).toHaveLength(before)
    f.state.requestLines = [{ id: "line-1", offeringId: "offering-1" }]
    const readCount = f.reads.length
    await expect(
      issuePreparedCommerceQuoteInTransaction(f.tx, prepared),
    ).resolves.toMatchObject({
      releaseState: "pending_approval",
      versionId: "version-1",
    })
    expect(
      f.reads.slice(readCount).some((row) => row.table === "sellableOffering"),
    ).toBe(false)
    expect(f.versionRows).toHaveLength(1)
  })

  test("pending approval supersedes foreign historical Service source lines before release effects", async () => {
    const f = fixture()
    const reviewed = await readCommerceQuoteIssueOptionsInTransaction(
      f.tx,
      intent(),
    )
    const original = reviewed.options[0]
    if (!original) throw Error("Missing reviewed option")
    f.state.actorMembershipId = "checker-1"
    f.state.approval = {
      id: "approval-1",
      quoteId: "quote-1",
      quoteVersionId: "version-1",
      status: "PENDING",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      sourceId: "request-1",
      sourceType: "SERVICE_REQUEST",
      requesterMembershipId: "maker-1",
      policyRevision: 3,
      quote: { currentVersionId: "version-1" },
      quoteVersion: {
        id: "version-1",
        status: "DRAFT",
        createdByUserId: "maker-user",
        currencyCode: "NGN",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        options: [
          {
            ...original,
            availabilityOutcome: "FULL",
            fulfilmentType: "UNSPECIFIED",
            lines: original.lines.map((row) => ({
              ...row,
              sourceLineId: "foreign-line",
            })),
          },
        ],
      },
    }
    f.state.allowWrites = true
    const result = await approveCommerceQuoteVersionInTransaction(
      f.tx,
      {
        ...scope,
        approvalId: "approval-1",
        quoteId: "quote-1",
        quoteVersionId: "version-1",
        clientDecisionId: "decision-1",
        expectedPolicyRevision: 3,
        reason: "Review exact source",
      },
      publication,
    )
    expect(result).toEqual({ superseded: true })
    expect(
      f.writes
        .filter((row) => row.table === "commerceQuoteVersion")
        .map((row) => row.input),
    ).toEqual([
      {
        data: { status: "SUPERSEDED", supersededAt: expect.any(Date) },
        where: { id: "version-1", status: "DRAFT" },
      },
    ])
    expect(
      f.writes.some(
        (row) =>
          row.table === "serviceRequest" ||
          row.table === "storeConversationMessage" ||
          row.table === "commerceQuoteReplayAccessToken",
      ),
    ).toBe(false)
  })
})
