import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  listServiceRequestPageInTransaction,
  readServiceRequestOriginalInTransaction,
} from "./service-request-read"

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Missing synthetic row")
  return value
}
const scope = { tenantId: "tenant", storeId: "store", actorUserId: "actor" }
const instant = new Date("2026-10-15T10:00:00.123Z")
function request(id: string) {
  return {
    id,
    tenantId: "tenant",
    storeId: "store",
    revision: 4,
    status: "SUBMITTED",
    customerName: "Identical name",
    customerPhone: "PRIVATE_PHONE",
    customerEmail: "PRIVATE_EMAIL",
    details: "PRIVATE_DETAILS",
    staffResponse: "Saved response",
    createdAt: instant,
    updatedAt: instant,
    requestedAt: null,
    requestForm: {
      id: "form",
      label: "Saved form",
      tenantId: "tenant",
      storeId: "store",
    },
    channelOrigin: "STAFF",
    contactOptIn: false,
    consentVersion: "privacy-v1",
    providerEventId: "PRIVATE_PROVIDER",
    payloadHash: "PRIVATE_HASH",
    publicTokenDigest: "PRIVATE_TOKEN",
    _count: { lines: 1 },
    lines: [
      {
        id: `line-${id}`,
        requestId: id,
        offeringId: "offering",
        offeringName: "SAVED SERVICE",
        variantName: "SAVED VARIANT",
        optionSelections: [{ group: "Saved colour", value: "Blue" }],
        requestedQuantity: { toFixed: () => "9007199254740993.000001" },
        details: "Saved line details",
      },
    ],
  }
}
type Row = ReturnType<typeof request>
function quote() {
  return {
    id: "quote",
    tenantId: "tenant",
    storeId: "store",
    sourceType: "SERVICE_REQUEST",
    sourceId: "request",
    currentVersionId: "version",
    currentVersion: {
      id: "version",
      quoteId: "quote",
      version: 3,
      status: "DRAFT",
      currencyCode: "NGN",
      totalMinor: 1200,
      expiresAt: instant,
      acceptedOrderId: null as string | null,
      acceptedOrder: null as null | {
        id: string
        tenantId: string
        storeId: string
        acceptedCommerceQuoteVersion: { quote: { sourceType: string } } | null
        prescriptionPickupFulfillment: { id: string } | null
        prescriptionDeliveryAddress: { id: string } | null
        _count: { prescriptionPaymentIntents: number }
      },
    },
    acceptanceTokenDigest: "PRIVATE_QUOTE_TOKEN",
  }
}
function world() {
  const rows: Row[] = [request("request")]
  let canonicalQuote: ReturnType<typeof quote> | null = null
  const actor = {
    id: "membership",
    role: "OWNER",
    staffAccessMode: "LEGACY",
    staffAccessRevision: 1,
    active: true,
    storeActive: true,
  }
  const reads: Array<{ name: string; args: unknown }> = []
  function matches(row: Row, where: Record<string, unknown>): boolean {
    if (
      row.tenantId !== where.tenantId ||
      row.storeId !== where.storeId ||
      (where.status && row.status !== where.status)
    )
      return false
    if (where.customerName) {
      const value = Reflect.get(
        where.customerName as object,
        "contains",
      ) as string
      const literal = value.replace(/\\([\\%_])/g, "$1").toLowerCase()
      if (!row.customerName.toLowerCase().includes(literal)) return false
    }
    if (where.OR) {
      const after = where.OR as Array<{
        createdAt: { lt: Date } | Date
        id?: { lt: string }
      }>
      return after.some((part) =>
        part.createdAt instanceof Date
          ? row.createdAt.getTime() === part.createdAt.getTime() &&
            Boolean(part.id && row.id < part.id.lt)
          : row.createdAt < part.createdAt.lt,
      )
    }
    return true
  }
  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) =>
      actor.active &&
      values.includes(scope.tenantId) &&
      values.includes(scope.actorUserId)
        ? [actor]
        : [],
    membership: {
      findFirst: async () =>
        actor.active
          ? { staffAccessRevision: actor.staffAccessRevision }
          : null,
    },
    store: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) =>
        actor.storeActive &&
        args.where.id === scope.storeId &&
        args.where.tenantId === scope.tenantId
          ? { id: scope.storeId }
          : null,
    },
    staffStoreAssignment: {
      findFirst: async () => ({ id: "assignment", revision: 1 }),
    },
    serviceRequest: {
      count: async (args: { where: Record<string, unknown> }) => {
        reads.push({ name: "count", args })
        return rows.filter((row) => matches(row, args.where)).length
      },
      findMany: async (args: {
        where: Record<string, unknown>
        take: number
      }) => {
        reads.push({ name: "page", args })
        return rows
          .filter((row) => matches(row, args.where))
          .sort(
            (a, b) =>
              b.createdAt.getTime() - a.createdAt.getTime() ||
              (a.id < b.id ? 1 : -1),
          )
          .slice(0, args.take)
      },
      findFirst: async (args: {
        where: { id: string; tenantId: string; storeId: string }
        select: { lines: { take: number } }
      }) => {
        reads.push({ name: "original", args })
        const row = rows.find(
          (row) =>
            row.id === args.where.id &&
            row.tenantId === args.where.tenantId &&
            row.storeId === args.where.storeId,
        )
        return row
          ? { ...row, lines: row.lines.slice(0, args.select.lines.take) }
          : null
      },
    },
    commerceQuote: {
      findUnique: async (args: unknown) => {
        reads.push({ name: "quote", args })
        return canonicalQuote
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    rows,
    actor,
    reads,
    setQuote: (value: ReturnType<typeof quote> | null) => {
      canonicalQuote = value
    },
  }
}

