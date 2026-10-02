import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
  OrderStatus,
  ServicePriority,
} from "../../generated/prisma/enums"

import {
  buildListSortContinuation,
  buildScopedListCursorWhere,
  buildScopedListPageWhere,
} from "./list-sort"
import {
  DEFAULT_SERVICE_WORK_QUEUE_ID_DIRECTION,
  DEFAULT_SERVICE_WORK_QUEUE_SORT,
} from "./service-work-sort"

function matchesWhere(
  record: Record<string, unknown>,
  where: Record<string, unknown>,
) {
  for (const [field, condition] of Object.entries(where)) {
    if (field === "AND") {
      if (
        !(condition as Array<Record<string, unknown>>).every((part) =>
          matchesWhere(record, part),
        )
      ) {
        return false
      }
      continue
    }
    if (field === "OR") {
      if (
        !(condition as Array<Record<string, unknown>>).some((part) =>
          matchesWhere(record, part),
        )
      ) {
        return false
      }
      continue
    }

    const actual = record[field]
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date)
    ) {
      const filters = condition as Record<string, unknown>
      if ("in" in filters && !(filters.in as unknown[]).includes(actual)) {
        return false
      }
      if ("gt" in filters && compare(actual, filters.gt) <= 0) return false
      if ("lt" in filters && compare(actual, filters.lt) >= 0) return false
    } else if (compare(actual, condition) !== 0) {
      return false
    }
  }
  return true
}

function compare(left: unknown, right: unknown) {
  const leftValue = left instanceof Date ? left.getTime() : left
  const rightValue = right instanceof Date ? right.getTime() : right
  if (leftValue === rightValue) return 0
  return (leftValue as string | number | bigint) <
    (rightValue as string | number | bigint)
    ? -1
    : 1
}

