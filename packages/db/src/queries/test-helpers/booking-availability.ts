import { fixture as decisionFixture } from "./commerce-quote-decision"
import { allowedServiceCommercePolicyDecisionRows } from "./service-commerce-policy"

export function field(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? Reflect.get(value, key)
    : undefined
}
function compare(
  value: unknown,
  expected: unknown,
  operation: "gt" | "gte" | "lt" | "lte",
) {
  const left = value instanceof Date ? value.getTime() : value
  const right = expected instanceof Date ? expected.getTime() : expected
  if (typeof left !== "number" || typeof right !== "number") return false
  return operation === "gt"
    ? left > right
    : operation === "gte"
      ? left >= right
      : operation === "lt"
        ? left < right
        : left <= right
}
export function matches(value: unknown, where: unknown): boolean {
  if (where instanceof Date)
    return value instanceof Date && value.getTime() === where.getTime()
  if (!where || typeof where !== "object") return value === where
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true
    if (key === "in") return Array.isArray(expected) && expected.includes(value)
    if (key === "not") return !matches(value, expected)
    if (key === "equals") return matches(value, expected)
    if (key === "gt" || key === "gte" || key === "lt" || key === "lte")
      return compare(value, expected, key)
    if (key === "some")
      return Array.isArray(value) && value.some((row) => matches(row, expected))
    if (key === "OR")
      return (
        Array.isArray(expected) && expected.some((part) => matches(value, part))
      )
    if (key === "AND")
      return (
        Array.isArray(expected) &&
        expected.every((part) => matches(value, part))
      )
    return matches(field(value, key), expected)
  })
}
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
  const include = field(args, "include")
  const projection = select ?? include
  if (!projection || typeof projection !== "object")
    return structuredClone(value)
  const result: Record<string, unknown> = select ? {} : { ...Object(value) }
  for (const [key, choice] of Object.entries(projection)) {
    if (choice === true) result[key] = structuredClone(field(value, key))
    else if (choice) result[key] = project(field(value, key), choice)
  }
  return result
}
export const bookingAvailabilityScope = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
}
export function bookingAvailabilityFixture() {
  const scope = bookingAvailabilityScope
  const tenant = { id: scope.tenantId, isActive: true }
  const store = {
    id: scope.storeId,
    tenantId: scope.tenantId,
    status: "ACTIVE",
    countryCode: "NG",
  }
  const member = {
    id: "member-1",
    userId: scope.actorUserId,
    tenantId: scope.tenantId,
    role: "OPERATOR",
    status: "ACTIVE",
    acceptedAt: new Date("2026-01-01T00:00:00Z"),
    tenant,
    staffAccessMode: "SCOPED",
    staffAccessRevision: 4,
    catalogEditor: false,
    retailOpsStaffProfile: { defaultStoreId: scope.storeId },
    staffStoreAssignments: [
      {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        role: "OPERATOR",
        status: "ACTIVE",
        revision: 2,
        store,
      },
    ],
    serviceCommerceStoreTeamAssignments: [
      {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        capability: "ATTENDANT",
        status: "ACTIVE",
      },
    ],
  }
  const source = {
    id: "request-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    status: "SUBMITTED",
    revision: 1,
    customerPhone: "PRIVATE_PHONE",
    customerEmail: "PRIVATE_EMAIL",
    customerName: "PRIVATE_NAME",
  }
  const settings = {
    id: "settings-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    revision: 0,
    defaultSlotInterval: 30,
    timezone: "UTC",
  }
  type Rule = {
    id: string
    tenantId: string
    storeId: string
    resourceId: string
    clientRuleId: string
    dayOfWeek: number
    startMinute: number
    endMinute: number
    status: string
  }
  type Exception = {
    id: string
    tenantId: string
    storeId: string
    resourceId: string
    clientExceptionId: string
    startAt: Date
    endAt: Date
    kind: string
    capacity: number | null
    status: string
  }
  const availability: Rule[] = []
  const exceptions: Exception[] = []
  const resource = {
    id: "resource-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    status: "ACTIVE",
    name: "Exact room",
    revision: 2,
    capacity: 2,
    availability,
    exceptions,
  }
  const config = {
    id: "config-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    offeringId: "offering-1",
    status: "ACTIVE",
    revision: 0,
    durationMinutes: 30,
    leadTimeMinutes: 0,
    bookingHorizonMinutes: 43_200,
    resources: [{ resourceId: resource.id, resource }],
    store: { ...store, serviceBookingSettings: settings },
  }
  type Reservation = {
    id: string
    tenantId: string
    storeId: string
    resourceId: string
    startAt: Date
    endAt: Date
    capacity: number
    status: string
  }
  const holds: Array<Reservation & { expiresAt: Date }> = []
  const bookings: Reservation[] = []
  const profile = {
    id: "profile-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    status: "ACTIVE",
    bookingEnabled: true,
  }
  const policies = allowedServiceCommercePolicyDecisionRows()
  const state = {
    tenant,
    store,
    member,
    source,
    settings,
    resource,
    config,
    holds,
    bookings,
    profile,
    policies,
  }
  const reads: Array<{ table: string; method: string; args: unknown }> = []
  const denied: string[] = []
  const tables: Record<string, () => unknown[]> = {
    tenant: () => [tenant],
    store: () => [store],
    membership: () => [member],
    serviceRequest: () => [source],
    serviceBookingOfferingConfig: () => [config],
    serviceBookingResource: () => [resource],
    serviceBookingHold: () => holds,
    serviceBooking: () => bookings,
    serviceCommerceStoreProfile: () => [profile],
    serviceCommercePolicyDecision: () => policies,
  }
  // Reuse an existing inert typed transaction scaffold, not a real Prisma
  // client or a canonical-module mock. Every allowed local delegate below is
  // predicate/projection aware; all other reads and every mutation are denied.
  const tx = new Proxy(decisionFixture().tx, {
    get(_target, table: string) {
      if (table.startsWith("$"))
        return () => {
          denied.push(table)
          throw Error(`Forbidden ${table}`)
        }
      return new Proxy(
        {},
        {
          get(_delegate, method: string) {
            return async (args: unknown) => {
              const tableRows = tables[table]
              if (!["findFirst", "findMany"].includes(method) || !tableRows) {
                denied.push(`${table}.${method}`)
                throw Error(`Forbidden ${table}.${method}`)
              }
              reads.push({ table, method, args })
              const rows = tableRows().filter((row) =>
                matches(row, field(args, "where") ?? {}),
              )
              return method === "findFirst"
                ? project(rows[0] ?? null, args)
                : project(rows, args)
            }
          },
        },
      )
    },
  })
  return { tx, state, reads, denied }
}