test("discovery selects a bounded private-field-free page and complete same-filter count", async () => {
  const w = world()
  for (let index = 0; index < 14; index++)
    w.rows.push(request(`request-${String(index).padStart(2, "0")}`))
  w.rows.push({ ...request("foreign"), storeId: "foreign" })
  const result = await listServiceRequestPageInTransaction(w.tx, {
    ...scope,
    limit: 10,
    status: "submitted",
    query: "Identical",
  })
  expect(result.items).toHaveLength(10)
  expect(result.totalMatching).toBe("15")
  expect(result.nextCursor).toBeString()
  expect(result.coverage).toBe("service_requests_only")
  for (const key of [
    "PRIVATE_PHONE",
    "PRIVATE_EMAIL",
    "PRIVATE_DETAILS",
    "PRIVATE_PROVIDER",
    "PRIVATE_HASH",
    "PRIVATE_TOKEN",
  ])
    expect(JSON.stringify(result)).not.toContain(key)
  expect(result.items[0]?.originalTarget).toEqual({
    kind: "service_request",
    requestId: "request-13",
    origin: { tenantId: "tenant", storeId: "store" },
  })
  const count = w.reads.find((read) => read.name === "count")?.args
  const page = w.reads.find((read) => read.name === "page")?.args
  expect(page).toMatchObject({
    where: (count as { where: unknown }).where,
    take: 11,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  expect(page).toMatchObject({
    select: {
      requestForm: { select: { tenantId: true, storeId: true } },
      _count: { select: { lines: true } },
    },
  })
})

test("continuation orders identical names/timestamps by exact identity and preserves complete matching count", async () => {
  const w = world()
  w.rows.push(request("request-z"), request("request-a"))
  const first = await listServiceRequestPageInTransaction(w.tx, {
    ...scope,
    limit: 1,
  })
  expect(first.items.map((row) => row.id)).toEqual(["request-z"])
  const next = await listServiceRequestPageInTransaction(w.tx, {
    ...scope,
    limit: 1,
    cursor: first.nextCursor ?? undefined,
  })
  expect(next.items.map((row) => row.id)).toEqual(["request-a"])
  expect(next.totalMatching).toBe("3")
  const last = await listServiceRequestPageInTransaction(w.tx, {
    ...scope,
    limit: 1,
    cursor: next.nextCursor ?? undefined,
  })
  expect(last.items.map((row) => row.id)).toEqual(["request"])
  expect(last.nextCursor).toBeNull()
})

test("cursor cannot cross actor, Tenant, Store, query, status, limit or access revision and malformed cursors refuse", async () => {
  const w = world()
  w.rows.push(request("request-z"))
  const first = await listServiceRequestPageInTransaction(w.tx, {
    ...scope,
    limit: 1,
  })
  const cursor = first.nextCursor ?? ""
  for (const changed of [
    { actorUserId: "other" },
    { tenantId: "other" },
    { storeId: "other" },
    { query: "Other" },
    { status: "declined" as const },
    { limit: 2 },
  ])
    await expect(
      listServiceRequestPageInTransaction(w.tx, {
        ...scope,
        limit: 1,
        cursor,
        ...changed,
      }),
    ).rejects.toThrow()
  w.actor.staffAccessRevision++
  await expect(
    listServiceRequestPageInTransaction(w.tx, { ...scope, limit: 1, cursor }),
  ).rejects.toThrow("first page")
  for (const malformed of [
    "",
    "!",
    "x".repeat(4097),
    Buffer.from("{}").toString("base64url"),
    Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(cursor, "base64url").toString()),
        extra: true,
      }),
    ).toString("base64url"),
  ])
    await expect(
      listServiceRequestPageInTransaction(w.tx, {
        ...scope,
        limit: 1,
        cursor: malformed,
      }),
    ).rejects.toThrow()
})