describe("server list sort keysets", () => {
  test("continues ascending and descending with deterministic tie-breakers", () => {
    expect(
      buildListSortContinuation([
        { field: "name", value: "Mango", direction: "asc" },
        { field: "id", value: "item-7", direction: "asc" },
      ]),
    ).toEqual({
      OR: [
        { AND: [{ name: { gt: "Mango" } }] },
        { AND: [{ name: "Mango" }, { id: { gt: "item-7" } }] },
      ],
    })
    expect(
      buildListSortContinuation([
        {
          field: "incurredAt",
          value: new Date("2026-09-01T00:00:00Z"),
          direction: "desc",
        },
        { field: "id", value: "bill-7", direction: "desc" },
      ]),
    ).toEqual({
      OR: [
        { AND: [{ incurredAt: { lt: new Date("2026-09-01T00:00:00Z") } }] },
        {
          AND: [
            { incurredAt: new Date("2026-09-01T00:00:00Z") },
            { id: { lt: "bill-7" } },
          ],
        },
      ],
    })
  })

  test("continues enum sorts in Prisma declaration order for both directions", () => {
    const enumCases: string[][] = [
      Object.values(CatalogItemKind),
      Object.values(CatalogRecordStatus),
      Object.values(OrderStatus),
      Object.values(ServicePriority),
    ]

    for (const values of enumCases) {
      const records = values.flatMap((status) => [
        { id: `${status}-a`, status },
        { id: `${status}-b`, status },
      ])
      const sortedAscending = [...records].sort(
        (left, right) =>
          values.indexOf(left.status) - values.indexOf(right.status) ||
          left.id.localeCompare(right.id),
      )
      const sortedDescending = [...records].sort(
        (left, right) =>
          values.indexOf(right.status) - values.indexOf(left.status) ||
          left.id.localeCompare(right.id),
      )

      for (const [direction, sorted] of [
        ["asc", sortedAscending],
        ["desc", sortedDescending],
      ] as const) {
        for (let index = 0; index < sorted.length; index += 1) {
          const cursor = sorted[index]
          if (!cursor) throw new Error("Expected sort cursor fixture.")
          const continuation = buildListSortContinuation([
            {
              field: "status",
              value: cursor.status,
              direction,
              enumValues: values,
            },
            { field: "id", value: cursor.id, direction: "asc" },
          ])
          expect(sorted.slice(index + 1)).toEqual(
            sorted.filter((record) => matchesWhere(record, continuation)),
          )
          expect(JSON.stringify(continuation)).not.toMatch(
            /\"status\":\{\"(?:gt|lt)\"/,
          )
        }
      }
    }
  })

  test("continues default job order by declared priority, date, then id", () => {
    const priorities = Object.values(ServicePriority) as ServicePriority[]
    const start = new Date("2026-09-01T00:00:00Z")
    const jobs = [
      {
        id: "j-1",
        priority: ServicePriority.NORMAL,
        createdAt: new Date(start.getTime()),
      },
      {
        id: "j-2",
        priority: ServicePriority.URGENT,
        createdAt: new Date(start.getTime()),
      },
      {
        id: "j-3",
        priority: ServicePriority.URGENT,
        createdAt: new Date(start.getTime()),
      },
      {
        id: "j-4",
        priority: ServicePriority.URGENT,
        createdAt: new Date(start.getTime() + 1),
      },
    ]
    const order = [...jobs].sort(
      (left, right) =>
        priorities.indexOf(right.priority) -
          priorities.indexOf(left.priority) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    const cursor = order[0]
    if (!cursor) throw new Error("Expected job cursor fixture.")
    expect(DEFAULT_SERVICE_WORK_QUEUE_SORT).toEqual([
      { field: "priority", direction: "desc" },
      { field: "createdAt", direction: "asc" },
    ])
    expect(DEFAULT_SERVICE_WORK_QUEUE_ID_DIRECTION).toBe("asc")
    const continuation = buildListSortContinuation([
      {
        field: DEFAULT_SERVICE_WORK_QUEUE_SORT[0].field,
        value: cursor.priority,
        direction: DEFAULT_SERVICE_WORK_QUEUE_SORT[0].direction,
        enumValues: priorities,
      },
      {
        field: DEFAULT_SERVICE_WORK_QUEUE_SORT[1].field,
        value: cursor.createdAt,
        direction: DEFAULT_SERVICE_WORK_QUEUE_SORT[1].direction,
      },
      {
        field: "id",
        value: cursor.id,
        direction: DEFAULT_SERVICE_WORK_QUEUE_ID_DIRECTION,
      },
    ])

    expect(continuation).toEqual({
      OR: [
        { AND: [{ priority: { in: ["NORMAL"] } }] },
        {
          AND: [
            { priority: "URGENT" },
            { createdAt: { gt: cursor.createdAt } },
          ],
        },
        {
          AND: [
            { priority: "URGENT" },
            { createdAt: cursor.createdAt },
            { id: { gt: cursor.id } },
          ],
        },
      ],
    })
    expect(order.slice(1)).toEqual(
      order.filter((record) => matchesWhere(record, continuation)),
    )
  })

  test("omits an empty later-enum membership branch at the terminal enum", () => {
    const continuation = buildListSortContinuation([
      {
        field: "priority",
        value: ServicePriority.NORMAL,
        direction: "desc",
        enumValues: Object.values(ServicePriority),
      },
      {
        field: "createdAt",
        value: new Date("2026-09-01T00:00:00Z"),
        direction: "asc",
      },
      { field: "id", value: "j-1", direction: "asc" },
    ])

    expect(continuation.OR).toHaveLength(2)
    expect(continuation.OR).not.toContainEqual({ priority: { in: [] } })
  })

  test("enum membership predicates satisfy generated Prisma where types", () => {
    const catalogKindWhere = {
      kind: { in: [CatalogItemKind.PRODUCT, CatalogItemKind.SERVICE] },
    } satisfies Prisma.CatalogItemWhereInput
    const catalogStatusWhere = {
      status: {
        in: [
          CatalogRecordStatus.DRAFT,
          CatalogRecordStatus.ACTIVE,
          CatalogRecordStatus.ARCHIVED,
        ],
      },
    } satisfies Prisma.CatalogItemWhereInput
    const orderStatusWhere = {
      status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
    } satisfies Prisma.CommercialOrderWhereInput
    const servicePriorityWhere = {
      priority: { in: [ServicePriority.NORMAL, ServicePriority.URGENT] },
    } satisfies Prisma.ServiceJobWhereInput

    expect(catalogKindWhere.kind).toEqual({
      in: [CatalogItemKind.PRODUCT, CatalogItemKind.SERVICE],
    })
    expect(catalogStatusWhere.status).toHaveProperty("in")
    expect(orderStatusWhere.status).toHaveProperty("in")
    expect(servicePriorityWhere.priority).toHaveProperty("in")
  })

  test("keeps cursor lookup and continuation under every active filter", () => {
    const filters = { bookId: "book-1", storeId: "store-1", voidedAt: null }

    expect(buildScopedListCursorWhere(filters, "bill-7")).toEqual({
      AND: [filters, { id: "bill-7" }],
    })
    expect(
      buildScopedListPageWhere(filters, [
        { field: "paidMinor", value: BigInt(100), direction: "asc" },
        { field: "id", value: "bill-7", direction: "asc" },
      ]),
    ).toEqual({
      AND: [
        filters,
        {
          OR: [
            { AND: [{ paidMinor: { gt: BigInt(100) } }] },
            {
              AND: [{ paidMinor: BigInt(100) }, { id: { gt: "bill-7" } }],
            },
          ],
        },
      ],
    })
  })
})
