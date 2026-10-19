import {
  bookingAvailabilityFixture,
  field,
  matches,
} from "./booking-availability"

// Inert stateful delegates exercise the actual canonical command functions.
// This is not SQL, concurrency, automatic rollback, or provider evidence.
function project(value: unknown, args: unknown): unknown {
  if (Array.isArray(value)) {
    const rows = value.filter((row) => matches(row, field(args, "where") ?? {}))
    const take = field(args, "take")
    return (typeof take === "number" ? rows.slice(0, take) : rows).map((row) =>
      project(row, args),
    )
  }
  if (value === null) return null
  const select = field(args, "select")
  const shape = select ?? field(args, "include")
  if (!shape || typeof shape !== "object") return structuredClone(value)
  const out: Record<string, unknown> = select ? {} : { ...Object(value) }
  for (const [key, choice] of Object.entries(shape)) {
    if (choice === true) out[key] = structuredClone(field(value, key))
    else if (choice) out[key] = project(field(value, key), choice)
  }
  return out
}
type Row = Record<string, unknown>
function apply(row: Row, data: unknown) {
  for (const [key, value] of Object.entries(Object(data))) {
    if (value === undefined) continue
    const increment = field(value, "increment")
    row[key] =
      typeof increment === "number"
        ? Number(row[key]) + increment
        : structuredClone(value)
  }
}
export function bookingCommandFixture() {
  const base = bookingAvailabilityFixture()
  Object.assign(base.state.source, {
    contactOptIn: true,
    channelOrigin: "STAFF",
  })
  Object.assign(base.state.settings, { reminderLeadMinutes: 0 })
  Object.assign(base.state.config, {
    holdDurationMinutes: 10,
    paymentRequirement: "NONE",
    depositAmountMinor: null,
    paymentPolicyRevision: 0,
    cancellationPolicyRevision: 0,
    cancellationWindowMinutes: 120,
    refundPolicy: "NONE",
  })
  const holds: Row[] = []
  const bookings: Row[] = []
  const events: Row[] = []
  const capabilities: Row[] = []
  const notifications: Row[] = []
  const jobs: Row[] = []
  const jobLines: Row[] = []
  const workEvents: Row[] = []
  const orderLines: Row[] = []
  const payments: Row[] = []
  const orders: Row[] = [
    {
      id: "order-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      customerId: "customer-1",
      currencyCode: "NGN",
      status: "FULFILLING",
      paymentStatus: "UNPAID",
      totalMinor: 5000,
      completedAt: null,
      acceptedCommerceQuoteVersion: null,
    },
  ]
  const writes: Array<{ table: string; method: string; args: unknown }> = []
  const locks: string[] = []
  const reads: Array<{ table: string; method: string; args: unknown }> = []
  const controls = { loseCAS: "", loseLock: "" }
  const tables: Record<string, Row[]> = {
    serviceBookingHold: holds,
    serviceBooking: bookings,
    serviceBookingEvent: events,
    serviceBookingAccessCapability: capabilities,
    serviceBookingNotificationIntent: notifications,
    serviceJob: jobs,
    serviceJobLine: jobLines,
    serviceWorkEvent: workEvents,
    commercialOrder: orders,
    commercialOrderLine: orderLines,
    commercialOrderPayment: payments,
  }
  function materialize(table: string, row: Row): Row {
    if (table === "serviceBookingHold")
      return {
        ...row,
        offeringConfig: base.state.config,
        accessCapability:
          capabilities.find((c) => c.id === row.accessCapabilityId) ?? null,
      }
    if (table === "serviceBooking")
      return {
        ...row,
        offeringConfig: base.state.config,
        resource: base.state.resource,
      }
    if (table === "serviceBookingEvent") {
      const booking = bookings.find((b) => b.id === row.bookingId)
      return {
        ...row,
        booking: booking ? materialize("serviceBooking", booking) : null,
      }
    }
    if (table === "serviceJob")
      return {
        ...row,
        lines: jobLines.filter((line) => line.serviceJobId === row.id),
      }
    return row
  }
  let serial = 0
  const tx = new Proxy(base.tx, {
    get(target, table: string) {
      if (table === "$queryRaw")
        return async (sql: unknown) => {
          const strings = field(sql, "strings") ?? sql
          const text = Array.isArray(strings)
            ? strings.join(" ")
            : String(strings)
          const name = [
            "FinanceBook",
            "CustomerLedgerAccount",
            "CommercialOrder",
            "ServiceBookingResource",
            "ServiceBooking",
            "ServiceJob",
          ].find((name) => text.includes(`"${name}"`))
          if (!name) throw Error("Unexpected synthetic lock")
          locks.push(name)
          return controls.loseLock === name ? [] : [{ id: `${name}-lock` }]
        }
      if (table.startsWith("$"))
        return () => {
          throw Error(`Forbidden ${table}`)
        }
      if (table === "serviceCommercePolicyAuditEvent")
        return {
          createMany: async (args: unknown) => {
            writes.push({ table, method: "createMany", args })
            return { count: 1 }
          },
        }
      if (table === "serviceCommerceStoreTeamAssignment")
        return {
          findFirst: async (args: unknown) => {
            const assignment =
              base.state.member.serviceCommerceStoreTeamAssignments.find((a) =>
                matches(
                  { ...a, membership: base.state.member },
                  field(args, "where") ?? {},
                ),
              )
            return project(
              assignment
                ? { ...assignment, membership: base.state.member }
                : null,
              args,
            )
          },
        }
      const rows = tables[table]
      if (!rows) return Reflect.get(target, table)
      return new Proxy(
        {},
        {
          get(_delegate, method: string) {
            return async (args: unknown) => {
              const where = field(args, "where") ?? {}
              const matching = rows.filter((row) =>
                matches(materialize(table, row), where),
              )
              if (
                [
                  "findFirst",
                  "findFirstOrThrow",
                  "findMany",
                  "findUnique",
                ].includes(method)
              ) {
                reads.push({ table, method, args })
                if (method === "findFirstOrThrow" && !matching[0])
                  throw Error("Missing exact row")
                return project(
                  method === "findMany"
                    ? matching.map((r) => materialize(table, r))
                    : matching[0]
                      ? materialize(table, matching[0])
                      : null,
                  args,
                )
              }
              if (method === "groupBy" && table === "commercialOrderPayment") {
                reads.push({ table, method, args })
                return ["PAYMENT", "REFUND"].flatMap((type) => {
                  const group = matching.filter((r) => r.type === type)
                  return group.length
                    ? [
                        {
                          type,
                          _sum: {
                            amountMinor: group.reduce(
                              (n, r) => n + Number(r.amountMinor),
                              0,
                            ),
                          },
                        },
                      ]
                    : []
                })
              }
              if (!["create", "updateMany", "update"].includes(method))
                throw Error(`Forbidden ${table}.${method}`)
              writes.push({ table, method, args })
              if (method === "create") {
                const defaults = {
                  id: `${table}-${++serial}`,
                  createdAt: new Date(),
                  effectiveAt: new Date(),
                  revision: 0,
                  fromStatus: null,
                  refundOutcome: null,
                  refundAmountMinor: null,
                  commercialOrderId: null,
                  serviceJobId: null,
                  quoteVersionId: null,
                  cancelledAt: null,
                  completedAt: null,
                }
                const row: Row = {
                  ...defaults,
                  status:
                    table === "serviceBookingHold"
                      ? "HELD"
                      : table === "serviceBookingAccessCapability"
                        ? "ACTIVE"
                        : table === "serviceBookingNotificationIntent"
                          ? "PENDING"
                          : "CONFIRMED",
                }
                apply(row, field(args, "data"))
                rows.push(row)
                return project(materialize(table, row), args)
              }
              if (controls.loseCAS === table && method === "updateMany")
                return { count: 0 }
              for (const row of matching) apply(row, field(args, "data"))
              if (method === "updateMany") return { count: matching.length }
              if (!matching[0]) throw Error("Missing update row")
              return project(materialize(table, matching[0]), args)
            }
          },
        },
      )
    },
  })
  return {
    tx,
    state: base.state,
    holds,
    bookings,
    events,
    capabilities,
    notifications,
    jobs,
    jobLines,
    workEvents,
    orders,
    orderLines,
    payments,
    writes,
    locks,
    reads,
    controls,
    denied: base.denied,
  }
}