test("invalid page/filter bounds refuse; literal wildcard queries and withdrawn states remain exact", async () => {
  const w = world()
  for (const limit of [0, 11, Number.NaN, Number.POSITIVE_INFINITY, 1.5])
    await expect(
      listServiceRequestPageInTransaction(w.tx, { ...scope, limit }),
    ).rejects.toThrow()
  for (const query of [" ", "x".repeat(121)])
    await expect(
      listServiceRequestPageInTransaction(w.tx, { ...scope, query }),
    ).rejects.toThrow()
  required(w.rows[0]).customerName = "Literal 50%_\\ name"
  required(w.rows[0]).status = "WITHDRAWN"
  expect(
    (
      await listServiceRequestPageInTransaction(w.tx, {
        ...scope,
        query: "50%_\\",
        status: "withdrawn",
      })
    ).totalMatching,
  ).toBe("1")
  expect(w.reads.findLast((read) => read.name === "count")?.args).toMatchObject(
    {
      where: {
        customerName: { contains: "50\\%\\_\\\\", mode: "insensitive" },
        status: "WITHDRAWN",
      },
    },
  )
})

test("exact original preserves full snapshot quantities/options and current canonical Quote version only", async () => {
  const w = world()
  w.setQuote(quote())
  const result = await readServiceRequestOriginalInTransaction(w.tx, {
    ...scope,
    requestId: "request",
  })
  expect(result.request).toMatchObject({
    id: "request",
    revision: 4,
    status: "SUBMITTED",
    customer: {
      name: "Identical name",
      phone: "PRIVATE_PHONE",
      email: "PRIVATE_EMAIL",
    },
    contactOptIn: false,
    consentVersion: "privacy-v1",
  })
  expect(result.lines).toEqual([
    {
      id: "line-request",
      offeringId: "offering",
      offeringName: "SAVED SERVICE",
      variantName: "SAVED VARIANT",
      quantity: "9007199254740993.000001",
      optionSelections: [{ group: "Saved colour", value: "Blue" }],
      details: "Saved line details",
    },
  ])
  expect(result.currentQuote).toEqual({
    quoteId: "quote",
    versionId: "version",
    version: 3,
    status: "DRAFT",
    currencyCode: "NGN",
    totalMinor: 1200,
    expiresAt: instant.toISOString(),
    acceptedOrderId: null,
  })
  expect(w.reads.find((read) => read.name === "quote")?.args).toMatchObject({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: "tenant",
        sourceType: "SERVICE_REQUEST",
        sourceId: "request",
      },
    },
  })
  for (const key of [
    "PRIVATE_PROVIDER",
    "PRIVATE_HASH",
    "PRIVATE_TOKEN",
    "PRIVATE_QUOTE_TOKEN",
    "currentQuoteId",
    "fixedPriceMinor",
    "allowedDispositions",
  ])
    expect(JSON.stringify(result)).not.toContain(key)
  w.setQuote(null)
  expect(
    (
      await readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      })
    ).currentQuote,
  ).toBeNull()
})

test("real Prisma Decimal quantities preserve the full non-exponential 38-digit source precision", async () => {
  const w = world()
  const line = required(required(w.rows[0]).lines[0])
  const precise = "12345678901234567890123456789012.123456"
  line.requestedQuantity = new Prisma.Decimal(precise)
  expect(
    (
      await readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      })
    ).lines[0]?.quantity,
  ).toBe(precise)
})

test("all reads require fresh persisted Owner/Admin/explicit legacy Manager and exact active Store", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    const w = world()
    w.actor.role = role
    expect(
      (await listServiceRequestPageInTransaction(w.tx, scope)).items,
    ).toHaveLength(1)
    expect(
      (
        await readServiceRequestOriginalInTransaction(w.tx, {
          ...scope,
          requestId: "request",
        })
      ).request.id,
    ).toBe("request")
  }
  for (const changed of [
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { role: "MANAGER", staffAccessMode: "SCOPED" },
    { role: "MANAGER", staffAccessMode: "UNKNOWN" },
    { active: false },
    { storeActive: false },
  ]) {
    const w = world()
    Object.assign(w.actor, changed)
    await expect(
      listServiceRequestPageInTransaction(w.tx, scope),
    ).rejects.toThrow()
    await expect(
      readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      }),
    ).rejects.toThrow()
  }
  const w = world()
  for (const changed of [
    { actorUserId: "other" },
    { tenantId: "other" },
    { storeId: "other" },
  ])
    await expect(
      readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        ...changed,
        requestId: "request",
      }),
    ).rejects.toThrow()
})

test("original refuses source/form/line/Quote/version/Order mismatches and clinical linkage", async () => {
  const w = world()
  for (const requestId of ["", " ", "x".repeat(129)])
    await expect(
      readServiceRequestOriginalInTransaction(w.tx, { ...scope, requestId }),
    ).rejects.toThrow("identity")
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "foreign",
    }),
  ).rejects.toThrow()
  for (const change of [
    { sourceType: "PRESCRIPTION_REQUEST" },
    { sourceType: "COMMERCE_INQUIRY" },
    { storeId: "other" },
    { tenantId: "other" },
    { sourceId: "other" },
    { currentVersionId: "wrong" },
  ]) {
    w.setQuote({ ...quote(), ...change })
    await expect(
      readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      }),
    ).rejects.toThrow()
  }
  const current = quote()
  current.currentVersion.quoteId = "other"
  w.setQuote(current)
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "request",
    }),
  ).rejects.toThrow()
  const q = quote()
  q.currentVersion.acceptedOrderId = "order"
  q.currentVersion.acceptedOrder = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    acceptedCommerceQuoteVersion: { quote: { sourceType: "SERVICE_REQUEST" } },
    prescriptionPickupFulfillment: null,
    prescriptionDeliveryAddress: null,
    _count: { prescriptionPaymentIntents: 0 },
  }
  w.setQuote(q)
  expect(
    (
      await readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      })
    ).currentQuote?.acceptedOrderId,
  ).toBe("order")
  for (const change of [
    { prescriptionPickupFulfillment: { id: "clinical" } },
    { prescriptionDeliveryAddress: { id: "clinical" } },
    { _count: { prescriptionPaymentIntents: 1 } },
    {
      acceptedCommerceQuoteVersion: {
        quote: { sourceType: "PRESCRIPTION_REQUEST" },
      },
    },
  ]) {
    const saved = q.currentVersion.acceptedOrder
    q.currentVersion.acceptedOrder = { ...saved, ...change }
    await expect(
      readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      }),
    ).rejects.toThrow("Clinical")
    q.currentVersion.acceptedOrder = saved
  }
  w.setQuote(null)
  required(w.rows[0]).requestForm.storeId = "other"
  await expect(
    listServiceRequestPageInTransaction(w.tx, scope),
  ).rejects.toThrow()
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "request",
    }),
  ).rejects.toThrow()
  required(w.rows[0]).requestForm.storeId = "store"
  required(required(w.rows[0]).lines[0]).requestId = "other"
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "request",
    }),
  ).rejects.toThrow()
})

test("bounded exact original never silently drops excess lines or coerces malformed snapshots", async () => {
  const w = world()
  const row = required(w.rows[0])
  row.lines = Array.from({ length: 101 }, (_, index) => ({
    ...required(request("request").lines[0]),
    id: `line-${index}`,
  }))
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "request",
    }),
  ).rejects.toThrow("no partial")
  row.lines = row.lines.slice(0, 100)
  expect(
    (
      await readServiceRequestOriginalInTransaction(w.tx, {
        ...scope,
        requestId: "request",
      })
    ).lines,
  ).toHaveLength(100)
  expect(
    w.reads.findLast((read) => read.name === "original")?.args,
  ).toMatchObject({ select: { lines: { take: 101 } } })
  required(row.lines[0]).requestedQuantity = { toFixed: () => "1e3" }
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "request",
    }),
  ).rejects.toThrow("quantity")
  required(row.lines[0]).requestedQuantity = { toFixed: () => "1" }
  required(row.lines[0]).optionSelections = [
    { group: "Saved", value: "x".repeat(501) },
  ]
  await expect(
    readServiceRequestOriginalInTransaction(w.tx, {
      ...scope,
      requestId: "request",
    }),
  ).rejects.toThrow("snapshots")
})
